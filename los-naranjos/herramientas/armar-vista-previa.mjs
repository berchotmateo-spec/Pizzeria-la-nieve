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
 * tener que publicarlo. No reemplaza al sitio real: el panel del club y las
 * reservas de verdad necesitan el servidor de Node.
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

// El navegador bloquea las descargas dentro de la vista previa: sacamos el .ics.
vistaReservar = vistaReservar.replace(
  entre(vistaReservar, '<a class="boton" id="descargar-ics"', '</a>', 'botón de agendar'), '');

// `#telefono` existe en reservar y en mis-turnos: en una sola página chocan.
vistaTurnos = vistaTurnos
  .replace('for="telefono"', 'for="mt-telefono"')
  .replace('id="telefono" name="telefono"', 'id="mt-telefono" name="telefono"')
  .replace('for="codigo"', 'for="mt-codigo"')
  .replace('id="codigo" name="codigo"', 'id="mt-codigo" name="codigo"');

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
const jsReservar = sinImport(leer('public/js/reservar.js'));
const jsTurnos = sinImport(leer('public/js/mis-turnos.js'))
  .replace(/\$\('#telefono'\)/g, "$('#mt-telefono')")
  .replace(/\$\('#codigo'\)/g, "$('#mt-codigo')");

// ── Configuración del club, la misma que sirve el servidor real ────────────
// Se usa una base temporal para que armar la vista previa no toque los datos.
const dbTemporal = join(tmpdir(), `naranjos-vista-previa-${process.pid}.db`);
process.env.DB_PATH = dbTemporal;
const { configPublica } = await import(new URL('../server/api.js', import.meta.url));
const config = configPublica();
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
  quedan sólo en este navegador: no llegan al club.
</div>

${sprite}

${cabecera}

<div class="vista" id="vista-inicio">${inicio}</div>
<div class="vista" id="vista-reservar" hidden>${vistaReservar}</div>
<div class="vista" id="vista-turnos" hidden>${vistaTurnos}</div>

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
const cacheSimulada = new Map();
function ocupacionSimulada(fecha) {
  if (cacheSimulada.has(fecha)) return cacheSimulada.get(fecha);
  const ocupado = new Set();
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
          const dur = azar() < 0.6 ? 90 : 60;
          if (m + dur <= cierra) {
            for (let s = m; s < m + dur; s += SLOT) ocupado.add(cancha.id + ':' + s / SLOT);
            m += dur;
            continue;
          }
        }
        m += SLOT;
      }
    }
  }
  cacheSimulada.set(fecha, ocupado);
  return ocupado;
}

const leerReservas = () => { try { return JSON.parse(localStorage.getItem(GUARDADO) || '[]'); } catch { return []; } };
const guardarReservas = (r) => { try { localStorage.setItem(GUARDADO, JSON.stringify(r)); } catch { /* sin almacenamiento */ } };

function ocupacionTotal(fecha) {
  const ocupado = new Set(ocupacionSimulada(fecha));
  for (const r of leerReservas()) {
    if (r.fecha !== fecha || r.estado !== 'confirmada') continue;
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

const serializar = (r) => ({
  ...r,
  disciplinaNombre: disciplinaDe(r.disciplina)?.nombre || r.disciplina,
  canchaNombre: CONFIG.canchas.find((c) => c.id === r.canchaId)?.nombre || r.canchaId,
  fechaLarga: fechaLarga(r.fecha),
  fin: aHora(aMin(r.hora) + r.duracionMin),
  cancelable: cancelable(r),
});

function cancelable(r) {
  if (r.estado !== 'confirmada') return false;
  const dif = diasEntre(hoy(), r.fecha);
  if (dif < 0) return false;
  return dif * 1440 + aMin(r.hora) - ahoraEnMinutos() >= CONFIG.reglas.horasCancelacion * 60;
}

const fallo = (mensaje, status = 400, code) => ({ status, datos: { error: mensaje, code } });

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

  const activas = leerReservas().filter((r) => r.telefono === telefono && r.estado === 'confirmada' && r.fecha >= hoy());
  if (activas.length >= CONFIG.reglas.maxPorTelefono) {
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

  const reserva = {
    codigo: nuevoCodigo(), tipo: 'reserva', disciplina: disciplina.slug, canchaId: cancha.id,
    fecha: d.fecha, hora: d.hora, duracionMin, nombre, telefono,
    email: email || null, notas: String(d.notas || '').trim().slice(0, 300) || null,
    estado: 'confirmada', creadaEn: new Date().toISOString(),
  };
  const todas = leerReservas();
  todas.push(reserva);
  guardarReservas(todas);
  return { status: 200, datos: { ok: true, reserva: serializar(reserva) } };
}

function manejar(url, metodo, cuerpo) {
  const ruta = url.pathname;
  const q = url.searchParams;

  if (ruta === '/api/config') {
    return { status: 200, datos: { ...CONFIG, calendario: calendario(), hoy: hoy() } };
  }

  if (ruta === '/api/disponibilidad') {
    const fecha = q.get('fecha') || hoy();
    const slug = q.get('disciplina') || 'padel';
    const dur = Number(q.get('duracion')) || disciplinaDe(slug)?.duracionPorDefecto || 60;
    return { status: 200, datos: disponibilidad(fecha, slug, dur) };
  }

  if (ruta === '/api/reservas' && metodo === 'POST') return crearReserva(cuerpo);

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
    const mias = todas.filter((r) => r.telefono === telefono && r.fecha >= hoy());
    return { status: 200, datos: { reservas: mias.map(serializar) } };
  }

  if (ruta === '/api/reservas/cancelar') {
    const todas = leerReservas();
    const r = todas.find((x) => x.codigo === String(cuerpo.codigo || '').trim().toUpperCase());
    if (!r) return fallo('No encontramos ese código de reserva.', 404, 'NO_ENCONTRADO');
    if (r.estado === 'cancelada') return fallo('Esa reserva ya estaba cancelada.');
    if (normalizarTel(cuerpo.telefono) !== r.telefono) return fallo('El teléfono no coincide con el de la reserva.', 403, 'NO_AUTORIZADO');
    if (!cancelable(r)) return fallo(\`Las cancelaciones online se aceptan hasta \${CONFIG.reglas.horasCancelacion} horas antes. Llamanos al \${CONFIG.club.telefono}.\`);
    r.estado = 'cancelada';
    guardarReservas(todas);
    return { status: 200, datos: { ok: true, reserva: serializar(r) } };
  }

  return fallo('Ese endpoint no existe.', 404);
}

const fetchReal = window.fetch.bind(window);
window.fetch = async (recurso, opciones = {}) => {
  const url = new URL(typeof recurso === 'string' ? recurso : recurso.url, location.href);
  if (!url.pathname.startsWith('/api/')) return fetchReal(recurso, opciones);
  await new Promise((r) => setTimeout(r, 90)); // una pizca de latencia, para que se sienta real
  const cuerpo = opciones.body ? JSON.parse(opciones.body) : {};
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
const VISTAS = { '/': 'vista-inicio', '/reservar': 'vista-reservar', '/mis-turnos': 'vista-turnos' };

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

  if (url.pathname !== '/reservar') return;
  const p = url.searchParams;
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
  if (url.pathname === '/admin') {
    e.preventDefault();
    alert('El panel del club no entra en la vista previa porque necesita el servidor de turnos.\\n\\nSe ve corriendo el proyecto: npm start → localhost:3000/admin');
    return;
  }
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
