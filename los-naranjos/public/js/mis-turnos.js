/** Consulta y cancelación de turnos por parte del socio. */
import { pedir, iniciarPagina, traerSesion, tarjetaTurno } from './comun.js';

const $ = (sel) => document.querySelector(sel);
const RECUERDO = 'naranjos:datos-jugador';

let config = null;
let turnoAcancelar = null;

const config$ = iniciarPagina().then((c) => { config = c; return c; });

/* Si ya reservó antes desde este dispositivo, precargamos el teléfono. */
try {
  const guardado = JSON.parse(localStorage.getItem(RECUERDO) || '{}');
  if (guardado.telefono) $('#telefono').value = guardado.telefono;
} catch { /* almacenamiento no disponible */ }

/* Permite entrar directo con ?codigo=LN-XXXXX desde un enlace o mail. */
const params = new URLSearchParams(location.search);
if (params.get('codigo')) $('#codigo').value = params.get('codigo').toUpperCase();
if ($('#telefono').value && ($('#codigo').value || params.get('buscar'))) buscar();

$('#buscador').addEventListener('submit', (e) => { e.preventDefault(); buscar(); });

/* Con la cuenta abierta no hay nada que buscar: los turnos son los suyos. */
traerSesion().then(async ({ usuario }) => {
  if (!usuario) return;
  $('#buscador').hidden = true;
  $('#aviso-sesion').hidden = false;
  await config$;
  $('#turnos').innerHTML = '<div class="esqueleto" style="height:86px"></div>';
  try {
    const { reservas } = await pedir('/api/reservas');
    pintar(reservas);
  } catch (err) {
    mostrarError(err.message);
  }
});

async function buscar() {
  const telefono = $('#telefono').value.trim();
  const codigo = $('#codigo').value.trim().toUpperCase();

  if (telefono.replace(/\D/g, '').length < 8) {
    mostrarError('Escribí el teléfono con el que hiciste la reserva.');
    return;
  }

  await config$;
  $('#error-busqueda').hidden = true;
  $('#sin-resultados').hidden = true;
  $('#boton-buscar').disabled = true;
  $('[data-texto-buscar]').innerHTML = '<span class="cargando"></span>';
  $('#turnos').innerHTML = `${'<div class="esqueleto" style="height:86px"></div>'.repeat(2)}`;

  const consulta = new URLSearchParams({ telefono });
  if (codigo) consulta.set('codigo', codigo);

  try {
    const { reservas } = await pedir(`/api/reservas?${consulta}`);
    pintar(reservas);
  } catch (err) {
    $('#turnos').innerHTML = '';
    if (err.status === 404 || err.status === 403) $('#sin-resultados').hidden = false;
    else mostrarError(err.message);
  } finally {
    $('#boton-buscar').disabled = false;
    $('[data-texto-buscar]').textContent = 'Buscar';
  }
}

function mostrarError(mensaje) {
  const caja = $('#error-busqueda');
  caja.hidden = false;
  caja.querySelector('[data-texto-error]').textContent = mensaje;
}

function pintar(reservas) {
  const cont = $('#turnos');
  const activas = reservas.filter((r) => r.estado === 'confirmada');
  const canceladas = reservas.filter((r) => r.estado !== 'confirmada');
  const ordenadas = [...activas, ...canceladas];

  if (!ordenadas.length) {
    cont.innerHTML = '';
    $('#sin-resultados').hidden = false;
    return;
  }

  const horas = config?.reglas?.horasCancelacion ?? 6;
  cont.innerHTML = ordenadas.map((r) => tarjetaTurno(r, horas)).join('');
}

/* ── Cancelación ──────────────────────────────────────────────────────────── */
$('#turnos').addEventListener('click', (e) => {
  const boton = e.target.closest('[data-cancelar]');
  if (!boton) return;
  turnoAcancelar = boton.dataset.cancelar;
  const turno = boton.closest('.turno');
  $('#detalle-cancelacion').textContent = turno.querySelector('.turno__fecha').textContent;
  $('#error-cancelacion').hidden = true;
  $('#modal-cancelar').showModal();
});

$('#confirmar-cancelacion').addEventListener('click', async () => {
  const boton = $('#confirmar-cancelacion');
  boton.disabled = true;
  boton.textContent = 'Cancelando…';
  try {
    await pedir('/api/reservas/cancelar', {
      method: 'POST',
      body: { codigo: turnoAcancelar, telefono: $('#telefono').value.trim() || undefined },
    });
    $('#modal-cancelar').close();
    if ($('#buscador').hidden) location.reload(); else buscar();
  } catch (err) {
    const caja = $('#error-cancelacion');
    caja.hidden = false;
    caja.querySelector('span').textContent = err.message;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Sí, cancelar';
  }
});
