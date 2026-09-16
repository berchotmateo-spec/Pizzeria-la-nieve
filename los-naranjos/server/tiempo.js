/** Utilidades de fecha y hora ancladas a la zona horaria del club. */
import { CLUB } from './config.js';

const TZ = CLUB.zonaHoraria;

const fmtFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});
const fmtHora = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
});

/** Fecha de hoy en el club, como 'YYYY-MM-DD'. */
export function hoy() {
  return fmtFecha.format(new Date());
}

/** Minutos transcurridos desde la medianoche de hoy en el club. */
export function ahoraEnMinutos() {
  const [h, m] = fmtHora.format(new Date()).split(':').map(Number);
  return h * 60 + m;
}

/** Marca de tiempo ISO para guardar en la base. */
export function ahoraISO() {
  return new Date().toISOString();
}

/** Día de la semana (0 = domingo) de una fecha 'YYYY-MM-DD'. */
export function diaSemana(fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Suma días a una fecha 'YYYY-MM-DD' y devuelve otra 'YYYY-MM-DD'. */
export function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  t.setUTCDate(t.getUTCDate() + dias);
  return t.toISOString().slice(0, 10);
}

/** Diferencia en días entre dos fechas 'YYYY-MM-DD'. */
export function diasEntre(desde, hasta) {
  const ms = Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

/** '18:30' → 1110 */
export function aMinutos(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

/** 1110 → '18:30' */
export function aHora(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** ¿La cadena tiene forma de fecha válida 'YYYY-MM-DD'? */
export function esFechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return false;
  const [a, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** 'martes 3 de septiembre' */
export function fechaLarga(fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  return `${DIAS[diaSemana(fecha)]} ${d} de ${MESES[m - 1]}`;
}

export { DIAS, MESES };
