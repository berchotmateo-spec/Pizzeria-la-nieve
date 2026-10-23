/** Lógica de negocio: disponibilidad, validación y alta de turnos. */
import { CANCHAS, DISCIPLINAS, HORARIOS, FERIADOS, RESERVAS, CLUB } from './config.js';
import { ocupacionDelDia, crearReserva, cancelarReserva, consultas, cuentas } from './db.js';
import { cobroDeLaReserva, GRACIA_MINUTOS } from './pagos.js';
import * as T from './tiempo.js';

const SLOT = RESERVAS.slotMinutos;

export const disciplinaPorSlug = (slug) => DISCIPLINAS.find((d) => d.slug === slug);
export const canchaPorId = (id) => CANCHAS.find((c) => c.id === id);
export const canchasDe = (slug) =>
  CANCHAS.filter((c) => c.disciplina === slug).sort((a, b) => a.orden - b.orden);

/** Horario de apertura de una fecha, o null si el club está cerrado. */
export function horarioDe(fecha) {
  if (FERIADOS[fecha]) return null;
  const h = HORARIOS[T.diaSemana(fecha)];
  if (!h || !h.abre || !h.cierra) return null;
  return h;
}

/** Los `n` casilleros que ocupa un turno que arranca en `inicioMin`. */
function slotsDe(inicioMin, duracionMin) {
  const desde = inicioMin / SLOT;
  return Array.from({ length: duracionMin / SLOT }, (_, i) => desde + i);
}

/**
 * Grilla de disponibilidad de un día para una disciplina y duración.
 * Devuelve, por horario, qué canchas quedan libres.
 */
export function disponibilidad(fecha, slug, duracionMin) {
  const disciplina = disciplinaPorSlug(slug);
  if (!disciplina) throw errorCliente('Disciplina inexistente.');
  if (!disciplina.duraciones.includes(duracionMin)) {
    throw errorCliente('Esa duración no está disponible para la disciplina.');
  }

  const horario = horarioDe(fecha);
  const canchas = canchasDe(slug);
  if (!horario) {
    return { fecha, disciplina: slug, duracionMin, cerrado: true, motivo: FERIADOS[fecha] || 'Cerrado', horarios: [] };
  }

  const abre = T.aMinutos(horario.abre);
  const cierra = T.aMinutos(horario.cierra);
  const ocupado = ocupacionDelDia(fecha);
  const esHoy = fecha === T.hoy();
  const pisoHoy = T.ahoraEnMinutos() + RESERVAS.minutosAntelacion;

  // Alineamos el primer turno a la grilla de casilleros.
  const primero = Math.ceil(abre / SLOT) * SLOT;
  const horarios = [];

  for (let inicio = primero; inicio + duracionMin <= cierra; inicio += SLOT) {
    if (esHoy && inicio < pisoHoy) continue;
    const slots = slotsDe(inicio, duracionMin);
    const libres = canchas
      .filter((c) => slots.every((s) => !ocupado.has(`${c.id}:${s}`)))
      .map((c) => c.id);
    horarios.push({
      hora: T.aHora(inicio),
      inicioMin: inicio,
      fin: T.aHora(inicio + duracionMin),
      libres,
      cantidad: libres.length,
    });
  }

  return {
    fecha,
    fechaLarga: T.fechaLarga(fecha),
    disciplina: slug,
    duracionMin,
    cerrado: false,
    abre: horario.abre,
    cierra: horario.cierra,
    totalCanchas: canchas.length,
    horarios,
  };
}

/** Rango de fechas reservables, para pintar el selector de días. */
export function calendario() {
  const desde = T.hoy();
  return Array.from({ length: RESERVAS.diasAnticipacion + 1 }, (_, i) => {
    const fecha = T.sumarDias(desde, i);
    const horario = horarioDe(fecha);
    return {
      fecha,
      diaSemana: T.diaSemana(fecha),
      dia: Number(fecha.slice(8)),
      mes: Number(fecha.slice(5, 7)),
      esHoy: i === 0,
      cerrado: !horario,
    };
  });
}

const ESTADO_POR_CODIGO = {
  OCUPADO: 409,
  NO_ENCONTRADO: 404,
  NO_AUTORIZADO: 403,
  LIMITE: 429,
};

function errorCliente(mensaje, code = 'INVALIDO') {
  const e = new Error(mensaje);
  e.code = code;
  e.status = ESTADO_POR_CODIGO[code] || 400;
  return e;
}

const soloDigitos = (s) => String(s || '').replace(/\D/g, '');

/** Normaliza un teléfono argentino a dígitos, para usarlo como identificador. */
export function normalizarTelefono(tel) {
  const d = soloDigitos(tel);
  return d.replace(/^0+/, '').replace(/^54/, '');
}

/**
 * Valida el pedido y crea la reserva. Devuelve la fila creada.
 * Si `usuario` viene, la reserva queda a su nombre y con su teléfono: el que
 * está con la sesión abierta no puede reservar a nombre de otro sin querer.
 *
 * La excepción es el personal del club: reserva para otra persona —los turnos
 * que le piden por WhatsApp o por teléfono—, así que el nombre y el teléfono
 * son los del formulario, no se le aplican los topes pensados para frenar
 * abusos desde la web y el cobro queda en manos del mostrador.
 *
 * Si el turno se paga online, nace 'pendiente': el que llama tiene que abrir
 * el cobro (ver pagos.js) y, si no puede, liberarlo.
 */
export function reservar(datos, ip, usuario = null) {
  const disciplina = disciplinaPorSlug(datos.disciplina);
  if (!disciplina) throw errorCliente('Elegí una disciplina válida.');

  const duracionMin = Number(datos.duracionMin);
  if (!disciplina.duraciones.includes(duracionMin)) {
    throw errorCliente('Elegí una duración válida.');
  }

  const fecha = String(datos.fecha || '');
  if (!T.esFechaValida(fecha)) throw errorCliente('La fecha no es válida.');

  const dif = T.diasEntre(T.hoy(), fecha);
  if (dif < 0) throw errorCliente('No se puede reservar en una fecha pasada.');
  if (dif > RESERVAS.diasAnticipacion) {
    throw errorCliente(`Se puede reservar hasta ${RESERVAS.diasAnticipacion} días de anticipación.`);
  }

  const horario = horarioDe(fecha);
  if (!horario) throw errorCliente('Ese día el complejo está cerrado.');

  if (!/^\d{2}:\d{2}$/.test(datos.hora || '')) throw errorCliente('Elegí un horario.');
  const inicioMin = T.aMinutos(datos.hora);
  if (inicioMin % SLOT !== 0) throw errorCliente('El horario debe caer en la grilla de turnos.');
  if (inicioMin < T.aMinutos(horario.abre) || inicioMin + duracionMin > T.aMinutos(horario.cierra)) {
    throw errorCliente(`Ese día atendemos de ${horario.abre} a ${horario.cierra}.`);
  }
  if (fecha === T.hoy() && inicioMin < T.ahoraEnMinutos() + RESERVAS.minutosAntelacion) {
    throw errorCliente(`Los turnos de hoy se reservan con ${RESERVAS.minutosAntelacion} minutos de anticipación.`);
  }

  const delClub = usuario?.rol === 'club';
  const cuenta = usuario && !delClub ? usuario : null;

  const nombre = String((cuenta ? cuenta.nombre : datos.nombre) || '').trim();
  if (nombre.length < 2) throw errorCliente('Escribí tu nombre y apellido.');
  if (nombre.length > 80) throw errorCliente('El nombre es demasiado largo.');

  const telefono = normalizarTelefono(cuenta ? cuenta.telefono : datos.telefono);
  if (telefono.length < 8) throw errorCliente('Escribí un teléfono de contacto válido.');

  const email = String(datos.email || (cuenta ? cuenta.email : '') || '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
    throw errorCliente('El correo no parece válido.');
  }

  const notas = String(datos.notas || '').trim().slice(0, 300);

  if (!delClub && consultas.activasPorTelefono(telefono, T.hoy()) >= RESERVAS.maxPorTelefono) {
    throw errorCliente(
      `Ya tenés ${RESERVAS.maxPorTelefono} turnos activos con este teléfono. ` +
      'Cancelá uno o escribinos por WhatsApp.'
    );
  }

  if (ip && !delClub) {
    const haceUnaHora = new Date(Date.now() - 3600_000).toISOString();
    if (consultas.desdeIpDesde(ip, haceUnaHora) >= RESERVAS.maxPorIpHora) {
      throw errorCliente('Demasiadas reservas seguidas. Probá de nuevo en un rato.', 'LIMITE');
    }
  }

  // Elección de cancha: la pedida, o la primera libre si hay asignación automática.
  const slots = slotsDe(inicioMin, duracionMin);
  const ocupado = ocupacionDelDia(fecha);
  const libres = canchasDe(disciplina.slug)
    .filter((c) => slots.every((s) => !ocupado.has(`${c.id}:${s}`)));

  let cancha;
  if (datos.canchaId) {
    cancha = libres.find((c) => c.id === datos.canchaId);
    if (!cancha) {
      const existe = canchaPorId(datos.canchaId);
      throw errorCliente(
        existe ? 'Esa cancha ya está ocupada en ese horario.' : 'Esa cancha no existe.',
        'OCUPADO'
      );
    }
  } else {
    if (!RESERVAS.asignacionAutomatica) throw errorCliente('Elegí una cancha.');
    cancha = libres[0];
    if (!cancha) throw errorCliente('No quedan canchas libres en ese horario.', 'OCUPADO');
  }

  // Se decide antes de tocar la base: si falta elegir cómo pagar, no se aparta nada.
  const cobro = cobroDeLaReserva({
    slug: disciplina.slug, duracionMin, pedido: datos.cobro, delClub,
  });

  return crearReserva(
    {
      disciplina: disciplina.slug,
      canchaId: cancha.id,
      fecha,
      inicioMin,
      duracionMin,
      nombre,
      telefono,
      email: email || null,
      notas: notas || null,
      ip,
      // Lo que carga el club para alguien con cuenta aparece también en su cuenta.
      usuarioId: cuenta ? cuenta.id : (delClub ? cuentas.porTelefono(telefono)?.id ?? null : null),
      ...cobro,
    },
    slots
  );
}

/** Crea un bloqueo administrativo (mantenimiento, torneo, clase). */
export function bloquear({ canchaId, fecha, hora, duracionMin, motivo }) {
  const cancha = canchaPorId(canchaId);
  if (!cancha) throw errorCliente('Esa cancha no existe.');
  if (!T.esFechaValida(fecha)) throw errorCliente('Fecha inválida.');
  if (!/^\d{2}:\d{2}$/.test(hora || '')) throw errorCliente('Hora inválida.');

  const inicioMin = T.aMinutos(hora);
  const dur = Number(duracionMin);
  if (!Number.isInteger(dur) || dur < SLOT || dur % SLOT !== 0 || dur > 12 * 60) {
    throw errorCliente(`La duración debe ser múltiplo de ${SLOT} minutos.`);
  }
  if (inicioMin % SLOT !== 0) throw errorCliente('La hora debe caer en la grilla de turnos.');

  return crearReserva(
    {
      tipo: 'bloqueo',
      disciplina: cancha.disciplina,
      canchaId,
      fecha,
      inicioMin,
      duracionMin: dur,
      nombre: String(motivo || 'Bloqueo').trim().slice(0, 80),
      telefono: null,
      email: null,
      notas: null,
    },
    slotsDe(inicioMin, dur)
  );
}

/** Convierte una fila de la base en el objeto que consume el navegador. */
export function serializar(r) {
  const cancha = canchaPorId(r.cancha_id);
  const disciplina = disciplinaPorSlug(r.disciplina);
  const pagado = r.pagado || 0;
  return {
    codigo: r.codigo,
    tipo: r.tipo,
    disciplina: r.disciplina,
    disciplinaNombre: disciplina?.nombre || r.disciplina,
    canchaId: r.cancha_id,
    canchaNombre: cancha?.nombre || r.cancha_id,
    fecha: r.fecha,
    fechaLarga: T.fechaLarga(r.fecha),
    hora: T.aHora(r.inicio_min),
    fin: T.aHora(r.inicio_min + r.duracion_min),
    duracionMin: r.duracion_min,
    nombre: r.nombre,
    telefono: r.telefono,
    email: r.email,
    notas: r.notas,
    estado: r.estado,
    creadaEn: r.creada_en,
    cancelable: esCancelable(r),
    // Pago: cómo se cobra, cuánto vale, cuánto entró y cuánto falta.
    cobro: r.cobro ?? null,
    precio: r.precio ?? null,
    aPagar: r.a_pagar ?? null,
    pagado,
    saldo: r.precio != null ? Math.max(r.precio - pagado, 0) : null,
    // Hasta cuándo puede empezar a pagar: lo que se le promete al jugador.
    venceHora: r.estado === 'pendiente' && r.vence_en
      ? T.horaDeISO(new Date(Date.parse(r.vence_en) - GRACIA_MINUTOS * 60_000).toISOString())
      : null,
  };
}

/** Lo mismo, sin los datos de contacto: para lo que se puede ver sólo con el código. */
export function serializarPublico(r) {
  const { telefono, email, ...resto } = serializar(r);
  return resto;
}

/** ¿Todavía estamos a tiempo de cancelar sin cargo? */
export function esCancelable(r) {
  if (r.estado !== 'confirmada') return false;
  const dif = T.diasEntre(T.hoy(), r.fecha);
  if (dif < 0) return false;
  const minutosFaltantes = dif * 24 * 60 + r.inicio_min - T.ahoraEnMinutos();
  return minutosFaltantes >= RESERVAS.horasCancelacion * 60;
}

/**
 * Cancela un turno. Lo puede hacer quien tenga el código y el teléfono, o el
 * jugador con la sesión abierta si el turno es suyo.
 */
export function cancelar(codigo, telefono, usuario = null) {
  const r = consultas.porCodigo(String(codigo || '').trim().toUpperCase());
  if (!r) throw errorCliente('No encontramos ese código de reserva.', 'NO_ENCONTRADO');
  if (r.estado === 'cancelada') throw errorCliente('Esa reserva ya estaba cancelada.');
  const esSuyo = usuario && (r.usuario_id === usuario.id || r.telefono === usuario.telefono);
  if (!esSuyo && normalizarTelefono(telefono) !== r.telefono) {
    throw errorCliente('El teléfono no coincide con el de la reserva.', 'NO_AUTORIZADO');
  }
  if (!esCancelable(r)) {
    throw errorCliente(
      `Las cancelaciones online se aceptan hasta ${RESERVAS.horasCancelacion} horas antes. ` +
      `Llamanos al ${CLUB.telefono}.`
    );
  }
  return cancelarReserva(r.id);
}

export { consultas, cancelarReserva };
