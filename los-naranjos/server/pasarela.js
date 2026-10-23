/**
 * Pasarela de pago: el único lugar del sistema que habla con Mercado Pago.
 *
 * Hay dos pasarelas y se eligen con variables de entorno, nunca solas:
 *  - 'mercadopago' — con MP_ACCESS_TOKEN. La de verdad: Checkout Pro.
 *  - 'simulado'    — con PAGOS_SIMULADOS=si. Una pantalla propia con "aprobar"
 *    y "rechazar" para desarrollar, probar y mostrar el sistema sin plata.
 *    No se prende nunca por descarte: con el sitio publicado, cualquiera
 *    podría confirmar turnos sin pagar.
 * Sin ninguna de las dos, los pagos online quedan apagados.
 *
 * Sin dependencias: Mercado Pago tiene SDK, pero lo que hace falta son cuatro
 * llamadas HTTP, y `fetch` viene con Node.
 */
import { createHmac, timingSafeEqual, randomBytes, randomUUID } from 'node:crypto';
import { PAGOS } from './config.js';
import { isoConZona } from './tiempo.js';

/** 'mercadopago', 'simulado' o null. Se lee en cada llamada: así lo pueden cambiar las pruebas. */
export function pasarelaActiva() {
  if (process.env.MP_ACCESS_TOKEN) return 'mercadopago';
  if (process.env.PAGOS_SIMULADOS === 'si') return 'simulado';
  return null;
}

// MP_API_URL existe sólo para que las pruebas apunten a un Mercado Pago de mentira.
const baseMP = () => (process.env.MP_API_URL || 'https://api.mercadopago.com').replace(/\/+$/, '');

function errorPasarela(mensaje, status = 502) {
  const e = new Error(mensaje);
  e.status = status;
  e.code = 'PASARELA';
  return e;
}

async function llamarMP(metodo, ruta, cuerpo, { idempotencia } = {}) {
  let res;
  try {
    res = await fetch(baseMP() + ruta, {
      method: metodo,
      headers: {
        authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        'content-type': 'application/json',
        // Si una escritura se reintenta, Mercado Pago la reconoce y no la repite.
        ...(metodo !== 'GET' ? { 'x-idempotency-key': idempotencia || randomUUID() } : {}),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw errorPasarela(`No hubo respuesta de Mercado Pago (${err.name === 'TimeoutError' ? 'tardó demasiado' : err.message}).`);
  }
  const texto = await res.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { /* respuesta que no es JSON */ }
  if (!res.ok) {
    const e = errorPasarela(`Mercado Pago respondió ${res.status}${datos?.message ? `: ${datos.message}` : ''}.`);
    e.statusMP = res.status;
    throw e;
  }
  return datos;
}

/**
 * Abre un cobro y devuelve adónde mandar al jugador.
 *  - `venceEn`: hasta cuándo se puede EMPEZAR a pagar. El turno queda apartado
 *    unos minutos más, para el que tocó "pagar" sobre la hora.
 *  - `urlBase`: la dirección pública del sitio, adonde Mercado Pago devuelve al
 *    jugador y manda los avisos.
 */
export async function crearCheckout({ codigo, titulo, monto, pagador = {}, urlBase, venceEn }) {
  const pasarela = pasarelaActiva();

  if (pasarela === 'simulado') {
    const ref = `SIM-${randomBytes(12).toString('hex')}`;
    return { pasarela, ref, url: `/pago-simulado?ref=${ref}` };
  }
  if (pasarela !== 'mercadopago') throw errorPasarela('Los pagos online no están configurados.', 503);

  const volver = `${urlBase}/reservar?pago=${encodeURIComponent(codigo)}`;
  const preferencia = await llamarMP('POST', '/checkout/preferences', {
    items: [{ id: codigo, title: titulo, quantity: 1, unit_price: monto, currency_id: 'ARS' }],
    payer: {
      ...(pagador.nombre ? { name: pagador.nombre } : {}),
      ...(pagador.email ? { email: pagador.email } : {}),
    },
    external_reference: codigo,
    back_urls: { success: volver, failure: volver, pending: volver },
    auto_return: 'approved',
    // Mercado Pago sólo puede avisarle a una dirección pública con https. Probando
    // en una máquina local no la hay: queda la confirmación a la vuelta del jugador.
    ...(urlBase.startsWith('https://') ? { notification_url: `${urlBase}/api/pagos/aviso` } : {}),
    // Que se apruebe o se rechace en el momento: un turno no puede quedar "en revisión".
    binary_mode: true,
    // Sin efectivo en Rapipago o Pago Fácil: se acredita días después, y el turno capaz es hoy.
    payment_methods: {
      excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
      installments: 1,
    },
    expires: true,
    expiration_date_from: isoConZona(new Date()),
    expiration_date_to: isoConZona(new Date(venceEn)),
    statement_descriptor: PAGOS.descriptor,
  });

  // Las credenciales de prueba viejas ("TEST-…") usan el checkout de prueba.
  const dePrueba = String(process.env.MP_ACCESS_TOKEN).startsWith('TEST-');
  const url = (dePrueba && preferencia?.sandbox_init_point) || preferencia?.init_point;
  if (!url || !preferencia?.id) throw errorPasarela('Mercado Pago no devolvió el link de pago.');
  return { pasarela, ref: String(preferencia.id), url };
}

/* Los estados de Mercado Pago, llevados a los cuatro que le importan a un turno. */
const ESTADOS_MP = {
  approved: 'aprobado',
  authorized: 'pendiente',
  pending: 'pendiente',
  in_process: 'pendiente',
  in_mediation: 'pendiente',
  rejected: 'rechazado',
  cancelled: 'rechazado',
  refunded: 'devuelto',
  charged_back: 'devuelto',
};

/**
 * Trae un pago de Mercado Pago. Es la única fuente de verdad sobre si alguien
 * pagó: ni el aviso ni la vuelta del jugador alcanzan, porque los dos se pueden
 * fraguar. Lo que dice la API, consultada con la credencial del club, no.
 */
export async function consultarPago(id) {
  const p = await llamarMP('GET', `/v1/payments/${encodeURIComponent(id)}`);
  return {
    pasarela: 'mercadopago',
    id: String(p.id),
    estado: ESTADOS_MP[p.status] || 'pendiente',
    monto: Math.round(Number(p.transaction_amount) || 0),
    moneda: p.currency_id || null,
    referencia: p.external_reference || null,
    detalle: p.status_detail || null,
  };
}

/** Devuelve un pago entero. La clave de idempotencia evita devolver dos veces lo mismo. */
export async function devolverPago({ pasarela, externoId, idempotencia }) {
  if (pasarela === 'simulado') return { ok: true };
  if (pasarelaActiva() !== 'mercadopago') {
    throw errorPasarela('Mercado Pago no está configurado en este servidor: devolvelo desde la cuenta del club.', 503);
  }
  await llamarMP('POST', `/v1/payments/${encodeURIComponent(externoId)}/refunds`, undefined, { idempotencia });
  return { ok: true };
}

/**
 * ¿El aviso viene de Mercado Pago?
 * La firma llega en `x-signature` ("ts=…,v1=…") y se arma igual que en los SDK
 * oficiales: HMAC-SHA256, con la clave secreta de la aplicación, sobre
 * "id:<data.id>;request-id:<x-request-id>;ts:<ts>;". El data.id sale de la URL
 * y va en minúsculas; lo que no llegó se saca del manifiesto.
 */
export function firmaValida({ firma, requestId, dataId, secreto }) {
  const partes = {};
  for (const trozo of String(firma || '').split(',')) {
    const i = trozo.indexOf('=');
    if (i < 0) continue;
    const clave = trozo.slice(0, i).trim().toLowerCase();
    const valor = trozo.slice(i + 1).trim();
    if (clave && valor) partes[clave] = valor;
  }
  if (!partes.ts || !partes.v1 || !secreto) return false;

  const manifiesto = [
    dataId ? `id:${String(dataId).trim().toLowerCase()}` : null,
    requestId ? `request-id:${String(requestId).trim()}` : null,
    `ts:${partes.ts}`,
  ].filter(Boolean).join(';') + ';';

  const esperada = Buffer.from(createHmac('sha256', secreto).update(manifiesto).digest('hex'));
  const recibida = Buffer.from(partes.v1);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/** Identificador de un pago simulado: parecido a los de verdad, imposible de confundir. */
export const nuevoIdSimulado = () => `SIMP-${randomBytes(8).toString('hex')}`;
