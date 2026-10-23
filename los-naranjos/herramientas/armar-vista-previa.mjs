/**
 * Arma una vista previa navegable del sitio en un único archivo HTML.
 *
 *   npm run vista-previa   →   vista-previa/index.html
 *
 * El archivo que genera se abre haciendo doble clic, sin instalar nada y sin
 * servidor: reutiliza el CSS y el JavaScript reales del sitio, y lo único que
 * cambia es que el sistema de turnos corre dentro del navegador, con datos de
 * demostración que quedan guardados en el propio dispositivo.
 *
 * Sirve para mostrar el proyecto (al club, a un diseñador, a quien sea) sin
 * tener que publicarlo. Trae el panel del club con datos de demostración, pero
 * no reemplaza al sitio real: lo que se reserva acá queda en el navegador y no
 * le llega a nadie.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const leer = (p) => readFileSync(RAIZ + p, 'utf8');

const entre = (texto, inicio, fin, etiqueta) => {
  const desde = texto.indexOf(inicio);
  if (desde < 0) throw new Error(`No encontré el inicio de ${etiqueta}`);
  const hasta = texto.indexOf(fin, desde);
  if (hasta < 0) throw new Error(`No encontré el fin de ${etiqueta}`);
  return texto.slice(desde, hasta + fin.length);
};

// ── Fuentes ────────────────────────────────────────────────────────────────
const indice = leer('public/index.html');
const reservar = leer('public/reservar.html');
const turnos = leer('public/mis-turnos.html');
const cuenta = leer('public/cuenta.html');
const admin = leer('public/admin.html');
const pagoSimulado = leer('public/pago-simulado.html');

const sprite = entre(indice, '<svg xmlns="http://www.w3.org/2000/svg" style="display:none"', '</svg>', 'sprite');
const cabecera = entre(indice, '<header class="cabecera">', '</header>', 'cabecera');
const pie = entre(indice, '<footer class="pie">', '</footer>', 'pie');
const flotante = entre(indice, '<a class="wsp-flotante"', '</a>', 'botón de WhatsApp');

let inicio = entre(indice, '<main id="contenido">', '</main>', 'main de la home');
let vistaReservar =
  entre(reservar, '<section class="tapa">', '</section>', 'tapa de reservar') +
  entre(reservar, '<main id="contenido">', '</main>', 'main de reservar');
let vistaTurnos =
  entre(turnos, '<section class="tapa">', '</section>', 'tapa de turnos') +
  entre(turnos, '<main id="contenido">', '</main>', 'main de turnos') +
  entre(turnos, '<dialog class="modal" id="modal-cancelar">', '</dialog>', 'modal de cancelación');
let vistaCuenta =
  entre(cuenta, '<section class="tapa">', '</section>', 'tapa de cuenta') +
  entre(cuenta, '<main id="contenido">', '</main>', 'main de cuenta') +
  entre(cuenta, '<dialog class="modal" id="modal-cancelar">', '</dialog>', 'modal de cuenta');

// El navegador bloquea las descargas dentro de la vista previa: sacamos el .ics.
vistaReservar = vistaReservar.replace(
  entre(vistaReservar, '<a class="boton" id="descargar-ics"', '</a>', 'botón de agendar'), '');

// `#telefono` existe en reservar y en mis-turnos: en una sola página chocan.
vistaTurnos = vistaTurnos
  .replace('for="telefono"', 'for="mt-telefono"')
  .replace('id="telefono" name="telefono"', 'id="mt-telefono" name="telefono"')
  .replace('for="codigo"', 'for="mt-codigo"')
  .replace('id="codigo" name="codigo"', 'id="mt-codigo" name="codigo"');

/* La cuenta también lista turnos y también tiene su modal de cancelación, así
   que en la página única sus identificadores llevan prefijo. */
const ID_CUENTA = [
  ['turnos', 'cta-turnos'],
  ['modal-cancelar', 'cta-modal'],
  ['detalle-cancelacion', 'cta-detalle'],
  ['error-cancelacion', 'cta-error-cancelacion'],
  ['confirmar-cancelacion', 'cta-confirmar'],
];
const renombrarEnCuenta = (texto) => ID_CUENTA.reduce(
  (acc, [viejo, nuevo]) =>
    acc.replaceAll(`id="${viejo}"`, `id="${nuevo}"`).replaceAll(`$('#${viejo}')`, `$('#${nuevo}')`),
  texto
);
vistaCuenta = renombrarEnCuenta(vistaCuenta);

/* El panel del club entra entero: pantalla de acceso, panel y los dos modales.
   Su modal de cancelación choca con el de "mis turnos", así que va con prefijo. */
const ID_ADMIN = [
  ['modal-cancelar', 'adm-modal'],
  ['detalle-cancelacion', 'adm-detalle'],
  ['error-cancelacion', 'adm-error-cancelacion'],
  ['confirmar-cancelacion', 'adm-confirmar'],
];
const renombrarEnAdmin = (texto) => ID_ADMIN.reduce(
  (acc, [viejo, nuevo]) =>
    acc.replaceAll(`id="${viejo}"`, `id="${nuevo}"`).replaceAll(`$('#${viejo}')`, `$('#${nuevo}')`),
  texto
);

/* El panel real tiene su propia cabecera oscura, con quién entró y el botón de
   salir. Acá la cabecera es la del sitio, así que esa barra se rearma como una
   tapa: sin ella, admin.js busca botones que no existen. */
const tapaAdmin = `
<section class="tapa">
  <div class="envoltura tapa__interior" style="flex-direction:row;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;display:flex">
    <div>
      <p class="migas"><a href="/">Inicio</a> <span>/</span> <span>Panel del club</span></p>
      <h1 class="display-md" style="margin-top:.3rem">Panel del club</h1>
    </div>
    <div style="display:flex;gap:.6rem;align-items:center">
      <span class="cuenta-enlace" id="quien-entro" hidden style="cursor:default">
        <svg><use href="#i-usuario"/></svg>
        <span data-quien></span>
      </span>
      <button class="boton boton--chico boton--contorno-claro" id="salir" hidden>Salir</button>
    </div>
  </div>
</section>`;

let vistaAdmin = renombrarEnAdmin(
  tapaAdmin +
  entre(admin, '<main id="contenido">', '</main>', 'main del panel') +
  entre(admin, '<dialog class="modal" id="modal-bloqueo">', '</dialog>', 'modal de bloqueo') +
  entre(admin, '<dialog class="modal" id="modal-cancelar">', '</dialog>', 'modal de cancelación del panel')
);

/* En la vista previa no hay servidor donde definir una clave, así que el panel
   dice con qué datos se entra. Es una demo: no hay nada real que proteger. */
vistaAdmin = vistaAdmin.replace(
  '<div class="aviso aviso--error" id="error-acceso" hidden><span></span></div>',
  `<div class="aviso" style="background:var(--papel-3);border-color:var(--linea)">
          <svg width="20" height="20" style="flex:none"><use href="#i-usuario"/></svg>
          <div>
            <b>Datos para probar el panel.</b><br>
            Teléfono <b>223 555-1212</b> · contraseña <b>demo1234</b>.<br>
            O la clave del panel: <b>demo1234</b>.
          </div>
        </div>
        <div class="aviso aviso--error" id="error-acceso" hidden><span></span></div>`
);

/* La pantalla de pago de prueba: en el sitio real reemplaza a Mercado Pago
   cuando el servidor corre en modo de prueba; acá, siempre. */
const vistaPagoSimulado = entre(
  pagoSimulado, '<main id="contenido" class="pago-prueba-fondo">', '</main>', 'main del pago de prueba'
);

// ── CSS ────────────────────────────────────────────────────────────────────
const css = ['public/css/base.css', 'public/css/site.css', 'public/css/app.css']
  .map(leer).join('\n\n');

// ── JavaScript ─────────────────────────────────────────────────────────────
const sinExports = (js) => js.replace(/^export (?=(async )?function|const|let|class)/gm, '');
const sinImport = (js) => js.replace(/^\s*import\s[\s\S]*?from '[^']*comun\.js';\s*/m, '');

const comun = sinExports(leer('public/js/comun.js'));
const jsInicio = sinImport(
  entre(indice, '<script type="module">', '</script>', 'script de la home')
    .replace('<script type="module">', '')
    .replace('</script>', '')
);
/* Para pagar, el sitio real sale de la página —a Mercado Pago o a la pantalla
   de prueba— y vuelve. Acá no hay adónde salir: se navega dentro del archivo. */
const unaVez = (texto, viejo, nuevo, etiqueta) => {
  if (!texto.includes(viejo)) throw new Error(`No encontré ${etiqueta}`);
  return texto.replace(viejo, nuevo);
};
const jsReservar = unaVez(
  sinImport(leer('public/js/reservar.js')), 'location.assign(url);', 'irA(url);', 'la salida al pago en reservar.js'
);
const jsPagoSimulado = unaVez(
  sinImport(leer('public/js/pago-simulado.js')), 'location.assign(url);', 'irA(url);', 'la vuelta del pago de prueba'
);
const jsCuenta = renombrarEnCuenta(sinImport(leer('public/js/cuenta.js')));
const jsAdmin = renombrarEnAdmin(sinImport(leer('public/js/admin.js')));
const jsTurnos = sinImport(leer('public/js/mis-turnos.js'))
  .replace(/\$\('#telefono'\)/g, "$('#mt-telefono')")
  .replace(/\$\('#codigo'\)/g, "$('#mt-codigo')");

// ── Configuración del club, la misma que sirve el servidor real ────────────
// Se usa una base temporal para que armar la vista previa no toque los datos.
const dbTemporal = join(tmpdir(), `naranjos-vista-previa-${process.pid}.db`);
process.env.DB_PATH = dbTemporal;
// En la vista previa los pagos son siempre de prueba: no hay Mercado Pago adonde ir.
process.env.PAGOS_SIMULADOS = 'si';
const { configPublica } = await import(new URL('../server/api.js', import.meta.url));
const config = configPublica();

/* Si el club todavía no confirmó la seña ni el precio, la vista previa usa
   montos de ejemplo —y la pantalla de reserva lo aclara—, para poder mostrar
   cómo se paga. Con los montos reales cargados en la config, usa esos. */
const MONTOS_DE_EJEMPLO = { seña: 10000, total: 40000, precio: 40000 };
if (!config.pagos.activos) {
  config.pagos = {
    ...config.pagos,
    activos: true,
    montosCargados: true,
    ejemplo: true,
    montos: Object.fromEntries(config.disciplinas.map((d) => [
      d.slug, Object.fromEntries(d.duraciones.map((dur) => [dur, { ...MONTOS_DE_EJEMPLO }])),
    ])),
  };
}
for (const sufijo of ['', '-wal', '-shm']) rmSync(dbTemporal + sufijo, { force: true });

delete config.calendario; // el calendario y la fecha se recalculan en el
delete config.hoy;        // navegador, así la vista previa no vence

const CONFIG = JSON.stringify(config, null, 0);

const salida = `<title>Los Naranjos</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600&display=swap">
<style>
/* El sitio tiene una identidad propia y deliberada —fondo papel cálido, negro
   y naranja de marca—, así que no cambia con el tema del visor: fija su propio
   esquema y pinta todos los colores de forma explícita. */
:root { color-scheme: light; }

${css}

/* ── Sólo para la vista previa ─────────────────────────────────────────── */
.cinta-demo {
  background: var(--negro-3);
  color: var(--claro-2);
  font-size: .78rem;
  line-height: 1.5;
  padding: .6rem 1.25rem;
  text-align: center;
  border-bottom: 1px solid var(--linea-clara-2);
}
.cinta-demo b { color: var(--naranja-alto); font-weight: 600; }
.vista[hidden] { display: none !important; }
</style>

<div class="cinta-demo">
  <b>Vista previa.</b> Se puede navegar y reservar de verdad, pero los turnos
  quedan sólo en este navegador: no llegan al club. Los pagos pasan por una
  pantalla de prueba y no se cobra nada.
</div>

${sprite}

${cabecera}

<div class="vista" id="vista-inicio">${inicio}</div>
<div class="vista" id="vista-reservar" hidden>${vistaReservar}</div>
<div class="vista" id="vista-turnos" hidden>${vistaTurnos}</div>
<div class="vista" id="vista-cuenta" hidden>${vistaCuenta}</div>
<div class="vista" id="vista-admin" hidden>${vistaAdmin}</div>
<div class="vista" id="vista-pago-simulado" hidden>${vistaPagoSimulado}</div>

${pie}
${flotante}

<script type="module">
/* ═══════════════════════════════════════════════════════════════════════════
   Backend de turnos, versión navegador.
   Reemplaza al servidor Node interceptando las llamadas a /api/. La lógica de
   disponibilidad y las validaciones son las mismas que aplica el servidor real.
   ═══════════════════════════════════════════════════════════════════════════ */
const CONFIG = ${CONFIG};
const SLOT = CONFIG.reglas.slotMinutos;
const GUARDADO = 'naranjos:vista-previa';

const aMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const aHora = (min) => \`\${String(Math.floor(min / 60) % 24).padStart(2, '0')}:\${String(min % 60).padStart(2, '0')}\`;

const fmtFecha = new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.club.zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('en-GB', { timeZone: CONFIG.club.zonaHoraria, hour: '2-digit', minute: '2-digit', hour12: false });
const hoy = () => fmtFecha.format(new Date());
const ahoraEnMinutos = () => { const [h, m] = fmtHora.format(new Date()).split(':').map(Number); return h * 60 + m; };

const diaSemana = (f) => { const [a, m, d] = f.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); };
const sumarDias = (f, n) => { const [a, m, d] = f.split('-').map(Number); const t = new Date(Date.UTC(a, m - 1, d)); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (f) => { const [, m, d] = f.split('-').map(Number); return \`\${DIAS[diaSemana(f)]} \${d} de \${MESES[m - 1]}\`; };

const horarioDe = (f) => (CONFIG.feriados[f] ? null : CONFIG.horarios[diaSemana(f)] || null);
const canchasDe = (slug) => CONFIG.canchas.filter((c) => c.disciplina === slug);
const disciplinaDe = (slug) => CONFIG.disciplinas.find((d) => d.slug === slug);

/* Generador pseudoaleatorio estable: la misma fecha siempre da la misma grilla. */
function semilla(texto) {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Ocupación simulada del día: en vez de sortear casillero por casillero
 * —que dejaría huecos irreales— se arman turnos completos por cancha, con más
 * movimiento a la tarde y a la noche, como pasa de verdad en un club.
 */
/* Nombres para los turnos de la demostración. El panel del club muestra quién
   reservó cada cancha, así que una grilla con casilleros anónimos no mostraría
   lo que el panel realmente hace. */
const NOMBRES = [
  'Martín Rodríguez', 'Sofía Gutiérrez', 'Lucas Fernández', 'Camila Pérez',
  'Nicolás Álvarez', 'Julieta Sosa', 'Federico Ibáñez', 'Agustina Ramos',
  'Diego Benítez', 'Valentina Ortiz', 'Matías Herrera', 'Carolina Díaz',
  'Joaquín Molina', 'Rocío Castro', 'Tomás Aguirre', 'Florencia Vega',
];
const NOTAS = [null, null, null, null, 'Alquilan paletas', 'Vienen con chicos', null, 'Juegan siempre los martes'];

/* En el club todos los turnos de cancha son de 90 minutos. */
const DURACION_TURNO = CONFIG.disciplinas[0].duraciones[0];

const cacheSimulada = new Map();

/**
 * El día de demostración: turnos completos, no casilleros sueltos.
 * De acá salen las dos cosas: qué horarios están ocupados (para la grilla
 * pública) y quién reservó cada uno (para el panel del club).
 */
function reservasSimuladas(fecha) {
  if (cacheSimulada.has(fecha)) return cacheSimulada.get(fecha);
  const reservas = [];
  const horario = horarioDe(fecha);
  if (horario) {
    const abre = Math.ceil(aMin(horario.abre) / SLOT) * SLOT;
    const cierra = aMin(horario.cierra);
    for (const cancha of CONFIG.canchas) {
      const azar = semilla(fecha + cancha.id);
      let m = abre;
      while (m < cierra) {
        const hora = m / 60;
        const demanda = hora < 12 ? 0.14 : hora < 16 ? 0.24 : hora < 19 ? 0.42 : hora < 22.5 ? 0.6 : 0.28;
        if (azar() < demanda) {
          const dur = DURACION_TURNO;
          if (m + dur <= cierra) {
            const i = Math.floor(azar() * NOMBRES.length);
            const esBloqueo = azar() < 0.04;
            const montos = montosDe(cancha.disciplina, dur);
            const tirada = azar();
            const cobro = esBloqueo || !CONFIG.pagos?.activos ? null
              : tirada < 0.55 ? 'seña' : tirada < 0.85 ? 'total' : 'club';
            reservas.push({
              codigo: 'LN-' + (fecha + cancha.id + m).slice(-5).toUpperCase().replace(/[^A-Z0-9]/g, 'X'),
              tipo: esBloqueo ? 'bloqueo' : 'reserva',
              disciplina: cancha.disciplina,
              canchaId: cancha.id,
              fecha,
              hora: aHora(m),
              duracionMin: dur,
              nombre: esBloqueo ? 'Mantenimiento' : NOMBRES[i],
              telefono: esBloqueo ? null : '22355' + String(10000 + Math.floor(azar() * 89999)),
              email: null,
              notas: esBloqueo ? null : NOTAS[Math.floor(azar() * NOTAS.length)],
              estado: 'confirmada',
              cobro,
              precio: esBloqueo ? null : montos.precio ?? null,
              pagado: cobro === 'seña' ? montos.seña || 0 : cobro === 'total' ? montos.total || 0 : 0,
              simulada: true,
            });
            m += dur;
            continue;
          }
        }
        m += SLOT;
      }
    }
  }
  cacheSimulada.set(fecha, reservas);
  return reservas;
}

/** Los casilleros que ocupan esos turnos. */
function ocupacionSimulada(fecha) {
  const ocupado = new Set();
  for (const r of reservasSimuladas(fecha)) {
    const inicio = aMin(r.hora);
    for (let m = inicio; m < inicio + r.duracionMin; m += SLOT) ocupado.add(r.canchaId + ':' + m / SLOT);
  }
  return ocupado;
}

const leerReservas = () => { try { return JSON.parse(localStorage.getItem(GUARDADO) || '[]'); } catch { return []; } };
const guardarReservas = (r) => { try { localStorage.setItem(GUARDADO, JSON.stringify(r)); } catch { /* sin almacenamiento */ } };

function ocupacionTotal(fecha) {
  const ocupado = new Set(ocupacionSimulada(fecha));
  for (const r of leerReservas()) {
    if (r.fecha !== fecha || !ocupaCancha(r)) continue;
    const inicio = aMin(r.hora);
    for (let m = inicio; m < inicio + r.duracionMin; m += SLOT) ocupado.add(r.canchaId + ':' + m / SLOT);
  }
  return ocupado;
}

const normalizarTel = (t) => String(t || '').replace(/\\D/g, '').replace(/^0+/, '').replace(/^54/, '');

function calendario() {
  return Array.from({ length: CONFIG.reglas.diasAnticipacion + 1 }, (_, i) => {
    const fecha = sumarDias(hoy(), i);
    return { fecha, diaSemana: diaSemana(fecha), dia: +fecha.slice(8), mes: +fecha.slice(5, 7), esHoy: i === 0, cerrado: !horarioDe(fecha) };
  });
}

function disponibilidad(fecha, slug, duracionMin) {
  const horario = horarioDe(fecha);
  const canchas = canchasDe(slug);
  if (!horario) return { fecha, disciplina: slug, duracionMin, cerrado: true, motivo: CONFIG.feriados[fecha] || 'Cerrado', horarios: [] };

  const abre = Math.ceil(aMin(horario.abre) / SLOT) * SLOT;
  const cierra = aMin(horario.cierra);
  const ocupado = ocupacionTotal(fecha);
  const esHoy = fecha === hoy();
  const piso = ahoraEnMinutos() + CONFIG.reglas.minutosAntelacion;
  const horarios = [];

  for (let inicio = abre; inicio + duracionMin <= cierra; inicio += SLOT) {
    if (esHoy && inicio < piso) continue;
    const slots = Array.from({ length: duracionMin / SLOT }, (_, i) => inicio / SLOT + i);
    const libres = canchas.filter((c) => slots.every((s) => !ocupado.has(c.id + ':' + s))).map((c) => c.id);
    horarios.push({ hora: aHora(inicio), inicioMin: inicio, fin: aHora(inicio + duracionMin), libres, cantidad: libres.length });
  }
  return { fecha, fechaLarga: fechaLarga(fecha), disciplina: slug, duracionMin, cerrado: false,
           abre: horario.abre, cierra: horario.cierra, totalCanchas: canchas.length, horarios };
}

const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const nuevoCodigo = () => 'LN-' + Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => ALFABETO[b % 32]).join('');

const serializar = ({ pagoRef, pagos, ...r }) => ({
  ...r,
  disciplinaNombre: disciplinaDe(r.disciplina)?.nombre || r.disciplina,
  canchaNombre: CONFIG.canchas.find((c) => c.id === r.canchaId)?.nombre || r.canchaId,
  fechaLarga: fechaLarga(r.fecha),
  fin: aHora(aMin(r.hora) + r.duracionMin),
  cancelable: cancelable(r),
  pagado: r.pagado || 0,
  saldo: r.precio != null ? Math.max(r.precio - (r.pagado || 0), 0) : null,
  venceHora: r.estado === 'pendiente' && r.venceEn ? horaDe(finDelCheckout(r)) : null,
});

function cancelable(r) {
  if (r.estado !== 'confirmada') return false;
  const dif = diasEntre(hoy(), r.fecha);
  if (dif < 0) return false;
  return dif * 1440 + aMin(r.hora) - ahoraEnMinutos() >= CONFIG.reglas.horasCancelacion * 60;
}

const fallo = (mensaje, status = 400, code) => ({ status, datos: { error: mensaje, code } });

/* ═══════════════════════════════════════════════════════════════════════════
   Pagos, versión vista previa.
   Lo mismo que hace el servidor con la pasarela de prueba: el turno queda
   apartado mientras se "paga" en la pantalla de prueba, y aprobar o rechazar
   lo deja firme o apartado para volver a intentar.
   ═══════════════════════════════════════════════════════════════════════════ */
const GRACIA_MIN = 5;
const LLAVE_REVISAR = 'naranjos:vista-previa-pagos-revisar';

const montosDe = (slug, dur) => CONFIG.pagos?.montos?.[slug]?.[dur] || {};
function opcionesDe(slug, dur) {
  if (!CONFIG.pagos?.activos) return [];
  const m = montosDe(slug, dur);
  return (CONFIG.pagos.opciones || ['seña', 'total']).filter((o) => m[o]).map((o) => ({ cobro: o, monto: m[o] }));
}
const nuevaRef = () => 'SIM-' + Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
const finDelCheckout = (r) => Date.parse(r.venceEn) - GRACIA_MIN * 60000;
const horaDe = (ms) => fmtHora.format(new Date(ms));
/* Un turno ocupa la cancha si está firme o si alguien lo está pagando a tiempo. */
const ocupaCancha = (r) => r.estado === 'confirmada' || (r.estado === 'pendiente' && Date.parse(r.venceEn) > Date.now());

/** Los apartados que nadie pagó a tiempo se sueltan. */
function vencerPendientes() {
  const todas = leerReservas();
  let cambio = false;
  for (const r of todas) {
    if (r.estado === 'pendiente' && Date.parse(r.venceEn) <= Date.now()) { r.estado = 'vencida'; cambio = true; }
  }
  if (cambio) guardarReservas(todas);
}

function cobroDeLaReserva(slug, dur, d) {
  const precio = montosDe(slug, dur).precio ?? null;
  if (d.delClub) return { cobro: 'club', precio, pagado: 0 };
  const opciones = opcionesDe(slug, dur);
  if (!opciones.length) return { cobro: null, precio, pagado: 0 };
  const elegida = opciones.find((o) => o.cobro === d.cobro);
  if (!elegida) {
    return { error: opciones.length > 1 ? 'Elegí si pagás la seña o el turno entero.' : 'Para reservar online hay que pagar la seña.' };
  }
  return {
    estado: 'pendiente', cobro: elegida.cobro, precio, aPagar: elegida.monto, pagado: 0,
    venceEn: new Date(Date.now() + (CONFIG.pagos.minutosParaPagar + GRACIA_MIN) * 60000).toISOString(),
    pagoRef: nuevaRef(),
  };
}

const leerRevisar = () => { try { return JSON.parse(localStorage.getItem(LLAVE_REVISAR) || '[]'); } catch { return []; } };
const guardarRevisar = (l) => { try { localStorage.setItem(LLAVE_REVISAR, JSON.stringify(l)); } catch { /* sin almacenamiento */ } };

/** Plata pagada de un turno que se canceló: queda en "Pagos para revisar". */
function paraDevolver(reserva, motivo) {
  if (!(reserva.pagado > 0)) return;
  const lista = leerRevisar();
  lista.unshift({
    id: Date.now(), monto: reserva.pagado, motivo, creadoEn: new Date().toISOString(),
    reserva: { ...reserva, estado: 'cancelada' },
  });
  guardarRevisar(lista);
}

function tituloDelCobro(r) {
  const cancha = CONFIG.canchas.find((c) => c.id === r.canchaId)?.nombre || r.canchaId;
  return \`\${r.cobro === 'seña' ? 'Seña' : 'Turno'} · \${disciplinaDe(r.disciplina)?.nombre || r.disciplina} · \${fechaLarga(r.fecha)} \${r.hora} · \${cancha}\`;
}

function manejarPagos(ruta, metodo, cuerpo, q) {
  const todas = leerReservas();
  const porCodigo = (c) => todas.find((r) => r.codigo === String(c || '').trim().toUpperCase());

  if (ruta === '/api/pagos/estado') {
    const r = porCodigo(q.get('codigo'));
    if (!r) return fallo('No encontramos esa reserva.', 404, 'NO_ENCONTRADO');
    const ultimo = (r.pagos || []).at(-1) || null;
    const { telefono, email, ...publica } = serializar(r);
    return {
      status: 200,
      datos: {
        reserva: publica,
        pago: ultimo && {
          estado: ultimo.estado, monto: ultimo.monto, motivo: null,
          mensaje: ultimo.estado === 'aprobado' ? 'Pago aprobado.' : 'El pago no se aprobó.',
        },
        aDevolver: false,
        venceEn: r.estado === 'pendiente' ? new Date(finDelCheckout(r)).toISOString() : null,
        opciones: r.estado === 'pendiente' ? opcionesDe(r.disciplina, r.duracionMin) : [],
      },
    };
  }

  if (ruta === '/api/pagos/reintentar') {
    const r = porCodigo(cuerpo.codigo);
    if (!r) return fallo('No encontramos esa reserva.', 404, 'NO_ENCONTRADO');
    if (r.estado === 'confirmada') return fallo('Ese turno ya está pagado y confirmado.', 409, 'YA_PAGADO');
    if (r.estado !== 'pendiente' || finDelCheckout(r) - Date.now() < 60000) {
      return fallo('Se terminó el tiempo para pagar y el turno se liberó. Elegilo de nuevo.', 410, 'VENCIDO');
    }
    const opcion = opcionesDe(r.disciplina, r.duracionMin).find((o) => o.cobro === (cuerpo.cobro || r.cobro));
    if (!opcion) return fallo('Esa forma de pago no está disponible.');
    r.cobro = opcion.cobro;
    r.aPagar = opcion.monto;
    r.pagoRef = nuevaRef();
    guardarReservas(todas);
    return { status: 200, datos: { url: '/pago-simulado?ref=' + r.pagoRef, venceEn: new Date(finDelCheckout(r)).toISOString() } };
  }

  if (ruta === '/api/pagos/abandonar') {
    const r = porCodigo(cuerpo.codigo);
    if (!r) return fallo('No encontramos esa reserva.', 404, 'NO_ENCONTRADO');
    if (r.estado === 'pendiente') { r.estado = 'vencida'; guardarReservas(todas); }
    const { telefono, email, ...publica } = serializar(r);
    return { status: 200, datos: { ok: true, reserva: publica } };
  }

  if (ruta === '/api/pagos/simulado') {
    const ref = metodo === 'GET' ? q.get('ref') : cuerpo.ref;
    const r = todas.find((x) => x.pagoRef === ref);
    if (!r) return fallo('Ese pago no existe.', 404, 'NO_ENCONTRADO');
    const vigente = r.estado === 'pendiente' && finDelCheckout(r) > Date.now();
    const volver = '/reservar?pago=' + encodeURIComponent(r.codigo);
    if (metodo === 'GET') {
      return {
        status: 200,
        datos: {
          codigo: r.codigo, titulo: tituloDelCobro(r), cobro: r.cobro, monto: r.aPagar, vigente,
          venceEn: new Date(finDelCheckout(r)).toISOString(), volver,
        },
      };
    }
    if (!vigente) return fallo('Este link de pago venció.', 410, 'VENCIDO');
    const aprobado = cuerpo.resultado === 'aprobado';
    const id = 'SIMP-' + nuevaRef().slice(4);
    r.pagos = [...(r.pagos || []), { id, estado: aprobado ? 'aprobado' : 'rechazado', monto: r.aPagar }];
    if (aprobado) {
      r.estado = 'confirmada';
      r.pagado = r.aPagar;
      r.cobro = r.precio && r.aPagar >= r.precio ? 'total' : 'seña';
      delete r.venceEn;
    }
    guardarReservas(todas);
    return { status: 200, datos: { volver: volver + '&payment_id=' + id + '&status=' + (aprobado ? 'approved' : 'rejected') } };
  }

  return fallo('Ese endpoint no existe.', 404);
}


function crearReserva(d) {
  const disciplina = disciplinaDe(d.disciplina);
  if (!disciplina) return fallo('Elegí una disciplina válida.');
  const duracionMin = Number(d.duracionMin);
  if (!disciplina.duraciones.includes(duracionMin)) return fallo('Elegí una duración válida.');

  const dif = diasEntre(hoy(), d.fecha);
  if (dif < 0) return fallo('No se puede reservar en una fecha pasada.');
  if (dif > CONFIG.reglas.diasAnticipacion) return fallo(\`Se puede reservar hasta \${CONFIG.reglas.diasAnticipacion} días de anticipación.\`);

  const horario = horarioDe(d.fecha);
  if (!horario) return fallo('Ese día el complejo está cerrado.');
  const inicio = aMin(d.hora);
  if (inicio < aMin(horario.abre) || inicio + duracionMin > aMin(horario.cierra)) {
    return fallo(\`Ese día atendemos de \${horario.abre} a \${horario.cierra}.\`);
  }
  if (d.fecha === hoy() && inicio < ahoraEnMinutos() + CONFIG.reglas.minutosAntelacion) {
    return fallo(\`Los turnos de hoy se reservan con \${CONFIG.reglas.minutosAntelacion} minutos de anticipación.\`);
  }

  const nombre = String(d.nombre || '').trim();
  if (nombre.length < 2) return fallo('Escribí tu nombre y apellido.');
  const telefono = normalizarTel(d.telefono);
  if (telefono.length < 8) return fallo('Escribí un teléfono de contacto válido.');
  const email = String(d.email || '').trim();
  if (email && !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]{2,}$/.test(email)) return fallo('El correo no parece válido.');

  const activas = leerReservas().filter((r) => r.telefono === telefono && ocupaCancha(r) && r.fecha >= hoy());
  if (!d.delClub && activas.length >= CONFIG.reglas.maxPorTelefono) {
    return fallo(\`Ya tenés \${CONFIG.reglas.maxPorTelefono} turnos activos con este teléfono. Cancelá uno o escribinos por WhatsApp.\`);
  }

  const slots = Array.from({ length: duracionMin / SLOT }, (_, i) => inicio / SLOT + i);
  const ocupado = ocupacionTotal(d.fecha);
  const libres = canchasDe(disciplina.slug).filter((c) => slots.every((s) => !ocupado.has(c.id + ':' + s)));

  let cancha;
  if (d.canchaId) {
    cancha = libres.find((c) => c.id === d.canchaId);
    if (!cancha) return fallo('Esa cancha ya está ocupada en ese horario.', 409, 'OCUPADO');
  } else {
    cancha = libres[0];
    if (!cancha) return fallo('No quedan canchas libres en ese horario.', 409, 'OCUPADO');
  }

  // Igual que en el servidor: el monto sale de la config, no del formulario.
  const cobro = cobroDeLaReserva(disciplina.slug, duracionMin, d);
  if (cobro.error) return fallo(cobro.error);

  const reserva = {
    codigo: nuevoCodigo(), tipo: 'reserva', disciplina: disciplina.slug, canchaId: cancha.id,
    fecha: d.fecha, hora: d.hora, duracionMin, nombre, telefono,
    email: email || null, notas: String(d.notas || '').trim().slice(0, 300) || null,
    estado: 'confirmada', creadaEn: new Date().toISOString(),
    ...cobro,
  };
  const todas = leerReservas();
  todas.push(reserva);
  guardarReservas(todas);
  const datos = { ok: true, reserva: serializar(reserva) };
  if (reserva.estado === 'pendiente') {
    datos.pago = { url: '/pago-simulado?ref=' + reserva.pagoRef, venceEn: new Date(finDelCheckout(reserva)).toISOString() };
  }
  return { status: 200, datos };
}

function manejar(url, metodo, cuerpo) {
  const ruta = url.pathname;
  const q = url.searchParams;
  vencerPendientes();

  if (ruta === '/api/config') {
    return { status: 200, datos: { ...CONFIG, calendario: calendario(), hoy: hoy() } };
  }

  if (ruta === '/api/disponibilidad') {
    const fecha = q.get('fecha') || hoy();
    const slug = q.get('disciplina') || 'padel';
    const dur = Number(q.get('duracion')) || disciplinaDe(slug)?.duracionPorDefecto || 60;
    return { status: 200, datos: disponibilidad(fecha, slug, dur) };
  }

  if (ruta === '/api/reservas' && metodo === 'POST') {
    const dueño = usuarioActual();
    // El personal del club reserva para un cliente: sus datos, y lo cobra el mostrador.
    if (dueño?.rol === 'club') {
      const r = crearReserva({ ...cuerpo, delClub: true });
      if (r.status === 200) {
        anotar(dueño.nombre, 'reserva para un cliente', \`\${r.datos.reserva.codigo} · \${cuerpo.fecha} \${cuerpo.hora} · \${r.datos.reserva.nombre} · lo cobra el club\`);
      }
      return r;
    }
    return crearReserva(dueño ? { ...cuerpo, nombre: dueño.nombre, telefono: dueño.telefono } : cuerpo);
  }

  if (ruta === '/api/reservas') {
    const codigo = String(q.get('codigo') || '').trim().toUpperCase();
    const telefono = normalizarTel(q.get('telefono'));
    const todas = leerReservas();
    if (codigo) {
      const r = todas.find((x) => x.codigo === codigo);
      if (!r) return fallo('No encontramos esa reserva.', 404);
      if (telefono && r.telefono !== telefono) return fallo('El teléfono no coincide.', 403);
      return { status: 200, datos: { reservas: [serializar(r)] } };
    }
    const dueño = usuarioActual();
    const tel = dueño ? dueño.telefono : telefono;
    if (!dueño && leerCuentas().some((u) => u.telefono === tel)) {
      return fallo('Ese teléfono tiene cuenta. Ingresá para ver tus turnos.', 401, 'NECESITA_SESION');
    }
    const mias = todas.filter((r) => r.telefono === tel && r.fecha >= hoy() && r.estado !== 'vencida');
    return { status: 200, datos: { reservas: mias.map(serializar) } };
  }

  if (ruta === '/api/reservas/cancelar') {
    const todas = leerReservas();
    const r = todas.find((x) => x.codigo === String(cuerpo.codigo || '').trim().toUpperCase());
    if (!r) return fallo('No encontramos ese código de reserva.', 404, 'NO_ENCONTRADO');
    if (r.estado === 'cancelada') return fallo('Esa reserva ya estaba cancelada.');
    const dueño = usuarioActual();
    const esSuyo = dueño && dueño.telefono === r.telefono;
    if (!esSuyo && normalizarTel(cuerpo.telefono) !== r.telefono) {
      return fallo('El teléfono no coincide con el de la reserva.', 403, 'NO_AUTORIZADO');
    }
    if (!cancelable(r)) return fallo(\`Las cancelaciones online se aceptan hasta \${CONFIG.reglas.horasCancelacion} horas antes. Llamanos al \${CONFIG.club.telefono}.\`);
    r.estado = 'cancelada';
    if (r.pagado > 0) { paraDevolver(r, 'Turno cancelado'); r.pagado = 0; }
    guardarReservas(todas);
    return { status: 200, datos: { ok: true, reserva: serializar(r) } };
  }

  if (ruta.startsWith('/api/pagos')) return manejarPagos(ruta, metodo, cuerpo, q);
  if (ruta.startsWith('/api/cuenta')) return manejarCuenta(ruta, metodo, cuerpo);
  if (ruta.startsWith('/api/admin')) return manejarPanel(ruta, metodo, cuerpo, url);

  return fallo('Ese endpoint no existe.', 404);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Panel del club, versión vista previa.
   Mismo panel que el real, con datos de demostración. La clave y el personal
   viven en este navegador: es una muestra, no un sistema con algo que cuidar.
   ═══════════════════════════════════════════════════════════════════════════ */
const CLAVE_DEMO = 'demo1234';
const LLAVE_BITACORA = 'naranjos:vista-previa-bitacora';
const LLAVE_CANCELADAS = 'naranjos:vista-previa-canceladas';

/* El club arranca con una persona cargada para que se pueda probar el ingreso
   con cuenta propia sin tener que crearla primero. */
function sembrarPersonal() {
  const cuentas = leerCuentas();
  if (cuentas.some((u) => u.rol === 'club')) return;
  cuentas.push({
    nombre: 'Vale Recepción',
    telefono: '2235551212',
    email: null,
    clave: revolver(CLAVE_DEMO),
    rol: 'club',
  });
  guardarCuentas(cuentas);
}

const leerBitacora = () => { try { return JSON.parse(localStorage.getItem(LLAVE_BITACORA) || '[]'); } catch { return []; } };
const anotar = (quien, accion, detalle) => {
  try {
    const b = leerBitacora();
    b.push({ cuando: new Date().toISOString(), quien, accion, detalle: detalle || null });
    localStorage.setItem(LLAVE_BITACORA, JSON.stringify(b.slice(-100)));
  } catch { /* sin almacenamiento */ }
};

/* Los turnos simulados se generan cada vez, así que las cancelaciones se
   anotan aparte, por código. */
const leerCanceladas = () => { try { return JSON.parse(localStorage.getItem(LLAVE_CANCELADAS) || '[]'); } catch { return []; } };
const cancelarSimulada = (codigo) => {
  try {
    const c = leerCanceladas();
    if (!c.includes(codigo)) { c.push(codigo); localStorage.setItem(LLAVE_CANCELADAS, JSON.stringify(c)); }
  } catch { /* sin almacenamiento */ }
};

/** Quién está entrando al panel: alguien del club, o la clave compartida. */
function quienEntra(cabeceras) {
  const u = usuarioActual();
  if (u && u.rol === 'club') return { quien: u.nombre, conClaveMaestra: false };
  const auth = (cabeceras && cabeceras.authorization) || '';
  if (auth === 'Bearer ' + CLAVE_DEMO) return { quien: 'Clave del panel', conClaveMaestra: true };
  return null;
}

/** Los turnos de un día: los simulados más los que se reservaron en la demo. */
function turnosDelDia(fecha) {
  const canceladas = leerCanceladas();
  const simulados = reservasSimuladas(fecha).filter((r) => !canceladas.includes(r.codigo));
  const propias = leerReservas().filter((r) => r.fecha === fecha && ocupaCancha(r));
  return [...simulados, ...propias].sort((a, b) => aMin(a.hora) - aMin(b.hora));
}

function manejarPanel(ruta, metodo, cuerpo, url) {
  sembrarPersonal();
  const entrada = quienEntra(window.__cabecerasPanel);
  if (!entrada) return fallo('Necesitás iniciar sesión como administrador.', 401);

  if (ruta === '/api/admin/sesion') {
    anotar(entrada.quien, 'ingreso', null);
    return {
      status: 200,
      datos: {
        ok: true,
        quien: entrada.quien,
        conClaveMaestra: entrada.conClaveMaestra,
        avisoTokenPorDefecto: false,
        sinPersonal: !leerCuentas().some((u) => u.rol === 'club'),
        pagos: { pasarela: 'simulado', activos: !!CONFIG.pagos?.activos, montosCargados: !!CONFIG.pagos?.activos },
      },
    };
  }

  if (ruta === '/api/admin/dia') {
    const fecha = url.searchParams.get('fecha') || hoy();
    const horario = horarioDe(fecha);
    const reservas = horario ? turnosDelDia(fecha).map(serializar) : [];
    const firmes = reservas.filter((r) => r.tipo === 'reserva' && r.estado === 'confirmada');
    const minutos = firmes.reduce((a, r) => a + r.duracionMin, 0);
    return {
      status: 200,
      datos: {
        fecha,
        fechaLarga: fechaLarga(fecha),
        horario,
        canchas: CONFIG.canchas,
        reservas,
        resumen: {
          turnos: firmes.length,
          bloqueos: reservas.filter((r) => r.tipo === 'bloqueo').length,
          horasVendidas: +(minutos / 60).toFixed(1),
          cobradoOnline: firmes.reduce((a, r) => a + (r.pagado || 0), 0),
          esperandoPago: reservas.filter((r) => r.estado === 'pendiente').length,
        },
      },
    };
  }

  if (ruta === '/api/admin/agenda') {
    const desde = url.searchParams.get('desde') || hoy();
    const hasta = url.searchParams.get('hasta') || sumarDias(desde, 7);
    const reservas = [];
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) reservas.push(...turnosDelDia(f).map(serializar));
    return { status: 200, datos: { desde, hasta, reservas } };
  }

  if (ruta === '/api/admin/bloqueos') {
    const cancha = CONFIG.canchas.find((c) => c.id === cuerpo.canchaId);
    if (!cancha) return fallo('Esa cancha no existe.');
    const dur = Number(cuerpo.duracionMin);
    const inicio = aMin(cuerpo.hora);
    const ocupado = ocupacionTotal(cuerpo.fecha);
    for (let m = inicio; m < inicio + dur; m += SLOT) {
      if (ocupado.has(cancha.id + ':' + m / SLOT)) {
        return fallo('Ese horario ya está ocupado.', 409, 'OCUPADO');
      }
    }
    const bloqueo = {
      codigo: nuevoCodigo(), tipo: 'bloqueo', disciplina: cancha.disciplina, canchaId: cancha.id,
      fecha: cuerpo.fecha, hora: cuerpo.hora, duracionMin: dur,
      nombre: String(cuerpo.motivo || 'Bloqueo').slice(0, 80),
      telefono: null, email: null, notas: null, estado: 'confirmada',
      creadaEn: new Date().toISOString(),
    };
    const todas = leerReservas();
    todas.push(bloqueo);
    guardarReservas(todas);
    anotar(entrada.quien, 'bloqueo', \`\${cancha.nombre} · \${cuerpo.fecha} \${cuerpo.hora} · \${bloqueo.nombre}\`);
    return { status: 200, datos: { ok: true, reserva: serializar(bloqueo) } };
  }

  if (ruta === '/api/admin/cancelar') {
    const codigo = String(cuerpo.codigo || '').trim().toUpperCase();
    const todas = leerReservas();
    const propia = todas.find((r) => r.codigo === codigo);
    if (propia) {
      propia.estado = 'cancelada';
      if (propia.pagado > 0) { paraDevolver(propia, 'Turno cancelado'); propia.pagado = 0; }
      guardarReservas(todas);
      anotar(entrada.quien, 'cancelación', \`\${codigo} · \${propia.fecha} \${propia.hora} · \${propia.nombre || 'sin nombre'}\`);
      return { status: 200, datos: { ok: true, reserva: serializar(propia) } };
    }
    for (const f of [hoy(), ...Array.from({ length: CONFIG.reglas.diasAnticipacion }, (_, i) => sumarDias(hoy(), i + 1))]) {
      const r = reservasSimuladas(f).find((x) => x.codigo === codigo);
      if (r) {
        cancelarSimulada(codigo);
        if (r.pagado > 0) paraDevolver(r, 'Turno cancelado');
        anotar(entrada.quien, 'cancelación', \`\${codigo} · \${r.fecha} \${r.hora} · \${r.nombre}\`);
        return { status: 200, datos: { ok: true, reserva: serializar({ ...r, estado: 'cancelada' }) } };
      }
    }
    return fallo('No existe esa reserva.', 404);
  }

  if (ruta === '/api/admin/personal' && metodo === 'GET') {
    const actual = usuarioActual();
    return {
      status: 200,
      datos: {
        personal: leerCuentas().filter((u) => u.rol === 'club').map((u, i) => ({
          id: i + 1,
          nombre: u.nombre,
          telefono: u.telefono,
          creadoEn: null,
          ultimoAcceso: null,
          esVos: !!actual && actual.telefono === u.telefono,
        })),
      },
    };
  }

  if (ruta === '/api/admin/personal') {
    const nombre = String(cuerpo.nombre || '').trim();
    if (nombre.length < 2) return fallo('Escribí tu nombre y apellido.');
    const telefono = normalizarTel(cuerpo.telefono);
    if (telefono.length < 8) return fallo('Escribí un teléfono válido.');
    const cuentas = leerCuentas();
    const existente = cuentas.find((u) => u.telefono === telefono);
    if (existente) {
      if (existente.rol === 'club') return fallo('Esa persona ya tiene acceso al panel.', 409, 'YA_ES_PERSONAL');
      existente.rol = 'club';
      guardarCuentas(cuentas);
      anotar(entrada.quien, 'alta de personal', \`\${existente.nombre} (\${telefono})\`);
      return {
        status: 200,
        datos: {
          ok: true,
          usuario: { nombre: existente.nombre, telefono, rol: 'club' },
          promovido: true,
          aviso: \`\${existente.nombre} ya tenía cuenta de jugador: entra al panel con esa misma contraseña.\`,
        },
      };
    }
    const clave = String(cuerpo.clave || '');
    if (clave.length < CONFIG.reglas.minClave) {
      return fallo(\`La contraseña tiene que tener al menos \${CONFIG.reglas.minClave} caracteres.\`);
    }
    cuentas.push({ nombre, telefono, email: null, clave: revolver(clave), rol: 'club' });
    guardarCuentas(cuentas);
    anotar(entrada.quien, 'alta de personal', \`\${nombre} (\${telefono})\`);
    return { status: 200, datos: { ok: true, usuario: { nombre, telefono, rol: 'club' }, promovido: false } };
  }

  if (ruta === '/api/admin/personal/baja') {
    const cuentas = leerCuentas();
    const club = cuentas.filter((u) => u.rol === 'club');
    const objetivo = club[Number(cuerpo.id) - 1];
    if (!objetivo) return fallo('Esa persona no existe.', 404);
    const actual = usuarioActual();
    if (actual && actual.telefono === objetivo.telefono) return fallo('No podés sacarte el acceso a vos mismo.');
    objetivo.rol = 'jugador';
    guardarCuentas(cuentas);
    anotar(entrada.quien, 'baja de personal', \`\${objetivo.nombre} (\${objetivo.telefono})\`);
    return { status: 200, datos: { ok: true, usuario: { nombre: objetivo.nombre, telefono: objetivo.telefono, rol: 'jugador' } } };
  }

  if (ruta === '/api/admin/pagos' && metodo === 'GET') {
    return { status: 200, datos: { aRevisar: leerRevisar().map((p) => ({ ...p, reserva: serializar(p.reserva) })) } };
  }

  if (ruta === '/api/admin/pagos/devolver' || ruta === '/api/admin/pagos/resolver') {
    const lista = leerRevisar();
    const pago = lista.find((x) => x.id === Number(cuerpo.id));
    if (!pago) return fallo('Ese pago ya está resuelto.', 409);
    guardarRevisar(lista.filter((x) => x !== pago));
    const devuelto = ruta.endsWith('devolver');
    anotar(entrada.quien, devuelto ? 'devolución' : 'pago resuelto sin devolver',
      \`\${pago.reserva.codigo} · \${pesos(pago.monto)}\${devuelto ? ' devueltos por el pago de prueba' : ''}\`);
    return { status: 200, datos: { ok: true } };
  }

  if (ruta === '/api/admin/movimientos') {
    const limite = Math.min(Number(url.searchParams.get('limite')) || 40, 200);
    return { status: 200, datos: { movimientos: leerBitacora().slice(-limite).reverse() } };
  }

  return fallo('Ese endpoint no existe.', 404);
}

/* ═══════════════════════════════════════════════════════════════════════════
   Cuentas, versión vista previa.
   El servidor real guarda la clave con scrypt y la sesión en una cookie que el
   navegador no puede leer. Acá no hay servidor: la cuenta queda en este
   dispositivo y la clave se guarda revuelta con un hash simple, sólo para no
   dejarla escrita en limpio. Alcanza para mostrar cómo se usa, no para
   proteger nada.
   ═══════════════════════════════════════════════════════════════════════════ */
const LLAVE_CUENTAS = 'naranjos:vista-previa-cuentas';
const LLAVE_SESION = 'naranjos:vista-previa-sesion';

const revolver = (texto) => {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return 'demo$' + (h >>> 0).toString(36);
};

const leerCuentas = () => { try { return JSON.parse(localStorage.getItem(LLAVE_CUENTAS) || '[]'); } catch { return []; } };
const guardarCuentas = (c) => { try { localStorage.setItem(LLAVE_CUENTAS, JSON.stringify(c)); } catch { /* sin almacenamiento */ } };
const telefonoEnSesion = () => { try { return localStorage.getItem(LLAVE_SESION) || ''; } catch { return ''; } };
const abrirSesion = (tel) => { try { localStorage.setItem(LLAVE_SESION, tel); } catch { /* sin almacenamiento */ } };
const cerrarSesion = () => { try { localStorage.removeItem(LLAVE_SESION); } catch { /* sin almacenamiento */ } };

const usuarioActual = () => leerCuentas().find((u) => u.telefono === telefonoEnSesion()) || null;
const perfilPublico = (u) => ({ nombre: u.nombre, telefono: u.telefono, email: u.email || null, rol: u.rol || 'jugador' });

function manejarCuenta(ruta, metodo, cuerpo) {
  const usuario = usuarioActual();

  if (ruta === '/api/cuenta' && metodo === 'GET') {
    if (!usuario) return { status: 200, datos: { usuario: null } };
    const suyas = leerReservas().filter((r) => r.telefono === usuario.telefono && r.estado !== 'vencida');
    return {
      status: 200,
      datos: {
        usuario: perfilPublico(usuario),
        turnos: suyas.filter((r) => r.fecha >= hoy()).map(serializar),
        historial: suyas.slice(-10).reverse().map(serializar),
      },
    };
  }

  if (ruta === '/api/cuenta/registro') {
    const nombre = String(cuerpo.nombre || '').trim();
    if (nombre.length < 2) return fallo('Escribí tu nombre y apellido.');
    const telefono = normalizarTel(cuerpo.telefono);
    if (telefono.length < 8) return fallo('Escribí un teléfono válido.');
    const clave = String(cuerpo.clave || '');
    if (clave.length < CONFIG.reglas.minClave) {
      return fallo(\`La contraseña tiene que tener al menos \${CONFIG.reglas.minClave} caracteres.\`);
    }
    const cuentas = leerCuentas();
    if (cuentas.some((u) => u.telefono === telefono)) {
      return fallo('Ya hay una cuenta con ese teléfono. Probá ingresando.', 409, 'TELEFONO_EN_USO');
    }
    cuentas.push({ nombre, telefono, email: String(cuerpo.email || '').trim() || null, clave: revolver(clave) });
    guardarCuentas(cuentas);
    abrirSesion(telefono);
    const adoptadas = leerReservas().filter((r) => r.telefono === telefono && r.estado === 'confirmada').length;
    return { status: 200, datos: { ok: true, usuario: perfilPublico(cuentas.at(-1)), reservasAdoptadas: adoptadas } };
  }

  if (ruta === '/api/cuenta/ingreso') {
    const telefono = normalizarTel(cuerpo.telefono);
    const u = leerCuentas().find((x) => x.telefono === telefono);
    if (!u || u.clave !== revolver(String(cuerpo.clave || ''))) {
      return fallo('El teléfono o la contraseña no coinciden.', 401, 'NO_AUTORIZADO');
    }
    abrirSesion(telefono);
    return { status: 200, datos: { ok: true, usuario: perfilPublico(u) } };
  }

  if (ruta === '/api/cuenta/salir') {
    cerrarSesion();
    return { status: 200, datos: { ok: true } };
  }

  if (!usuario) return fallo('Necesitás ingresar a tu cuenta.', 401, 'NECESITA_SESION');

  if (ruta === '/api/cuenta/perfil') {
    const cuentas = leerCuentas();
    const u = cuentas.find((x) => x.telefono === usuario.telefono);
    const nombre = String(cuerpo.nombre || '').trim();
    if (nombre.length < 2) return fallo('Escribí tu nombre y apellido.');
    u.nombre = nombre;
    u.email = String(cuerpo.email || '').trim() || null;
    guardarCuentas(cuentas);
    return { status: 200, datos: { ok: true, usuario: perfilPublico(u) } };
  }

  if (ruta === '/api/cuenta/clave') {
    const cuentas = leerCuentas();
    const u = cuentas.find((x) => x.telefono === usuario.telefono);
    if (u.clave !== revolver(String(cuerpo.claveActual || ''))) {
      return fallo('La contraseña actual no coincide.', 401, 'NO_AUTORIZADO');
    }
    const nueva = String(cuerpo.claveNueva || '');
    if (nueva.length < CONFIG.reglas.minClave) {
      return fallo(\`La contraseña tiene que tener al menos \${CONFIG.reglas.minClave} caracteres.\`);
    }
    u.clave = revolver(nueva);
    guardarCuentas(cuentas);
    return { status: 200, datos: { ok: true } };
  }

  return fallo('Ese endpoint no existe.', 404);
}

const fetchReal = window.fetch.bind(window);
window.fetch = async (recurso, opciones = {}) => {
  const url = new URL(typeof recurso === 'string' ? recurso : recurso.url, location.href);
  if (!url.pathname.startsWith('/api/')) return fetchReal(recurso, opciones);
  await new Promise((r) => setTimeout(r, 90)); // una pizca de latencia, para que se sienta real
  const cuerpo = opciones.body ? JSON.parse(opciones.body) : {};
  // El panel del club manda la clave en una cabecera; acá no hay request real.
  window.__cabecerasPanel = opciones.headers || {};
  const { status, datos } = manejar(url, opciones.method || 'GET', cuerpo);
  return new Response(JSON.stringify(datos), { status, headers: { 'content-type': 'application/json' } });
};

/* ═══════════════════════════════════════════════════════════════════════════
   Código del sitio, tal cual está en el repositorio
   ═══════════════════════════════════════════════════════════════════════════ */
${comun}

// Las tres pantallas conviven en una sola página: la cabecera se inicializa una vez.
const _cabeceraOriginal = iniciarCabecera;
let _cabeceraLista = false;
iniciarCabecera = function () {
  if (_cabeceraLista) return;
  _cabeceraLista = true;
  _cabeceraOriginal();
};

/* ═══════════════════════════════════════════════════════════════════════════
   Navegación entre pantallas sin recargar
   ═══════════════════════════════════════════════════════════════════════════ */
const VISTAS = {
  '/': 'vista-inicio',
  '/reservar': 'vista-reservar',
  '/mis-turnos': 'vista-turnos',
  '/cuenta': 'vista-cuenta',
  '/admin': 'vista-admin',
  '/pago-simulado': 'vista-pago-simulado',
};

function mostrarVista(ruta) {
  const id = VISTAS[ruta] || 'vista-inicio';
  for (const vista of document.querySelectorAll('.vista')) vista.hidden = vista.id !== id;
  for (const enlace of document.querySelectorAll('.navegacion a')) {
    const destino = new URL(enlace.getAttribute('href'), location.href).pathname;
    enlace.toggleAttribute('aria-current', destino === ruta && ruta !== '/');
    if (destino === ruta && ruta !== '/') enlace.setAttribute('aria-current', 'page');
  }
}

/** Marca una opción del formulario cuando aparece; la grilla llega por red. */
async function marcar(selector, intentos = 24) {
  for (let i = 0; i < intentos; i++) {
    const input = document.querySelector(selector);
    if (input && !input.disabled) {
      if (!input.checked) { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); }
      return true;
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

async function irA(href) {
  const url = new URL(href, location.href);
  mostrarVista(url.pathname);
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (url.hash) {
    const destino = document.querySelector(url.hash);
    if (destino) requestAnimationFrame(() => destino.scrollIntoView({ behavior: 'smooth' }));
  }

  if (url.pathname === '/pago-simulado') {
    document.dispatchEvent(new CustomEvent('naranjos:pago-simulado', { detail: { ref: url.searchParams.get('ref') } }));
    return;
  }
  if (url.pathname !== '/reservar') return;
  // Si venimos de confirmar un turno, la pantalla arranca limpia.
  document.dispatchEvent(new CustomEvent('naranjos:reiniciar-reserva'));
  // La sesión pudo cambiar en otra pantalla —entrar al panel, por ejemplo—: el formulario se entera.
  olvidarSesion();
  traerSesion({ refrescar: true }).then(pintarSesion);
  const p = url.searchParams;
  // La vuelta del pago de prueba, como la de Mercado Pago en el sitio real.
  if (p.get('pago')) {
    document.dispatchEvent(new CustomEvent('naranjos:volver-del-pago', {
      detail: { codigo: p.get('pago'), pagoId: p.get('payment_id') },
    }));
    return;
  }
  if (p.get('disciplina')) await marcar(\`#opciones-disciplina input[value="\${CSS.escape(p.get('disciplina'))}"]\`);
  if (p.get('duracion')) await marcar(\`#segmentado-duracion input[value="\${CSS.escape(p.get('duracion'))}"]\`);
  if (p.get('fecha')) await marcar(\`#tira-dias input[value="\${CSS.escape(p.get('fecha'))}"]\`);
  if (p.get('hora')) await marcar(\`#grilla-horarios input[value="\${CSS.escape(p.get('hora'))}"]\`);
}

document.addEventListener('click', (e) => {
  const enlace = e.target.closest('a[href]');
  if (!enlace || enlace.target === '_blank') return;
  const href = enlace.getAttribute('href');
  if (!href.startsWith('/') && !href.startsWith('#')) return;

  const url = new URL(href, location.href);
  if (!(url.pathname in VISTAS)) return;
  e.preventDefault();
  irA(href);
});

/* Las tres pantallas ya están en el documento: se inicializan las tres. */
mostrarVista('/');
{
${jsInicio}
}
{
${jsReservar}
}
{
${jsTurnos}
}
{
${jsCuenta}
}
{
${jsAdmin}
}
{
${jsPagoSimulado}
}
</script>
`;

/*
 * Por defecto se escribe un documento HTML completo, para que el archivo se
 * pueda abrir con doble clic o subir a cualquier hosting estático. Sin
 * `<meta charset>` el navegador adivina la codificación y rompe los acentos.
 *
 * Con `--fragmento` se omite el envoltorio: es lo que necesitan los visores
 * que agregan su propio `<head>` (por ejemplo, publicar como artefacto).
 */
const fragmento = process.argv.includes('--fragmento');
const documento = fragmento ? salida : `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0B0C0E">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230B0C0E'/%3E%3Ccircle cx='32' cy='32' r='19' fill='%23FF6B14'/%3E%3Cg stroke='%230B0C0E' stroke-width='2.4'%3E%3Cpath d='M13 32h38'/%3E%3Cpath d='M23 32V21M41 32v11'/%3E%3Ccircle cx='32' cy='32' r='19' fill='none'/%3E%3C/g%3E%3C/svg%3E">
<style>
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; }
  img { max-width: 100%; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
${salida}
</body>
</html>
`;

const destino = fragmento ? 'vista-previa/fragmento.html' : 'vista-previa/index.html';
mkdirSync(RAIZ + 'vista-previa', { recursive: true });
writeFileSync(RAIZ + destino, documento);
console.log(
  `${destino} — ${(documento.length / 1024).toFixed(0)} kB.` +
  (fragmento ? '' : ' Abrilo con doble clic, no hace falta instalar nada.')
);
