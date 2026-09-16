/** Panel del club: grilla del día, cancelaciones y bloqueos. */
import { pedir, traerConfig, iniciarCabecera, esc, duracionTexto } from './comun.js';

const $ = (sel) => document.querySelector(sel);
const LLAVE = 'naranjos:clave-panel';

let clave = null;
let config = null;
let dia = null;          // datos del día que se está mostrando
let codigoAcancelar = null;

iniciarCabecera();
arrancar();

async function arrancar() {
  config = await traerConfig().catch(() => null);
  if (!config) {
    $('#error-acceso').hidden = false;
    $('#error-acceso').querySelector('span').textContent =
      'No pudimos conectarnos con el servidor de turnos. Revisá que esté encendido.';
    return;
  }

  $('#fecha').value = config.hoy;
  $('#fecha').min = config.hoy;
  $('#bloqueo-fecha').value = config.hoy;
  $('#bloqueo-cancha').innerHTML = config.canchas
    .map((c) => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');

  // Sesión recordada mientras la pestaña siga abierta.
  const guardada = sessionStorage.getItem(LLAVE);
  if (guardada) { clave = guardada; if (await verificar()) return entrar(); clave = null; }
}

const cabeceras = () => ({ authorization: `Bearer ${clave}` });

async function verificar() {
  try {
    const r = await pedir('/api/admin/sesion', { method: 'POST', headers: cabeceras() });
    $('#aviso-clave').hidden = !r.avisoTokenPorDefecto;
    return true;
  } catch {
    sessionStorage.removeItem(LLAVE);
    return false;
  }
}

$('#formulario-acceso').addEventListener('submit', async (e) => {
  e.preventDefault();
  clave = $('#clave').value;
  $('#boton-entrar').disabled = true;
  $('#boton-entrar').innerHTML = '<span class="cargando"></span>';
  if (await verificar()) {
    sessionStorage.setItem(LLAVE, clave);
    entrar();
  } else {
    clave = null;
    const caja = $('#error-acceso');
    caja.hidden = false;
    caja.querySelector('span').textContent = 'La clave no es correcta.';
  }
  $('#boton-entrar').disabled = false;
  $('#boton-entrar').textContent = 'Entrar';
});

$('#salir').addEventListener('click', () => {
  sessionStorage.removeItem(LLAVE);
  location.reload();
});

function entrar() {
  $('#pantalla-acceso').hidden = true;
  $('#pantalla-panel').hidden = false;
  $('#salir').hidden = false;
  cargarDia();
}

/* ── Navegación por fecha ─────────────────────────────────────────────────── */
const sumarDias = (fecha, n) => {
  const [a, m, d] = fecha.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

$('#fecha').addEventListener('change', cargarDia);
$('#dia-anterior').addEventListener('click', () => { $('#fecha').value = sumarDias($('#fecha').value, -1); cargarDia(); });
$('#dia-siguiente').addEventListener('click', () => { $('#fecha').value = sumarDias($('#fecha').value, 1); cargarDia(); });
$('#ir-hoy').addEventListener('click', () => { $('#fecha').value = config.hoy; cargarDia(); });

async function cargarDia() {
  const fecha = $('#fecha').value;
  if (!fecha) return;
  $('#grilla').querySelector('tbody').innerHTML =
    '<tr><td style="padding:1.5rem" colspan="99">Cargando…</td></tr>';
  try {
    dia = await pedir(`/api/admin/dia?fecha=${encodeURIComponent(fecha)}`, { headers: cabeceras() });
  } catch (err) {
    $('#grilla').querySelector('tbody').innerHTML =
      `<tr><td style="padding:1.5rem" colspan="99">${esc(err.message)}</td></tr>`;
    return;
  }
  $('#etiqueta-fecha').textContent = dia.fechaLarga;
  pintarResumen();
  pintarGrilla();
  pintarTabla();
}

function pintarResumen() {
  const canchas = dia.canchas.length;
  const horasDia = dia.horario
    ? (aMin(dia.horario.cierra) - aMin(dia.horario.abre)) / 60 * canchas
    : 0;
  const ocupacion = horasDia ? Math.round((dia.resumen.horasVendidas / horasDia) * 100) : 0;

  $('#resumen').innerHTML = `
    <div class="tarjeta-resumen"><b class="numeros">${dia.resumen.turnos}</b><span>Turnos reservados</span></div>
    <div class="tarjeta-resumen"><b class="numeros">${dia.resumen.horasVendidas}</b><span>Horas de cancha</span></div>
    <div class="tarjeta-resumen"><b class="numeros">${ocupacion}%</b><span>Ocupación del día</span></div>
    <div class="tarjeta-resumen"><b class="numeros">${dia.resumen.bloqueos}</b><span>Bloqueos activos</span></div>`;
}

const aMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const aHora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

function pintarGrilla() {
  const tabla = $('#grilla');
  if (!dia.horario) {
    tabla.innerHTML = '<tbody><tr><td style="padding:1.5rem">Ese día el complejo está cerrado.</td></tr></tbody>';
    return;
  }

  const paso = config.reglas.slotMinutos;
  const desde = Math.floor(aMin(dia.horario.abre) / paso) * paso;
  const hasta = Math.ceil(aMin(dia.horario.cierra) / paso) * paso;
  const slots = [];
  for (let m = desde; m < hasta; m += paso) slots.push(m);

  // Qué reserva ocupa cada casillero de cada cancha.
  const ocupado = new Map();
  for (const r of dia.reservas) {
    const inicio = aMin(r.hora);
    for (let m = inicio; m < inicio + r.duracionMin; m += paso) {
      ocupado.set(`${r.canchaId}:${m}`, { reserva: r, esInicio: m === inicio });
    }
  }

  const encabezado = `<thead><tr><th style="left:0;z-index:3">Cancha</th>${
    slots.map((m) => `<th>${m % 60 === 0 ? aHora(m) : ''}</th>`).join('')}</tr></thead>`;

  const filas = dia.canchas.map((c) => {
    const celdas = slots.map((m) => {
      const uso = ocupado.get(`${c.id}:${m}`);
      if (!uso) {
        return `<td><button class="celda" type="button" data-libre data-cancha="${esc(c.id)}" data-hora="${aHora(m)}" aria-label="Bloquear ${esc(c.nombre)} a las ${aHora(m)}"></button></td>`;
      }
      const { reserva, esInicio } = uso;
      const clase = reserva.tipo === 'bloqueo' ? 'celda celda--ocupada celda--bloqueo' : 'celda celda--ocupada';
      const titulo = `${reserva.hora}–${reserva.fin} · ${reserva.canchaNombre} · ${reserva.nombre || 'Bloqueo'}`;
      return `<td><button class="${clase}" type="button" data-codigo="${esc(reserva.codigo)}" title="${esc(titulo)}">${
        esInicio ? esc((reserva.nombre || 'Bloqueo').split(' ')[0]) : ''}</button></td>`;
    }).join('');
    return `<tr><th>${esc(c.nombre)}</th>${celdas}</tr>`;
  }).join('');

  tabla.innerHTML = `${encabezado}<tbody>${filas}</tbody>`;
}

function pintarTabla() {
  const cuerpo = $('#tabla-reservas').querySelector('tbody');
  const turnos = dia.reservas;
  if (!turnos.length) {
    cuerpo.innerHTML = '<tr><td colspan="8" style="padding:1.5rem;color:var(--tinta-3)">Todavía no hay turnos para este día.</td></tr>';
    return;
  }
  cuerpo.innerHTML = turnos.map((r) => `
    <tr>
      <td class="numeros"><b>${esc(r.hora)}</b><br><span style="color:var(--tinta-3)">${esc(r.fin)}</span></td>
      <td>${esc(r.canchaNombre)}</td>
      <td>${r.tipo === 'bloqueo' ? '<span class="pildora pildora--gris">Bloqueo</span>' : esc(r.disciplinaNombre)}</td>
      <td>${esc(r.nombre || '—')}</td>
      <td>${r.telefono ? `<a class="enlace-linea" href="tel:${esc(r.telefono)}">${esc(r.telefono)}</a>` : '—'}</td>
      <td><code>${esc(r.codigo)}</code></td>
      <td style="max-width:180px;color:var(--tinta-2)">${esc(r.notas || '')}</td>
      <td><button class="boton boton--fantasma boton--chico" data-cancelar="${esc(r.codigo)}">
        ${r.tipo === 'bloqueo' ? 'Liberar' : 'Cancelar'}</button></td>
    </tr>`).join('');
}

/* ── Bloqueos ─────────────────────────────────────────────────────────────── */
$('#nuevo-bloqueo').addEventListener('click', () => {
  $('#bloqueo-fecha').value = $('#fecha').value;
  $('#error-bloqueo').hidden = true;
  $('#modal-bloqueo').showModal();
});

$('#grilla').addEventListener('click', (e) => {
  const libre = e.target.closest('[data-libre]');
  if (libre) {
    $('#bloqueo-cancha').value = libre.dataset.cancha;
    $('#bloqueo-fecha').value = $('#fecha').value;
    $('#bloqueo-hora').value = libre.dataset.hora;
    $('#error-bloqueo').hidden = true;
    $('#modal-bloqueo').showModal();
    return;
  }
  const ocupada = e.target.closest('[data-codigo]');
  if (ocupada) abrirCancelacion(ocupada.dataset.codigo);
});

$('#formulario-bloqueo').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await pedir('/api/admin/bloqueos', {
      method: 'POST',
      headers: cabeceras(),
      body: {
        canchaId: $('#bloqueo-cancha').value,
        fecha: $('#bloqueo-fecha').value,
        hora: $('#bloqueo-hora').value,
        duracionMin: Number($('#bloqueo-duracion').value),
        motivo: $('#bloqueo-motivo').value,
      },
    });
    $('#modal-bloqueo').close();
    if ($('#bloqueo-fecha').value !== $('#fecha').value) $('#fecha').value = $('#bloqueo-fecha').value;
    cargarDia();
  } catch (err) {
    const caja = $('#error-bloqueo');
    caja.hidden = false;
    caja.querySelector('span').textContent = err.message;
  }
});

/* ── Cancelaciones ────────────────────────────────────────────────────────── */
$('#tabla-reservas').addEventListener('click', (e) => {
  const boton = e.target.closest('[data-cancelar]');
  if (boton) abrirCancelacion(boton.dataset.cancelar);
});

function abrirCancelacion(codigo) {
  const r = dia.reservas.find((x) => x.codigo === codigo);
  if (!r) return;
  codigoAcancelar = codigo;
  $('#detalle-cancelacion').textContent =
    `${r.hora}–${r.fin} · ${r.canchaNombre} · ${r.nombre || 'Bloqueo'} · ${duracionTexto(r.duracionMin)}`;
  $('#error-cancelacion').hidden = true;
  $('#modal-cancelar').showModal();
}

$('#confirmar-cancelacion').addEventListener('click', async () => {
  try {
    await pedir('/api/admin/cancelar', {
      method: 'POST', headers: cabeceras(), body: { codigo: codigoAcancelar },
    });
    $('#modal-cancelar').close();
    cargarDia();
  } catch (err) {
    const caja = $('#error-cancelacion');
    caja.hidden = false;
    caja.querySelector('span').textContent = err.message;
  }
});

document.querySelectorAll('[data-cerrar]').forEach((b) =>
  b.addEventListener('click', () => b.closest('dialog').close()));
