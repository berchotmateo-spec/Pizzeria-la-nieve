/**
 * Pasa a PDF una página HTML del proyecto: la propuesta o la cartilla.
 *
 *   node herramientas/armar-pdf.mjs propuesta/index.html propuesta/Propuesta-Los-Naranjos.pdf
 *
 * Es la única herramienta que necesita algo además de Node: Playwright con su
 * Chromium (`npm i -D playwright && npx playwright install chromium`, o una
 * instalación global). Imprime con los estilos de `@media print` de la página,
 * en A4 y sin márgenes, porque cada página ya trae los suyos.
 */
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const [, , entrada, salida] = process.argv;
if (!entrada || !salida) {
  console.error('Uso: node herramientas/armar-pdf.mjs <entrada.html> <salida.pdf>');
  process.exit(1);
}

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.emulateMedia({ media: 'print' });
await pagina.goto('file://' + resolve(entrada), { waitUntil: 'networkidle' });
// Sin esperar a las tipografías, el PDF puede salir con la letra de reemplazo.
await pagina.evaluate(() => document.fonts.ready);
await pagina.waitForTimeout(300);
await pagina.pdf({
  path: salida,
  format: 'A4',
  printBackground: true,
  margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
});
await navegador.close();
console.log(`PDF listo: ${salida}`);
