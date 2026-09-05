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
  claim: 'Pádel en Mar del Plata',
  descripcion:
    'Siete canchas de pádel techadas en el corazón de Mar del Plata, ' +
    'con vestuarios y bar. Reservá tu turno online.',

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
  // El canal por el que hoy se reservan TODOS los turnos: 223 547-0343.
  // Formato para wa.me: 54 + 9 (móvil) + área sin el 0 + número sin el 15.
  whatsapp: '5492235470343',
  // El club no publica un correo. Mientras no lo dé, el sitio no muestra
  // ninguno: es preferible un dato de menos que uno inventado.
  email: null,

  // ── Redes ──────────────────────────────────────────────────────────────────
  instagram: 'losnaranjos_mdq',
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
 * Ojo con esto, porque se presta a confusión: `cierra` es la hora en que cierra
 * el complejo, NO la hora del último turno. El sistema ofrece un turno sólo si
 * termina antes del cierre.
 *
 * Con el cierre a las 23:30 que está puesto acá:
 *   · el último turno de 90 minutos arranca a las 22:00
 *   · el último turno de 60 minutos arranca a las 22:30
 *
 * Las dos cosas coinciden con lo que el club publica en Instagram, así que
 * 23:30 es la mejor hipótesis disponible.
 *
 * ⚠️ VERIFICAR igual: el club no publica su horario, esto es una deducción a
 * partir de los turnos que ofrece. Confirmar sobre todo la hora de APERTURA,
 * para la que no hay ningún dato propio (7:30 sale de directorios de terceros).
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
      'Canchas de blindex con piso de césped sintético y luz LED, ' +
      'todas techadas. Alquiler de paletas y venta de pelotas en recepción.',
    precios: { 60: null, 90: null }, // ⚠️ COMPLETAR con tarifas reales
    destacada: true,
  },
];
// El club sólo ofrece pádel: sin pickleball ni fútbol. Si en algún momento
// suman otra disciplina, se agrega acá como un objeto más en este arreglo.


/**
 * Canchas del complejo: 7 canchas de pádel, todas techadas.
 * Si el club suma o saca una cancha, alcanza con cambiar el número de acá:
 * el sitio, la grilla de turnos y el panel se acomodan solos.
 *
 * Una de las siete es la central, con gradas: donde se juegan las finales de
 * los torneos y la que la gente pide para jugar en serio.
 * ⚠️ VERIFICAR cuál es. Quedó puesta la primera porque es lo más habitual; si
 * en el club es otra, se cambia `CANCHA_CENTRAL` y se acomoda todo solo.
 */
const CANCHA_CENTRAL = 1;

export const CANCHAS = Array.from({ length: 7 }, (_, i) => {
  const numero = i + 1;
  const central = numero === CANCHA_CENTRAL;
  return {
    id: `padel-${numero}`,
    nombre: central ? 'Central' : `Pádel ${numero}`,
    disciplina: 'padel',
    superficie: 'Césped sintético',
    techada: true,
    // Con gradas para mirar: el dato que hace que alguien elija esta cancha.
    gradas: central,
    orden: numero,
  };
});

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

/**
 * Servicios e instalaciones que se muestran en la home.
 * Sólo lo que el club confirmó que es suyo. El gimnasio y las canchas de
 * fútbol están en el mismo predio pero los maneja otra gente, así que se
 * nombran como lo que son: vecinos, no servicios propios.
 */
export const SERVICIOS = [
  { titulo: 'Vestuarios', texto: 'Duchas con agua caliente, para irte cambiado.', icono: 'vestuario' },
  { titulo: 'Bar', texto: 'Bebidas frías al salir de la cancha.', icono: 'parrilla' },
  { titulo: 'Techado y luz LED', texto: 'Las siete canchas bajo techo e iluminadas.', icono: 'padel' },
  { titulo: 'En el mismo predio', texto: 'Gimnasio y canchas de fútbol, con administración propia.', icono: 'gym' },
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
