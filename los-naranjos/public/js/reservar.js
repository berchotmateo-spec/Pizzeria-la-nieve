/** Flujo de reserva de turnos. */
import { pedir, traerConfig, iniciarCabecera, iniciarAnio, pintarDatosDelClub,
         traerSesion, pintarSesion, pagoEnPalabras,
         esc, pesos, duracionTexto, linkWhatsapp, DIAS_CORTOS, MESES_CORTOS } from './comun.js';

const $  = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const ICONOS = { padel: 'i-padel', pickleball: 'i-pickleball', futbol: 'i-futbol' };
const RECUERDO = 'naranjos:datos-jugador';
/* El turno que se está pagando en esta pestaña: si el jugador vuelve sin
   pagar (con el botón de atrás, por ejemplo), se le ofrece seguir o soltarlo. */
const PAGO_EN_CURSO = 'naranjos:pago-en-curso';

const estado = {
  config: null,
  disciplina: null,
  fecha: null,
  duracionMin: null,
  hora: null,
  canchaId: null,
  disponibilidad: null,
  cobro: null,          // 'seña' | 'total' | 'club'
  delClub: false,       // quien reserva es del personal del club
  enviando: false,
  yendoAPagar: false,
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
  // Con pagos online, "sin cargo" depende de la política de devoluciones del club: no se promete.
  $('#aviso-cancelacion').textContent =
    (config.pagos?.activos
      ? `Podés cancelar desde “Mis turnos” hasta ${config.reglas.horasCancelacion} horas antes del turno. `
      : `Podés cancelar sin cargo hasta ${config.reglas.horasCancelacion} horas antes del turno. `) +
    `Los turnos de hoy se toman con ${config.reglas.minutosAntelacion} minutos de anticipación.`;
  $('#aviso-confirmacion').textContent =
    `Guardá el código: con él y tu teléfono podés consultar o cancelar el turno desde “Mis turnos”.`;

  pintarDisciplinas();
  pintarDias();
  recordarDatos();
  usarDatosDeLaCuenta();
  aplicarParametrosDeUrl();
  actualizar();
  retomarPagoSiCorresponde();

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

  /* Si el club ofrece un solo deporte —hoy, sólo pádel— elegirlo no es una
     decisión: es un clic de peaje. Queda marcado de entrada. */
  if (estado.config.disciplinas.length === 1) {
    const unica = $('#opciones-disciplina input');
    unica.checked = true;
    estado.disciplina = unica.value;
    const d = disciplinaActual();
    estado.duracionMin = d.duracionPorDefecto ?? d.duraciones[0];
    pintarDuraciones();
  }
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

  /* Cuando el club ofrece una sola duración —en Los Naranjos, 90 minutos— el
     paso deja de ser una pregunta y pasa a ser un dato: se muestra, no se
     elige. El bloque se queda igual para no romper la numeración y porque
     saber cuánto dura el turno antes de elegir la hora sirve. */
  if (d.duraciones.length === 1) {
    const min = d.duraciones[0];
    estado.duracionMin = min;
    $('[data-titulo-duracion]').textContent = 'Cuánto dura';
    cont.innerHTML = `
      <div>
        <input type="radio" name="duracion" id="dur-${min}" value="${min}" checked>
        <label for="dur-${min}">${duracionTexto(min)}</label>
      </div>`;
    cont.classList.add('segmentado--fijo');
    cont.setAttribute('aria-label', `Todos los turnos son de ${duracionTexto(min)}`);
    return;
  }

  $('[data-titulo-duracion]').textContent = '¿Cuánto tiempo?';
  cont.classList.remove('segmentado--fijo');
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
        ${esc(c.nombre)}${c.gradas ? ' <small>con gradas</small>' : ''}${c.techada ? ' <small>techada</small>' : ''}${c.muros ? ` <small>${esc(c.muros)}</small>` : ''}
      </label>
    </span>`).join('');
}

$('#lista-canchas').addEventListener('change', (e) => {
  if (e.target.name !== 'cancha') return;
  estado.canchaId = e.target.value;
  actualizar({ sinRecargarHorarios: true });
});

/* ── Paso 6 · pago ────────────────────────────────────────────────────────── */

/**
 * Las formas de pagar este turno. Las online salen de la config del club; el
 * personal del club, en cambio, reserva sin pago online: lo cobra el mostrador.
 */
function opcionesDePago() {
  if (estado.delClub) {
    return [{ cobro: 'club', titulo: 'Lo cobra el club', detalle: 'Sin pago online: se paga en el mostrador.' }];
  }
  const pagos = estado.config?.pagos;
  if (!pagos?.activos || !estado.disciplina || !estado.duracionMin) return [];
  const m = pagos.montos?.[estado.disciplina]?.[estado.duracionMin] || {};
  const textos = {
    seña: {
      titulo: 'Pagar la seña',
      detalle: m.precio ? `El resto, ${pesos(m.precio - m.seña)}, lo pagás en el club.` : 'El resto lo pagás en el club.',
    },
    total: { titulo: 'Pagar el turno entero', detalle: 'No pagás nada más en el club.' },
  };
  const lista = (pagos.opciones || ['seña', 'total'])
    .filter((o) => m[o])
    .map((o) => ({ cobro: o, monto: m[o], ...textos[o] }));
  if (lista.length && !pagos.obligatorio) {
    lista.push({ cobro: 'club', titulo: 'Pagar en el club', detalle: 'Sin pago online.' });
  }
  return lista;
}

let ultimasOpcionesDePago = '';

function pintarPago() {
  const opciones = opcionesDePago();
  const bloque = $('[data-bloque="pago"]');
  bloque.hidden = !opciones.length;

  // Si la opción elegida ya no corre (cambió la duración, entró alguien del club), se vuelve a elegir.
  if (!opciones.some((o) => o.cobro === estado.cobro)) {
    estado.cobro = opciones.length === 1 ? opciones[0].cobro : null;
  }

  const clave = JSON.stringify(opciones);
  if (clave === ultimasOpcionesDePago) return;
  ultimasOpcionesDePago = clave;

  $('#opciones-pago').innerHTML = opciones.map((o) => `
    <label class="opcion">
      <input type="radio" name="cobro" value="${esc(o.cobro)}" ${o.cobro === estado.cobro ? 'checked' : ''}>
      <span class="opcion__cara">
        <span class="opcion__icono"><svg><use href="#${o.cobro === 'club' ? 'i-usuario' : 'i-tarjeta'}"/></svg></span>
        <span class="opcion__nombre">${esc(o.titulo)}</span>
        ${o.monto ? `<span class="opcion__monto numeros">${esc(pesos(o.monto))}</span>` : ''}
        <span class="opcion__dato">${esc(o.detalle)}</span>
      </span>
    </label>`).join('');

  const pagos = estado.config.pagos;
  $('#nota-pago').textContent = estado.delClub ? '' : 'Con Mercado Pago';
  $('#ayuda-pago').textContent = estado.delClub ? '' :
    `Te llevamos a Mercado Pago para pagar. Tenés ${pagos.minutosParaPagar} minutos: mientras tanto ` +
    'el turno queda apartado para vos, y si no se paga, se libera.' +
    (pagos.ejemplo ? ' Los montos son de ejemplo: el club todavía no confirmó la seña ni el precio.' : '');
}

$('#opciones-pago').addEventListener('change', (e) => {
  if (e.target.name !== 'cobro') return;
  estado.cobro = e.target.value;
  actualizar({ sinRecargarHorarios: true });
});

const opcionElegida = () => opcionesDePago().find((o) => o.cobro === estado.cobro) || null;

/* ── Sincronización de la interfaz ────────────────────────────────────────── */
let ultimaConsulta = '';

function actualizar({ sinRecargarHorarios = false } = {}) {
  marcarBloque('disciplina', !!estado.disciplina, false);
  marcarBloque('fecha', !!estado.fecha, !estado.disciplina);
  marcarBloque('duracion', !!estado.duracionMin, !estado.fecha);
  marcarBloque('hora', !!estado.hora, !(estado.fecha && estado.duracionMin));
  marcarBloque('datos', false, !estado.hora);
  pintarPago();
  marcarBloque('pago', !!estado.cobro, !estado.hora);

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
    pago: null,
  };

  const opciones = opcionesDePago();
  $('[data-fila-resumen-pago]').hidden = !opciones.length;
  const elegida = opcionElegida();
  if (elegida) {
    valores.pago = elegida.monto
      ? `${elegida.cobro === 'seña' ? 'Seña' : 'Turno entero'} · ${pesos(elegida.monto)}`
      : elegida.titulo;
  }

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
  const falta = opcionesDePago().length > 0 && !estado.cobro;
  const completo = estado.disciplina && estado.fecha && estado.duracionMin && estado.hora &&
    $('#nombre').value.trim().length >= 2 &&
    $('#telefono').value.replace(/\D/g, '').length >= 8 && !falta;
  $('#boton-confirmar').disabled = !completo || estado.enviando || estado.yendoAPagar;
  if (!estado.enviando && !estado.yendoAPagar) $('[data-texto-boton]').textContent = textoDelBoton();
}

/** "Reservar y pagar $10.000" cuando hay que pagar online; si no, "Confirmar reserva". */
function textoDelBoton() {
  const elegida = opcionElegida();
  return elegida?.monto ? `Reservar y pagar ${pesos(elegida.monto)}` : 'Confirmar reserva';
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
    cobro: estado.cobro || undefined,
  };

  estado.enviando = true;
  $('#error-envio').hidden = true;
  $('#boton-confirmar').disabled = true;
  $('[data-texto-boton]').innerHTML = '<span class="cargando"></span> Confirmando…';

  try {
    const { reserva, pago } = await pedir('/api/reservas', { method: 'POST', body: cuerpo });
    // Lo que carga el personal es de un cliente: no tiene que quedar como "mis datos".
    if (!estado.delClub) guardarDatos(cuerpo);
    if (pago?.url) {
      estado.yendoAPagar = true;
      recordarPagoEnCurso(reserva.codigo);
      $('[data-texto-boton]').innerHTML = '<span class="cargando"></span> Yendo a Mercado Pago…';
      irAlPago(pago.url);
      return;
    }
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
    actualizarBoton();
  }
}

/** Manda al jugador a pagar. La vista previa, que no puede salir de la página, la reemplaza. */
function irAlPago(url) {
  location.assign(url);
}

/**
 * Vuelve al formulario en blanco después de confirmar un turno.
 * Lo usan el botón "Reservar otro turno" y, en la vista previa, la vuelta a
 * esta pantalla: nadie quiere encontrarse el ticket viejo en vez del formulario.
 */
function reiniciarReserva() {
  estado.hora = null;
  estado.canchaId = null;
  estado.yendoAPagar = false;
  ultimaConsulta = '';
  $('#confirmacion').hidden = true;
  $('#estado-pago').hidden = true;
  $('#panel-reserva').hidden = false;
  $('#error-envio').hidden = true;
  $('#notas').value = '';
  $$('#grilla-horarios input:checked, #lista-canchas input:checked').forEach((i) => { i.checked = false; });
  $('#detalle-canchas').hidden = true;
  document.title = 'Reservar turno — Los Naranjos';
  actualizar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('#otro-turno').addEventListener('click', reiniciarReserva);
document.addEventListener('naranjos:reiniciar-reserva', () => {
  if (!$('#confirmacion').hidden || !$('#estado-pago').hidden || estado.yendoAPagar) reiniciarReserva();
});

function mostrarConfirmacion(reserva) {
  $('#panel-reserva').hidden = true;
  $('#estado-pago').hidden = true;
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
  const pago = pagoEnPalabras(reserva);
  $('[data-fila-pago]').hidden = !pago;
  $('[data-ticket="pago"]').textContent = pago ? pago.texto : '';

  const club = estado.config.club;
  const mensaje =
    `¡Turno confirmado en Los Naranjos! 🍊\n` +
    `${reserva.disciplinaNombre} · ${reserva.fechaLarga}\n` +
    `${reserva.hora} a ${reserva.fin} · ${reserva.canchaNombre}\n` +
    `${club.direccion}, ${club.ciudad}\n` +
    `Código: ${reserva.codigo}`;
  $('#compartir-wsp').href = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
  // La vista previa saca el botón de agendar (el navegador bloquea la descarga),
  // así que puede no estar en el documento.
  const agendar = $('#descargar-ics');
  if (agendar) agendar.href = crearIcs(reserva, club);

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

/**
 * Con la cuenta abierta, el nombre y el teléfono los pone la cuenta y quedan
 * bloqueados: el servidor los toma de la sesión igual, así que dejarlos
 * editables sólo serviría para que alguien crea que reservó a otro nombre.
 */
async function usarDatosDeLaCuenta() {
  const sesion = await traerSesion();
  pintarSesion(sesion);            // la cabecera también muestra quién entró
  aplicarSesionAlFormulario(sesion);
}

/**
 * Acomoda el paso "Tus datos" según haya o no alguien con la sesión abierta.
 * El personal del club es un caso aparte: reserva para otra persona, así que
 * los datos se escriben a mano y el pago queda para el mostrador.
 */
function aplicarSesionAlFormulario({ usuario } = {}) {
  const delClub = usuario?.rol === 'club';
  const cuenta = usuario && !delClub ? usuario : null;

  if (delClub && !estado.delClub) {
    // Lo que quedó guardado en este navegador no es del cliente.
    for (const id of ['#nombre', '#telefono', '#email']) $(id).value = '';
  }
  estado.delClub = delClub;

  if (cuenta) {
    $('#nombre').value = cuenta.nombre;
    $('#telefono').value = cuenta.telefono;
    if (cuenta.email && !$('#email').value) $('#email').value = cuenta.email;
  }
  for (const id of ['#nombre', '#telefono']) {
    $(id).readOnly = !!cuenta;
    $(id).closest('.campo').hidden = !!cuenta;
  }
  $('#reservando-como').hidden = !cuenta;
  $('#reservando-para').hidden = !delClub;
  $('[data-bloque="datos"] h2').textContent = delClub ? 'Datos del cliente' : 'Tus datos';
  if (estado.config) actualizar({ sinRecargarHorarios: true });
}

/* Si alguien entra o sale mientras esta pantalla está abierta, el formulario se
   entera: pasa en la vista previa, donde las pantallas conviven en una página. */
document.addEventListener('naranjos:sesion', (e) => {
  if (estado.config) aplicarSesionAlFormulario(e.detail);
});

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

/* ── Vuelta desde Mercado Pago ────────────────────────────────────────────── */

const recordarPagoEnCurso = (codigo) => {
  try { sessionStorage.setItem(PAGO_EN_CURSO, codigo); } catch { /* sin almacenamiento */ }
};
const pagoEnCurso = () => {
  try { return sessionStorage.getItem(PAGO_EN_CURSO); } catch { return null; }
};
const olvidarPagoEnCurso = () => {
  try { sessionStorage.removeItem(PAGO_EN_CURSO); } catch { /* sin almacenamiento */ }
};

/**
 * Al abrir la página: ¿volvemos de pagar (Mercado Pago agrega ?pago=… a la
 * vuelta), o quedó un turno apartado en esta pestaña esperando el pago?
 */
function retomarPagoSiCorresponde() {
  const p = new URLSearchParams(location.search);
  if (p.get('pago')) {
    retomarPago({ codigo: p.get('pago'), pagoId: p.get('payment_id') || p.get('collection_id') });
    return;
  }
  const codigo = pagoEnCurso();
  if (codigo) retomarPago({ codigo, silencioso: true });
}

// El botón "atrás" desde Mercado Pago puede devolver la página tal como quedó.
window.addEventListener('pageshow', (e) => {
  if (e.persisted && estado.config) {
    estado.yendoAPagar = false;
    actualizarBoton();
    retomarPagoSiCorresponde();
  }
});

// En la vista previa la vuelta del pago llega por acá, sin recargar la página.
document.addEventListener('naranjos:volver-del-pago', (e) => retomarPago(e.detail));

let esperandoConfirmacion = 0;

/**
 * Muestra cómo quedó un turno que se estaba pagando. Lo que diga la URL a la
 * vuelta (status=approved) no cuenta: se le pregunta al servidor, que a su vez
 * le pregunta a Mercado Pago.
 */
async function retomarPago({ codigo, pagoId, silencioso = false }) {
  if (!silencioso) {
    pintarEstadoPago({ icono: 'i-reloj', titulo: 'Estamos viendo cómo salió el pago…', cargando: true });
  }
  let datos;
  try {
    const consulta = new URLSearchParams({ codigo });
    if (pagoId) consulta.set('pago_id', pagoId);
    datos = await pedir(`/api/pagos/estado?${consulta}`);
  } catch (err) {
    olvidarPagoEnCurso();
    if (silencioso) return;
    pintarEstadoPago({
      icono: 'i-reloj', titulo: 'No pudimos ver el estado del pago', texto: err.message,
      acciones: [{ accion: 'otro-turno', texto: 'Volver a reservar' }],
    });
    return;
  }
  limpiarUrl();

  const { reserva, pago, aDevolver, venceEn, opciones } = datos;
  const turno = `${reserva.disciplinaNombre} · ${reserva.fechaLarga} · ${reserva.hora} a ${reserva.fin} · ${reserva.canchaNombre}`;

  if (reserva.estado === 'confirmada') {
    olvidarPagoEnCurso();
    mostrarConfirmacion(reserva);
    return;
  }

  if (reserva.estado === 'pendiente') {
    recordarPagoEnCurso(reserva.codigo);
    if (pago?.estado === 'pendiente' && esperandoConfirmacion < 12) {
      esperandoConfirmacion++;
      pintarEstadoPago({
        icono: 'i-reloj', titulo: 'Mercado Pago está procesando tu pago',
        texto: 'Apenas lo confirme, el turno queda firme. No hace falta que hagas nada.', turno, cargando: true,
      });
      setTimeout(() => retomarPago({ codigo: reserva.codigo }), 4000);
      return;
    }
    esperandoConfirmacion = 0;
    // La hora la da el servidor, en la hora del club: no depende del reloj del teléfono.
    const hasta = reserva.venceHora || (venceEn ? horaLocal(venceEn) : '');
    const rechazado = pago?.estado === 'rechazado';
    pintarEstadoPago({
      icono: rechazado ? 'i-tarjeta' : 'i-reloj',
      tono: rechazado ? 'error' : 'alerta',
      titulo: rechazado ? 'El pago no salió' : 'Tu turno te está esperando',
      texto: rechazado
        ? `${pago.motivo ? `${pago.motivo} ` : ''}Podés probar de nuevo, con otra tarjeta o con la otra opción. ` +
          `El turno sigue apartado para vos hasta las ${hasta}.`
        : `Todavía no está pago. Lo tenemos apartado para vos hasta las ${hasta}; después se libera.`,
      turno,
      codigo: reserva.codigo,
      opciones,
      elegida: reserva.cobro,
      acciones: [
        { accion: 'pagar', texto: rechazado ? 'Probar de nuevo' : 'Pagar ahora', principal: true },
        { accion: 'soltar', texto: 'Soltar el turno' },
      ],
    });
    return;
  }

  olvidarPagoEnCurso();
  if (silencioso && !aDevolver) return;

  if (reserva.estado === 'vencida') {
    pintarEstadoPago({
      icono: 'i-reloj', tono: aDevolver ? 'error' : 'alerta',
      titulo: aDevolver ? 'Recibimos tu pago, pero el turno ya era de otra persona' : 'Se terminó el tiempo para pagar',
      texto: aDevolver
        ? 'Pagaste cuando el turno ya se había liberado y otra persona lo reservó. El club ve tu pago en su panel y se comunica con vos para devolvértelo.'
        : 'El turno no se pagó a tiempo y volvió a quedar libre. Si sigue disponible, podés reservarlo de nuevo.',
      turno,
      acciones: [{ accion: 'otro-turno', texto: 'Elegir un turno', principal: true }],
    });
    return;
  }

  pintarEstadoPago({
    icono: 'i-reloj', tono: 'alerta', titulo: 'Esta reserva está cancelada', turno,
    texto: aDevolver ? 'Tenía un pago hecho: el club lo ve en su panel y se comunica con vos.' : '',
    acciones: [{ accion: 'otro-turno', texto: 'Elegir un turno', principal: true }],
  });
}

const horaLocal = (iso) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

/** Saca ?pago=… de la barra, para que recargar no vuelva a abrir este cartel. */
function limpiarUrl() {
  if (!new URLSearchParams(location.search).get('pago')) return;
  try { history.replaceState(null, '', location.pathname); } catch { /* la vista previa no deja */ }
}

/** Arma el cartel de cómo salió el pago, con las opciones para seguir. */
function pintarEstadoPago({
  icono, tono = 'neutro', titulo, texto = '', turno, codigo, opciones = [], elegida = null, acciones = [], cargando = false,
}) {
  $('#panel-reserva').hidden = true;
  $('#confirmacion').hidden = true;
  const caja = $('#estado-pago');
  caja.hidden = false;
  caja.dataset.codigo = codigo || '';
  caja.innerHTML = `
    <span class="estado-pago__icono estado-pago__icono--${esc(tono)}">
      ${cargando ? '<span class="cargando"></span>' : `<svg><use href="#${esc(icono)}"/></svg>`}
    </span>
    <div>
      <h2 class="display-md">${esc(titulo)}</h2>
      ${texto ? `<p class="bajada">${esc(texto)}</p>` : ''}
    </div>
    ${turno ? `<p class="estado-pago__turno">${esc(turno)}</p>` : ''}
    ${opciones.length > 1 ? `
      <div class="opciones opciones--pago estado-pago__opciones" role="radiogroup" aria-label="Cómo pagás">
        ${opciones.map((o, i) => `
          <label class="opcion">
            <input type="radio" name="cobro-reintento" value="${esc(o.cobro)}" ${
              (opciones.some((x) => x.cobro === elegida) ? o.cobro === elegida : i === 0) ? 'checked' : ''}>
            <span class="opcion__cara">
              <span class="opcion__nombre">${o.cobro === 'seña' ? 'La seña' : 'El turno entero'}</span>
              <span class="opcion__monto numeros">${esc(pesos(o.monto))}</span>
            </span>
          </label>`).join('')}
      </div>` : ''}
    <div class="aviso aviso--error" data-error-pago hidden><span></span></div>
    ${acciones.length ? `
      <div class="acciones-confirmacion">
        ${acciones.map((a) => `<button type="button" class="boton ${a.principal ? '' : 'boton--fantasma'}" data-accion="${esc(a.accion)}">${esc(a.texto)}</button>`).join('')}
      </div>` : ''}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('#estado-pago').addEventListener('click', async (e) => {
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;
  const caja = $('#estado-pago');
  const codigo = caja.dataset.codigo;
  const error = caja.querySelector('[data-error-pago]');
  error.hidden = true;

  if (boton.dataset.accion === 'otro-turno') {
    olvidarPagoEnCurso();
    reiniciarReserva();
    return;
  }

  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.innerHTML = '<span class="cargando"></span>';
  try {
    if (boton.dataset.accion === 'pagar') {
      const cobro = caja.querySelector('input[name="cobro-reintento"]:checked')?.value;
      const { url } = await pedir('/api/pagos/reintentar', { method: 'POST', body: { codigo, cobro } });
      boton.innerHTML = '<span class="cargando"></span> Yendo a Mercado Pago…';
      irAlPago(url);
      return;
    }
    if (boton.dataset.accion === 'soltar') {
      await pedir('/api/pagos/abandonar', { method: 'POST', body: { codigo } });
      olvidarPagoEnCurso();
      reiniciarReserva();
    }
  } catch (err) {
    error.hidden = false;
    error.querySelector('span').textContent = err.message;
    boton.disabled = false;
    boton.textContent = textoOriginal;
    // Si ya no hay nada que pagar, el cartel se actualiza con lo que pasó.
    if (err.code === 'VENCIDO' || err.code === 'YA_PAGADO') retomarPago({ codigo });
  }
});
