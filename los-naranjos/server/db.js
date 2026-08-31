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

  CREATE INDEX IF NOT EXISTS idx_reservas_fecha    ON reservas (fecha, estado);
  CREATE INDEX IF NOT EXISTS idx_reservas_telefono ON reservas (telefono, estado);
  CREATE INDEX IF NOT EXISTS idx_ocupacion_fecha   ON ocupacion (fecha);
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
      WHERE o.fecha = ?`
  ),
  insertarReserva: db.prepare(
    `INSERT INTO reservas
       (codigo, tipo, disciplina, cancha_id, fecha, inicio_min, duracion_min,
        nombre, telefono, email, notas, estado, creada_en, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmada', ?, ?)`
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
      datos.ip ?? null
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

export const consultas = {
  porCodigo: (codigo) => q.porCodigo.get(codigo),
  porId: (id) => q.porId.get(id),
  activasPorTelefono: (tel, desde) => q.activasPorTelefono.get(tel, desde).n,
  porTelefono: (tel, desde) => q.porTelefono.all(tel, desde),
  delDia: (fecha) => q.delDia.all(fecha),
  rango: (desde, hasta) => q.rangoAdmin.all(desde, hasta),
  desdeIpDesde: (ip, desdeISO) => q.desdeIpDesde.get(ip, desdeISO).n,
};
