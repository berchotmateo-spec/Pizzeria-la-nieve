/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  LOS NARANJOS — Configuración única del sitio y del sistema de turnos
 * ─────────────────────────────────────────────────────────────────────────────
 *  Este es el ÚNICO archivo que hace falta tocar para adaptar el sitio.
 *  Todo lo marcado con  // ⚠️ VERIFICAR  son datos tomados de directorios
 *  públicos de internet que conviene confirmar con el club.
 */

export const CLUB = {
  nombre: 'Los Naranjos',
  claim: 'Multiespacio deportivo',
  descripcion:
    'Pádel, pickleball, fútbol y gimnasio en el corazón de Mar del Plata. ' +
    'Canchas profesionales, escuela propia y un after con parrilla y bar.',

  // ── Ubicación ──────────────────────────────────────────────────────────────
  direccion: 'Dorrego 333',
  barrio: 'Mar del Plata',
  ciudad: 'Mar del Plata',
  provincia: 'Buenos Aires',
  cp: 'B7600',
  pais: 'Argentina',
  coordenadas: { lat: -38.0055, lng: -57.5426 }, // ⚠️ VERIFICAR (aproximado)

  // ── Contacto ───────────────────────────────────────────────────────────────
  telefono: '(0223) 472-9295',
  telefonoLink: '+542234729295',
  // ⚠️ VERIFICAR — es el dato más importante que falta: hoy TODAS las reservas
  // del club pasan por WhatsApp, así que el número tiene que ser el correcto.
  whatsapp: '5492234729295',
  email: 'reservas@losnaranjos.com.ar', // ⚠️ VERIFICAR — mail de reservas

  // ── Redes ──────────────────────────────────────────────────────────────────
  instagram: 'losnaranjospadel',
  facebook: 'multiespacio.losnaranjos',

  // ── Dominio (para SEO / datos estructurados) ───────────────────────────────
  sitio: 'https://losnaranjos.com.ar', // ⚠️ VERIFICAR — dominio definitivo

  zonaHoraria: 'America/Argentina/Buenos_Aires',
  moneda: 'ARS',
};

/**
 * Horario de atención por día de la semana (0 = domingo … 6 = sábado).
 * `abre` / `cierra` en formato HH:MM, hora local de Mar del Plata.
 * Poné `null` para un día cerrado.
 * ⚠️ VERIFICAR — y ojo con esto, porque se presta a confusión:
 *
 * `cierra` es la hora en que cierra el complejo, NO la hora del último turno.
 * El sistema ofrece un turno sólo si termina antes del cierre, así que el
 * último turno de 90 minutos arranca a `cierra` menos hora y media.
 *
 * En el Instagram del club el último turno figura a las 22:00. Para que ese
 * turno de 22:00 exista con 90 minutos de pádel, el cierre tiene que ser a las
 * 23:30 — que es lo que está puesto acá. Si en realidad cierran a las 23:00,
 * entonces el turno de las 22:00 es de una hora y el último de 90 minutos
 * arranca a las 21:30.
 *
 * Preguntar en el club cuál de las dos cosas es, y ajustar acá.
 */
export const HORARIOS = {
  0: { abre: '09:00', cierra: '22:30' }, // domingo
  1: { abre: '07:30', cierra: '23:30' },
  2: { abre: '07:30', cierra: '23:30' },
  3: { abre: '07:30', cierra: '23:30' },
  4: { abre: '07:30', cierra: '23:30' },
  5: { abre: '07:30', cierra: '23:30' },
  6: { abre: '08:00', cierra: '23:30' }, // sábado
};

/** Días no laborables o cierres especiales: 'YYYY-MM-DD': 'motivo' */
export const FERIADOS = {
  // '2026-12-25': 'Navidad',
};

/**
 * Disciplinas reservables. El `slug` se usa en la URL y en la base de datos.
 * `duraciones` en minutos — la primera es la que viene preseleccionada.
 */
export const DISCIPLINAS = [
  {
    slug: 'padel',
    nombre: 'Pádel',
    icono: 'padel',
    duraciones: [60, 90],
    duracionPorDefecto: 90,
    jugadores: '4 jugadores',
    descripcion:
      'Canchas de blindex con piso de césped sintético y luz LED. ' +
      'Alquiler de paletas y venta de pelotas en recepción.',
    precios: { 60: null, 90: null }, // ⚠️ COMPLETAR con tarifas reales
    destacada: true,
  },
  {
    slug: 'pickleball',
    nombre: 'Pickleball',
    icono: 'pickleball',
    duraciones: [60, 90],
    duracionPorDefecto: 60,
    jugadores: '2 a 4 jugadores',
    descripcion:
      'El deporte que más crece en el mundo, ahora en Mar del Plata. ' +
      'Paletas y pelotas incluidas en el alquiler.',
    precios: { 60: null, 90: null }, // ⚠️ COMPLETAR
  },
  {
    slug: 'futbol',
    nombre: 'Fútbol 5',
    icono: 'futbol',
    duraciones: [60],
    duracionPorDefecto: 60,
    jugadores: '10 jugadores',
    descripcion:
      'Cancha de césped sintético techada e iluminada, apta para jugar ' +
      'todo el año llueva o truene.',
    precios: { 60: null }, // ⚠️ COMPLETAR
  },
];

/**
 * Canchas del complejo.
 * ⚠️ VERIFICAR: las fuentes públicas hablan de 18 canchas de pádel.
 * Ajustá cantidad, nombres y atributos según el complejo real.
 */
export const CANCHAS = [
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `padel-${i + 1}`,
    nombre: `Pádel ${i + 1}`,
    disciplina: 'padel',
    superficie: 'Césped sintético',
    muros: i < 8 ? 'Blindex' : 'Muro',
    techada: i < 6,
    orden: i + 1,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    id: `padel-${i + 13}`,
    nombre: `Pádel ${i + 13}`,
    disciplina: 'padel',
    superficie: 'Césped sintético',
    muros: 'Blindex',
    techada: false,
    orden: i + 13,
  })),
  {
    id: 'pickle-1',
    nombre: 'Pickleball 1',
    disciplina: 'pickleball',
    superficie: 'Piso duro',
    techada: true,
    orden: 21,
  },
  {
    id: 'pickle-2',
    nombre: 'Pickleball 2',
    disciplina: 'pickleball',
    superficie: 'Piso duro',
    techada: true,
    orden: 22,
  },
  {
    id: 'futbol-1',
    nombre: 'Fútbol 5',
    disciplina: 'futbol',
    superficie: 'Césped sintético',
    techada: true,
    orden: 31,
  },
];

/** Reglas del sistema de turnos. */
export const RESERVAS = {
  /** Granularidad de la grilla, en minutos. No cambiar sin revisar la UI. */
  slotMinutos: 30,
  /** Con cuántos días de anticipación se puede reservar. */
  diasAnticipacion: 14,
  /** Antelación mínima para reservar un turno de hoy, en minutos. */
  minutosAntelacion: 60,
  /** Hasta cuántas horas antes se puede cancelar sin cargo. */
  horasCancelacion: 6,
  /** Máximo de turnos activos simultáneos por teléfono. */
  maxPorTelefono: 3,
  /** Máximo de reservas que una misma IP puede crear por hora. */
  maxPorIpHora: 10,
  /** Si es true, el sistema elige la cancha automáticamente. */
  asignacionAutomatica: true,
};

/**
 * Mostrar precios en el sitio.
 * Dejalo en `false` hasta cargar las tarifas reales en DISCIPLINAS.precios
 * y en SERVICIOS: mientras tanto el sitio muestra "Consultar" y un CTA a
 * WhatsApp, en lugar de publicar números equivocados.
 */
export const PRECIOS_PUBLICADOS = false;

/** Servicios e instalaciones que se muestran en la home. */
export const SERVICIOS = [
  { titulo: 'Gimnasio', texto: 'Sala de musculación con aparatos y espacio de entrenamiento funcional.', icono: 'gym' },
  { titulo: 'Bar y parrilla', texto: 'Bar con pantallas y parrillas para el tercer tiempo, con reserva previa.', icono: 'parrilla' },
  { titulo: 'Vestuarios', texto: 'Vestuarios con duchas de agua caliente y lockers para ambos géneros.', icono: 'vestuario' },
  { titulo: 'Escuelas', texto: 'Escuela de pádel y de fútbol para chicos y adultos, todos los niveles.', icono: 'escuela' },
  { titulo: 'Cumpleaños y eventos', texto: 'Organizamos cumpleaños, torneos internos y eventos de empresa.', icono: 'evento' },
  { titulo: 'Asistencia médica', texto: 'Servicio de asistencia médica disponible durante la actividad.', icono: 'salud' },
];

/** Programas / clases con cupo (no reservables online, solo informativos). */
export const PROGRAMAS = [
  {
    titulo: 'Escuela de pádel',
    nivel: 'Iniciación · Intermedio · Competitivo',
    texto: 'Clases grupales de 90 minutos, dos o tres veces por semana, con profesores certificados.',
  },
  {
    titulo: 'Clases particulares',
    nivel: 'Individual o en dupla',
    texto: 'Entrenamiento personalizado con análisis de técnica, táctica y video.',
  },
  {
    titulo: 'Escuela de fútbol infantil',
    nivel: 'De 5 a 14 años',
    texto: 'Formación deportiva en cancha techada, con foco en técnica individual y juego en equipo.',
  },
  {
    titulo: 'Torneos y americanos',
    nivel: 'Todas las categorías',
    texto: 'Americanos semanales y torneos por categoría durante todo el año.',
  },
];

/** Panel de administración. Definí ADMIN_TOKEN como variable de entorno. */
export const ADMIN = {
  token: process.env.ADMIN_TOKEN || 'naranjos-dev',
  tokenPorDefecto: !process.env.ADMIN_TOKEN,
};

export const SERVIDOR = {
  puerto: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  rutaDB: process.env.DB_PATH || new URL('../data/turnos.db', import.meta.url).pathname,
};
