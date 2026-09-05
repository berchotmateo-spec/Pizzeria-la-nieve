/** Consulta y cancelación de turnos por parte del socio. */
import { pedir, iniciarPagina, esc, duracionTexto, DIAS_CORTOS, MESES_CORTOS } from './comun.js';

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

  cont.innerHTML = ordenadas.map((r) => {
    const [a, m, d] = r.fecha.split('-').map(Number);
    const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
    const cancelada = r.estado !== 'confirmada';

    const acciones = cancelada
      ? '<span class="pildora pildora--gris">Cancelada</span>'
      : r.cancelable
        ? `<button class="boton boton--fantasma boton--chico" data-cancelar="${esc(r.codigo)}">Cancelar</button>`
        : `<span class="pildora pildora--gris" title="Se cancela hasta ${horas} h antes">Fuera de plazo</span>`;

    return `
      <article class="turno" data-estado="${esc(r.estado)}">
        <div class="turno__dia">
          <span>${DIAS_CORTOS[dow]}</span>
          <b class="numeros">${d}</b>
          <span>${MESES_CORTOS[m - 1]}</span>
        </div>
        <div>
          <p class="turno__fecha">${esc(r.hora)} – ${esc(r.fin)} · ${esc(r.disciplinaNombre)}</p>
          <p class="turno__detalle">${esc(r.canchaNombre)} · ${esc(duracionTexto(r.duracionMin))} · a nombre de ${esc(r.nombre)}</p>
          <div class="turno__meta">
            <span class="pildora">Código ${esc(r.codigo)}</span>
            ${!cancelada && r.cancelable ? `<span class="pildora pildora--verde"><span class="punto"></span> Confirmado</span>` : ''}
            ${r.notas ? `<span class="pildora">${esc(r.notas)}</span>` : ''}
          </div>
        </div>
        <div class="turno__acciones">${acciones}</div>
      </article>`;
  }).join('');
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
      body: { codigo: turnoAcancelar, telefono: $('#telefono').value.trim() },
    });
    $('#modal-cancelar').close();
    buscar();
  } catch (err) {
    const caja = $('#error-cancelacion');
    caja.hidden = false;
    caja.querySelector('span').textContent = err.message;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Sí, cancelar';
  }
});
