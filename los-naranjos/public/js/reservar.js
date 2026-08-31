/** Flujo de reserva de turnos. */
import { pedir, traerConfig, iniciarCabecera, iniciarAnio, pintarDatosDelClub,
         esc, duracionTexto, linkWhatsapp, DIAS_CORTOS, MESES_CORTOS } from './comun.js';

const $  = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const ICONOS = { padel: 'i-padel', pickleball: 'i-pickleball', futbol: 'i-futbol' };
const RECUERDO = 'naranjos:datos-jugador';

const estado = {
  config: null,
  disciplina: null,
  fecha: null,
  duracionMin: null,
  hora: null,
  canchaId: null,
  disponibilidad: null,
  enviando: false,
};

iniciarCabecera();
iniciarAnio();
arrancar();

async function arrancar() {
  let config;
  try {
    config = await traerConfig();
  } catch {
    $('#sin-sistema').hidden = false;
    $('#panel-reserva').hidden = true;
    try { pintarDatosDelClub({ club: { whatsapp: '', telefonoLink: '' } }); } catch { /* nada */ }
    return;
  }

  estado.config = config;
  pintarDatosDelClub(config);

  $('#nota-anticipacion').textContent = `Hasta ${config.reglas.diasAnticipacion} días para adelante`;
  $('#aviso-cancelacion').textContent =
    `Podés cancelar sin cargo hasta ${config.reglas.horasCancelacion} horas antes del turno. ` +
    `Los turnos de hoy se toman con ${config.reglas.minutosAntelacion} minutos de anticipación.`;
  $('#aviso-confirmacion').textContent =
    `Guardá el código: con él y tu teléfono podés consultar o cancelar el turno desde “Mis turnos”.`;

  pintarDisciplinas();
  pintarDias();
  recordarDatos();
  aplicarParametrosDeUrl();
  actualizar();

  $('#formulario').addEventListener('submit', enviar);
  $$('#formulario input, #formulario textarea').forEach((campo) => {
    campo.addEventListener('input', () => { limpiarError(campo); actualizarBoton(); });
  });
}

/* ── Paso 1 · disciplina ──────────────────────────────────────────────────── */
function pintarDisciplinas() {
  const cont = $('#opciones-disciplina');
  cont.innerHTML = estado.config.disciplinas.map((d) => `
    <label class="opcion">
      <input type="radio" name="disciplina" value="${esc(d.slug)}">
      <span class="opcion__cara">
        <span class="opcion__icono"><svg><use href="#${ICONOS[d.icono] || 'i-padel'}"/></svg></span>
        <span class="opcion__nombre">${esc(d.nombre)}</span>
        <span class="opcion__dato">${esc(d.jugadores)} · ${d.canchas} ${d.canchas === 1 ? 'cancha' : 'canchas'}</span>
      </span>
    </label>`).join('');

  cont.addEventListener('change', (e) => {
    if (e.target.name !== 'disciplina') return;
    estado.disciplina = e.target.value;
    const d = disciplinaActual();
    estado.duracionMin = d.duracionPorDefecto ?? d.duraciones[0];
    estado.hora = null;
    estado.canchaId = null;
    pintarDuraciones();
    actualizar();
  });
}

const disciplinaActual = () => estado.config.disciplinas.find((d) => d.slug === estado.disciplina);

/* ── Paso 2 · día ─────────────────────────────────────────────────────────── */
function pintarDias() {
  const cont = $('#tira-dias');
  cont.innerHTML = estado.config.calendario.map((d) => `
    <label class="dia">
      <input type="radio" name="fecha" value="${esc(d.fecha)}" ${d.cerrado ? 'disabled' : ''}>
      <span class="dia__cara">
        <span class="dia__semana">${d.esHoy ? 'Hoy' : DIAS_CORTOS[d.diaSemana]}</span>
        <span class="dia__numero numeros">${d.dia}</span>
        <span class="dia__mes">${d.cerrado ? 'cerrado' : MESES_CORTOS[d.mes - 1]}</span>
      </span>
    </label>`).join('');

  cont.addEventListener('change', (e) => {
    if (e.target.name !== 'fecha') return;
    estado.fecha = e.target.value;
    estado.hora = null;
    estado.canchaId = null;
    actualizar();
  });
}

/* ── Paso 3 · duración ────────────────────────────────────────────────────── */
function pintarDuraciones() {
  const d = disciplinaActual();
  const cont = $('#segmentado-duracion');
  cont.innerHTML = d.duraciones.map((min) => `
    <div>
      <input type="radio" name="duracion" id="dur-${min}" value="${min}" ${min === estado.duracionMin ? 'checked' : ''}>
      <label for="dur-${min}">${duracionTexto(min)}</label>
    </div>`).join('');
}

$('#segmentado-duracion').addEventListener('change', (e) => {
  if (e.target.name !== 'duracion') return;
  estado.duracionMin = Number(e.target.value);
  estado.hora = null;
  estado.canchaId = null;
  actualizar();
});

/* ── Paso 4 · horario ─────────────────────────────────────────────────────── */
const FRANJAS = [
  { titulo: 'Mañana', desde: 0,    hasta: 720 },
  { titulo: 'Tarde',  desde: 720,  hasta: 1080 },
  { titulo: 'Noche',  desde: 1080, hasta: 1441 },
];

async function cargarHorarios() {
  const cont = $('#grilla-horarios');
  cont.innerHTML = `<div class="horas">${'<div class="esqueleto" style="height:52px"></div>'.repeat(8)}</div>`;
  $('#detalle-canchas').hidden = true;

  let datos;
  try {
    datos = await pedir(
      `/api/disponibilidad?fecha=${encodeURIComponent(estado.fecha)}` +
      `&disciplina=${encodeURIComponent(estado.disciplina)}&duracion=${estado.duracionMin}`
    );
  } catch (err) {
    cont.innerHTML = `<p class="vacio">${esc(err.message)}</p>`;
    return;
  }

  estado.disponibilidad = datos;

  if (datos.cerrado) {
    cont.innerHTML = `<p class="vacio">Ese día el complejo está cerrado${datos.motivo ? ` (${esc(datos.motivo)})` : ''}. Elegí otra fecha.</p>`;
    $('#nota-canchas').textContent = '';
    return;
  }

  const libres = datos.horarios.filter((h) => h.cantidad > 0);
  $('#nota-canchas').textContent = libres.length
    ? `${libres.length} ${libres.length === 1 ? 'horario libre' : 'horarios libres'}`
    : '';

  if (!libres.length) {
    cont.innerHTML = `<p class="vacio">No quedan turnos de ${duracionTexto(estado.duracionMin)} ese día.<br>Probá con otra duración u otra fecha.</p>`;
    return;
  }

  cont.innerHTML = FRANJAS.map((f) => {
    const enFranja = libres.filter((h) => h.inicioMin >= f.desde && h.inicioMin < f.hasta);
    if (!enFranja.length) return '';
    return `
      <div class="franja">
        <p class="franja__titulo">${f.titulo}</p>
        <div class="horas">
          ${enFranja.map((h) => `
            <label class="hora ${h.cantidad <= 2 ? 'hora--pocas' : ''}">
              <input type="radio" name="hora" value="${esc(h.hora)}" ${h.hora === estado.hora ? 'checked' : ''}>
              <span class="hora__cara">
                <span class="hora__valor">${esc(h.hora)}</span>
                <span class="hora__libres">${h.cantidad} ${h.cantidad === 1 ? 'libre' : 'libres'}</span>
              </span>
            </label>`).join('')}
        </div>
      </div>`;
  }).join('');

  if (estado.hora && !libres.some((h) => h.hora === estado.hora)) {
    estado.hora = null;
    estado.canchaId = null;
  }
  if (estado.hora) pintarCanchas();
  // La grilla llegó después del último actualizar(): sincronizamos resumen y botón.
  actualizar({ sinRecargarHorarios: true });
}

$('#grilla-horarios').addEventListener('change', (e) => {
  if (e.target.name !== 'hora') return;
  estado.hora = e.target.value;
  estado.canchaId = null;
  pintarCanchas();
  actualizar({ sinRecargarHorarios: true });
});

/** Lista de canchas libres para el horario elegido. */
function pintarCanchas() {
  const detalle = $('#detalle-canchas');
  const slot = estado.disponibilidad?.horarios.find((h) => h.hora === estado.hora);
  if (!slot) { detalle.hidden = true; return; }

  const canchas = estado.config.canchas.filter((c) => slot.libres.includes(c.id));
  detalle.hidden = canchas.length < 2;
  $('#lista-canchas').innerHTML = canchas.map((c) => `
    <span class="cancha-chip">
      <input type="radio" name="cancha" id="cancha-${esc(c.id)}" value="${esc(c.id)}" ${c.id === estado.canchaId ? 'checked' : ''}>
      <label for="cancha-${esc(c.id)}">
        ${esc(c.nombre)}${c.techada ? ' <small>techada</small>' : ''}${c.muros ? ` <small>${esc(c.muros)}</small>` : ''}
      </label>
    </span>`).join('');
}

$('#lista-canchas').addEventListener('change', (e) => {
  if (e.target.name !== 'cancha') return;
  estado.canchaId = e.target.value;
  actualizar({ sinRecargarHorarios: true });
});

/* ── Sincronización de la interfaz ────────────────────────────────────────── */
let ultimaConsulta = '';

function actualizar({ sinRecargarHorarios = false } = {}) {
  marcarBloque('disciplina', !!estado.disciplina, false);
  marcarBloque('fecha', !!estado.fecha, !estado.disciplina);
  marcarBloque('duracion', !!estado.duracionMin, !estado.fecha);
  marcarBloque('hora', !!estado.hora, !(estado.fecha && estado.duracionMin));
  marcarBloque('datos', false, !estado.hora);

  const listoParaConsultar = estado.disciplina && estado.fecha && estado.duracionMin;
  const clave = `${estado.disciplina}|${estado.fecha}|${estado.duracionMin}`;
  if (listoParaConsultar && !sinRecargarHorarios && clave !== ultimaConsulta) {
    ultimaConsulta = clave;
    cargarHorarios();
  }

  pintarResumen();
  actualizarBoton();
}

function marcarBloque(nombre, completo, inactivo) {
  const bloque = $(`[data-bloque="${nombre}"]`);
  bloque.dataset.inactivo = String(inactivo);
  bloque.dataset.completo = String(completo);
  const numero = $('[data-numero]', bloque);
  const indice = numero.dataset.indice || (numero.dataset.indice = numero.textContent.trim());
  numero.innerHTML = completo ? '<svg><use href="#i-check"/></svg>' : indice;
}

function pintarResumen() {
  const d = estado.disciplina ? disciplinaActual() : null;
  const cancha = estado.canchaId
    ? estado.config.canchas.find((c) => c.id === estado.canchaId)?.nombre
    : null;
  const dia = estado.fecha
    ? (estado.disponibilidad?.fecha === estado.fecha && estado.disponibilidad.fechaLarga) ||
      textoFechaCorta(estado.fecha)
    : null;

  const valores = {
    disciplina: d?.nombre,
    fecha: dia,
    hora: estado.hora ? `${estado.hora} a ${finDelTurno()}` : null,
    duracion: estado.duracionMin ? duracionTexto(estado.duracionMin) : null,
    cancha: cancha || (estado.hora ? 'La asignamos nosotros' : null),
  };

  for (const [clave, valor] of Object.entries(valores)) {
    const el = $(`[data-resumen="${clave}"]`);
    el.textContent = valor || (clave === 'cancha' ? 'La asignamos' : 'A elegir');
    el.classList.toggle('resumen__valor--pendiente', !valor);
  }
}

function textoFechaCorta(fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS_CORTOS[dow]} ${d} ${MESES_CORTOS[m - 1]}`;
}

function finDelTurno() {
  const [h, m] = estado.hora.split(':').map(Number);
  const fin = h * 60 + m + estado.duracionMin;
  return `${String(Math.floor(fin / 60) % 24).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}`;
}

/** Borra el mensaje de error de un campo cuando el usuario lo corrige. */
function limpiarError(campo) {
  const caja = $(`[data-error="${campo.name}"]`);
  if (caja) { caja.hidden = true; caja.textContent = ''; }
  campo.closest('.campo')?.classList.remove('error');
  $('#error-envio').hidden = true;
}

function actualizarBoton() {
  const completo = estado.disciplina && estado.fecha && estado.duracionMin && estado.hora &&
    $('#nombre').value.trim().length >= 2 &&
    $('#telefono').value.replace(/\D/g, '').length >= 8;
  $('#boton-confirmar').disabled = !completo || estado.enviando;
}

/* ── Envío ────────────────────────────────────────────────────────────────── */
async function enviar(e) {
  e.preventDefault();
  if (estado.enviando) return;

  const cuerpo = {
    disciplina: estado.disciplina,
    fecha: estado.fecha,
    hora: estado.hora,
    duracionMin: estado.duracionMin,
    canchaId: estado.canchaId || undefined,
    nombre: $('#nombre').value.trim(),
    telefono: $('#telefono').value.trim(),
    email: $('#email').value.trim(),
    notas: $('#notas').value.trim(),
  };

  estado.enviando = true;
  $('#error-envio').hidden = true;
  $('#boton-confirmar').disabled = true;
  $('[data-texto-boton]').innerHTML = '<span class="cargando"></span> Confirmando…';

  try {
    const { reserva } = await pedir('/api/reservas', { method: 'POST', body: cuerpo });
    guardarDatos(cuerpo);
    mostrarConfirmacion(reserva);
  } catch (err) {
    const caja = $('#error-envio');
    caja.hidden = false;
    $('[data-texto-error]').textContent = err.message;
    caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Si el turno se lo llevó otro, refrescamos la grilla para mostrar la realidad.
    if (err.code === 'OCUPADO') {
      estado.hora = null;
      estado.canchaId = null;
      ultimaConsulta = '';
      actualizar();
    }
  } finally {
    estado.enviando = false;
    $('[data-texto-boton]').textContent = 'Confirmar reserva';
    actualizarBoton();
  }
}

function mostrarConfirmacion(reserva) {
  $('#panel-reserva').hidden = true;
  const panel = $('#confirmacion');
  panel.hidden = false;

  const textos = {
    codigo: reserva.codigo,
    disciplina: reserva.disciplinaNombre,
    fecha: reserva.fechaLarga,
    hora: `${reserva.hora} a ${reserva.fin} (${duracionTexto(reserva.duracionMin)})`,
    cancha: reserva.canchaNombre,
    nombre: reserva.nombre,
  };
  for (const [clave, valor] of Object.entries(textos)) {
    $(`[data-ticket="${clave}"]`).textContent = valor;
  }

  const club = estado.config.club;
  const mensaje =
    `¡Turno confirmado en Los Naranjos! 🍊\n` +
    `${reserva.disciplinaNombre} · ${reserva.fechaLarga}\n` +
    `${reserva.hora} a ${reserva.fin} · ${reserva.canchaNombre}\n` +
    `${club.direccion}, ${club.ciudad}\n` +
    `Código: ${reserva.codigo}`;
  $('#compartir-wsp').href = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
  $('#descargar-ics').href = crearIcs(reserva, club);

  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.title = `Turno ${reserva.codigo} — Los Naranjos`;
}

/** Archivo .ics para agendar el turno. Argentina no usa horario de verano: UTC−3. */
function crearIcs(reserva, club) {
  const desfase = 3 * 60; // minutos que hay que sumar para pasar a UTC
  const aUtc = (fecha, hora, sumar = 0) => {
    const [a, m, d] = fecha.split('-').map(Number);
    const [hh, mm] = hora.split(':').map(Number);
    const t = new Date(Date.UTC(a, m - 1, d, hh, mm));
    t.setUTCMinutes(t.getUTCMinutes() + desfase + sumar);
    return t.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };

  const lineas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Los Naranjos//Turnos//ES', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${reserva.codigo}@losnaranjos`,
    `DTSTAMP:${aUtc(reserva.fecha, reserva.hora)}`,
    `DTSTART:${aUtc(reserva.fecha, reserva.hora)}`,
    `DTEND:${aUtc(reserva.fecha, reserva.hora, reserva.duracionMin)}`,
    `SUMMARY:${reserva.disciplinaNombre} en Los Naranjos — ${reserva.canchaNombre}`,
    `LOCATION:${club.direccion}\\, ${club.ciudad}\\, ${club.provincia}`,
    `DESCRIPTION:Código de reserva ${reserva.codigo}. Turno de ${duracionTexto(reserva.duracionMin)}.`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Tu turno en Los Naranjos es en 2 horas', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lineas.join('\r\n'));
}

/* ── Memoria local y parámetros de la URL ─────────────────────────────────── */
function recordarDatos() {
  try {
    const guardado = JSON.parse(localStorage.getItem(RECUERDO) || '{}');
    if (guardado.nombre) $('#nombre').value = guardado.nombre;
    if (guardado.telefono) $('#telefono').value = guardado.telefono;
    if (guardado.email) $('#email').value = guardado.email;
  } catch { /* almacenamiento no disponible */ }
}

function guardarDatos({ nombre, telefono, email }) {
  try {
    localStorage.setItem(RECUERDO, JSON.stringify({ nombre, telefono, email }));
  } catch { /* almacenamiento no disponible */ }
}

/** Permite entrar directo desde la home con el turno medio elegido. */
function aplicarParametrosDeUrl() {
  const p = new URLSearchParams(location.search);
  const marcar = (nombre, valor) => {
    if (!valor) return false;
    const input = $(`input[name="${nombre}"][value="${CSS.escape(valor)}"]`);
    if (!input || input.disabled) return false;
    input.checked = true;
    return true;
  };

  const slug = p.get('disciplina');
  if (marcar('disciplina', slug)) {
    estado.disciplina = slug;
    const d = disciplinaActual();
    estado.duracionMin = d.duracionPorDefecto ?? d.duraciones[0];
    pintarDuraciones();
  }

  if (estado.disciplina && marcar('fecha', p.get('fecha'))) estado.fecha = p.get('fecha');

  const dur = Number(p.get('duracion'));
  if (estado.disciplina && disciplinaActual().duraciones.includes(dur)) {
    estado.duracionMin = dur;
    pintarDuraciones();
  }

  // La hora se aplica cuando llega la grilla del servidor.
  const hora = p.get('hora');
  if (hora && /^\d{2}:\d{2}$/.test(hora)) estado.hora = hora;
}
