/** Lo que comparten las herramientas del video: rutas, tipografías y el navegador. */
import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const AQUI = fileURLToPath(new URL('./', import.meta.url));
export const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
export const CACHE = AQUI + '.cache/';
export const CAPTURAS = CACHE + 'capturas/';
const ARCHIVO = CACHE + 'fuentes/archivo.woff2';

/**
 * Archivo es la tipografía de los títulos del sitio. En el sitio publicado la
 * sirve Google Fonts; para armar el video se baja una sola vez del registro de
 * npm, que es de donde este entorno puede bajar cosas. Inter ya viene instalada.
 */
export function asegurarTipografia() {
  if (existsSync(ARCHIVO)) return ARCHIVO;
  mkdirSync(CACHE + 'fuentes', { recursive: true });
  const tmp = CACHE + 'fuentes/paquete/';
  mkdirSync(tmp, { recursive: true });
  execFileSync('npm', ['pack', '@fontsource-variable/archivo', '--silent', '--pack-destination', tmp], { stdio: 'ignore' });
  execFileSync('sh', ['-c', `tar -xzf "${tmp}"*.tgz -C "${tmp}" package/files/archivo-latin-wght-normal.woff2 && cp "${tmp}package/files/archivo-latin-wght-normal.woff2" "${ARCHIVO}"`]);
  return ARCHIVO;
}

/** La hoja que el sitio le pide a Google Fonts, resuelta con los archivos locales. */
const CSS_TIPOGRAFIAS = `
@font-face {
  font-family: 'Archivo';
  src: url('https://tipografias.local/archivo.woff2') format('woff2');
  font-weight: 100 900;
  font-display: block;
}`;

/** Abre un navegador donde las tipografías del sitio cargan sin salir a internet. */
export async function abrirNavegador(opciones = {}) {
  asegurarTipografia();
  // En castellano de acá: si no, los campos de fecha salen como mes/día/año.
  const navegador = await chromium.launch({ args: ['--lang=es-AR'] });
  const contexto = await navegador.newContext(opciones);
  await contexto.route('https://fonts.googleapis.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body: CSS_TIPOGRAFIAS }));
  await contexto.route('https://tipografias.local/**', (r) =>
    r.fulfill({ status: 200, contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(ARCHIVO) }));
  await contexto.route('https://fonts.gstatic.com/**', (r) => r.abort());
  return { navegador, contexto };
}
