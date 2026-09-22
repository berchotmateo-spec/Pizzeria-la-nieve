/** Endpoints JSON del sistema de turnos. */
import {
  CLUB, DISCIPLINAS, CANCHAS, HORARIOS, RESERVAS, SERVICIOS, PROGRAMAS,
  PRECIOS_PUBLICADOS, ADMIN, FERIADOS, CUENTAS,
} from './config.js';
import * as N from './turnos.js';
import * as T from './tiempo.js';
import * as C from './cuentas.js';
import { cuentas, personal, bitacora } from './db.js';

/** Payload público: todo lo que el navegador necesita, nada más. */
export function configPublica() {
  return {
    club: CLUB,
    horarios: HORARIOS,
    feriados: FERIADOS,
    disciplinas: DISCIPLINAS.map((d) => ({
      slug: d.slug, nombre: d.nombre, icono: d.icono,
      duraciones: d.duraciones, duracionPorDefecto: d.duracionPorDefecto,
      jugadores: d.jugadores, descripcion: d.descripcion,
      precios: PRECIOS_PUBLICADOS ? d.precios : null,
      destacada: !!d.destacada,
      canchas: N.canchasDe(d.slug).length,
    })),
    canchas: CANCHAS,
    reglas: {
      diasAnticipacion: RESERVAS.diasAnticipacion,
      minutosAntelacion: RESERVAS.minutosAntelacion,
      horasCancelacion: RESERVAS.horasCancelacion,
      maxPorTelefono: RESERVAS.maxPorTelefono,
      slotMinutos: RESERVAS.slotMinutos,
      minClave: CUENTAS.minClave,
    },
    servicios: SERVICIOS,
    programas: PROGRAMAS,
    preciosPublicados: PRECIOS_PUBLICADOS,
    calendario: N.calendario(),
    hoy: T.hoy(),
  };
}

const sinSesion = () => {
  const e = new Error('Necesitás ingresar a tu cuenta.');
  e.status = 401;
  e.code = 'NECESITA_SESION';
  return e;
};

const noAutorizado = () => {
  const e = new Error('Necesitás iniciar sesión como administrador.');
  e.status = 401;
  return e;
};

function claveMaestraValida(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const esperado = ADMIN.token;
  if (!token) return false;
  // Comparación de longitud constante para no filtrar el token por tiempos.
  if (token.length !== esperado.length) return false;
  let distinto = 0;
  for (let i = 0; i < token.length; i++) distinto |= token.charCodeAt(i) ^ esperado.charCodeAt(i);
  return distinto === 0;
}

/**
 * Deja pasar al panel y devuelve quién entró, para la bitácora.
 *
 * Hay dos formas de entrar: con la cuenta propia de alguien del club —que es
 * la que queremos, porque deja rastro con nombre y apellido— o con la clave
 * maestra del panel, que sirve para arrancar cuando todavía no hay nadie
 * cargado y como salida de emergencia si alguien se queda afuera.
 */
function exigirClub({ req, usuario }) {
  if (C.esDelClub(usuario)) {
    return { quien: usuario.nombre, usuarioId: usuario.id, conClaveMaestra: false };
  }
  if (claveMaestraValida(req)) {
    return { quien: 'Clave del panel', usuarioId: null, conClaveMaestra: true };
  }
  throw noAutorizado();
}

/** Anota un movimiento del panel, sin que un fallo al anotar tire la acción. */
function anotar(quienEntro, accion, detalle, ip) {
  try {
    bitacora.anotar({
      quien: quienEntro.quien, usuarioId: quienEntro.usuarioId, accion, detalle, ip,
    });
  } catch (err) {
    console.error('No se pudo anotar en la bitácora:', err.message);
  }
}

/** Tabla de rutas: 'MÉTODO /ruta' → handler(ctx). */
export const rutas = {
  'GET /api/config': () => configPublica(),

  'GET /api/disponibilidad': ({ query }) => {
    const fecha = query.get('fecha') || T.hoy();
    if (!T.esFechaValida(fecha)) { const e = new Error('Fecha inválida.'); e.status = 400; throw e; }
    const disciplina = query.get('disciplina') || 'padel';
    const duracion = Number(query.get('duracion')) ||
      N.disciplinaPorSlug(disciplina)?.duracionPorDefecto || 60;
    return N.disponibilidad(fecha, disciplina, duracion);
  },

  'POST /api/reservas': ({ body, ip, usuario }) => {
    const r = N.reservar(body, ip, usuario);
    return { ok: true, reserva: N.serializar(r) };
  },

  'GET /api/reservas': ({ query, usuario }) => {
    const codigo = String(query.get('codigo') || '').trim().toUpperCase();

    if (codigo) {
      const r = N.consultas.porCodigo(codigo);
      if (!r || r.tipo !== 'reserva') { const e = new Error('No encontramos esa reserva.'); e.status = 404; throw e; }
      const telefono = N.normalizarTelefono(query.get('telefono'));
      const esSuyo = usuario && (r.usuario_id === usuario.id || r.telefono === usuario.telefono);
      if (!esSuyo && telefono && r.telefono !== telefono) {
        const e = new Error('El teléfono no coincide.'); e.status = 403; throw e;
      }
      return { reservas: [N.serializar(r)] };
    }

    // Con la sesión abierta no hace falta escribir nada: son sus turnos.
    if (usuario) {
      return { reservas: N.consultas.deUsuario(usuario.id, T.hoy()).map(N.serializar) };
    }

    const telefono = N.normalizarTelefono(query.get('telefono'));
    if (!telefono) { const e = new Error('Indicá tu código o tu teléfono.'); e.status = 400; throw e; }

    /* Si ese teléfono tiene cuenta, sus turnos se ven entrando, no escribiendo
       el número: si no, cualquiera que lo conozca vería a qué hora jugás. */
    if (cuentas.porTelefono(telefono)) {
      const e = new Error('Ese teléfono tiene cuenta. Ingresá para ver tus turnos.');
      e.status = 401;
      e.code = 'NECESITA_SESION';
      throw e;
    }
    return { reservas: N.consultas.porTelefono(telefono, T.hoy()).map(N.serializar) };
  },

  'POST /api/reservas/cancelar': ({ body, usuario }) => {
    const r = N.cancelar(body.codigo, body.telefono, usuario);
    return { ok: true, reserva: N.serializar(r) };
  },

  // ── Cuentas de los jugadores ──────────────────────────────────────────────
  'POST /api/cuenta/registro': ({ body, req, res }) => C.registrar(body, req, res),

  'POST /api/cuenta/ingreso': ({ body, req, res }) => C.ingresar(body, req, res),

  'POST /api/cuenta/salir': ({ req, res }) => {
    C.cerrarSesion(req, res);
    return { ok: true };
  },

  /* Devuelve 200 con usuario en null cuando no hay sesión: para el navegador
     "todavía no ingresaste" no es un error, es el estado normal de la home. */
  'GET /api/cuenta': ({ usuario }) => {
    if (!usuario) return { usuario: null };
    return {
      usuario: C.perfilPublico(usuario),
      turnos: cuentas.reservasActivas(usuario.id, T.hoy()).map(N.serializar),
      historial: cuentas.historial(usuario.id, 10).map(N.serializar),
    };
  },

  'POST /api/cuenta/perfil': ({ body, usuario }) => {
    if (!usuario) throw sinSesion();
    return C.actualizarPerfil(usuario, body);
  },

  'POST /api/cuenta/clave': ({ body, usuario, req, res }) => {
    if (!usuario) throw sinSesion();
    return C.cambiarClave(usuario, body, req, res);
  },

  // ── Administración ────────────────────────────────────────────────────────
  'POST /api/admin/sesion': (ctx) => {
    const quien = exigirClub(ctx);
    anotar(quien, 'ingreso', null, ctx.ip);
    return {
      ok: true,
      quien: quien.quien,
      conClaveMaestra: quien.conClaveMaestra,
      avisoTokenPorDefecto: ADMIN.tokenPorDefecto,
      /* Si todavía no hay nadie del club cargado, el panel lo dice: es el
         primer paso para dejar de depender de una clave compartida. */
      sinPersonal: personal.listar().length === 0,
    };
  },

  'GET /api/admin/dia': (ctx) => {
    exigirClub(ctx);
    const { query } = ctx;
    const fecha = query.get('fecha') || T.hoy();
    if (!T.esFechaValida(fecha)) { const e = new Error('Fecha inválida.'); e.status = 400; throw e; }
    const horario = N.horarioDe(fecha);
    const reservas = N.consultas.delDia(fecha).map(N.serializar);
    const ocupadosMin = reservas
      .filter((r) => r.tipo === 'reserva')
      .reduce((a, r) => a + r.duracionMin, 0);
    return {
      fecha,
      fechaLarga: T.fechaLarga(fecha),
      horario,
      canchas: CANCHAS,
      reservas,
      resumen: {
        turnos: reservas.filter((r) => r.tipo === 'reserva').length,
        bloqueos: reservas.filter((r) => r.tipo === 'bloqueo').length,
        horasVendidas: +(ocupadosMin / 60).toFixed(1),
      },
    };
  },

  'GET /api/admin/agenda': (ctx) => {
    exigirClub(ctx);
    const { query } = ctx;
    const desde = query.get('desde') || T.hoy();
    const hasta = query.get('hasta') || T.sumarDias(desde, 7);
    if (!T.esFechaValida(desde) || !T.esFechaValida(hasta)) {
      const e = new Error('Rango de fechas inválido.'); e.status = 400; throw e;
    }
    return { desde, hasta, reservas: N.consultas.rango(desde, hasta).map(N.serializar) };
  },

  'POST /api/admin/bloqueos': (ctx) => {
    const quien = exigirClub(ctx);
    const r = N.bloquear(ctx.body);
    anotar(quien, 'bloqueo', `${r.cancha_id} · ${r.fecha} ${T.aHora(r.inicio_min)} · ${r.nombre}`, ctx.ip);
    return { ok: true, reserva: N.serializar(r) };
  },

  'POST /api/admin/cancelar': (ctx) => {
    const quien = exigirClub(ctx);
    const r = N.consultas.porCodigo(String(ctx.body.codigo || '').trim().toUpperCase());
    if (!r) { const e = new Error('No existe esa reserva.'); e.status = 404; throw e; }
    if (r.estado === 'cancelada') { const e = new Error('Ya estaba cancelada.'); e.status = 400; throw e; }
    anotar(quien, 'cancelación', `${r.codigo} · ${r.fecha} ${T.aHora(r.inicio_min)} · ${r.nombre || 'sin nombre'}`, ctx.ip);
    return { ok: true, reserva: N.serializar(N.cancelarReserva(r.id)) };
  },

  // ── Personal del club ─────────────────────────────────────────────────────
  'GET /api/admin/personal': (ctx) => {
    exigirClub(ctx);
    return {
      personal: personal.listar().map((u) => ({
        id: u.id,
        nombre: u.nombre,
        telefono: u.telefono,
        creadoEn: u.creado_en,
        ultimoAcceso: u.ultimo_acceso,
        esVos: ctx.usuario ? ctx.usuario.id === u.id : false,
      })),
    };
  },

  'POST /api/admin/personal': async (ctx) => {
    const quien = exigirClub(ctx);
    const r = await C.altaDePersonal(ctx.body);
    anotar(quien, 'alta de personal', `${r.usuario.nombre} (${r.usuario.telefono})`, ctx.ip);
    return r;
  },

  'POST /api/admin/personal/baja': (ctx) => {
    const quien = exigirClub(ctx);
    /* Sacarse el acceso a uno mismo es la forma más fácil de quedarse afuera
       en el peor momento, así que no se puede desde acá. */
    if (ctx.usuario && Number(ctx.body.id) === ctx.usuario.id) {
      const e = new Error('No podés sacarte el acceso a vos mismo.');
      e.status = 400;
      throw e;
    }
    const r = C.bajaDePersonal(ctx.body.id);
    anotar(quien, 'baja de personal', `${r.usuario.nombre} (${r.usuario.telefono})`, ctx.ip);
    return r;
  },

  // ── Bitácora ──────────────────────────────────────────────────────────────
  'GET /api/admin/movimientos': (ctx) => {
    exigirClub(ctx);
    const limite = Math.min(Number(ctx.query.get('limite')) || 40, 200);
    return {
      movimientos: bitacora.ultimos(limite).map((m) => ({
        cuando: m.cuando,
        quien: m.quien,
        accion: m.accion,
        detalle: m.detalle,
      })),
    };
  },
};
