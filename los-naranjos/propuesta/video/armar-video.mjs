/**
 * Arma el video de la propuesta.
 *
 *   node propuesta/video/capturar.mjs       ← una vez, o cuando cambia el sitio
 *   node propuesta/video/armar-video.mjs    → propuesta/Los-Naranjos-propuesta.mp4
 *
 * Abre composicion.html, le pide el cuadro de cada instante y le saca una
 * foto; después ffmpeg junta las fotos en un MP4 vertical (1080×1920, 30
 * cuadros por segundo) que WhatsApp e Instagram aceptan sin convertir.
 *
 * Para revisar sin armar todo:
 *   node propuesta/video/armar-video.mjs --muestras 1.5,12.9,28
 * deja esos cuadros sueltos en .cache/muestras/.
 *
 * Necesita Playwright (como armar-pdf.mjs) y ffmpeg.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';
import { AQUI, RAIZ, CACHE, CAPTURAS, asegurarTipografia } from './comun.mjs';

const CUADROS_POR_SEGUNDO = 30;
const ANCHO = 1080, ALTO = 1920;
const SALIDA = RAIZ + 'propuesta/Los-Naranjos-propuesta.mp4';
const CUADROS = CACHE + 'cuadros/';
const MUESTRAS = CACHE + 'muestras/';

const argumento = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i < 0 ? null : process.argv[i + 1];
};

if (!existsSync(CAPTURAS + 'datos.json')) {
  console.error('Faltan las capturas. Corré antes: node propuesta/video/capturar.mjs');
  process.exit(1);
}
asegurarTipografia();

/* La composición se sirve por http: abierta como archivo, el navegador no la
   deja leer el JSON de las capturas. */
const TIPOS = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const servidor = createServer((req, res) => {
  const ruta = normalize(join(AQUI, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!ruta.startsWith(AQUI) || !existsSync(ruta) || !statSync(ruta).isFile()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TIPOS[extname(ruta)] || 'application/octet-stream' });
  createReadStream(ruta).pipe(res);
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const URL_COMPOSICION = `http://127.0.0.1:${servidor.address().port}/composicion.html`;

const navegador = await chromium.launch();
async function abrirPagina() {
  const pagina = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 1 });
  pagina.on('pageerror', (e) => { console.error('Error en la composición:', e.message); process.exit(1); });
  await pagina.goto(URL_COMPOSICION);
  await pagina.waitForFunction(() => window.listo === true, null, { timeout: 60_000 });
  return pagina;
}

/** Deja el cuadro del segundo `t` en pantalla y lo guarda. */
async function foto(pagina, t, archivo) {
  await pagina.evaluate((s) => {
    window.render(s);
    // Dos vueltas del navegador: la primera aplica los estilos, la segunda ya los pintó.
    return new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
  }, t);
  await pagina.screenshot({ path: archivo, type: 'png' });
}

try {
  const muestras = argumento('--muestras');
  if (muestras) {
    mkdirSync(MUESTRAS, { recursive: true });
    const pagina = await abrirPagina();
    for (const t of muestras.split(',').map(Number)) {
      const archivo = `${MUESTRAS}t-${t.toFixed(2).padStart(5, '0')}.png`;
      await foto(pagina, t, archivo);
      console.log(archivo);
    }
  } else {
    rmSync(CUADROS, { recursive: true, force: true });
    mkdirSync(CUADROS, { recursive: true });

    // Varias pestañas a la vez, cada una con su tanda de cuadros.
    const pestañas = await Promise.all(Array.from({ length: Number(argumento('--pestañas')) || 4 }, abrirPagina));
    const duracion = await pestañas[0].evaluate(() => window.DURACION);
    const total = Math.round(duracion * CUADROS_POR_SEGUNDO);
    let siguiente = 0, hechos = 0;
    const inicio = Date.now();
    await Promise.all(pestañas.map(async (pagina) => {
      while (siguiente < total) {
        const i = siguiente++;
        await foto(pagina, i / CUADROS_POR_SEGUNDO, `${CUADROS}${String(i).padStart(5, '0')}.png`);
        if (++hechos % 150 === 0) console.log(`  ${hechos} de ${total} cuadros…`);
      }
    }));
    console.log(`${total} cuadros en ${((Date.now() - inicio) / 1000).toFixed(0)} s. Armando el MP4…`);

    /* H.264 + AAC en MP4, que es lo que reproduce cualquier teléfono. La pista
       de audio va en silencio: hay aplicaciones que rechazan un video sin
       audio. Los colores se marcan como BT.709 para que el naranja salga
       naranja en todos lados. */
    const ffmpeg = spawnSync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-framerate', String(CUADROS_POR_SEGUNDO), '-i', `${CUADROS}%05d.png`,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', argumento('--crf') || '19', '-profile:v', 'high', '-level', '4.2',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-c:a', 'aac', '-b:a', '96k', '-shortest',
      '-movflags', '+faststart',
      SALIDA,
    ], { stdio: 'inherit' });
    if (ffmpeg.status !== 0) throw new Error('ffmpeg no pudo armar el video.');
    console.log(`Listo: ${SALIDA} — ${(statSync(SALIDA).size / 1024 / 1024).toFixed(1)} MB, ${duracion} s.`);
  }
} finally {
  await navegador.close();
  servidor.close();
}
