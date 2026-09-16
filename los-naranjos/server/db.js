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
      WHERE o.fecha = ?`
  ),
  insertarReserva: db.prepare(
    `INSERT INTO reservas
       (codigo, tipo, disciplina, cancha_id, fecha, inicio_min, duracion_min,
        nombre, telefono, email, notas, estado, creada_en, ip, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmada', ?, ?, ?)`
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
  activasPorTelefono: db.prepare(
    `SELECT COUNT(*) AS n FROM reservas
      WHERE telefono = ? AND estado = 'confirmada' AND tipo = 'reserva'
        AND fecha >= ?`
  ),
  porTelefono: db.prepare(
    `SELECT * FROM reservas
      WHERE telefono = ? AND tipo = 'reserva' AND fecha >= ?
      ORDER BY fecha, inicio_min`
  ),
  delDia: db.prepare(
    `SELECT * FROM reservas WHERE fecha = ? AND estado = 'confirmada'
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
      WHERE usuario_id = ? AND tipo = 'reserva' AND fecha >= ?
      ORDER BY fecha, inicio_min`
  ),
  historialDeUsuario: db.prepare(
    `SELECT * FROM reservas
      WHERE usuario_id = ? AND tipo = 'reserva'
      ORDER BY fecha DESC, inicio_min DESC
      LIMIT ?`
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
};

/** Mapa 'canchaId:slot' → 'reserva' | 'bloqueo' para una fecha. */
export function ocupacionDelDia(fecha) {
  const mapa = new Map();
  for (const fila of q.ocupacionDelDia.all(fecha)) {
    mapa.set(`${fila.cancha_id}:${fila.slot}`, fila.tipo);
  }
  return mapa;
}

/**
 * Crea una reserva y toma sus casilleros de forma atómica.
 * Si alguien ganó de mano el turno, lanza un error con code = 'OCUPADO'.
 */
export function crearReserva(datos, slots) {
  const codigo = nuevoCodigo();
  db.exec('BEGIN IMMEDIATE');
  try {
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
      ahoraISO(),
      datos.ip ?? null,
      datos.usuarioId ?? null
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

/** Cancela una reserva y libera sus casilleros. */
export function cancelarReserva(id) {
  db.exec('BEGIN IMMEDIATE');
  try {
    q.liberarSlots.run(id);
    q.cancelar.run(ahoraISO(), id);
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
  activasPorTelefono: (tel, desde) => q.activasPorTelefono.get(tel, desde).n,
  porTelefono: (tel, desde) => q.porTelefono.all(tel, desde),
  deUsuario: (id, desde) => q.reservasDeUsuario.all(id, desde),
  delDia: (fecha) => q.delDia.all(fecha),
  rango: (desde, hasta) => q.rangoAdmin.all(desde, hasta),
  desdeIpDesde: (ip, desdeISO) => q.desdeIpDesde.get(ip, desdeISO).n,
};
