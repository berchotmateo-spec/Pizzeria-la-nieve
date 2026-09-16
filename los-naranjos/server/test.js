/**
 * Pruebas del sistema de turnos.
 *   npm test
 * Usa una base temporal, así que no toca los datos reales.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

const RUTA_DB = join(tmpdir(), `naranjos-test-${process.pid}.db`);
process.env.DB_PATH = RUTA_DB;
process.env.ADMIN_TOKEN = 'clave-de-prueba-1234';
process.env.PORT = String(3100 + (process.pid % 400));

const { rutas } = await import('./api.js');
const { cuentas } = await import('./db.js');
const T = await import('./tiempo.js');
const { RESERVAS, CUENTAS } = await import('./config.js');
const { usuarioDeLaSolicitud, reiniciarIntentos } = await import('./cuentas.js');

/**
 * Día contra el que se prueba todo.
 *
 * Antes era "mañana", y eso hacía que la suite fallara los sábados: el domingo
 * el club abre a las 09:00 y varios tests reservan a las 08:00 o a las 07:30.
 * Un test que depende del día en que lo corrés no prueba nada, así que se elige
 * el próximo miércoles, que siempre tiene el horario largo (07:30 a 23:30) y
 * entra holgado en los 14 días de anticipación que permite el sistema.
 */
const MIERCOLES = 3;
const PROXIMO_MIERCOLES = (() => {
  const hoy = T.hoy();
  const faltan = ((MIERCOLES - T.diaSemana(hoy) + 7) % 7) || 7;
  return T.sumarDias(hoy, faltan);
})();
const params = (o) => new URLSearchParams(o);
const admin = { headers: { authorization: 'Bearer clave-de-prueba-1234' } };

const reservaBase = (extra = {}) => ({
  disciplina: 'padel',
  fecha: PROXIMO_MIERCOLES,
  hora: '20:00',
  duracionMin: 90,
  nombre: 'Mateo Berchot',
  telefono: '223 555-1234',
  ...extra,
});

let contadorIp = 0;
/** Cada llamada usa una IP distinta, salvo que el test pida una concreta. */
const ipUnica = () => `10.0.${Math.floor(contadorIp / 250)}.${(contadorIp++ % 250) + 1}`;

/** Ejecuta un handler y devuelve { ok, datos, error, status }. */
async function llamar(clave, ctx = {}) {
  try {
    return { ok: true, datos: await rutas[clave]({ req: { headers: {} }, body: {}, query: params({}), ip: ipUnica(), ...ctx }) };
  } catch (err) {
    return { ok: false, error: err.message, status: err.status, code: err.code };
  }
}

/**
 * Simula un navegador: se guarda la cookie de sesión que devuelve el servidor
 * y la manda en los pedidos siguientes, que es justo lo que hay que probar.
 */
function navegador(ip = ipUnica()) {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    async llamar(clave, ctx = {}) {
      const req = { headers: cookie ? { cookie } : {}, socket: {} };
      const res = {
        setHeader(nombre, valor) {
          if (String(nombre).toLowerCase() !== 'set-cookie') return;
          const par = String(valor).split(';')[0];
          cookie = par.endsWith('=') ? '' : par; // Max-Age=0 borra la sesión
        },
      };
      try {
        const usuario = usuarioDeLaSolicitud(req);
        const datos = await rutas[clave]({
          req, res, body: {}, query: params({}), ip, usuario, ...ctx,
        });
        return { ok: true, datos };
      } catch (err) {
        return { ok: false, error: err.message, status: err.status, code: err.code };
      }
    },
  };
}

const cuentaBase = (extra = {}) => ({
  nombre: 'Jugadora de Prueba',
  telefono: '223 555-9000',
  clave: 'pelota-naranja-7',
  ...extra,
});

after(() => {
  for (const sufijo of ['', '-wal', '-shm']) rmSync(RUTA_DB + sufijo, { force: true });
});

test('la configuración pública no filtra la clave de administrador', async () => {
  const { datos } = await llamar('GET /api/config');
  assert.equal(datos.club.nombre, 'Los Naranjos');
  assert.equal(datos.club.direccion, 'Dorrego 333');
  assert.ok(!JSON.stringify(datos).includes('clave-de-prueba'));
  assert.ok(datos.disciplinas.length >= 1);
  assert.equal(datos.calendario.length, RESERVAS.diasAnticipacion + 1);
});

test('la disponibilidad respeta el horario del club', async () => {
  const { datos } = await llamar('GET /api/disponibilidad', {
    query: params({ fecha: PROXIMO_MIERCOLES, disciplina: 'padel', duracion: '90' }),
  });
  assert.equal(datos.cerrado, false);
  assert.ok(datos.horarios.length > 0);
  const ultimo = datos.horarios.at(-1);
  assert.ok(T.aMinutos(ultimo.fin) <= T.aMinutos(datos.cierra), 'ningún turno termina después del cierre');
  assert.equal(datos.horarios[0].cantidad, datos.totalCanchas);
});

test('una reserva válida se crea y ocupa la cancha', async () => {
  const { ok, datos } = await llamar('POST /api/reservas', { body: reservaBase() });
  assert.ok(ok);
  assert.match(datos.reserva.codigo, /^LN-[A-Z0-9]{5}$/);
  assert.equal(datos.reserva.hora, '20:00');
  assert.equal(datos.reserva.fin, '21:30');
  assert.equal(datos.reserva.telefono, '2235551234', 'el teléfono se normaliza');

  const disp = await llamar('GET /api/disponibilidad', {
    query: params({ fecha: PROXIMO_MIERCOLES, disciplina: 'padel', duracion: '90' }),
  });
  const slot = disp.datos.horarios.find((h) => h.hora === '20:00');
  assert.equal(slot.cantidad, disp.datos.totalCanchas - 1);
  assert.ok(!slot.libres.includes(datos.reserva.canchaId));
});

test('no se puede reservar dos veces la misma cancha en el mismo horario', async () => {
  const primera = await llamar('POST /api/reservas', {
    body: reservaBase({ hora: '19:00', canchaId: 'padel-2', telefono: '2235550001' }),
  });
  assert.ok(primera.ok);
  const segunda = await llamar('POST /api/reservas', {
    body: reservaBase({ hora: '19:00', canchaId: 'padel-2', telefono: '2235550002' }),
  });
  assert.equal(segunda.ok, false);
  assert.equal(segunda.status, 409);
});

test('se detecta el solapamiento parcial de turnos', async () => {
  await llamar('POST /api/reservas', {
    body: reservaBase({ hora: '10:00', duracionMin: 90, canchaId: 'padel-3', telefono: '2235550003' }),
  });
  // 11:00 cae dentro del turno de 10:00–11:30.
  const choque = await llamar('POST /api/reservas', {
    body: reservaBase({ hora: '11:00', duracionMin: 60, canchaId: 'padel-3', telefono: '2235550004' }),
  });
  assert.equal(choque.ok, false);
  assert.equal(choque.status, 409);
  // 11:30 arranca justo cuando el otro termina: tiene que entrar.
  const pegado = await llamar('POST /api/reservas', {
    body: reservaBase({ hora: '11:30', duracionMin: 60, canchaId: 'padel-3', telefono: '2235550005' }),
  });
  assert.equal(pegado.ok, true);
});

test('se rechazan los datos incompletos o fuera de rango', async () => {
  const casos = [
    [{ nombre: 'A' }, 'nombre demasiado corto'],
    [{ telefono: '123' }, 'teléfono inválido'],
    [{ email: 'no-es-mail' }, 'correo inválido'],
    [{ fecha: T.sumarDias(T.hoy(), -1) }, 'fecha pasada'],
    [{ fecha: T.sumarDias(T.hoy(), RESERVAS.diasAnticipacion + 5) }, 'demasiado lejos'],
    [{ hora: '03:00' }, 'fuera del horario de atención'],
    [{ hora: '20:15' }, 'fuera de la grilla de 30 minutos'],
    [{ duracionMin: 45 }, 'duración no permitida'],
    [{ disciplina: 'tenis' }, 'disciplina inexistente'],
  ];
  for (const [extra, motivo] of casos) {
    const r = await llamar('POST /api/reservas', { body: reservaBase(extra) });
    assert.equal(r.ok, false, `debería rechazar: ${motivo}`);
    assert.equal(r.status, 400, `${motivo} → 400`);
  }
});

test('se limita la cantidad de turnos activos por teléfono', async () => {
  const tel = '2235558888';
  for (let i = 0; i < RESERVAS.maxPorTelefono; i++) {
    const r = await llamar('POST /api/reservas', {
      body: reservaBase({ hora: `${14 + i}:00`, duracionMin: 60, telefono: tel }),
    });
    assert.ok(r.ok, `la reserva ${i + 1} debería entrar`);
  }
  const extra = await llamar('POST /api/reservas', {
    body: reservaBase({ hora: '18:00', duracionMin: 60, telefono: tel }),
  });
  assert.equal(extra.ok, false);
  assert.match(extra.error, /turnos activos/);
});

test('consulta y cancelación por parte del socio', async () => {
  const tel = '2235557777';
  const { datos } = await llamar('POST /api/reservas', {
    body: reservaBase({ hora: '09:00', duracionMin: 60, telefono: tel }),
  });
  const codigo = datos.reserva.codigo;

  const ajeno = await llamar('GET /api/reservas', { query: params({ codigo, telefono: '2230000000' }) });
  assert.equal(ajeno.ok, false, 'el teléfono equivocado no puede ver la reserva');
  assert.equal(ajeno.status, 403);

  const propia = await llamar('GET /api/reservas', { query: params({ codigo, telefono: tel }) });
  assert.equal(propia.datos.reservas[0].codigo, codigo);

  const malIntento = await llamar('POST /api/reservas/cancelar', { body: { codigo, telefono: '2230000000' } });
  assert.equal(malIntento.ok, false);
  assert.equal(malIntento.status, 403);

  const cancelada = await llamar('POST /api/reservas/cancelar', { body: { codigo, telefono: tel } });
  assert.equal(cancelada.datos.reserva.estado, 'cancelada');

  const repetida = await llamar('POST /api/reservas/cancelar', { body: { codigo, telefono: tel } });
  assert.equal(repetida.ok, false, 'no se cancela dos veces');
});

test('cancelar libera el horario para otra persona', async () => {
  const { datos } = await llamar('POST /api/reservas', {
    body: reservaBase({ hora: '08:00', duracionMin: 60, canchaId: 'padel-4', telefono: '2235556666' }),
  });
  const ocupado = await llamar('POST /api/reservas', {
    body: reservaBase({ hora: '08:00', duracionMin: 60, canchaId: 'padel-4', telefono: '2235556665' }),
  });
  assert.equal(ocupado.status, 409);

  await llamar('POST /api/reservas/cancelar', {
    body: { codigo: datos.reserva.codigo, telefono: '2235556666' },
  });
  const libre = await llamar('POST /api/reservas', {
    body: reservaBase({ hora: '08:00', duracionMin: 60, canchaId: 'padel-4', telefono: '2235556665' }),
  });
  assert.ok(libre.ok, 'el horario quedó liberado');
});

test('el panel de administración exige la clave correcta', async () => {
  const sinClave = await llamar('GET /api/admin/dia');
  assert.equal(sinClave.status, 401);

  const claveMala = await llamar('GET /api/admin/dia', { req: { headers: { authorization: 'Bearer incorrecta' } } });
  assert.equal(claveMala.status, 401);

  const conClave = await llamar('GET /api/admin/dia', { req: admin, query: params({ fecha: PROXIMO_MIERCOLES }) });
  assert.ok(conClave.ok);
  assert.ok(conClave.datos.resumen.turnos > 0);
  assert.ok(conClave.datos.resumen.horasVendidas > 0);
});

test('el administrador puede bloquear una cancha y eso saca el turno de la grilla', async () => {
  const bloqueo = await llamar('POST /api/admin/bloqueos', {
    req: admin,
    body: { canchaId: 'padel-2', fecha: PROXIMO_MIERCOLES, hora: '16:00', duracionMin: 120, motivo: 'Torneo interno' },
  });
  assert.ok(bloqueo.ok);
  assert.equal(bloqueo.datos.reserva.tipo, 'bloqueo');

  const choque = await llamar('POST /api/reservas', {
    body: reservaBase({ hora: '17:00', duracionMin: 60, canchaId: 'padel-2', telefono: '2235554444' }),
  });
  assert.equal(choque.status, 409, 'no se puede reservar sobre un bloqueo');
});

test('el administrador puede cancelar cualquier turno', async () => {
  const { datos } = await llamar('POST /api/reservas', {
    body: reservaBase({ hora: '12:30', duracionMin: 60, telefono: '2235553333' }),
  });
  const r = await llamar('POST /api/admin/cancelar', { req: admin, body: { codigo: datos.reserva.codigo } });
  assert.equal(r.datos.reserva.estado, 'cancelada');
});

test('se frena la avalancha de reservas desde una misma IP', async () => {
  const ip = '203.0.113.77';
  let bloqueada = 0;
  for (let i = 0; i < RESERVAS.maxPorIpHora + 3; i++) {
    // Un horario distinto por intento: con sólo 7 canchas, reutilizar la
    // misma hora agotaría la disponibilidad antes de llegar al límite de IP
    // que este test quiere probar.
    const r = await llamar('POST /api/reservas', {
      ip,
      body: reservaBase({
        hora: T.aHora(7 * 60 + 30 + i * RESERVAS.slotMinutos),
        duracionMin: 60,
        telefono: `22355${String(i).padStart(5, '0')}`,
      }),
    });
    if (!r.ok && r.status === 429) bloqueada++;
  }
  assert.ok(bloqueada > 0, 'después del límite por hora la IP queda frenada');
});

test('crear la cuenta abre la sesión y se queda con los turnos previos', async () => {
  const tel = '2235557001';
  // Primero reserva como visitante, sin cuenta.
  const previa = await llamar('POST /api/reservas', {
    body: reservaBase({ hora: '09:00', duracionMin: 60, telefono: tel, nombre: 'Ana Invitada' }),
  });
  assert.ok(previa.ok);

  const nav = navegador();
  const alta = await nav.llamar('POST /api/cuenta/registro', {
    body: cuentaBase({ telefono: tel, nombre: 'Ana Registrada' }),
  });
  assert.ok(alta.ok, alta.error);
  assert.equal(alta.datos.usuario.telefono, tel);
  assert.equal(alta.datos.reservasAdoptadas, 1, 'el turno que ya tenía queda en su cuenta');
  assert.ok(nav.cookie.startsWith('ln_sesion='), 'quedó la cookie de sesión');

  // Y ahora ve ese turno sin escribir nada.
  const mios = await nav.llamar('GET /api/reservas');
  assert.equal(mios.datos.reservas.length, 1);
  assert.equal(mios.datos.reservas[0].codigo, previa.datos.reserva.codigo);
});

test('no se puede abrir dos cuentas con el mismo teléfono', async () => {
  const tel = '2235557002';
  const primera = await navegador().llamar('POST /api/cuenta/registro', { body: cuentaBase({ telefono: tel }) });
  assert.ok(primera.ok);

  const segunda = await navegador().llamar('POST /api/cuenta/registro', { body: cuentaBase({ telefono: tel }) });
  assert.equal(segunda.ok, false);
  assert.equal(segunda.status, 409);
  assert.equal(segunda.code, 'TELEFONO_EN_USO');
});

test('la contraseña no se guarda en limpio ni se devuelve nunca', async () => {
  const tel = '2235557003';
  const clave = 'clave-secreta-muy-linda';
  const nav = navegador();
  const alta = await nav.llamar('POST /api/cuenta/registro', { body: cuentaBase({ telefono: tel, clave }) });
  assert.ok(alta.ok);
  assert.ok(!JSON.stringify(alta.datos).includes(clave), 'no vuelve en la respuesta');

  const fila = cuentas.porTelefono(tel);
  assert.ok(fila.clave.startsWith('scrypt$'), 'se guarda hasheada');
  assert.ok(!fila.clave.includes(clave));

  const perfil = await nav.llamar('GET /api/cuenta');
  assert.ok(!JSON.stringify(perfil.datos).includes(clave));
  assert.ok(!JSON.stringify(perfil.datos).includes('scrypt$'), 'el hash tampoco se expone');
});

test('la contraseña corta no pasa y la equivocada no entra', async () => {
  const tel = '2235557004';
  const corta = await navegador().llamar('POST /api/cuenta/registro', {
    body: cuentaBase({ telefono: tel, clave: 'corta' }),
  });
  assert.equal(corta.ok, false);
  assert.match(corta.error, new RegExp(String(CUENTAS.minClave)));

  await navegador().llamar('POST /api/cuenta/registro', { body: cuentaBase({ telefono: tel, clave: 'la-correcta-1' }) });

  const errada = await navegador().llamar('POST /api/cuenta/ingreso', {
    body: { telefono: tel, clave: 'la-equivocada-1' },
  });
  assert.equal(errada.ok, false);
  assert.equal(errada.status, 401);

  const buena = await navegador().llamar('POST /api/cuenta/ingreso', {
    body: { telefono: tel, clave: 'la-correcta-1' },
  });
  assert.ok(buena.ok, buena.error);
  assert.equal(buena.datos.usuario.telefono, tel);
});

test('se frena el intento de adivinar la contraseña a fuerza bruta', async () => {
  reiniciarIntentos();
  const tel = '2235557005';
  await navegador().llamar('POST /api/cuenta/registro', { body: cuentaBase({ telefono: tel }) });

  let frenados = 0;
  for (let i = 0; i < CUENTAS.maxIntentos + 2; i++) {
    const r = await navegador('198.51.100.7').llamar('POST /api/cuenta/ingreso', {
      body: { telefono: tel, clave: `intento-numero-${i}` },
    });
    if (r.status === 429) frenados++;
  }
  assert.ok(frenados > 0, 'después del límite de intentos la puerta se cierra');
  reiniciarIntentos();
});

test('con la sesión abierta el turno sale a nombre de la cuenta', async () => {
  const tel = '2235557006';
  const nav = navegador();
  await nav.llamar('POST /api/cuenta/registro', {
    body: cuentaBase({ telefono: tel, nombre: 'Lucía Socia' }),
  });

  // El cuerpo miente a propósito: la cuenta manda.
  const r = await nav.llamar('POST /api/reservas', {
    body: reservaBase({ hora: '10:00', duracionMin: 60, nombre: 'Otro Nombre', telefono: '2239999999' }),
  });
  assert.ok(r.ok, r.error);
  assert.equal(r.datos.reserva.nombre, 'Lucía Socia');
  assert.equal(r.datos.reserva.telefono, tel);

  // Y lo puede cancelar sin escribir el teléfono.
  const baja = await nav.llamar('POST /api/reservas/cancelar', { body: { codigo: r.datos.reserva.codigo } });
  assert.ok(baja.ok, baja.error);
  assert.equal(baja.datos.reserva.estado, 'cancelada');
});

test('el teléfono de alguien con cuenta no muestra sus turnos a un desconocido', async () => {
  const tel = '2235557007';
  await navegador().llamar('POST /api/cuenta/registro', { body: cuentaBase({ telefono: tel }) });

  const curioso = await llamar('GET /api/reservas', { query: params({ telefono: tel }) });
  assert.equal(curioso.ok, false);
  assert.equal(curioso.status, 401);
  assert.equal(curioso.code, 'NECESITA_SESION');

  // El visitante sin cuenta sigue consultando por teléfono, como siempre.
  const visitante = await llamar('GET /api/reservas', { query: params({ telefono: '2235558888' }) });
  assert.ok(visitante.ok);
});

test('cambiar la contraseña cierra las sesiones abiertas en otro lado', async () => {
  const tel = '2235557008';
  const clave = 'la-de-siempre-9';
  const compu = navegador();
  await compu.llamar('POST /api/cuenta/registro', { body: cuentaBase({ telefono: tel, clave }) });

  const celular = navegador();
  await celular.llamar('POST /api/cuenta/ingreso', { body: { telefono: tel, clave } });
  assert.ok((await celular.llamar('GET /api/cuenta')).datos.usuario, 'el celular está adentro');

  const cambio = await compu.llamar('POST /api/cuenta/clave', {
    body: { claveActual: clave, claveNueva: 'una-nueva-distinta-3' },
  });
  assert.ok(cambio.ok, cambio.error);

  assert.equal((await celular.llamar('GET /api/cuenta')).datos.usuario, null, 'al celular lo echó');
  assert.ok((await compu.llamar('GET /api/cuenta')).datos.usuario, 'la compu sigue adentro');
});

test('salir cierra la sesión y editar el perfil la mantiene', async () => {
  const tel = '2235557009';
  const nav = navegador();
  await nav.llamar('POST /api/cuenta/registro', { body: cuentaBase({ telefono: tel }) });

  const perfil = await nav.llamar('POST /api/cuenta/perfil', {
    body: { nombre: 'Nombre Corregido', email: 'jugadora@ejemplo.com' },
  });
  assert.ok(perfil.ok, perfil.error);
  assert.equal(perfil.datos.usuario.nombre, 'Nombre Corregido');
  assert.equal(perfil.datos.usuario.email, 'jugadora@ejemplo.com');

  assert.ok((await nav.llamar('POST /api/cuenta/salir')).ok);
  assert.equal(nav.cookie, '', 'la cookie se borró');
  assert.equal((await nav.llamar('GET /api/cuenta')).datos.usuario, null);

  const sinSesion = await nav.llamar('POST /api/cuenta/perfil', { body: { nombre: 'Colado' } });
  assert.equal(sinSesion.status, 401);
});

test('el servidor HTTP sirve el sitio y el API', async () => {
  const { servidor } = await import('./index.js');
  await new Promise((r) => (servidor.listening ? r() : servidor.once('listening', r)));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  try {
    const home = await fetch(base + '/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /text\/html/);

    const reservar = await fetch(base + '/reservar');
    assert.equal(reservar.status, 200, 'las URLs limpias resuelven al .html');

    const config = await fetch(base + '/api/config');
    assert.equal(config.status, 200);

    const inexistente = await fetch(base + '/api/no-existe');
    assert.equal(inexistente.status, 404);

    // No se puede escapar del directorio público.
    const escape = await fetch(base + '/../server/config.js');
    assert.notEqual(escape.status, 200);

    const metodo = await fetch(base + '/', { method: 'DELETE' });
    assert.equal(metodo.status, 405);
  } finally {
    // fetch mantiene la conexión viva: hay que cortarlas para que cierre.
    servidor.closeAllConnections();
    await new Promise((r) => servidor.close(r));
  }
});
