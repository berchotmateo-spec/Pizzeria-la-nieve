/** Panel del club: grilla del día, cancelaciones y bloqueos. */
import { pedir, traerConfig, iniciarCabecera, esc, pesos, duracionTexto, pagoEnPalabras } from './comun.js';

const $ = (sel) => document.querySelector(sel);
const LLAVE = 'naranjos:clave-panel';

/* Dos maneras de entrar: con la cuenta propia de quien atiende —la buena, la
   que deja rastro— o con la clave compartida del panel, que sirve para
   arrancar y como salida de emergencia. */
let modo = 'cuenta';     // 'cuenta' | 'clave'
let clave = null;        // sólo se usa en modo 'clave'
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

  // ¿Ya hay una sesión de alguien del club abierta en este navegador?
  if (await verificar()) return entrar();

  // Si no, puede quedar la clave del panel de esta misma pestaña.
  const guardada = sessionStorage.getItem(LLAVE);
  if (guardada) {
    modo = 'clave';
    clave = guardada;
    if (await verificar()) return entrar();
    clave = null;
    modo = 'cuenta';
  }
}

/** Alterna entre entrar con la cuenta propia y entrar con la clave del panel. */
$('#cambiar-modo').addEventListener('click', () => {
  modo = modo === 'cuenta' ? 'clave' : 'cuenta';
  const conCuenta = modo === 'cuenta';
  $('[data-modo="cuenta"]').hidden = !conCuenta;
  $('[data-etiqueta-clave]').textContent = conCuenta ? 'Contraseña' : 'Clave del panel';
  $('#cambiar-modo').textContent = conCuenta
    ? 'Entrar con la clave del panel'
    : 'Entrar con mi cuenta';
  $('#error-acceso').hidden = true;
  $('#clave').value = '';
  (conCuenta ? $('#acceso-telefono') : $('#clave')).focus();
});

/* Con la cuenta propia la sesión viaja en la cookie y no hay nada que agregar;
   con la clave del panel va en la cabecera, como antes. */
const cabeceras = () => (modo === 'clave' && clave ? { authorization: `Bearer ${clave}` } : {});

async function verificar() {
  try {
    const r = await pedir('/api/admin/sesion', { method: 'POST', headers: cabeceras() });
    $('#aviso-clave').hidden = !r.avisoTokenPorDefecto;
    $('#aviso-sin-personal').hidden = !r.sinPersonal;
    avisarPagos(r.pagos);
    // Reservar para un cliente deja la firma de quien lo hizo: con la clave compartida no hay a quién.
    $('#reservar-cliente').hidden = r.conClaveMaestra;
    $('#quien-entro').hidden = false;
    $('#quien-entro').querySelector('[data-quien]').textContent = r.quien;
    return true;
  } catch {
    if (modo === 'clave') sessionStorage.removeItem(LLAVE);
    return false;
  }
}

$('#formulario-acceso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const caja = $('#error-acceso');
  caja.hidden = true;
  $('#boton-entrar').disabled = true;
  $('#boton-entrar').innerHTML = '<span class="cargando"></span>';

  let adentro = false;
  let mensaje = 'La clave no es correcta.';

  if (modo === 'cuenta') {
    try {
      await pedir('/api/cuenta/ingreso', {
        method: 'POST',
        body: { telefono: $('#acceso-telefono').value.trim(), clave: $('#clave').value },
      });
      adentro = await verificar();
      if (!adentro) mensaje = 'Esa cuenta no tiene acceso al panel del club.';
    } catch (err) {
      mensaje = err.message;
    }
  } else {
    clave = $('#clave').value;
    adentro = await verificar();
    if (adentro) sessionStorage.setItem(LLAVE, clave);
    else clave = null;
  }

  if (adentro) {
    entrar();
  } else {
    caja.hidden = false;
    caja.querySelector('span').textContent = mensaje;
  }
  $('#boton-entrar').disabled = false;
  $('#boton-entrar').textContent = 'Entrar';
});

$('#salir').addEventListener('click', async () => {
  sessionStorage.removeItem(LLAVE);
  if (modo === 'cuenta') await pedir('/api/cuenta/salir', { method: 'POST' }).catch(() => {});
  location.reload();
});

function entrar() {
  $('#pantalla-acceso').hidden = true;
  $('#pantalla-panel').hidden = false;
  $('#salir').hidden = false;
  cargarDia();
  cargarPagos();
  cargarPersonal();
  cargarMovimientos();
}

/** Avisa si los pagos online están en prueba o a medio configurar. */
function avisarPagos(pagos) {
  const caja = $('#aviso-pagos');
  let texto = '';
  if (pagos?.pasarela === 'simulado') {
    texto = '<b>Pagos en modo de prueba.</b> Los pagos online pasan por una pantalla de prueba y nadie paga ' +
      'de verdad. Sirve para mostrar el sistema; antes de abrirlo al público hay que conectar la cuenta de ' +
      'Mercado Pago del club.';
  } else if (!pagos?.pasarela && pagos?.montosCargados) {
    texto = '<b>Los pagos online están apagados.</b> Hay montos cargados, pero falta conectar Mercado Pago: ' +
      'mientras tanto, los turnos se reservan sin seña.';
  } else if (pagos?.pasarela === 'mercadopago' && !pagos.activos) {
    texto = '<b>Mercado Pago está conectado, pero no hay montos.</b> Falta cargar la seña o el precio del ' +
      'turno: mientras tanto, los turnos se reservan sin seña.';
  }
  caja.hidden = !texto;
  caja.querySelector('[data-texto-aviso-pagos]').innerHTML = texto;
}

/* ── Pagos para revisar ───────────────────────────────────────────────────── */
async function cargarPagos() {
  const seccion = $('#seccion-pagos');
  const cuerpo = $('#tabla-pagos').querySelector('tbody');
  try {
    const { aRevisar } = await pedir('/api/admin/pagos', { headers: cabeceras() });
    seccion.hidden = aRevisar.length === 0;
    cuerpo.innerHTML = aRevisar.map((p) => `
      <tr>
        <td class="numeros"><b>${esc(p.reserva.fechaLarga)}</b><br>
          <span style="color:var(--tinta-3)">${esc(p.reserva.hora)} · ${esc(p.reserva.canchaNombre)} · <code>${esc(p.reserva.codigo)}</code></span></td>
        <td>${esc(p.reserva.nombre || '—')}${p.reserva.telefono
          ? `<br><a class="enlace-linea" href="tel:${esc(p.reserva.telefono)}">${esc(p.reserva.telefono)}</a>` : ''}</td>
        <td class="numeros"><b>${esc(pesos(p.monto))}</b></td>
        <td style="max-width:240px;color:var(--tinta-2)">${esc(p.motivo || '')}</td>
        <td style="white-space:nowrap">
          <button class="boton boton--chico" data-devolver="${p.id}" data-monto="${esc(pesos(p.monto))}">Devolver</button>
          <button class="boton boton--fantasma boton--chico" data-resolver="${p.id}">Ya lo resolví</button>
        </td>
      </tr>`).join('');
  } catch (err) {
    seccion.hidden = false;
    cuerpo.innerHTML = `<tr><td colspan="5" style="padding:1.2rem">${esc(err.message)}</td></tr>`;
  }
}

$('#tabla-pagos').addEventListener('click', async (e) => {
  const devolver = e.target.closest('[data-devolver]');
  const resolver = e.target.closest('[data-resolver]');
  const boton = devolver || resolver;
  if (!boton) return;
  const pregunta = devolver
    ? `¿Devolver ${devolver.dataset.monto} por Mercado Pago?\n\nLa plata vuelve al medio con el que pagó. No se puede deshacer.`
    : '¿Marcar este pago como resuelto sin devolverlo?\n\nUsalo si lo arreglaste de otra forma: lo pasaste a otro turno, lo devolviste en efectivo…';
  if (!confirm(pregunta)) return;
  boton.disabled = true;
  try {
    await pedir(devolver ? '/api/admin/pagos/devolver' : '/api/admin/pagos/resolver', {
      method: 'POST', headers: cabeceras(), body: { id: Number(boton.dataset.devolver || boton.dataset.resolver) },
    });
    cargarPagos();
    cargarMovimientos();
  } catch (err) {
    alert(err.message);
    boton.disabled = false;
  }
});

/* ── Personal del club ────────────────────────────────────────────────────── */
async function cargarPersonal() {
  const cuerpo = $('#tabla-personal').querySelector('tbody');
  try {
    const { personal } = await pedir('/api/admin/personal', { headers: cabeceras() });
    $('#cuenta-personal').textContent =
      personal.length === 1 ? '1 persona' : `${personal.length} personas`;

    cuerpo.innerHTML = personal.length
      ? personal.map((u) => `
          <tr>
            <td>${esc(u.nombre)}${u.esVos ? ' <span class="pildora pildora--verde">vos</span>' : ''}</td>
            <td class="numeros">${esc(u.telefono)}</td>
            <td>${u.ultimoAcceso ? esc(fechaCorta(u.ultimoAcceso)) : '—'}</td>
            <td>${u.esVos ? '' : `<button class="boton boton--fantasma boton--chico" data-baja="${u.id}">Sacar acceso</button>`}</td>
          </tr>`).join('')
      : '<tr><td colspan="4" class="plomo" style="padding:1.2rem">Todavía no cargaste a nadie.</td></tr>';
  } catch (err) {
    cuerpo.innerHTML = `<tr><td colspan="4" style="padding:1.2rem">${esc(err.message)}</td></tr>`;
  }
}

const fechaCorta = (iso) =>
  new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

$('#formulario-personal').addEventListener('submit', async (e) => {
  e.preventDefault();
  const boton = $('#boton-personal');
  $('#error-personal').hidden = true;
  $('#ok-personal').hidden = true;
  boton.disabled = true;
  $('[data-texto-personal]').innerHTML = '<span class="cargando"></span> Dando acceso…';
  try {
    const r = await pedir('/api/admin/personal', {
      method: 'POST',
      headers: cabeceras(),
      body: {
        nombre: $('#personal-nombre').value.trim(),
        telefono: $('#personal-telefono').value.trim(),
        clave: $('#personal-clave').value,
      },
    });
    $('#formulario-personal').reset();
    $('#ok-personal').hidden = false;
    $('#ok-personal').querySelector('span').textContent =
      r.aviso || `${r.usuario.nombre} ya puede entrar al panel con su teléfono y su contraseña.`;
    cargarPersonal();
    cargarMovimientos();
  } catch (err) {
    $('#error-personal').hidden = false;
    $('#error-personal').querySelector('span').textContent = err.message;
  } finally {
    boton.disabled = false;
    $('[data-texto-personal]').textContent = 'Dar acceso';
  }
});

$('#tabla-personal').addEventListener('click', async (e) => {
  const boton = e.target.closest('[data-baja]');
  if (!boton) return;
  const fila = boton.closest('tr');
  const nombre = fila.querySelector('td').textContent.trim();
  if (!confirm(`¿Sacarle el acceso al panel a ${nombre}?\n\nSu cuenta de jugador y sus turnos quedan como están.`)) return;
  boton.disabled = true;
  try {
    await pedir('/api/admin/personal/baja', {
      method: 'POST', headers: cabeceras(), body: { id: Number(boton.dataset.baja) },
    });
    cargarPersonal();
    cargarMovimientos();
  } catch (err) {
    alert(err.message);
    boton.disabled = false;
  }
});

/* ── Bitácora ─────────────────────────────────────────────────────────────── */
async function cargarMovimientos() {
  const cuerpo = $('#tabla-movimientos').querySelector('tbody');
  try {
    const { movimientos } = await pedir('/api/admin/movimientos?limite=25', { headers: cabeceras() });
    cuerpo.innerHTML = movimientos.length
      ? movimientos.map((m) => `
          <tr>
            <td class="numeros">${esc(fechaCorta(m.cuando))}</td>
            <td>${esc(m.quien)}</td>
            <td>${esc(m.accion)}</td>
            <td class="plomo">${esc(m.detalle || '—')}</td>
          </tr>`).join('')
      : '<tr><td colspan="4" class="plomo" style="padding:1.2rem">Todavía no hay movimientos.</td></tr>';
  } catch (err) {
    cuerpo.innerHTML = `<tr><td colspan="4" style="padding:1.2rem">${esc(err.message)}</td></tr>`;
  }
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

  const r = dia.resumen;
  $('#resumen').innerHTML = `
    <div class="tarjeta-resumen"><b class="numeros">${r.turnos}</b><span>Turnos reservados</span></div>
    <div class="tarjeta-resumen"><b class="numeros">${r.horasVendidas}</b><span>Horas de cancha</span></div>
    <div class="tarjeta-resumen"><b class="numeros">${ocupacion}%</b><span>Ocupación del día</span></div>
    ${r.cobradoOnline || r.esperandoPago
      ? `<div class="tarjeta-resumen"><b class="numeros">${esc(pesos(r.cobradoOnline || 0))}</b><span>Cobrado online${
          r.esperandoPago ? ` · ${r.esperandoPago} esperando pago` : ''}</span></div>`
      : ''}
    <div class="tarjeta-resumen"><b class="numeros">${r.bloqueos}</b><span>Bloqueos activos</span></div>`;
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
      const clase = reserva.tipo === 'bloqueo' ? 'celda celda--ocupada celda--bloqueo'
        : reserva.estado === 'pendiente' ? 'celda celda--ocupada celda--pendiente'
        : 'celda celda--ocupada';
      const pago = pagoEnPalabras(reserva);
      const titulo = `${reserva.hora}–${reserva.fin} · ${reserva.canchaNombre} · ${reserva.nombre || 'Bloqueo'}${pago ? ` · ${pago.texto}` : ''}`;
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
    cuerpo.innerHTML = '<tr><td colspan="9" style="padding:1.5rem;color:var(--tinta-3)">Todavía no hay turnos para este día.</td></tr>';
    return;
  }
  cuerpo.innerHTML = turnos.map((r) => `
    <tr>
      <td class="numeros"><b>${esc(r.hora)}</b><br><span style="color:var(--tinta-3)">${esc(r.fin)}</span></td>
      <td>${esc(r.canchaNombre)}</td>
      <td>${r.tipo === 'bloqueo' ? '<span class="pildora pildora--gris">Bloqueo</span>' : esc(r.disciplinaNombre)}</td>
      <td>${esc(r.nombre || '—')}</td>
      <td>${r.telefono ? `<a class="enlace-linea" href="tel:${esc(r.telefono)}">${esc(r.telefono)}</a>` : '—'}</td>
      <td>${pildoraDePago(r)}</td>
      <td><code>${esc(r.codigo)}</code></td>
      <td style="max-width:180px;color:var(--tinta-2)">${esc(r.notas || '')}</td>
      <td><button class="boton boton--fantasma boton--chico" data-cancelar="${esc(r.codigo)}">
        ${r.tipo === 'bloqueo' ? 'Liberar' : 'Cancelar'}</button></td>
    </tr>`).join('');
}

function pildoraDePago(r) {
  const pago = pagoEnPalabras(r);
  return pago ? `<span class="pildora pildora--${pago.tono}" style="white-space:nowrap">${esc(pago.texto)}</span>` : '—';
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
    cargarMovimientos();
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
  // Si hay plata de por medio, que se sepa antes de tocar el botón.
  const aviso = $('#modal-cancelar').querySelector('[data-aviso-pago]');
  aviso.hidden = !(r.pagado > 0 || r.estado === 'pendiente');
  aviso.textContent = r.pagado > 0
    ? `Este turno tiene ${pesos(r.pagado)} pagados por Mercado Pago. Al cancelarlo, el pago queda en "Pagos para revisar" para devolverlo.`
    : 'Este turno está esperando el pago: si lo cancelás y la persona paga igual, el pago queda en "Pagos para revisar".';
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
    cargarPagos();
    cargarMovimientos();
  } catch (err) {
    const caja = $('#error-cancelacion');
    caja.hidden = false;
    caja.querySelector('span').textContent = err.message;
  }
});

document.querySelectorAll('[data-cerrar]').forEach((b) =>
  b.addEventListener('click', () => b.closest('dialog').close()));
