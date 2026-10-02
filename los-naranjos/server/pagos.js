/**
 * Cobro de turnos: une las reservas con la pasarela de pago.
 *
 * El recorrido de un turno que se paga online:
 *  1. El jugador elige seña o turno entero. La reserva nace 'pendiente' y
 *     aparta la cancha los minutos que tiene para pagar, más un changüí.
 *  2. Paga en Mercado Pago.
 *  3. Mercado Pago avisa al servidor y además devuelve al jugador al sitio. Por
 *     cualquiera de los dos caminos se consulta el pago a la API y, si está
 *     aprobado y alcanza, el turno queda 'confirmada'.
 *  4. Si nadie pagó a tiempo, el turno vence y la cancha se libera.
 *
 * Los casos raros —pagó tarde y la cancha ya era de otro, pagó dos veces,
 * canceló un turno pagado— no se resuelven solos: la plata queda marcada
 * "para devolver" en el panel, y el club decide.
 */
import { PAGOS, DISCIPLINAS, CANCHAS, RESERVAS, CLUB, PRECIOS_PUBLICADOS } from './config.js';
import {
  pagos as P, aplicarPago, vencerPendientes, descartarPendiente, consultas, bitacora,
} from './db.js';
import * as T from './tiempo.js';
import {
  pasarelaActiva, crearCheckout, consultarPago, devolverPago, firmaValida, nuevoIdSimulado,
} from './pasarela.js';

/** Changüí después del tiempo para pagar, para el que tocó "pagar" sobre la hora. */
export const GRACIA_MINUTOS = 5;

const entero = (v) => (Number.isFinite(v) && v > 0 ? Math.round(v) : null);
const pesos = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

function error(mensaje, status = 400, code) {
  const e = new Error(mensaje);
  e.status = status;
  if (code) e.code = code;
  return e;
}

/* Las llamadas a Mercado Pago que puede disparar alguien de afuera —la vuelta
   del jugador, un nuevo intento, un aviso sin firma— van con tope por IP:
   nadie tiene que poder usar el servidor para gastar la cuota de la API del
   club. En memoria, como el freno de los ingresos: si el servidor se
   reinicia, se perdona. */
const llamadasPorIp = new Map();

function dentroDelTope(ip, tope, ventanaMinutos = 10) {
  if (!ip) return true;
  const ahora = Date.now();
  if (llamadasPorIp.size > 5000) llamadasPorIp.clear();
  const recientes = (llamadasPorIp.get(ip) || []).filter((t) => ahora - t < ventanaMinutos * 60_000);
  const pasa = recientes.length < tope;
  if (pasa) recientes.push(ahora);
  llamadasPorIp.set(ip, recientes);
  return pasa;
}

/**
 * La dirección pública del sitio: adonde vuelve el jugador y adonde avisa
 * Mercado Pago. Manda URL_PUBLICA; si no está, la dirección por la que entró
 * el jugador (detrás de Railway o de un Nginx, con su x-forwarded-proto). El
 * dominio de la config queda último: si todavía no existe, mandaría a la gente
 * a ninguna parte.
 */
export function urlPublica(req) {
  if (process.env.URL_PUBLICA) return process.env.URL_PUBLICA.replace(/\/+$/, '');
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (host) {
    const proto = String(req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http')).split(',')[0].trim();
    return `${proto}://${String(host).split(',')[0].trim()}`;
  }
  return CLUB.sitio.replace(/\/+$/, '');
}

/* ── Montos ───────────────────────────────────────────────────────────────── */

/** Lo que vale un turno y lo que se puede pagar online por él. Siempre desde la config. */
export function montosDe(slug, duracionMin) {
  const d = DISCIPLINAS.find((x) => x.slug === slug);
  const precio = entero(d?.precios?.[duracionMin]);
  let seña = null;
  if (PAGOS.seña?.tipo === 'fijo') seña = entero(PAGOS.seña.valor);
  if (PAGOS.seña?.tipo === 'porcentaje' && precio) seña = entero((precio * PAGOS.seña.valor) / 100);
  // Una "seña" que cubre el turno entero ya no es una seña.
  if (seña && precio && seña >= precio) seña = null;
  return {
    precio,
    seña: PAGOS.opciones.includes('seña') ? seña : null,
    total: PAGOS.opciones.includes('total') ? precio : null,
  };
}

/** Las formas de pagar online ese turno, en el orden del club. Vacío si no hay pasarela. */
export function opcionesDe(slug, duracionMin) {
  if (!pasarelaActiva()) return [];
  const m = montosDe(slug, duracionMin);
  return PAGOS.opciones.filter((o) => m[o]).map((o) => ({ cobro: o, monto: m[o] }));
}

/** Lo que el navegador necesita saber de los pagos. Ninguna credencial. */
export function configPublicaDePagos() {
  const montos = {};
  let alguna = false;
  for (const d of DISCIPLINAS) {
    montos[d.slug] = {};
    for (const dur of d.duraciones) {
      const m = montosDe(d.slug, dur);
      montos[d.slug][dur] = {
        seña: m.seña,
        total: m.total,
        // El precio se muestra para decir cuánto queda por pagar en el club,
        // salvo que el club haya elegido no publicarlo y no se cobre entero.
        precio: PRECIOS_PUBLICADOS || m.total ? m.precio : null,
      };
      if (m.seña || m.total) alguna = true;
    }
  }
  const pasarela = pasarelaActiva();
  return {
    activos: !!pasarela && alguna,
    montosCargados: alguna,
    pasarela,
    obligatorio: PAGOS.obligatorio,
    minutosParaPagar: PAGOS.minutosParaPagar,
    opciones: PAGOS.opciones,
    montos,
  };
}

/**
 * Cómo nace una reserva según cómo se va a pagar.
 * `pedido` es lo que eligió el jugador: 'seña', 'total' o 'club'.
 * El personal del club reserva sin pago online: lo cobra el mostrador.
 */
export function cobroDeLaReserva({ slug, duracionMin, pedido, delClub }) {
  const { precio } = montosDe(slug, duracionMin);
  const sinPagoOnline = (cobro) => ({ estado: 'confirmada', cobro, precio, aPagar: null, venceEn: null });

  if (delClub) return sinPagoOnline('club');

  const opciones = opcionesDe(slug, duracionMin);
  if (!opciones.length) return sinPagoOnline(null);

  const elegida = opciones.find((o) => o.cobro === pedido);
  if (elegida) {
    return {
      estado: 'pendiente',
      cobro: elegida.cobro,
      precio,
      aPagar: elegida.monto,
      venceEn: T.dentroDeMinutosISO(PAGOS.minutosParaPagar + GRACIA_MINUTOS),
    };
  }
  if (pedido === 'club' && !PAGOS.obligatorio) return sinPagoOnline('club');

  throw error(opciones.length > 1
    ? 'Elegí si pagás la seña o el turno entero.'
    : `Para reservar online hay que pagar ${opciones[0].cobro === 'seña' ? 'la seña' : 'el turno'}.`);
}

/* ── Cobro ────────────────────────────────────────────────────────────────── */

function tituloDelCobro(r) {
  const que = r.cobro === 'seña' ? 'Seña' : 'Turno';
  const disciplina = DISCIPLINAS.find((d) => d.slug === r.disciplina)?.nombre || r.disciplina;
  const cancha = CANCHAS.find((c) => c.id === r.cancha_id)?.nombre || r.cancha_id;
  return `${que} · ${disciplina} · ${T.fechaLarga(r.fecha)} ${T.aHora(r.inicio_min)} · ${cancha}`;
}

/** Hasta cuándo se puede empezar a pagar: el vencimiento del apartado, sin el changüí. */
const finDelCheckout = (r) => new Date(Date.parse(r.vence_en) - GRACIA_MINUTOS * 60_000);

const slotsDe = (r) => {
  const paso = RESERVAS.slotMinutos;
  return Array.from({ length: r.duracion_min / paso }, (_, i) => r.inicio_min / paso + i);
};

/** Abre el cobro de una reserva pendiente. Devuelve adónde ir a pagar y hasta cuándo. */
export async function iniciarCobro(r, req) {
  const venceEn = finDelCheckout(r);
  const checkout = await crearCheckout({
    codigo: r.codigo,
    titulo: tituloDelCobro(r),
    monto: r.a_pagar,
    pagador: { nombre: r.nombre, email: r.email },
    urlBase: urlPublica(req),
    venceEn,
  });
  P.guardarCheckout(r.id, checkout.ref, r.cobro, r.a_pagar);
  return { url: checkout.url, venceEn: venceEn.toISOString() };
}

const buscar = (codigo) => {
  const r = consultas.porCodigo(String(codigo || '').trim().toUpperCase());
  if (!r || r.tipo !== 'reserva') throw error('No encontramos esa reserva.', 404, 'NO_ENCONTRADO');
  return r;
};

/** Otro intento para un turno que sigue apartado: rechazado, abandonado o cambio de opción. */
export async function reintentarCobro(codigo, pedido, req, ip) {
  if (!dentroDelTope(ip, 20)) {
    throw error('Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.', 429, 'LIMITE');
  }
  vencerPendientes();
  const r = buscar(codigo);
  if (r.estado === 'confirmada') throw error('Ese turno ya está pagado y confirmado.', 409, 'YA_PAGADO');
  if (r.estado !== 'pendiente' || finDelCheckout(r).getTime() - Date.now() < 60_000) {
    throw error('Se terminó el tiempo para pagar y el turno se liberó. Elegilo de nuevo.', 410, 'VENCIDO');
  }
  const opcion = opcionesDe(r.disciplina, r.duracion_min).find((o) => o.cobro === (pedido || r.cobro));
  if (!opcion) throw error('Esa forma de pago no está disponible.');
  return iniciarCobro({ ...r, cobro: opcion.cobro, a_pagar: opcion.monto }, req);
}

/** El jugador se arrepiente antes de pagar: la cancha se libera ya, sin esperar el vencimiento. */
export function abandonarCobro(codigo) {
  vencerPendientes();
  const r = buscar(codigo);
  return r.estado === 'pendiente' ? descartarPendiente(r.id) : r;
}

/* ── Pagos que informa la pasarela ────────────────────────────────────────── */

function anotarSistema(accion, detalle) {
  try {
    bitacora.anotar({ quien: 'Sistema', usuarioId: null, accion, detalle, ip: null });
  } catch (err) {
    console.error('No se pudo anotar en la bitácora:', err.message);
  }
}

/**
 * Aplica un pago que informó la pasarela. Devuelve lo que pasó con el turno, o
 * null si el pago no es de un turno de este sistema (la misma cuenta de
 * Mercado Pago puede cobrar otras cosas).
 */
export function procesarPago(p) {
  if (!p?.referencia || !p.id) return null;
  const r = consultas.porCodigo(String(p.referencia).toUpperCase());
  if (!r || r.tipo !== 'reserva') return null;

  /* Alcanza con lo mínimo que el club acepta —la seña— aunque el jugador
     después haya cambiado a "turno entero" en otra pestaña: pagó algo válido. */
  const minimo = Math.min(...opcionesDe(r.disciplina, r.duracion_min).map((o) => o.monto), r.a_pagar ?? Infinity);
  const enPesos = !p.moneda || p.moneda === 'ARS';

  const hecho = aplicarPago({
    reservaId: r.id,
    proveedor: p.pasarela,
    externoId: String(p.id),
    monto: p.monto,
    estado: p.estado,
    detalle: enPesos ? p.detalle : [p.detalle, `moneda ${p.moneda}`].filter(Boolean).join(' · '),
    slots: slotsDe(r),
    minimo: enPesos ? minimo : Infinity,
    cobro: r.precio && p.monto >= r.precio ? 'total' : 'seña',
  });

  if (hecho.resultado === 'a-devolver') {
    anotarSistema('pago para devolver', `${r.codigo} · ${pesos(p.monto)} · ${hecho.motivo}`);
  }
  if (hecho.resultado === 'recuperada') {
    anotarSistema('turno recuperado', `${r.codigo} · pagó con el apartado vencido y la cancha seguía libre`);
  }
  return { ...hecho, reserva: consultas.porId(r.id) };
}

/** Consulta un pago a Mercado Pago y lo aplica. */
export async function verificarPago(id) {
  if (pasarelaActiva() !== 'mercadopago' || !id) return null;
  return procesarPago(await consultarPago(String(id)));
}

/**
 * El aviso de Mercado Pago (webhook). Puede llegar repetido, desordenado o
 * falsificado, así que no se cree en lo que dice: sólo se usa para saber qué
 * pago ir a consultar a la API con la credencial del club.
 *
 * Con MP_WEBHOOK_SECRET cargada, un aviso con la firma mal se rechaza. Uno sin
 * firma se acepta igual: la consulta a la API ya lo deja sin nada que fraguar,
 * y descartarlo podría dejar sin confirmar un turno que alguien pagó.
 */
export async function avisoDePago({ query, body = {}, headers = {}, ip }) {
  const tipo = query.get('type') || query.get('topic') || body.type || body.topic;
  const id = query.get('data.id') ||
    (query.get('topic') === 'payment' ? query.get('id') : null) ||
    body?.data?.id;
  if (tipo !== 'payment' || !id) return { ok: true, ignorado: true };

  const secreto = process.env.MP_WEBHOOK_SECRET;
  const firma = headers['x-signature'];
  const firmado = !!(secreto && firma);
  if (firmado &&
      !firmaValida({ firma, requestId: headers['x-request-id'], dataId: query.get('data.id'), secreto })) {
    throw error('La firma del aviso no es válida.', 401, 'FIRMA');
  }
  if (pasarelaActiva() !== 'mercadopago') return { ok: true, ignorado: true };
  // Un 429 hace que Mercado Pago lo reintente más tarde: si era legítimo, no se pierde.
  if (!firmado && !dentroDelTope(ip, 60)) throw error('Demasiados avisos seguidos.', 429, 'LIMITE');

  const hecho = await verificarPago(id);
  return { ok: true, resultado: hecho?.resultado ?? 'ajeno' };
}

/* Lo que se le dice al jugador cuando el pago no sale, según el motivo que da
   Mercado Pago. Lo que no está acá cae en el mensaje general. */
const MOTIVOS_RECHAZO = {
  cc_rejected_insufficient_amount: 'La tarjeta no tiene saldo suficiente.',
  cc_rejected_bad_filled_security_code: 'El código de seguridad no es correcto.',
  cc_rejected_bad_filled_date: 'La fecha de vencimiento no es correcta.',
  cc_rejected_bad_filled_card_number: 'El número de tarjeta no es correcto.',
  cc_rejected_bad_filled_other: 'Algún dato de la tarjeta no es correcto.',
  cc_rejected_call_for_authorize: 'Tu banco pide que autorices el pago. Llamalo o probá con otra tarjeta.',
  cc_rejected_card_disabled: 'La tarjeta no está habilitada para pagar online.',
  cc_rejected_duplicated_payment: 'Ya hiciste un pago igual hace un momento.',
  cc_rejected_high_risk: 'Mercado Pago no aprobó el pago por seguridad. Probá con otro medio.',
  cc_rejected_max_attempts: 'Llegaste al límite de intentos con esa tarjeta. Probá con otra.',
};

function mensajeDelPago(p) {
  if (p.estado === 'aprobado') return 'Pago aprobado.';
  if (p.estado === 'pendiente') return 'Mercado Pago todavía está procesando el pago.';
  if (p.estado === 'devuelto') return 'Este pago fue devuelto.';
  return MOTIVOS_RECHAZO[p.detalle] || 'El pago no se aprobó.';
}

/**
 * Dónde está parado un turno que se está pagando. Lo pide la pantalla a la que
 * vuelve el jugador desde Mercado Pago. Si trae el número de pago se consulta a
 * la API en el momento, sin esperar el aviso.
 */
export async function estadoDelPago(codigo, pagoId, ip) {
  vencerPendientes();
  let r = buscar(codigo);

  if (pagoId && ['pendiente', 'vencida'].includes(r.estado) && pasarelaActiva() === 'mercadopago') {
    const conocido = P.porExterno('mercadopago', String(pagoId));
    // Pasado el tope no se consulta: se muestra lo que hay, y el aviso confirma igual.
    if ((!conocido || conocido.estado === 'pendiente') && dentroDelTope(ip, 30)) {
      try {
        await verificarPago(String(pagoId));
      } catch (err) {
        console.error('No se pudo verificar el pago al volver de Mercado Pago:', err.message);
      }
      r = buscar(codigo);
    }
  }

  const delTurno = P.deReserva(r.id);
  const ultimo = delTurno.at(-1) || null;
  return {
    reserva: r,
    pago: ultimo && {
      estado: ultimo.estado,
      monto: ultimo.monto,
      mensaje: mensajeDelPago(ultimo),
      // El motivo concreto del rechazo, si Mercado Pago lo dio; si no, null.
      motivo: ultimo.estado === 'rechazado' ? MOTIVOS_RECHAZO[ultimo.detalle] || null : null,
    },
    aDevolver: delTurno.some((p) => p.devolucion === 'pendiente'),
    venceEn: r.estado === 'pendiente' ? finDelCheckout(r).toISOString() : null,
    opciones: r.estado === 'pendiente' ? opcionesDe(r.disciplina, r.duracion_min) : [],
  };
}

/* ── Pasarela simulada ────────────────────────────────────────────────────── */

const soloSimulado = () => {
  if (pasarelaActiva() !== 'simulado') throw error('Este servidor no tiene pagos simulados.', 404);
};

/** Lo que muestra la pantalla de pago simulado. Sin datos personales. */
export function checkoutSimulado(ref) {
  soloSimulado();
  vencerPendientes();
  const r = P.reservaPorRef(String(ref || ''));
  if (!r) throw error('Ese pago no existe.', 404, 'NO_ENCONTRADO');
  return {
    codigo: r.codigo,
    titulo: tituloDelCobro(r),
    cobro: r.cobro,
    monto: r.a_pagar,
    vigente: r.estado === 'pendiente' && finDelCheckout(r).getTime() > Date.now(),
    venceEn: r.vence_en ? finDelCheckout(r).toISOString() : null,
    volver: `/reservar?pago=${encodeURIComponent(r.codigo)}`,
  };
}

/** "Pagar" en la pantalla simulada. Recorre el mismo camino que un pago de verdad. */
export function pagarSimulado(ref, resultado) {
  const datos = checkoutSimulado(ref);
  if (!datos.vigente) throw error('Este link de pago venció.', 410, 'VENCIDO');
  const aprobado = resultado === 'aprobado';
  const id = nuevoIdSimulado();
  procesarPago({
    pasarela: 'simulado',
    id,
    estado: aprobado ? 'aprobado' : 'rechazado',
    monto: datos.monto,
    moneda: 'ARS',
    referencia: datos.codigo,
    detalle: aprobado ? 'accredited' : 'cc_rejected_other_reason',
  });
  return {
    volver: `${datos.volver}&payment_id=${id}&status=${aprobado ? 'approved' : 'rejected'}`,
  };
}

/* ── Panel del club ───────────────────────────────────────────────────────── */

/** Pagos que el club tiene que devolver o resolver. */
export const pagosARevisar = () =>
  P.aRevisar().map((p) => ({ pago: p, reserva: consultas.porId(p.reserva_id) }));

function pagoARevisar(id) {
  const p = P.porId(Number(id));
  if (!p) throw error('Ese pago no existe.', 404, 'NO_ENCONTRADO');
  if (p.devolucion !== 'pendiente') throw error('Ese pago ya está resuelto.', 409);
  return p;
}

/** Devuelve el pago por Mercado Pago y lo da por resuelto. */
export async function devolver(id) {
  const p = pagoARevisar(id);
  await devolverPago({
    pasarela: p.proveedor,
    externoId: p.externo_id,
    // La misma clave siempre: si dos personas tocan "devolver" a la vez, se devuelve una vez.
    idempotencia: `devolucion-${p.proveedor}-${p.externo_id}`,
  });
  P.resolver(p.id, 'hecha');
  return P.porId(p.id);
}

/** El club lo resolvió por otro lado (lo pasó a otro turno, lo devolvió en efectivo…). */
export function resolverSinDevolver(id) {
  const p = pagoARevisar(id);
  P.resolver(p.id, 'no');
  return P.porId(p.id);
}

/** Cada minuto, los turnos que nadie pagó a tiempo se liberan solos. */
export function vencerCadaMinuto() {
  const reloj = setInterval(() => {
    try { vencerPendientes(); } catch (err) { console.error('No se pudieron vencer los turnos sin pagar:', err.message); }
  }, 60_000);
  reloj.unref();
  return reloj;
}

export { pesos };
