/** Utilidades compartidas por todas las páginas. */

/* ── Cliente del API ──────────────────────────────────────────────────────── */
export async function pedir(ruta, opciones = {}) {
  const res = await fetch(ruta, {
    headers: { 'content-type': 'application/json', ...(opciones.headers || {}) },
    ...opciones,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  let datos = null;
  try { datos = await res.json(); } catch { /* respuesta sin cuerpo */ }
  if (!res.ok) {
    const err = new Error(datos?.error || 'No pudimos conectarnos con el sistema de turnos.');
    err.status = res.status;
    err.code = datos?.code;
    throw err;
  }
  return datos;
}

let configCache = null;
export async function traerConfig() {
  if (!configCache) configCache = pedir('/api/config').catch((e) => { configCache = null; throw e; });
  return configCache;
}

/* ── Formato ──────────────────────────────────────────────────────────────── */
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const duracionTexto = (min) => (min % 60 === 0 ? `${min / 60} h` : `${min} min`);

export const pesos = (n) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);

/** Escapa texto antes de insertarlo como HTML. */
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Arma el enlace de WhatsApp del club con un mensaje ya escrito. */
export function linkWhatsapp(numero, mensaje) {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/* ── Comportamiento común de la página ────────────────────────────────────── */
export function iniciarCabecera() {
  const cabecera = document.querySelector('.cabecera');
  const boton = document.querySelector('.menu-boton');
  const nav = document.querySelector('.navegacion');

  if (cabecera) {
    const alScroll = () => cabecera.classList.toggle('cabecera--solida', window.scrollY > 24);
    alScroll();
    window.addEventListener('scroll', alScroll, { passive: true });
  }

  if (boton && nav) {
    boton.addEventListener('click', () => {
      const abierto = nav.dataset.abierto === 'true';
      nav.dataset.abierto = String(!abierto);
      boton.setAttribute('aria-expanded', String(!abierto));
    });
    nav.addEventListener('click', (e) => {
      if (e.target.closest('a')) {
        nav.dataset.abierto = 'false';
        boton.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

export function iniciarRevelado() {
  const objetivos = document.querySelectorAll('[data-revelar]');
  if (!objetivos.length) return;
  if (!('IntersectionObserver' in window)) {
    objetivos.forEach((el) => el.classList.add('visible'));
    return;
  }
  const observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue;
        const retraso = Number(entrada.target.dataset.revelar) || 0;
        setTimeout(() => entrada.target.classList.add('visible'), retraso);
        observador.unobserve(entrada.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
  );
  objetivos.forEach((el) => observador.observe(el));
}

/** Cuenta de 0 al número final cuando el elemento entra en pantalla. */
export function iniciarContadores() {
  const nodos = document.querySelectorAll('[data-contar]');
  if (!nodos.length || !('IntersectionObserver' in window)) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      const destino = Number(e.target.dataset.contar);
      observador.unobserve(e.target);
      if (reduce) { e.target.textContent = String(destino); continue; }
      const inicio = performance.now();
      const dur = 1100;
      const paso = (t) => {
        const p = Math.min((t - inicio) / dur, 1);
        const suave = 1 - Math.pow(1 - p, 3);
        e.target.textContent = String(Math.round(destino * suave));
        if (p < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    }
  }, { threshold: 0.5 });

  nodos.forEach((n) => observador.observe(n));
}

/** Rellena todos los enlaces y textos que dependen de la config del club. */
export function pintarDatosDelClub(config) {
  const { club } = config;
  document.querySelectorAll('[data-club]').forEach((el) => {
    const valor = club[el.dataset.club];
    if (valor != null) el.textContent = valor;
  });
  document.querySelectorAll('[data-tel]').forEach((el) => { el.href = `tel:${club.telefonoLink}`; });
  document.querySelectorAll('[data-mail]').forEach((el) => { el.href = `mailto:${club.email}`; });
  document.querySelectorAll('[data-ig]').forEach((el) => { el.href = `https://instagram.com/${club.instagram}`; });
  document.querySelectorAll('[data-fb]').forEach((el) => { el.href = `https://facebook.com/${club.facebook}`; });
  document.querySelectorAll('[data-mapa]').forEach((el) => {
    el.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${club.direccion}, ${club.ciudad}, ${club.provincia}`)}`;
  });
  document.querySelectorAll('[data-wsp]').forEach((el) => {
    el.href = linkWhatsapp(club.whatsapp, el.dataset.wsp || '¡Hola! Quiero consultar por una cancha en Los Naranjos.');
  });
}

export function iniciarAnio() {
  document.querySelectorAll('[data-anio]').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });
}

/** Arranque estándar de una página del sitio. */
export async function iniciarPagina() {
  iniciarCabecera();
  iniciarRevelado();
  iniciarAnio();
  try {
    const config = await traerConfig();
    pintarDatosDelClub(config);
    return config;
  } catch {
    return null; // el sitio sigue funcionando aunque el API esté caído
  }
}
