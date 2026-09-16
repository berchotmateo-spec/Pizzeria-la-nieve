/** Cuenta del jugador: entrar, registrarse, ver sus turnos y editar sus datos. */
import {
  pedir, iniciarPagina, traerSesion, olvidarSesion, pintarSesion,
  tarjetaTurno, esc, DIAS_CORTOS, MESES_CORTOS,
} from './comun.js';

const $ = (sel) => document.querySelector(sel);
const RECUERDO = 'naranjos:datos-jugador';

let config = null;
let turnoAcancelar = null;

const config$ = iniciarPagina().then((c) => { config = c; return c; });

arrancar();

async function arrancar() {
  const sesion = await traerSesion();
  pintarSesion(sesion);
  if (sesion.usuario) pintarPerfil(sesion);
  else precargarDatosConocidos();

  config$.then((c) => {
    const min = c?.reglas?.minClave;
    if (min) $('#ayuda-clave').textContent = `Mínimo ${min} caracteres.`;
  });
}

/* Si ya reservó desde este dispositivo, el teléfono va puesto: una cosa menos
   que escribir, tanto para entrar como para registrarse. */
function precargarDatosConocidos() {
  try {
    const guardado = JSON.parse(localStorage.getItem(RECUERDO) || '{}');
    if (guardado.telefono) {
      $('#ingreso-telefono').value = guardado.telefono;
      $('#registro-telefono').value = guardado.telefono;
    }
    if (guardado.nombre) $('#registro-nombre').value = guardado.nombre;
    if (guardado.email) $('#registro-email').value = guardado.email;
  } catch { /* almacenamiento no disponible */ }
}

/* ── Entrar ───────────────────────────────────────────────────────────────── */
$('#form-ingreso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = $('#boton-ingresar');
  ocultar('#error-ingreso');
  cargando(boton, '[data-texto-ingresar]', 'Entrando…');
  try {
    await pedir('/api/cuenta/ingreso', {
      method: 'POST',
      body: {
        telefono: $('#ingreso-telefono').value.trim(),
        clave: $('#ingreso-clave').value,
      },
    });
    volverAEmpezar();
  } catch (err) {
    mostrar('#error-ingreso', err.message);
    listo(boton, '[data-texto-ingresar]', 'Entrar');
  }
});

/* ── Crear la cuenta ──────────────────────────────────────────────────────── */
$('#form-registro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = $('#boton-registrar');
  ocultar('#error-registro');
  cargando(boton, '[data-texto-registrar]', 'Creando…');
  try {
    const { reservasAdoptadas } = await pedir('/api/cuenta/registro', {
      method: 'POST',
      body: {
        nombre: $('#registro-nombre').value.trim(),
        telefono: $('#registro-telefono').value.trim(),
        email: $('#registro-email').value.trim(),
        clave: $('#registro-clave').value,
      },
    });
    volverAEmpezar(
      reservasAdoptadas > 0
        ? `Listo. Encontramos ${reservasAdoptadas} ${reservasAdoptadas === 1 ? 'turno tuyo' : 'turnos tuyos'} y ${reservasAdoptadas === 1 ? 'quedó' : 'quedaron'} en tu cuenta.`
        : '¡Bienvenido! Desde ahora reservás sin escribir tus datos.'
    );
  } catch (err) {
    mostrar('#error-registro', err.message);
    listo(boton, '[data-texto-registrar]', 'Crear mi cuenta');
  }
});

/** Después de entrar o registrarse recargamos la sesión y pintamos el perfil. */
async function volverAEmpezar(bienvenida) {
  olvidarSesion();
  const sesion = await traerSesion({ refrescar: true });
  pintarSesion(sesion);
  pintarPerfil(sesion);
  if (bienvenida) {
    const caja = $('#aviso-bienvenida');
    caja.querySelector('span').textContent = bienvenida;
    caja.hidden = false;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── El perfil ────────────────────────────────────────────────────────────── */
function pintarPerfil({ usuario, turnos = [], historial = [] }) {
  if (!usuario) return;
  $('#perfil-nombre').value = usuario.nombre;
  $('#perfil-telefono').value = usuario.telefono;
  $('#perfil-email').value = usuario.email || '';

  const horas = config?.reglas?.horasCancelacion ?? 6;
  const proximos = turnos.filter((t) => t.estado === 'confirmada');
  $('#turnos').innerHTML = proximos.map((t) => tarjetaTurno(t, horas)).join('');
  $('#sin-turnos').hidden = proximos.length > 0;

  // En el historial sólo tiene sentido lo que ya pasó o se canceló.
  const codigosProximos = new Set(proximos.map((t) => t.codigo));
  const pasados = historial.filter((t) => !codigosProximos.has(t.codigo));
  $('#panel-historial').hidden = pasados.length === 0;
  $('#historial').innerHTML = pasados.map((t) => {
    const [a, m, d] = t.fecha.split('-').map(Number);
    const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
    return `
      <tr>
        <td>${DIAS_CORTOS[dow]} ${d} ${MESES_CORTOS[m - 1]}</td>
        <td class="numeros">${esc(t.hora)} – ${esc(t.fin)}</td>
        <td>${esc(t.canchaNombre)}</td>
        <td><code>${esc(t.codigo)}</code></td>
        <td>${t.estado === 'confirmada' ? 'Jugado' : 'Cancelado'}</td>
      </tr>`;
  }).join('');
}

$('#form-perfil').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = $('#boton-perfil');
  ocultar('#error-perfil');
  ocultar('#ok-perfil');
  cargando(boton, '[data-texto-perfil]', 'Guardando…');
  try {
    await pedir('/api/cuenta/perfil', {
      method: 'POST',
      body: {
        nombre: $('#perfil-nombre').value.trim(),
        email: $('#perfil-email').value.trim(),
      },
    });
    olvidarSesion();
    pintarSesion(await traerSesion({ refrescar: true }));
    $('#ok-perfil').hidden = false;
  } catch (err) {
    mostrar('#error-perfil', err.message);
  } finally {
    listo(boton, '[data-texto-perfil]', 'Guardar cambios');
  }
});

$('#form-clave').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = $('#boton-clave');
  ocultar('#error-clave');
  ocultar('#ok-clave');
  cargando(boton, '[data-texto-clave]', 'Cambiando…');
  try {
    await pedir('/api/cuenta/clave', {
      method: 'POST',
      body: {
        claveActual: $('#clave-actual').value,
        claveNueva: $('#clave-nueva').value,
      },
    });
    $('#form-clave').reset();
    $('#ok-clave').hidden = false;
  } catch (err) {
    mostrar('#error-clave', err.message);
  } finally {
    listo(boton, '[data-texto-clave]', 'Cambiar contraseña');
  }
});

$('#boton-salir').addEventListener('click', async () => {
  await pedir('/api/cuenta/salir', { method: 'POST' }).catch(() => {});
  olvidarSesion();
  location.href = '/';
});

/* ── Cancelar un turno desde el perfil ────────────────────────────────────── */
$('#turnos').addEventListener('click', (e) => {
  const boton = e.target.closest('[data-cancelar]');
  if (!boton) return;
  turnoAcancelar = boton.dataset.cancelar;
  $('#detalle-cancelacion').textContent =
    boton.closest('.turno').querySelector('.turno__fecha').textContent;
  $('#error-cancelacion').hidden = true;
  $('#modal-cancelar').showModal();
});

$('#confirmar-cancelacion').addEventListener('click', async () => {
  const boton = $('#confirmar-cancelacion');
  boton.disabled = true;
  boton.textContent = 'Cancelando…';
  try {
    await pedir('/api/reservas/cancelar', { method: 'POST', body: { codigo: turnoAcancelar } });
    $('#modal-cancelar').close();
    olvidarSesion();
    pintarPerfil(await traerSesion({ refrescar: true }));
  } catch (err) {
    const caja = $('#error-cancelacion');
    caja.hidden = false;
    caja.querySelector('span').textContent = err.message;
  } finally {
    boton.disabled = false;
    boton.textContent = 'Sí, cancelar';
  }
});

/* ── Ayudantes de formulario ──────────────────────────────────────────────── */
function mostrar(selector, mensaje) {
  const caja = $(selector);
  caja.hidden = false;
  caja.querySelector('span').textContent = mensaje;
}

const ocultar = (selector) => { $(selector).hidden = true; };

function cargando(boton, selectorTexto, texto) {
  boton.disabled = true;
  $(selectorTexto).innerHTML = `<span class="cargando"></span> ${esc(texto)}`;
}

function listo(boton, selectorTexto, texto) {
  boton.disabled = false;
  $(selectorTexto).textContent = texto;
}
