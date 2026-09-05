/**
 * Servidor de Los Naranjos: sirve el sitio estático y el API de turnos.
 * Sin dependencias externas — sólo módulos nativos de Node 22.
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVIDOR, CLUB, ADMIN } from './config.js';
import { rutas } from './api.js';

const RAIZ_PUBLICA = fileURLToPath(new URL('../public/', import.meta.url));
const LIMITE_CUERPO = 32 * 1024; // 32 kB alcanza y sobra para un formulario

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function json(res, status, datos) {
  const cuerpo = JSON.stringify(datos);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(cuerpo),
    'cache-control': 'no-store',
  });
  res.end(cuerpo);
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const partes = [];
    req.on('data', (c) => {
      total += c.length;
      if (total > LIMITE_CUERPO) {
        reject(Object.assign(new Error('El pedido es demasiado grande.'), { status: 413 }));
        req.destroy();
        return;
      }
      partes.push(c);
    });
    req.on('end', () => {
      const texto = Buffer.concat(partes).toString('utf8');
      if (!texto) return resolve({});
      try {
        resolve(JSON.parse(texto));
      } catch {
        reject(Object.assign(new Error('El cuerpo no es JSON válido.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function ipDe(req) {
  const reenviada = req.headers['x-forwarded-for'];
  if (typeof reenviada === 'string' && reenviada) return reenviada.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

/** Resuelve la ruta pedida a un archivo dentro de public/, o null. */
function archivoDe(ruta) {
  let rel = decodeURIComponent(ruta.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  if (!extname(rel)) rel += '.html'; // /reservar → reservar.html

  const destino = normalize(join(RAIZ_PUBLICA, rel));
  if (!destino.startsWith(RAIZ_PUBLICA.endsWith(sep) ? RAIZ_PUBLICA : RAIZ_PUBLICA + sep)) {
    return null; // intento de salir del directorio público
  }
  try {
    const info = statSync(destino);
    return info.isFile() ? { destino, info } : null;
  } catch {
    return null;
  }
}

function servirEstatico(req, res, ruta) {
  const archivo = archivoDe(ruta) || archivoDe('/404.html');
  if (!archivo) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
    return;
  }
  const { destino, info } = archivo;
  const esHtml = extname(destino) === '.html';
  const etag = `W/"${info.size}-${Number(info.mtimeMs).toString(36)}"`;

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304).end();
    return;
  }

  res.writeHead(archivoDe(ruta) ? 200 : 404, {
    'content-type': TIPOS[extname(destino)] || 'application/octet-stream',
    'content-length': info.size,
    etag,
    'cache-control': esHtml ? 'no-cache' : 'public, max-age=3600',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(destino).pipe(res);
}

const servidor = createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('x-frame-options', 'SAMEORIGIN');

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const clave = `${req.method} ${url.pathname}`;

  if (url.pathname.startsWith('/api/')) {
    const handler = rutas[clave];
    if (!handler) return json(res, 404, { error: 'Ese endpoint no existe.' });
    try {
      const body = req.method === 'POST' ? await leerCuerpo(req) : {};
      const datos = await handler({ req, res, body, query: url.searchParams, ip: ipDe(req) });
      return json(res, 200, datos);
    } catch (err) {
      const status = err.status || (err.code === 'OCUPADO' ? 409 : 400);
      if (status >= 500) console.error(err);
      return json(res, status, { error: err.message || 'Error inesperado.', code: err.code });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'Método no permitido.' });
  }
  servirEstatico(req, res, url.pathname);
});

servidor.listen(SERVIDOR.puerto, SERVIDOR.host, () => {
  const url = `http://localhost:${SERVIDOR.puerto}`;
  console.log(`\n  \x1b[38;5;208m●\x1b[0m  ${CLUB.nombre} — ${CLUB.direccion}, ${CLUB.ciudad}`);
  console.log(`     Sitio      ${url}`);
  console.log(`     Reservas   ${url}/reservar`);
  console.log(`     Admin      ${url}/admin`);
  if (ADMIN.tokenPorDefecto) {
    console.log(
      `\n  \x1b[33m▲  Estás usando la clave de administrador por defecto.\x1b[0m` +
      `\n     Antes de publicar el sitio, definí ADMIN_TOKEN en el entorno.\n`
    );
  } else {
    console.log('');
  }
});

export { servidor };
