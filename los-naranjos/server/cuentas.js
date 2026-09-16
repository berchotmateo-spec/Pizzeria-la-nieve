/**
 * Cuentas de los jugadores: registro, ingreso, sesión y perfil.
 *
 * Todo con módulos nativos de Node, como el resto del proyecto. Las decisiones
 * que importan y por qué:
 *
 *  · La clave se guarda con scrypt, que viene en `node:crypto`. Es lento a
 *    propósito: si alguien se lleva la base, probar claves una por una le sale
 *    carísimo. Nunca se guarda ni se registra la clave en limpio.
 *  · La sesión es un token al azar que viaja en una cookie HttpOnly, así no lo
 *    puede leer ningún script. En la base guardamos sólo su hash.
 *  · El nombre de usuario es el teléfono, porque es el dato que el jugador ya
 *    usa para reservar y el que el club le pide por WhatsApp.
 */
import { randomBytes, scrypt as scryptCb, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { CUENTAS } from './config.js';
import { crearUsuario, cuentas, sesiones } from './db.js';
import { normalizarTelefono } from './turnos.js';

const scrypt = promisify(scryptCb);

/* Parámetros de scrypt. N alto = más lento de romper; 16384 tarda ~80 ms en un
   servidor chico, que es imperceptible al ingresar y molesto para un atacante. */
const SCRYPT = { N: 16384, r: 8, p: 1, largo: 32 };

const error = (mensaje, status = 400, code) =>
  Object.assign(new Error(mensaje), { status, code });

/* ── Claves ─────────────────────────────────────────────────────────────── */

/** Devuelve "scrypt$N$r$p$salt$hash", todo lo necesario para verificar después. */
export async function hashearClave(clave) {
  const sal = randomBytes(16);
  const hash = await scrypt(clave.normalize('NFKC'), sal, SCRYPT.largo, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p,
  });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, sal.toString('base64'), hash.toString('base64')].join('$');
}

/** Compara en tiempo constante: el tiempo de respuesta no dice si acertó. */
export async function claveCoincide(clave, guardado) {
  const partes = String(guardado || '').split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, N, r, p, salB64, hashB64] = partes;
  const sal = Buffer.from(salB64, 'base64');
  const esperado = Buffer.from(hashB64, 'base64');
  const calculado = await scrypt(String(clave).normalize('NFKC'), sal, esperado.length, {
    N: Number(N), r: Number(r), p: Number(p),
  });
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/* ── Cookies ────────────────────────────────────────────────────────────── */

export const NOMBRE_COOKIE = 'ln_sesion';

export function leerCookies(req) {
  const crudo = req.headers.cookie;
  if (!crudo) return {};
  const mapa = {};
  for (const parte of crudo.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    mapa[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return mapa;
}

/* Sólo marcamos la cookie como Secure si la visita llegó por HTTPS. Ponerlo
   siempre rompería el desarrollo en localhost; no ponerlo nunca dejaría viajar
   la sesión en claro cuando el sitio ya esté publicado. */
const porHttps = (req) =>
  req.socket?.encrypted === true || req.headers['x-forwarded-proto'] === 'https';

function armarCookie(valor, segundos, req) {
  const trozos = [
    `${NOMBRE_COOKIE}=${valor}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${segundos}`,
  ];
  if (porHttps(req)) trozos.push('Secure');
  return trozos.join('; ');
}

/* ── Sesiones ───────────────────────────────────────────────────────────── */

const hashDeToken = (token) => createHash('sha256').update(token).digest('hex');

function abrirSesion(res, req, usuarioId) {
  const token = randomBytes(32).toString('base64url');
  const segundos = CUENTAS.diasSesion * 24 * 60 * 60;
  const expira = new Date(Date.now() + segundos * 1000).toISOString();
  sesiones.crear(hashDeToken(token), usuarioId, expira, req ? ipDe(req) : null);
  res.setHeader('set-cookie', armarCookie(token, segundos, req));
  return token;
}

export function cerrarSesion(req, res) {
  const token = leerCookies(req)[NOMBRE_COOKIE];
  if (token) sesiones.borrar(hashDeToken(token));
  res.setHeader('set-cookie', armarCookie('', 0, req));
}

const ipDe = (req) => {
  const reenviada = req.headers['x-forwarded-for'];
  if (typeof reenviada === 'string' && reenviada) return reenviada.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
};

/**
 * El jugador que hizo esta solicitud, o null.
 * Se llama en cada pedido al API, así que es una sola lectura por clave primaria.
 */
export function usuarioDeLaSolicitud(req) {
  const token = leerCookies(req)[NOMBRE_COOKIE];
  if (!token) return null;
  const fila = sesiones.porHash(hashDeToken(token));
  if (!fila) return null;
  if (fila.expira_en <= new Date().toISOString()) {
    sesiones.borrar(fila.token_hash);
    return null;
  }
  return fila;
}

/** Lo que el navegador puede saber de una cuenta: nunca la clave. */
export const perfilPublico = (u) => ({
  id: u.id,
  nombre: u.nombre,
  telefono: u.telefono,
  email: u.email || null,
  creadoEn: u.creado_en,
});

/* ── Freno a la fuerza bruta ────────────────────────────────────────────── */

/* En memoria a propósito: si el servidor se reinicia, se perdona. Lo que
   interesa es cortar la ráfaga de miles de intentos, no llevar un prontuario. */
const intentos = new Map();

function registrarIntentoFallido(clave) {
  const ahora = Date.now();
  const ventana = CUENTAS.ventanaIntentosMinutos * 60_000;
  const previos = (intentos.get(clave) || []).filter((t) => ahora - t < ventana);
  previos.push(ahora);
  intentos.set(clave, previos);
}

function estaFrenado(clave) {
  const ahora = Date.now();
  const ventana = CUENTAS.ventanaIntentosMinutos * 60_000;
  const previos = (intentos.get(clave) || []).filter((t) => ahora - t < ventana);
  if (previos.length) intentos.set(clave, previos); else intentos.delete(clave);
  return previos.length >= CUENTAS.maxIntentos;
}

const olvidarIntentos = (clave) => intentos.delete(clave);

/** Sólo para las pruebas: vuelve a fojas cero. */
export const reiniciarIntentos = () => intentos.clear();

/* ── Validaciones ───────────────────────────────────────────────────────── */

function validarNombre(valor) {
  const nombre = String(valor || '').trim();
  if (nombre.length < 2) throw error('Escribí tu nombre y apellido.');
  if (nombre.length > 80) throw error('El nombre es demasiado largo.');
  return nombre;
}

function validarTelefono(valor) {
  const telefono = normalizarTelefono(valor);
  if (telefono.length < 8) throw error('Escribí un teléfono válido.');
  if (telefono.length > 20) throw error('Ese teléfono no parece válido.');
  return telefono;
}

function validarEmail(valor) {
  const email = String(valor || '').trim();
  if (!email) return null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) throw error('El correo no parece válido.');
  if (email.length > 120) throw error('El correo es demasiado largo.');
  return email;
}

function validarClave(valor) {
  const clave = String(valor || '');
  if (clave.length < CUENTAS.minClave) {
    throw error(`La contraseña tiene que tener al menos ${CUENTAS.minClave} caracteres.`);
  }
  if (clave.length > 200) throw error('La contraseña es demasiado larga.');
  return clave;
}

/* ── Operaciones ────────────────────────────────────────────────────────── */

export async function registrar(datos, req, res) {
  const nombre = validarNombre(datos.nombre);
  const telefono = validarTelefono(datos.telefono);
  const email = validarEmail(datos.email);
  const clave = validarClave(datos.clave);

  if (cuentas.porTelefono(telefono)) {
    throw error('Ya hay una cuenta con ese teléfono. Probá ingresando.', 409, 'TELEFONO_EN_USO');
  }

  const { usuario, reservasAdoptadas } = crearUsuario({
    telefono, nombre, email, clave: await hashearClave(clave),
  });

  abrirSesion(res, req, usuario.id);
  cuentas.marcarAcceso(usuario.id);
  return { ok: true, usuario: perfilPublico(usuario), reservasAdoptadas };
}

export async function ingresar(datos, req, res) {
  const telefono = normalizarTelefono(datos.telefono);
  const clave = String(datos.clave || '');
  const llaveIp = `ip:${ipDe(req)}`;
  const llaveTel = `tel:${telefono}`;

  if (estaFrenado(llaveTel) || estaFrenado(llaveIp)) {
    throw error(
      'Demasiados intentos fallidos. Esperá unos minutos y volvé a probar.',
      429, 'LIMITE'
    );
  }

  const usuario = telefono ? cuentas.porTelefono(telefono) : null;
  /* Si el teléfono no existe igual verificamos contra un hash de descarte, para
     que tardar menos no delate qué teléfonos tienen cuenta. */
  const guardado = usuario ? usuario.clave : HASH_SEÑUELO;
  const coincide = await claveCoincide(clave, guardado);

  if (!usuario || !coincide) {
    registrarIntentoFallido(llaveTel);
    registrarIntentoFallido(llaveIp);
    throw error('El teléfono o la contraseña no coinciden.', 401, 'NO_AUTORIZADO');
  }

  olvidarIntentos(llaveTel);
  olvidarIntentos(llaveIp);
  abrirSesion(res, req, usuario.id);
  cuentas.marcarAcceso(usuario.id);
  sesiones.limpiarVencidas();
  return { ok: true, usuario: perfilPublico(usuario) };
}

/* Hash de una clave que nadie tiene. Existe sólo para que un ingreso con un
   teléfono inexistente tarde lo mismo que uno con la clave equivocada. */
const HASH_SEÑUELO = await hashearClave(randomBytes(32).toString('hex'));

export function actualizarPerfil(usuario, datos) {
  const nombre = validarNombre(datos.nombre ?? usuario.nombre);
  const email = validarEmail(datos.email ?? usuario.email);
  cuentas.actualizarPerfil(usuario.id, nombre, email);
  return { ok: true, usuario: perfilPublico({ ...usuario, nombre, email }) };
}

export async function cambiarClave(usuario, datos, req, res) {
  if (!(await claveCoincide(String(datos.claveActual || ''), usuario.clave))) {
    throw error('La contraseña actual no coincide.', 401, 'NO_AUTORIZADO');
  }
  const nueva = validarClave(datos.claveNueva);
  if (await claveCoincide(nueva, usuario.clave)) {
    throw error('La contraseña nueva tiene que ser distinta de la anterior.');
  }
  cuentas.actualizarClave(usuario.id, await hashearClave(nueva));
  /* Cambiar la clave cierra las sesiones viejas —que es de lo que se trata si
     alguien se te metió en la cuenta— y deja abierta la de acá. */
  sesiones.borrarTodasDe(usuario.id);
  abrirSesion(res, req, usuario.id);
  return { ok: true };
}
