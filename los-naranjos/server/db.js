/** Capa de datos del sistema de turnos. SQLite embebido, sin dependencias. */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SERVIDOR } from './config.js';
import { ahoraISO } from './tiempo.js';

mkdirSync(dirname(SERVIDOR.rutaDB), { recursive: true });

export const db = new DatabaseSync(SERVIDOR.rutaDB);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS reservas (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo        TEXT    NOT NULL UNIQUE,
    tipo          TEXT    NOT NULL DEFAULT 'reserva',
    disciplina    TEXT    NOT NULL,
    cancha_id     TEXT    NOT NULL,
    fecha         TEXT    NOT NULL,
    inicio_min    INTEGER NOT NULL,
    duracion_min  INTEGER NOT NULL,
    nombre        TEXT,
    telefono      TEXT,
    email         TEXT,
    notas         TEXT,
    estado        TEXT    NOT NULL DEFAULT 'confirmada',
    creada_en     TEXT    NOT NULL,
    cancelada_en  TEXT,
    ip            TEXT
  );

  /* La clave primaria compuesta es lo que hace imposible la doble reserva:
     dos turnos no pueden ocupar el mismo casillero de la misma cancha. */
  CREATE TABLE IF NOT EXISTS ocupacion (
    cancha_id  TEXT    NOT NULL,
    fecha      TEXT    NOT NULL,
    slot       INTEGER NOT NULL,
    reserva_id INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
    PRIMARY KEY (cancha_id, fecha, slot)
  ) WITHOUT ROWID;

  /* Cuentas de los jugadores. El teléfono es el nombre de usuario: es el dato
     que ya usan para reservar y el que el club les pide por WhatsApp. */
  CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    telefono      TEXT    NOT NULL UNIQUE,
    nombre        TEXT    NOT NULL,
    email         TEXT,
    clave         TEXT    NOT NULL,
    creado_en     TEXT    NOT NULL,
    ultimo_acceso TEXT
  );

  /* Guardamos el hash del token, no el token: si alguien se lleva la base,
     no se lleva las sesiones abiertas. */
  CREATE TABLE IF NOT EXISTS sesiones (
    token_hash TEXT    NOT NULL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    creada_en  TEXT    NOT NULL,
    expira_en  TEXT    NOT NULL,
    ip         TEXT
  ) WITHOUT ROWID;

  /* Quién hizo qué en el panel del club. Con varias personas atendiendo el
     mostrador, "¿quién canceló este turno?" deja de ser una pregunta sin
     respuesta. */
  CREATE TABLE IF NOT EXISTS bitacora (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    cuando     TEXT NOT NULL,
    quien      TEXT NOT NULL,
    usuario_id INTEGER REFERENCES usuarios(id),
    accion     TEXT NOT NULL,
    detalle    TEXT,
    ip         TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_bitacora_cuando  ON bitacora (cuando DESC);
  CREATE INDEX IF NOT EXISTS idx_reservas_fecha    ON reservas (fecha, estado);
  CREATE INDEX IF NOT EXISTS idx_reservas_telefono ON reservas (telefono, estado);
  CREATE INDEX IF NOT EXISTS idx_ocupacion_fecha   ON ocupacion (fecha);
  CREATE INDEX IF NOT EXISTS idx_sesiones_usuario  ON sesiones (usuario_id);
`);

/* Las bases creadas antes de que existieran las cuentas no tienen la columna
   que ata una reserva a su dueño. Se agrega al vuelo: SQLite no tiene
   "ADD COLUMN IF NOT EXISTS", así que preguntamos antes. */
const columnasReservas = db.prepare('SELECT name FROM pragma_table_info(?)').all('reservas');
if (!columnasReservas.some((c) => c.name === 'usuario_id')) {
  db.exec('ALTER TABLE reservas ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_reservas_usuario ON reservas (usuario_id, fecha)');

/* Una misma cuenta sirve para jugar y para atender el mostrador: lo único que
   cambia es el rol. Así el dueño, que además juega, no necesita dos cuentas. */
const columnasUsuarios = db.prepare('SELECT name FROM pragma_table_info(?)').all('usuarios');
if (!columnasUsuarios.some((c) => c.name === 'rol')) {
  db.exec("ALTER TABLE usuarios ADD COLUMN rol TEXT NOT NULL DEFAULT 'jugador'");
}
db.exec('CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios (rol)');

/* ── Pagos ────────────────────────────────────────────────────────────────────
   Un turno que se paga online nace 'pendiente': ocupa sus casilleros mientras
   el jugador está en Mercado Pago, hasta `vence_en`. Si el pago entra, pasa a
   'confirmada'; si no, a 'vencida' y los casilleros se liberan.

   - cobro:    'seña' | 'total' | 'club' (lo cobra el mostrador) | null (sin pago online)
   - precio:   lo que valía el turno al reservarlo, si estaba cargado
   - a_pagar:  lo que se le pidió pagar online
   - pagado:   lo aprobado que corresponde a este turno (sin lo que hay que devolver)
   - pago_ref: el checkout vigente en la pasarela */
for (const [columna, tipo] of [
  ['vence_en', 'TEXT'],
  ['cobro', 'TEXT'],
  ['precio', 'INTEGER'],
  ['a_pagar', 'INTEGER'],
  ['pagado', 'INTEGER NOT NULL DEFAULT 0'],
  ['pago_ref', 'TEXT'],
]) {
  const columnas = db.prepare('SELECT name FROM pragma_table_info(?)').all('reservas');
  if (!columnas.some((c) => c.name === columna)) {
    db.exec(`ALTER TABLE reservas ADD COLUMN ${columna} ${tipo}`);
  }
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_reservas_pendientes ON reservas (estado, vence_en);
  CREATE INDEX IF NOT EXISTS idx_reservas_pago_ref   ON reservas (pago_ref);

  /* Cada pago que informa la pasarela, aprobado o no. La clave única
     (proveedor, externo_id) es lo que hace que un mismo aviso llegue dos veces
     y se cuente una sola. */
  CREATE TABLE IF NOT EXISTS pagos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    reserva_id     INTEGER NOT NULL REFERENCES reservas(id),
    proveedor      TEXT    NOT NULL,
    externo_id     TEXT    NOT NULL,
    monto          INTEGER NOT NULL,
    estado         TEXT    NOT NULL,   -- 'aprobado' | 'rechazado' | 'pendiente' | 'devuelto'
    detalle        TEXT,
    devolucion     TEXT,               -- null | 'pendiente' | 'hecha' | 'no'
    motivo         TEXT,               -- por qué hay que devolverlo
    creado_en      TEXT    NOT NULL,
    actualizado_en TEXT    NOT NULL,
    UNIQUE (proveedor, externo_id)
  );

  CREATE INDEX IF NOT EXISTS idx_pagos_reserva    ON pagos (reserva_id);
  CREATE INDEX IF NOT EXISTS idx_pagos_devolucion ON pagos (devolucion);
`);

const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin 0/O ni 1/I
const existeCodigo = db.prepare('SELECT 1 FROM reservas WHERE codigo = ?');

/** Genera un código corto e inequívoco tipo "LN-7K3QP". */
export function nuevoCodigo() {
  for (let intento = 0; intento < 50; intento++) {
    let c = '';
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    for (const b of bytes) c += ALFABETO[b % ALFABETO.length];
    const codigo = `LN-${c}`;
    if (!existeCodigo.get(codigo)) return codigo;
  }
  throw new Error('No se pudo generar un código único');
}

const q = {
  ocupacionDelDia: db.prepare(
    `SELECT o.cancha_id, o.slot, r.tipo
       FROM ocupacion o JOIN reservas r ON r.id = o.reserva_id
      WHERE o.fecha = ?
        AND NOT (r.estado = 'pendiente' AND r.vence_en <= ?)`
  ),
  insertarReserva: db.prepare(
    `INSERT INTO reservas
       (codigo, tipo, disciplina, cancha_id, fecha, inicio_min, duracion_min,
        nombre, telefono, email, notas, estado, creada_en, ip, usuario_id,
        vence_en, cobro, precio, a_pagar)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  insertarOcupacion: db.prepare(
    'INSERT INTO ocupacion (cancha_id, fecha, slot, reserva_id) VALUES (?, ?, ?, ?)'
  ),
  porId: db.prepare('SELECT * FROM reservas WHERE id = ?'),
  porCodigo: db.prepare('SELECT * FROM reservas WHERE codigo = ?'),
  liberarSlots: db.prepare('DELETE FROM ocupacion WHERE reserva_id = ?'),
  cancelar: db.prepare(
    "UPDATE reservas SET estado = 'cancelada', cancelada_en = ? WHERE id = ?"
  ),
  /* Un turno esperando el pago cuenta como activo: si no, alguien podría
     apartar media grilla sin pagar nada. */
  activasPorTelefono: db.prepare(
    `SELECT COUNT(*) AS n FROM reservas
      WHERE telefono = ? AND tipo = 'reserva' AND fecha >= ?
        AND (estado = 'confirmada' OR (estado = 'pendiente' AND vence_en > ?))`
  ),
  /* Un apartado que venció sin pagar no le sirve a nadie en su lista. */
  porTelefono: db.prepare(
    `SELECT * FROM reservas
      WHERE telefono = ? AND tipo = 'reserva' AND fecha >= ? AND estado != 'vencida'
      ORDER BY fecha, inicio_min`
  ),
  delDia: db.prepare(
    `SELECT * FROM reservas
      WHERE fecha = ?
        AND (estado = 'confirmada' OR (estado = 'pendiente' AND vence_en > ?))
      ORDER BY inicio_min, cancha_id`
  ),
  rangoAdmin: db.prepare(
    `SELECT * FROM reservas WHERE fecha BETWEEN ? AND ?
      ORDER BY fecha, inicio_min, cancha_id`
  ),
  desdeIpDesde: db.prepare(
    "SELECT COUNT(*) AS n FROM reservas WHERE ip = ? AND creada_en > ?"
  ),

  // ── Cuentas ──────────────────────────────────────────────────────────────
  crearUsuario: db.prepare(
    'INSERT INTO usuarios (telefono, nombre, email, clave, creado_en) VALUES (?, ?, ?, ?, ?)'
  ),
  usuarioPorId: db.prepare('SELECT * FROM usuarios WHERE id = ?'),
  usuarioPorTelefono: db.prepare('SELECT * FROM usuarios WHERE telefono = ?'),
  actualizarPerfil: db.prepare('UPDATE usuarios SET nombre = ?, email = ? WHERE id = ?'),
  actualizarClave: db.prepare('UPDATE usuarios SET clave = ? WHERE id = ?'),
  marcarAcceso: db.prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?'),
  /* Al crear la cuenta, los turnos que ya había sacado con ese teléfono
     pasan a ser suyos: nadie quiere empezar de cero. */
  adoptarReservas: db.prepare(
    'UPDATE reservas SET usuario_id = ? WHERE telefono = ? AND usuario_id IS NULL'
  ),
  reservasDeUsuario: db.prepare(
    `SELECT * FROM reservas
      WHERE usuario_id = ? AND tipo = 'reserva' AND fecha >= ? AND estado != 'vencida'
      ORDER BY fecha, inicio_min`
  ),
  historialDeUsuario: db.prepare(
    `SELECT * FROM reservas
      WHERE usuario_id = ? AND tipo = 'reserva' AND estado != 'vencida'
      ORDER BY fecha DESC, inicio_min DESC
      LIMIT ?`
  ),

  // ── Personal del club ────────────────────────────────────────────────────
  personalDelClub: db.prepare(
    `SELECT id, nombre, telefono, email, creado_en, ultimo_acceso
       FROM usuarios WHERE rol = 'club' ORDER BY nombre`
  ),
  cambiarRol: db.prepare('UPDATE usuarios SET rol = ? WHERE id = ?'),

  // ── Bitácora ─────────────────────────────────────────────────────────────
  anotar: db.prepare(
    'INSERT INTO bitacora (cuando, quien, usuario_id, accion, detalle, ip) VALUES (?, ?, ?, ?, ?, ?)'
  ),
  ultimosMovimientos: db.prepare(
    'SELECT * FROM bitacora ORDER BY id DESC LIMIT ?'
  ),

  // ── Sesiones ─────────────────────────────────────────────────────────────
  crearSesion: db.prepare(
    'INSERT INTO sesiones (token_hash, usuario_id, creada_en, expira_en, ip) VALUES (?, ?, ?, ?, ?)'
  ),
  sesionPorHash: db.prepare(
    `SELECT s.token_hash, s.expira_en, u.*
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ?`
  ),
  borrarSesion: db.prepare('DELETE FROM sesiones WHERE token_hash = ?'),
  borrarSesionesDe: db.prepare('DELETE FROM sesiones WHERE usuario_id = ?'),
  limpiarSesiones: db.prepare('DELETE FROM sesiones WHERE expira_en < ?'),

  // ── Pagos ────────────────────────────────────────────────────────────────
  liberarVencidas: db.prepare(
    `DELETE FROM ocupacion WHERE reserva_id IN
       (SELECT id FROM reservas WHERE estado = 'pendiente' AND vence_en <= ?)`
  ),
  marcarVencidas: db.prepare(
    "UPDATE reservas SET estado = 'vencida' WHERE estado = 'pendiente' AND vence_en <= ?"
  ),
  guardarCheckout: db.prepare(
    "UPDATE reservas SET pago_ref = ?, cobro = ?, a_pagar = ? WHERE id = ? AND estado = 'pendiente'"
  ),
  porPagoRef: db.prepare('SELECT * FROM reservas WHERE pago_ref = ?'),
  descartar: db.prepare("UPDATE reservas SET estado = 'vencida' WHERE id = ? AND estado = 'pendiente'"),
  confirmarPendiente: db.prepare(
    "UPDATE reservas SET estado = 'confirmada', vence_en = NULL, cobro = COALESCE(?, cobro) WHERE id = ?"
  ),
  casillerosTomados: db.prepare(
    'SELECT COUNT(*) AS n FROM ocupacion WHERE cancha_id = ? AND fecha = ? AND slot BETWEEN ? AND ?'
  ),
  pagoPorExterno: db.prepare('SELECT * FROM pagos WHERE proveedor = ? AND externo_id = ?'),
  pagoPorId: db.prepare('SELECT * FROM pagos WHERE id = ?'),
  insertarPago: db.prepare(
    `INSERT INTO pagos (reserva_id, proveedor, externo_id, monto, estado, detalle, creado_en, actualizado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  actualizarPago: db.prepare(
    'UPDATE pagos SET estado = ?, detalle = ?, actualizado_en = ? WHERE id = ?'
  ),
  paraDevolver: db.prepare(
    "UPDATE pagos SET devolucion = 'pendiente', motivo = ?, actualizado_en = ? WHERE id = ?"
  ),
  paraDevolverDeReserva: db.prepare(
    `UPDATE pagos SET devolucion = 'pendiente', motivo = ?, actualizado_en = ?
      WHERE reserva_id = ? AND estado = 'aprobado' AND devolucion IS NULL`
  ),
  resolverDevolucion: db.prepare(
    "UPDATE pagos SET devolucion = ?, actualizado_en = ? WHERE id = ? AND devolucion = 'pendiente'"
  ),
  marcarDevuelto: db.prepare(
    "UPDATE pagos SET estado = 'devuelto', actualizado_en = ? WHERE id = ?"
  ),
  /* Lo pagado de un turno es lo aprobado que no hay que devolver. */
  recalcularPagado: db.prepare(
    `UPDATE reservas SET pagado = (
       SELECT COALESCE(SUM(monto), 0) FROM pagos
        WHERE reserva_id = reservas.id AND estado = 'aprobado' AND devolucion IS NULL
     ) WHERE id = ?`
  ),
  pagosDeReserva: db.prepare('SELECT * FROM pagos WHERE reserva_id = ? ORDER BY id'),
  pagosARevisar: db.prepare("SELECT * FROM pagos WHERE devolucion = 'pendiente' ORDER BY id DESC"),
};

/** Mapa 'canchaId:slot' → 'reserva' | 'bloqueo' para una fecha. */
export function ocupacionDelDia(fecha) {
  const mapa = new Map();
  for (const fila of q.ocupacionDelDia.all(fecha, ahoraISO())) {
    mapa.set(`${fila.cancha_id}:${fila.slot}`, fila.tipo);
  }
  return mapa;
}

/**
 * Crea una reserva y toma sus casilleros de forma atómica.
 * Si alguien ganó de mano el turno, lanza un error con code = 'OCUPADO'.
 *
 * Antes de tomar los casilleros se sueltan los de los apartados que vencieron
 * sin pagar: si no, un pago abandonado seguiría ocupando la cancha.
 */
export function crearReserva(datos, slots) {
  const codigo = nuevoCodigo();
  db.exec('BEGIN IMMEDIATE');
  try {
    liberarVencidasAdentro();
    const { lastInsertRowid } = q.insertarReserva.run(
      codigo,
      datos.tipo || 'reserva',
      datos.disciplina,
      datos.canchaId,
      datos.fecha,
      datos.inicioMin,
      datos.duracionMin,
      datos.nombre ?? null,
      datos.telefono ?? null,
      datos.email ?? null,
      datos.notas ?? null,
      datos.estado || 'confirmada',
      ahoraISO(),
      datos.ip ?? null,
      datos.usuarioId ?? null,
      datos.venceEn ?? null,
      datos.cobro ?? null,
      datos.precio ?? null,
      datos.aPagar ?? null
    );
    for (const slot of slots) {
      q.insertarOcupacion.run(datos.canchaId, datos.fecha, slot, lastInsertRowid);
    }
    db.exec('COMMIT');
    return q.porId.get(lastInsertRowid);
  } catch (err) {
    db.exec('ROLLBACK');
    if (String(err.message).includes('UNIQUE') || String(err.message).includes('PRIMARY KEY')) {
      const e = new Error('Ese turno acaba de ser tomado por otra persona.');
      e.code = 'OCUPADO';
      throw e;
    }
    throw err;
  }
}

/**
 * Cancela una reserva y libera sus casilleros.
 * Si tenía pagos aprobados, quedan marcados para que el club los devuelva
 * (o los resuelva de otra forma) desde el panel.
 */
export function cancelarReserva(id) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const ahora = ahoraISO();
    q.liberarSlots.run(id);
    q.cancelar.run(ahora, id);
    q.paraDevolverDeReserva.run('Turno cancelado', ahora, id);
    q.recalcularPagado.run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return q.porId.get(id);
}

/** Registra al jugador y se queda con los turnos que ya tenía ese teléfono. */
export function crearUsuario({ telefono, nombre, email, clave }) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const { lastInsertRowid } = q.crearUsuario.run(
      telefono, nombre, email ?? null, clave, ahoraISO()
    );
    const { changes } = q.adoptarReservas.run(lastInsertRowid, telefono);
    db.exec('COMMIT');
    return { usuario: q.usuarioPorId.get(lastInsertRowid), reservasAdoptadas: Number(changes) };
  } catch (err) {
    db.exec('ROLLBACK');
    if (String(err.message).includes('UNIQUE')) {
      const e = new Error('Ya hay una cuenta con ese teléfono.');
      e.code = 'TELEFONO_EN_USO';
      throw e;
    }
    throw err;
  }
}

export const cuentas = {
  porId: (id) => q.usuarioPorId.get(id),
  porTelefono: (tel) => q.usuarioPorTelefono.get(tel),
  actualizarPerfil: (id, nombre, email) => q.actualizarPerfil.run(nombre, email ?? null, id),
  actualizarClave: (id, clave) => q.actualizarClave.run(clave, id),
  marcarAcceso: (id) => q.marcarAcceso.run(ahoraISO(), id),
  reservasActivas: (id, desde) => q.reservasDeUsuario.all(id, desde),
  historial: (id, limite = 20) => q.historialDeUsuario.all(id, limite),
};

export const personal = {
  listar: () => q.personalDelClub.all(),
  cambiarRol: (id, rol) => q.cambiarRol.run(rol, id),
};

export const bitacora = {
  anotar: ({ quien, usuarioId, accion, detalle, ip }) =>
    q.anotar.run(ahoraISO(), quien, usuarioId ?? null, accion, detalle ?? null, ip ?? null),
  ultimos: (limite = 40) => q.ultimosMovimientos.all(limite),
};

export const sesiones = {
  crear: (tokenHash, usuarioId, expiraEn, ip) =>
    q.crearSesion.run(tokenHash, usuarioId, ahoraISO(), expiraEn, ip ?? null),
  porHash: (tokenHash) => q.sesionPorHash.get(tokenHash),
  borrar: (tokenHash) => q.borrarSesion.run(tokenHash),
  borrarTodasDe: (usuarioId) => q.borrarSesionesDe.run(usuarioId),
  limpiarVencidas: () => q.limpiarSesiones.run(ahoraISO()),
};

export const consultas = {
  porCodigo: (codigo) => q.porCodigo.get(codigo),
  porId: (id) => q.porId.get(id),
  activasPorTelefono: (tel, desde) => q.activasPorTelefono.get(tel, desde, ahoraISO()).n,
  porTelefono: (tel, desde) => q.porTelefono.all(tel, desde),
  deUsuario: (id, desde) => q.reservasDeUsuario.all(id, desde),
  delDia: (fecha) => q.delDia.all(fecha, ahoraISO()),
  rango: (desde, hasta) => q.rangoAdmin.all(desde, hasta),
  desdeIpDesde: (ip, desdeISO) => q.desdeIpDesde.get(ip, desdeISO).n,
};

/* ── Pagos ────────────────────────────────────────────────────────────────── */

/** Suelta los casilleros de los apartados vencidos. Va dentro de una transacción abierta. */
function liberarVencidasAdentro() {
  const ahora = ahoraISO();
  q.liberarVencidas.run(ahora);
  q.marcarVencidas.run(ahora);
}

/** Marca como vencidos los turnos que nadie pagó a tiempo y libera sus canchas. */
export function vencerPendientes() {
  db.exec('BEGIN IMMEDIATE');
  try {
    liberarVencidasAdentro();
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Suelta un turno que estaba esperando el pago: el jugador se arrepintió o no
 * se pudo abrir el cobro. Queda 'vencida', no 'cancelada': nunca llegó a ser
 * un turno, y así no ensucia la lista de "Mis turnos". Si igual entra un pago
 * después, se lo trata como a cualquier pago tardío.
 */
export function descartarPendiente(id) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = q.porId.get(id);
    if (r?.estado === 'pendiente') {
      q.liberarSlots.run(id);
      q.descartar.run(id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return q.porId.get(id);
}

/**
 * Aplica lo que informa la pasarela sobre un pago, de forma atómica.
 * Se puede llamar las veces que haga falta con el mismo pago —el aviso de
 * Mercado Pago y la vuelta del jugador llegan por caminos distintos y a veces
 * repetidos—: la clave única (proveedor, externo_id) hace que cuente una vez.
 *
 * Devuelve qué pasó con el turno:
 *  - 'confirmada':  el pago dejó el turno firme;
 *  - 'recuperada':  el apartado había vencido, pero la cancha seguía libre;
 *  - 'a-devolver':  el pago no se puede usar (ver `motivo`) y queda para el club;
 *  - 'registrado':  pago no aprobado (rechazado, en proceso): el turno sigue igual;
 *  - 'sin-cambios': ya se había procesado.
 */
export function aplicarPago({ reservaId, proveedor, externoId, monto, estado, detalle, slots, minimo, cobro }) {
  db.exec('BEGIN IMMEDIATE');
  try {
    liberarVencidasAdentro();
    const ahora = ahoraISO();
    const previo = q.pagoPorExterno.get(proveedor, externoId);

    if (previo) {
      if (previo.estado === estado) {
        db.exec('COMMIT');
        return { resultado: 'sin-cambios', pago: previo };
      }
      q.actualizarPago.run(estado, detalle ?? previo.detalle, ahora, previo.id);
      // Si lo devolvieron desde la cuenta de Mercado Pago, ya no hay nada pendiente.
      if (estado === 'devuelto' && previo.devolucion === 'pendiente') {
        q.resolverDevolucion.run('hecha', ahora, previo.id);
      }
    } else {
      q.insertarPago.run(reservaId, proveedor, externoId, monto, estado, detalle ?? null, ahora, ahora);
    }

    const pago = q.pagoPorExterno.get(proveedor, externoId);
    if (estado !== 'aprobado' || (previo && previo.estado === 'aprobado')) {
      q.recalcularPagado.run(reservaId);
      db.exec('COMMIT');
      return { resultado: 'registrado', pago };
    }

    const r = q.porId.get(reservaId);
    let resultado = 'a-devolver';
    let motivo = null;

    if (monto < (minimo ?? 0)) {
      motivo = 'El pago no alcanza el monto pedido';
    } else if (r.estado === 'pendiente') {
      q.confirmarPendiente.run(cobro ?? null, r.id);
      resultado = 'confirmada';
    } else if (r.estado === 'vencida') {
      // Pagó justo cuando se le venció el tiempo: si nadie tomó la cancha, el
      // turno es suyo; si no, la plata queda para devolver.
      const libre = q.casillerosTomados.get(
        r.cancha_id, r.fecha, slots[0], slots[slots.length - 1]
      ).n === 0;
      if (libre) {
        for (const slot of slots) q.insertarOcupacion.run(r.cancha_id, r.fecha, slot, r.id);
        q.confirmarPendiente.run(cobro ?? null, r.id);
        resultado = 'recuperada';
      } else {
        motivo = 'Pagó cuando el turno ya se había liberado y lo tomó otra persona';
      }
    } else if (r.estado === 'confirmada') {
      motivo = 'Pago repetido: el turno ya estaba pagado';
    } else {
      motivo = 'Pagó un turno que ya estaba cancelado';
    }

    if (motivo) q.paraDevolver.run(motivo, ahora, pago.id);
    q.recalcularPagado.run(r.id);
    db.exec('COMMIT');
    return { resultado, motivo, pago: q.pagoPorId.get(pago.id) };
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const pagos = {
  guardarCheckout: (reservaId, ref, cobro, aPagar) => q.guardarCheckout.run(ref, cobro, aPagar, reservaId).changes > 0,
  reservaPorRef: (ref) => q.porPagoRef.get(ref),
  porId: (id) => q.pagoPorId.get(id),
  porExterno: (proveedor, externoId) => q.pagoPorExterno.get(proveedor, externoId),
  deReserva: (reservaId) => q.pagosDeReserva.all(reservaId),
  aRevisar: () => q.pagosARevisar.all(),
  /** Deja resuelta una devolución: 'hecha' (se devolvió) o 'no' (se arregló de otra forma). */
  resolver(id, como) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const { changes } = q.resolverDevolucion.run(como, ahoraISO(), id);
      if (changes && como === 'hecha') q.marcarDevuelto.run(ahoraISO(), id);
      db.exec('COMMIT');
      return changes > 0;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  },
};
