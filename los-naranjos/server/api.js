/** Endpoints JSON del sistema de turnos. */
import {
  CLUB, DISCIPLINAS, CANCHAS, HORARIOS, RESERVAS, SERVICIOS, PROGRAMAS,
  PRECIOS_PUBLICADOS, ADMIN, FERIADOS, CUENTAS,
} from './config.js';
import * as N from './turnos.js';
import * as T from './tiempo.js';
import * as C from './cuentas.js';
import { cuentas } from './db.js';

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

function exigirAdmin(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const esperado = ADMIN.token;
  // Comparación de longitud constante para no filtrar el token por tiempos.
  if (token.length !== esperado.length) throw noAutorizado();
  let distinto = 0;
  for (let i = 0; i < token.length; i++) distinto |= token.charCodeAt(i) ^ esperado.charCodeAt(i);
  if (distinto !== 0) throw noAutorizado();
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
  'POST /api/admin/sesion': ({ req }) => {
    exigirAdmin(req);
    return { ok: true, avisoTokenPorDefecto: ADMIN.tokenPorDefecto };
  },

  'GET /api/admin/dia': ({ req, query }) => {
    exigirAdmin(req);
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

  'GET /api/admin/agenda': ({ req, query }) => {
    exigirAdmin(req);
    const desde = query.get('desde') || T.hoy();
    const hasta = query.get('hasta') || T.sumarDias(desde, 7);
    if (!T.esFechaValida(desde) || !T.esFechaValida(hasta)) {
      const e = new Error('Rango de fechas inválido.'); e.status = 400; throw e;
    }
    return { desde, hasta, reservas: N.consultas.rango(desde, hasta).map(N.serializar) };
  },

  'POST /api/admin/bloqueos': ({ req, body }) => {
    exigirAdmin(req);
    return { ok: true, reserva: N.serializar(N.bloquear(body)) };
  },

  'POST /api/admin/cancelar': ({ req, body }) => {
    exigirAdmin(req);
    const r = N.consultas.porCodigo(String(body.codigo || '').trim().toUpperCase());
    if (!r) { const e = new Error('No existe esa reserva.'); e.status = 404; throw e; }
    if (r.estado === 'cancelada') { const e = new Error('Ya estaba cancelada.'); e.status = 400; throw e; }
    return { ok: true, reserva: N.serializar(N.cancelarReserva(r.id)) };
  },
};
