/**
 * Pantalla de pago de prueba: hace de Mercado Pago cuando el servidor corre
 * con PAGOS_SIMULADOS=si. Aprobar o rechazar recorre el mismo camino que un
 * pago de verdad, y a la vuelta el sitio se entera igual que con Mercado Pago.
 */
import { pedir, pesos } from './comun.js';

const $ = (sel) => document.querySelector(sel);
let ref = null;

const hora = (iso) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

function mostrarError(mensaje) {
  const caja = $('[data-prueba-error]');
  caja.hidden = !mensaje;
  caja.querySelector('span').textContent = mensaje || '';
}

async function cargarPagoSimulado(nuevaRef) {
  ref = nuevaRef;
  const caja = $('#pago-prueba');
  caja.dataset.estado = 'cargando';
  mostrarError('');
  try {
    const d = await pedir(`/api/pagos/simulado?ref=${encodeURIComponent(ref)}`);
    $('[data-prueba="que"]').textContent = d.cobro === 'seña' ? 'Seña del turno' : 'Turno completo';
    $('[data-prueba="monto"]').textContent = pesos(d.monto);
    $('[data-prueba="titulo"]').textContent = d.titulo;
    $('[data-prueba="vence"]').textContent = d.vigente
      ? `Se puede pagar hasta las ${hora(d.venceEn)}.`
      : 'Este link de pago venció.';
    $('#volver-sin-pagar').href = d.volver;
    $('#aprobar-prueba').disabled = !d.vigente;
    $('#rechazar-prueba').disabled = !d.vigente;
    caja.dataset.estado = 'listo';
  } catch (err) {
    caja.dataset.estado = 'error';
    $('[data-prueba="monto"]').textContent = '—';
    mostrarError(err.message);
  }
}

async function pagar(resultado, boton) {
  const original = boton.textContent;
  $('#aprobar-prueba').disabled = true;
  $('#rechazar-prueba').disabled = true;
  boton.innerHTML = '<span class="cargando"></span>';
  mostrarError('');
  try {
    const { volver } = await pedir('/api/pagos/simulado', { method: 'POST', body: { ref, resultado } });
    volverAlSitio(volver);
  } catch (err) {
    mostrarError(err.message);
    $('#aprobar-prueba').disabled = false;
    $('#rechazar-prueba').disabled = false;
  } finally {
    boton.textContent = original;
  }
}

/** Vuelve al sitio como lo haría Mercado Pago. La vista previa la reemplaza. */
function volverAlSitio(url) {
  location.assign(url);
}

$('#aprobar-prueba').addEventListener('click', (e) => pagar('aprobado', e.currentTarget));
$('#rechazar-prueba').addEventListener('click', (e) => pagar('rechazado', e.currentTarget));

const inicial = new URLSearchParams(location.search).get('ref');
if (inicial) cargarPagoSimulado(inicial);
else {
  $('#pago-prueba').dataset.estado = 'error';
  mostrarError('Falta el pago a mostrar.');
}

// En la vista previa se llega acá sin recargar la página.
document.addEventListener('naranjos:pago-simulado', (e) => cargarPagoSimulado(e.detail.ref));
