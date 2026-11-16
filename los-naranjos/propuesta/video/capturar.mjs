/**
 * Saca las capturas que usa el video, del sistema de verdad.
 *
 *   node propuesta/video/capturar.mjs
 *
 * Recorre la vista previa (vista-previa/index.html) como lo haría una persona:
 * reserva un turno desde el celular pagando la seña, y después entra al panel
 * del club. Guarda cada pantalla en .cache/capturas/ junto con dónde quedó
 * cada botón (datos.json), para que el video sepa dónde "tocar".
 *
 * No hay nada dibujado a mano: lo que se ve en el video es el sistema.
 */
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { abrirNavegador, RAIZ, CAPTURAS } from './comun.mjs';

const VISTA_PREVIA = 'file://' + RAIZ + 'vista-previa/index.html';
const CELULAR = { ancho: 390, alto: 780, escala: 3 };

/* El reloj del navegador queda clavado en un día de semana a la mañana: así
   las capturas salen iguales se armen el día que se armen, y la portada
   muestra turnos libres para hoy en vez de un "ya no quedan" de domingo a la
   noche. El día se puede cambiar con DIA=2026-11-24. */
const AHORA = new Date(`${process.env.DIA || '2026-11-23'}T10:00:00-03:00`);

/* Para la captura: sin la cinta de "vista previa" ni el aviso de pagos de
   prueba (el video ya aclara que son datos de demostración), sin animaciones
   a medio camino y con todo lo que aparece al hacer scroll ya a la vista. */
const CSS_CAPTURA = `
  .cinta-demo, #aviso-pagos { display: none !important; }
  *, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }
  [data-revelar] { opacity: 1 !important; transform: none !important; }
  html { scroll-behavior: auto !important; }
`;
const ponerEstilos = (css) => `
  document.addEventListener('DOMContentLoaded', () => {
    const estilo = document.createElement('style');
    estilo.textContent = ${JSON.stringify(css)};
    document.head.appendChild(estilo);
  });`;

rmSync(CAPTURAS, { recursive: true, force: true });
mkdirSync(CAPTURAS, { recursive: true });
const datos = { celular: CELULAR, pantallas: {}, panel: {} };

const caja = (r) => r && ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });

/** Dónde está un elemento dentro de la página entera (no de la ventana). */
async function rect(pagina, selector) {
  const loc = typeof selector === 'string' ? pagina.locator(selector).first() : selector;
  const r = await loc.boundingBox();
  if (!r) throw new Error('No encontré ' + selector);
  const scroll = await pagina.evaluate(() => window.scrollY);
  return caja({ ...r, y: r.y + scroll });
}

async function abrir(opciones) {
  const { navegador, contexto } = await abrirNavegador({
    locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', ...opciones,
  });
  await contexto.addInitScript(ponerEstilos(CSS_CAPTURA));
  const pagina = await contexto.newPage();
  pagina.on('pageerror', (e) => { console.error('Error en la página:', e.message); process.exitCode = 1; });
  await pagina.clock.install({ time: AHORA });
  await pagina.goto(VISTA_PREVIA);
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.waitForTimeout(400);
  return { navegador, pagina };
}

/* ═══════════════════════════════════════════════════════════════════════════
   El jugador, desde el celular
   ═══════════════════════════════════════════════════════════════════════════ */
{
  const { navegador, pagina: p } = await abrir({
    viewport: { width: CELULAR.ancho, height: CELULAR.alto },
    deviceScaleFactor: CELULAR.escala,
    isMobile: true,
    hasTouch: true,
  });

  /**
   * Guarda una pantalla entera del celular, sin la barra fija ni el botón de
   * WhatsApp —en el video van aparte, quietos, con la página moviéndose por
   * debajo—, y anota dónde quedaron los elementos que interesan.
   */
  async function pantalla(nombre, vista, marcas = {}) {
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(120);
    const alto = await p.evaluate((sel) => {
      const v = document.querySelector(sel);
      return Math.ceil(v.getBoundingClientRect().bottom + window.scrollY);
    }, vista);
    const rects = {};
    for (const [clave, selector] of Object.entries(marcas)) rects[clave] = await rect(p, selector);
    const fijos = (v) => p.evaluate((valor) => {
      document.querySelector('.cabecera').style.visibility = valor;
      document.querySelector('.wsp-flotante').style.visibility = valor;
    }, v);
    await fijos('hidden');
    await p.screenshot({ path: `${CAPTURAS}cel-${nombre}.png`, fullPage: true, clip: { x: 0, y: 0, width: CELULAR.ancho, height: alto } });
    await fijos('');
    datos.pantallas[nombre] = { archivo: `cel-${nombre}.png`, alto, marcas: rects };
    console.log(`· ${nombre}: ${alto}px`);
  }

  // 1 · La portada.
  await p.locator('.portada [data-en-vivo], .portada').first().waitFor();
  await p.waitForTimeout(500);
  await pantalla('portada', '.portada', { reservar: '#vista-inicio a.boton[href^="/reservar"]' });

  // 2 · Reservar: se elige el día.
  await p.locator('#vista-inicio a.boton[href^="/reservar"]').first().click();
  await p.locator('#vista-reservar').waitFor({ state: 'visible' });
  await p.locator('#tira-dias label').first().waitFor();

  /* El día y la hora se eligen mirando la disponibilidad real de la demo: una
     noche con pocas canchas libres muestra mejor para qué sirve la grilla. Se
     busca entre los días que entran en la pantalla sin deslizar la tira. */
  const eleccion = await p.evaluate(async () => {
    const config = await fetch('/api/config').then((r) => r.json());
    let mejor = null;
    for (const dia of config.calendario.slice(1, 5)) {
      if (dia.cerrado) continue;
      const d = await fetch(`/api/disponibilidad?fecha=${dia.fecha}&disciplina=padel&duracion=90`).then((r) => r.json());
      const libres = d.horarios.filter((x) => x.cantidad > 0).length;
      for (const h of d.horarios.filter((x) => x.inicioMin >= 19 * 60 && x.inicioMin <= 21 * 60)) {
        const puntaje = (h.cantidad === 2 ? 10 : h.cantidad === 1 || h.cantidad === 3 ? 6 : 0) +
          (h.hora === '20:00' ? 4 : h.hora === '19:30' || h.hora === '20:30' ? 2 : 0) +
          (libres > 12 ? 2 : 0);
        if (!mejor || puntaje > mejor.puntaje) mejor = { puntaje, fecha: dia.fecha, hora: h.hora, libres: h.cantidad };
      }
    }
    return mejor;
  });
  console.log('  turno elegido:', eleccion);
  datos.turno = eleccion;

  const dia = p.locator(`#tira-dias label:has(input[value="${eleccion.fecha}"])`);
  await pantalla('reservar-1', '#vista-reservar', { dia, bloqueDia: '[data-bloque="fecha"]' });

  // 3 · Aparecen los horarios.
  await dia.click();
  await p.locator('#grilla-horarios .hora').first().waitFor();
  await p.waitForTimeout(250);
  const hora = p.locator(`#grilla-horarios label:has(input[value="${eleccion.hora}"])`);
  await pantalla('reservar-2', '#vista-reservar', { dia, hora, bloqueHora: '[data-bloque="hora"]', grilla: '#grilla-horarios' });

  // 4 · Elige la hora.
  await hora.click();
  await p.waitForTimeout(250);
  await pantalla('reservar-3', '#vista-reservar', { hora, bloqueHora: '[data-bloque="hora"]', bloqueDatos: '[data-bloque="datos"]' });

  // 5 · Sus datos, y cómo paga.
  await p.fill('#nombre', 'Lucía Fernández');
  await p.fill('#telefono', '223 555-0142');
  await p.fill('#email', 'lucia@ejemplo.com');
  await p.locator('#email').blur();
  await p.locator('[data-bloque="pago"]').waitFor({ state: 'visible' });
  const seña = p.locator('#opciones-pago label:has(input[value="seña"])');
  await pantalla('reservar-4', '#vista-reservar', {
    bloqueDatos: '[data-bloque="datos"]', bloquePago: '[data-bloque="pago"]', seña,
    total: '#opciones-pago label:has(input[value="total"])', resumen: '.resumen', boton: '#boton-confirmar',
  });

  // 6 · Elige pagar la seña.
  await seña.click();
  await p.waitForTimeout(200);
  await pantalla('reservar-5', '#vista-reservar', {
    bloquePago: '[data-bloque="pago"]', seña, resumen: '.resumen', boton: '#boton-confirmar',
  });

  // 7 · Paga (en la demo, con la pantalla de pago de prueba) y recibe su turno.
  await p.locator('#boton-confirmar').click();
  await p.locator('#pago-prueba[data-estado="listo"]').waitFor();
  await p.locator('#aprobar-prueba').click();
  await p.locator('#confirmacion').waitFor({ state: 'visible' });
  await p.waitForTimeout(300);
  await pantalla('turno', '#vista-reservar', {
    confirmacion: '#confirmacion', tilde: '.confirmacion__tilde', ticket: '.ticket', filaPago: '[data-fila-pago]',
  });
  datos.codigo = (await p.locator('[data-ticket="codigo"]').textContent()).trim();
  datos.pago = (await p.locator('[data-ticket="pago"]').textContent()).trim();
  console.log('  ticket:', datos.codigo, '·', datos.pago);

  // La barra de arriba y el botón de WhatsApp, sueltos y con fondo transparente.
  // El fondo crema es del <body>, no de la página: sin sacarlo, la barra saldría sobre crema.
  await p.addStyleTag({ content: `
    html, body { background: transparent !important; }
    .cabecera { background: transparent !important; backdrop-filter: none !important; border-color: transparent !important; }
    body > *:not(.cabecera):not(.wsp-flotante) { visibility: hidden !important; }` });
  await p.locator('.cabecera').screenshot({ path: CAPTURAS + 'cel-cabecera.png', omitBackground: true });
  datos.cabecera = { alto: Math.round((await p.locator('.cabecera').boundingBox()).height) };
  const wsp = await p.locator('.wsp-flotante').boundingBox();
  await p.addStyleTag({ content: '.cabecera { visibility: hidden !important; }' });
  const margen = 30;
  await p.screenshot({
    path: CAPTURAS + 'cel-wsp.png', omitBackground: true,
    clip: { x: wsp.x - margen, y: wsp.y - margen, width: wsp.width + margen * 2, height: wsp.height + margen * 2 },
  });
  datos.wsp = { ...caja(wsp), margen };

  await navegador.close();
}

/* ═══════════════════════════════════════════════════════════════════════════
   El club, desde el panel
   Antes de capturar se usa el panel como en un día cualquiera —alguien bloquea
   una cancha, alguien carga un turno pedido por WhatsApp, alguien cancela—,
   para que el registro de movimientos tenga qué mostrar.
   ═══════════════════════════════════════════════════════════════════════════ */
{
  const { navegador, pagina: p } = await abrir({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  p.on('dialog', (d) => d.accept());
  const pasan = (minutos) => p.clock.fastForward(minutos * 60_000);

  const irAlPanel = async () => {
    await p.evaluate(() => document.querySelector('a[href="/admin"]').click());
    await p.locator('#vista-admin').waitFor({ state: 'visible' });
  };
  const entrarConCuenta = async (telefono, clave) => {
    await irAlPanel();
    await p.fill('#acceso-telefono', telefono);
    await p.fill('#clave', clave);
    await p.click('#boton-entrar');
    await p.locator('#pantalla-panel').waitFor({ state: 'visible' });
    await p.locator('#tabla-reservas tbody tr').first().waitFor();
  };
  const salir = async () => {
    await Promise.all([p.waitForEvent('load'), p.click('#salir')]);
    await p.evaluate(() => document.fonts.ready);
  };

  // Con la clave del panel se carga a la segunda persona del club.
  await p.clock.setSystemTime(new Date(AHORA.getTime() - 22 * 60_000));
  await irAlPanel();
  await p.click('#cambiar-modo');
  await p.fill('#clave', 'demo1234');
  await p.click('#boton-entrar');
  await p.locator('#pantalla-panel').waitFor({ state: 'visible' });
  await pasan(2);
  await p.fill('#personal-nombre', 'Nico Mostrador');
  await p.fill('#personal-telefono', '223 555-3434');
  await p.fill('#personal-clave', 'mostrador-2026');
  await p.click('#boton-personal');
  await p.locator('#ok-personal').waitFor({ state: 'visible' });
  await salir();

  // Nico bloquea una cancha libre a la tarde, para una clase.
  await pasan(6);
  await entrarConCuenta('223 555-3434', 'mostrador-2026');
  await pasan(4);
  const libre = await p.evaluate(() => {
    const paso = 30;
    const aMin = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
    const celdas = [...document.querySelectorAll('#grilla [data-libre]')];
    const libres = new Set(celdas.map((c) => c.dataset.cancha + '@' + aMin(c.dataset.hora)));
    // Una hora entera libre entre las 15 y las 18.
    const c = celdas.find((x) => {
      const m = aMin(x.dataset.hora);
      return m >= 15 * 60 && m <= 17 * 60 && libres.has(x.dataset.cancha + '@' + (m + paso));
    });
    return c && { cancha: c.dataset.cancha, hora: c.dataset.hora };
  });
  await p.locator(`#grilla [data-libre][data-cancha="${libre.cancha}"][data-hora="${libre.hora}"]`).click();
  await p.selectOption('#bloqueo-duracion', '60');
  await p.fill('#bloqueo-motivo', 'Clase de la escuela');
  await p.locator('#formulario-bloqueo button[type="submit"]').click();
  await p.locator('#modal-bloqueo').waitFor({ state: 'hidden' });
  await salir();

  // Vale carga un turno que le pidieron por WhatsApp…
  await pasan(9);
  await entrarConCuenta('223 555-1212', 'demo1234');
  await pasan(5);
  await p.click('#reservar-cliente');
  await p.locator('#vista-reservar').waitFor({ state: 'visible' });
  await p.locator('#reservando-para').waitFor({ state: 'visible' });
  await p.locator('#tira-dias label:not(:has(input:disabled))').nth(1).click();
  await p.locator('#grilla-horarios .hora').first().waitFor();
  // A la noche, que es cuando más se pide: la primera hora libre de esta lista.
  let elegida = p.locator('#grilla-horarios label.hora').last();
  for (const h of ['21:00', '20:30', '21:30', '20:00', '19:30', '19:00']) {
    const opcion = p.locator(`#grilla-horarios label:has(input[value="${h}"])`);
    if (await opcion.count()) { elegida = opcion; break; }
  }
  await elegida.click();
  await p.fill('#nombre', 'Carlos Méndez');
  await p.fill('#telefono', '223 444-1000');
  await p.locator('#telefono').blur();
  await p.click('#boton-confirmar');
  await p.locator('#confirmacion').waitFor({ state: 'visible' });

  // …y cancela uno de esta noche, que tenía la seña pagada.
  await pasan(7);
  await irAlPanel();
  await p.evaluate(() => { document.querySelector('#ir-hoy').click(); });
  await p.waitForTimeout(400);
  const fila = p.locator('#tabla-reservas tbody tr', { hasText: 'Seña pagada' }).filter({ hasText: /^\s*(19|20):/ }).first();
  await fila.locator('[data-cancelar]').click();
  await p.locator('#adm-confirmar').click();
  await p.locator('#adm-modal').waitFor({ state: 'hidden' });
  await p.waitForTimeout(500);
  await pasan(3);

  /* ── Capturas ─────────────────────────────────────────────────────────── */
  const pieza = async (nombre, selector, extra = {}) => {
    const loc = p.locator(selector).first();
    await loc.scrollIntoViewIfNeeded();
    await p.waitForTimeout(150);
    await loc.screenshot({ path: `${CAPTURAS}panel-${nombre}.png`, ...extra });
    const r = await loc.boundingBox();
    datos.panel[nombre] = { archivo: `panel-${nombre}.png`, ancho: Math.round(r.width), alto: Math.round(r.height) };
    console.log(`· panel ${nombre}: ${Math.round(r.width)}×${Math.round(r.height)}`);
    return r;
  };

  // La parte de arriba del panel, como se ve en una computadora.
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: CAPTURAS + 'panel-arriba.png' });
  datos.panel.arriba = { archivo: 'panel-arriba.png', ancho: 1280, alto: 900 };

  // De acá en más se capturan piezas sueltas: lo que queda fijo en pantalla estorba.
  await p.addStyleTag({ content: '.cabecera, .wsp-flotante { display: none !important; }' });

  // La grilla entera, sin la barra de desplazamiento: en el video se recorre de punta a punta.
  await p.setViewportSize({ width: 2400, height: 1200 });
  await p.addStyleTag({ content: '.grilla-envoltorio { overflow: visible !important; width: max-content !important; }' });
  const g = await pieza('grilla', '.grilla-envoltorio');
  datos.panel.grilla.columnaCanchas = Math.round((await p.locator('#grilla tbody th').first().boundingBox()).width);
  datos.panel.grilla.encabezado = Math.round((await p.locator('#grilla thead').boundingBox()).height);
  datos.panel.grilla.horas = await p.evaluate((x0) => [...document.querySelectorAll('#grilla thead th')]
    .filter((th) => th.textContent.trim())
    .map((th) => ({ hora: th.textContent.trim(), x: Math.round(th.getBoundingClientRect().left - x0) })), g.x);

  // Las tarjetas del resumen, de a dos por fila, como se ven en un celular.
  await p.setViewportSize({ width: 430, height: 900 });
  const r = await pieza('resumen', '#resumen');
  datos.panel.resumen.tarjetas = await p.evaluate(([x0, y0]) => [...document.querySelectorAll('#resumen .tarjeta-resumen')]
    .map((el) => {
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.left - x0), y: Math.round(b.top - y0), w: Math.round(b.width), h: Math.round(b.height), titulo: el.querySelector('span').textContent.trim(), valor: el.querySelector('b').textContent.trim() };
    }), [r.x, r.y]);
  datos.panel.resumen.radio = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.tarjeta-resumen')).borderRadius));

  // La tabla de turnos del día y el registro de movimientos.
  await p.setViewportSize({ width: 1180, height: 1000 });
  await p.addStyleTag({ content: '.tabla-envoltorio { overflow: visible !important; }' });
  const t = await pieza('turnos', '#tabla-reservas');
  datos.panel.turnos.columnas = await p.evaluate((x0) => [...document.querySelectorAll('#tabla-reservas thead th')]
    .map((th) => ({ titulo: th.textContent.trim(), x: Math.round(th.getBoundingClientRect().left - x0), w: Math.round(th.getBoundingClientRect().width) })), t.x);
  datos.panel.turnos.filas = await p.evaluate((y0) => [...document.querySelectorAll('#tabla-reservas tbody tr')].slice(0, 40)
    .map((tr) => ({ y: Math.round(tr.getBoundingClientRect().top - y0), h: Math.round(tr.getBoundingClientRect().height), hora: tr.querySelector('td b')?.textContent, pago: tr.querySelector('.pildora')?.textContent?.trim() || '' })),
  t.y);

  // Angosto a propósito: las cuatro columnas entran sin achicar la letra en el video.
  await p.setViewportSize({ width: 580, height: 1200 });
  const m = await pieza('movimientos', '#tabla-movimientos');
  datos.panel.movimientos.filas = await p.evaluate((y0) => [...document.querySelectorAll('#tabla-movimientos tbody tr')]
    .map((tr) => ({ y: Math.round(tr.getBoundingClientRect().top - y0), h: Math.round(tr.getBoundingClientRect().height), texto: tr.textContent.replace(/\s+/g, ' ').trim() })),
  m.y);
  console.log(datos.panel.movimientos.filas.map((f) => '    ' + f.texto).join('\n'));

  await navegador.close();
}

writeFileSync(CAPTURAS + 'datos.json', JSON.stringify(datos, null, 2));
console.log('Listo: capturas en', CAPTURAS);
