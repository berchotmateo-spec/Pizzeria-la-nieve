# Contexto para el proyecto nuevo: turnos de Once Unidos

Este archivo es el punto de partida del sistema de turnos para el **Club
Deportivo Once Unidos**. Junta lo que se construyó y lo que se aprendió con
**Los Naranjos**, el sistema anterior, que es la base de la que se arranca.

Si al lado de este archivo está la carpeta **`base-los-naranjos/`**, ese es el
código completo de Los Naranjos, con sus 29 pruebas pasando. La idea es copiarlo
y adaptarlo, no escribirlo de cero: el motor de turnos ya maneja varios
deportes, que es justo lo que necesita un club deportivo.

> De Once Unidos, acá hay preguntas, no datos. Todo lo del club se confirma con
> ellos antes de cargarlo.

---

## 1. Quién soy y cómo trabajo

- Soy **Mateo Berchot**, de Mar del Plata. Les armo a clubes un sitio web con
  sistema de turnos propio y lo vendo como servicio: **un pago de armado más un
  abono mensual**.
- **Los Naranjos** —club de pádel en Dorrego 333, Mar del Plata— es mi segundo
  cliente. Al 2 de octubre de 2026 el club confirmó que hoy toma todos los turnos
  por WhatsApp, me pasaron el contacto del encargado y falta la reunión para
  mostrárselo. Once Unidos es el próximo.
- **Español rioplatense, de vos**, en todo: textos del sitio, comentarios,
  nombres de variables y funciones, mensajes de commit.
- **Nada inventado.** Lo que el club no confirmó se marca con `⚠️ VERIFICAR` en
  la configuración. Si es un dato que se ve en el sitio (un mail, un precio),
  queda en `null` y el sitio no lo muestra: mejor un dato de menos que uno falso.
- **Si hay una sola opción, no se pregunta.** Con un solo deporte o una sola
  duración de turno, ese paso de la reserva se saltea solo.
- **Al dueño se le muestra todo andando**: el sitio, una reserva de punta a punta
  y el panel del club. Para eso está la vista previa, que se abre con doble clic
  y anda sin internet.
- A la reunión llevo una **propuesta** (HTML y PDF), una **cartilla de precios
  interna** y, a veces, una **planilla** que me arma Cowork a partir de un prompt.

## 2. Qué hace el sistema

1. **Sitio público**: el club, las canchas, la escuela, los servicios, la
   ubicación y los horarios, con la disponibilidad del día en la portada.
2. **Reserva online**: día → horario → cancha (o "la que esté libre") → datos →
   confirmación con un código de turno (`LN-7K3QP`) y un `.ics` para agendarlo.
   La grilla muestra en vivo qué canchas quedan libres.
3. **Cuentas de jugador**, opcionales: teléfono y contraseña. Con la cuenta
   abierta se reserva sin escribir datos y se ven los turnos y el historial. Al
   registrarse, los turnos que ya había sacado con ese teléfono pasan a su cuenta.
4. **Mis turnos**: quien no tiene cuenta consulta y cancela con su teléfono y el
   código.
5. **Panel del club**: grilla del día por cancha, turnos del día con resumen
   (turnos, bloqueos, horas vendidas), bloqueo de canchas (mantenimiento, clases,
   torneos), cancelación de cualquier turno, un usuario para cada persona del
   club y una bitácora de quién hizo qué.

## 3. Cómo está hecho

### Stack

- **Node 22.5 o más, sin dependencias**: `node:http`, `node:sqlite`
  (`DatabaseSync`), `node:crypto`, `node:test`. Ni `npm install` ni build.
  Módulos ES.
- **HTML, CSS y JavaScript sin frameworks** en el navegador.
- **Un solo archivo SQLite** (`data/turnos.db`, modo WAL). Para respaldar alcanza
  con copiarlo.

```
server/config.js     Datos del club, canchas, horarios y reglas ← lo único que se edita para adaptar
server/tiempo.js     Fechas y horas en la zona horaria del club
server/db.js         Esquema SQLite, transacciones y consultas
server/turnos.js     Disponibilidad, validaciones, alta, bloqueos y cancelaciones
server/cuentas.js    Registro, ingreso, sesiones, claves y personal del club
server/api.js        Rutas JSON
server/index.js      Servidor HTTP y archivos estáticos
server/seed.js       Turnos de ejemplo para ver el panel lleno
server/test.js       Pruebas (node:test)
public/              index, reservar, mis-turnos, cuenta, admin y 404, más css/, js/ y assets/
herramientas/        armar-vista-previa.mjs (el sitio en un solo HTML) · armar-pdf.mjs (HTML → PDF)
propuesta/           Propuesta para el club (HTML y PDF) y el prompt de la planilla de Cowork
cartilla/            Cartilla de precios: documento INTERNO, no va al club
```

Comandos: `npm start` (http://localhost:3000), `npm run dev` (se reinicia al
guardar), `npm test`, `node server/seed.js --limpiar` y `npm run vista-previa`.
Variables de entorno: `PORT`, `HOST`, `ADMIN_TOKEN` y `DB_PATH`.

### `server/config.js`, la única fuente de verdad

Todo lo que cambia de un club a otro vive ahí, y el navegador lo recibe por
`GET /api/config`. Si el club suma una cancha, se cambia un número y el sitio,
la grilla y el panel se acomodan solos.

| Bloque | Qué define |
| --- | --- |
| `CLUB` | Nombre, claim, dirección, coordenadas, teléfono, WhatsApp (para wa.me: 54 + 9 + área sin el 0 + número sin el 15), mail, redes, dominio y zona horaria |
| `HORARIOS` | Apertura y cierre por día de la semana. `cierra` es el cierre del complejo: un turno se ofrece sólo si **termina** antes |
| `FERIADOS` | Fechas en que no se reserva |
| `DISCIPLINAS` | Cada deporte: slug, nombre, ícono, `duraciones` en minutos, duración por defecto, jugadores y precios por duración |
| `CANCHAS` | Cada cancha: id, nombre, disciplina, superficie, techada, gradas y orden |
| `RESERVAS` | Casillero de 30 min, 14 días de anticipación, 60 min de antelación para turnos de hoy, cancelación hasta 6 h antes, 3 turnos activos por teléfono, 10 altas por IP por hora y asignación automática de cancha |
| `PRECIOS_PUBLICADOS` | En `false` hasta tener tarifas reales: mientras tanto el sitio muestra "Consultar" |
| `SERVICIOS`, `PROGRAMAS` | Lo que se muestra en la home. Sólo lo que es del club |
| `CUENTAS` | Clave de 8 caracteres como mínimo, sesión de 30 días y freno a los 8 intentos fallidos en 15 min |
| `ADMIN`, `SERVIDOR` | Llave maestra, puerto y ruta de la base, desde variables de entorno |

### Cómo se evita la doble reserva

Cada turno ocupa casilleros de 30 minutos en la tabla `ocupacion`, cuya clave
primaria es `(cancha_id, fecha, slot)`. Dos turnos no pueden ocupar el mismo
casillero de la misma cancha: el segundo choca contra la base y recibe un `409`.
El alta corre en una transacción `BEGIN IMMEDIATE`, así que la regla se cumple
aunque lleguen dos pedidos en el mismo instante. Los bloqueos del club usan el
mismo mecanismo (`tipo = 'bloqueo'`), y cancelar libera los casilleros.

Las fechas van como `'YYYY-MM-DD'` y las horas como minutos desde la medianoche,
todo anclado a `America/Argentina/Buenos_Aires` con `Intl.DateTimeFormat`: el
servidor puede estar en cualquier zona horaria.

### Cuentas y seguridad

- El **teléfono es el usuario**: es el dato que el jugador ya usa para reservar.
  Se normaliza a dígitos, sin el 0 ni el 54 de adelante.
- Contraseñas con **scrypt** de `node:crypto` (N=16384, r=8, p=1, sal al azar),
  comparadas con `timingSafeEqual`. Un teléfono sin cuenta tarda lo mismo que una
  clave equivocada (hay un hash señuelo), para no delatar quién tiene cuenta.
- La sesión es un token al azar en una cookie **HttpOnly y SameSite=Lax**, con
  `Secure` sólo si la visita llegó por HTTPS (también detrás de un proxy, por
  `x-forwarded-proto`). En la base queda el **sha256 del token**, no el token.
- **8 intentos fallidos** por teléfono y por IP frenan el ingreso 15 minutos. El
  conteo vive en memoria.
- Cambiar la contraseña **cierra las otras sesiones**.
- Con la sesión abierta, **el turno sale a nombre de la cuenta**, no de lo que
  diga el formulario.
- Si un teléfono **tiene cuenta**, sus turnos no se ven escribiendo el número:
  hay que entrar. Si no, cualquiera que lo conozca vería a qué hora juega.
- Registrarse con un teléfono que ya tiene cuenta **no pisa la contraseña**.

### Quién entra al panel del club

- **Cada persona con su cuenta**: es la misma tabla `usuarios`, con `rol` en
  `'jugador'` o `'club'`. El dueño que además juega usa una sola cuenta.
- **La llave maestra** (`ADMIN_TOKEN`, por `Authorization: Bearer`) sirve para
  arrancar —alguien tiene que cargar a la primera persona— y como salida de
  emergencia. Mientras no hay personal cargado, el panel lo avisa. **Antes de
  publicar hay que definir `ADMIN_TOKEN`**: con la clave por defecto cualquiera
  entra, y el panel muestra un cartel de aviso.
- Dar de alta a alguien que ya juega **no le cambia la contraseña**: entra con la
  suya. Darle de baja lo devuelve a jugador, con sus turnos, y le cierra las
  sesiones. Nadie se puede sacar el acceso a sí mismo.
- La **bitácora** anota ingresos, cancelaciones, bloqueos y altas y bajas de
  personal: quién, cuándo y sobre qué.

### API

| Ruta | Para qué |
| --- | --- |
| `GET /api/config` | Club, disciplinas, canchas, reglas y calendario |
| `GET /api/disponibilidad?fecha=&disciplina=&duracion=` | Horarios con las canchas libres |
| `POST /api/reservas` | Crear un turno |
| `GET /api/reservas?telefono=&codigo=` | Consultar turnos (con sesión, los de la cuenta) |
| `POST /api/reservas/cancelar` | Cancelar con código y teléfono, o con la sesión |
| `POST /api/cuenta/registro`, `ingreso`, `salir`, `perfil`, `clave` · `GET /api/cuenta` | Cuentas de jugador |
| `POST /api/admin/sesion` | Entrar al panel |
| `GET /api/admin/dia?fecha=` · `GET /api/admin/agenda?desde=&hasta=` | Grilla del día · turnos de un rango (todavía sin pantalla) |
| `POST /api/admin/bloqueos` · `POST /api/admin/cancelar` | Bloquear una cancha · cancelar cualquier turno |
| `GET` y `POST /api/admin/personal` · `POST /api/admin/personal/baja` | Personal del club |
| `GET /api/admin/movimientos` | Bitácora |

### La vista previa offline

`herramientas/armar-vista-previa.mjs` empaqueta todo el sitio en **un solo HTML**
(`vista-previa/index.html`) que se abre con doble clic. Usa el CSS y el
JavaScript reales y reemplaza `window.fetch` por un simulador del servidor que
corre en el navegador y guarda en `localStorage`. Trae el panel del club con
turnos y personal de demostración: teléfono **223 555-1212**, contraseña
**demo1234** (también sirve `demo1234` como llave maestra). Lo que se reserva ahí
no le llega a nadie, y un cartel lo aclara. Se regenera con `npm run
vista-previa` cada vez que cambian textos, estilos o configuración.

Ojo al tocar el armador: el código del simulador va dentro de un template
literal, así que **cada `${` va como `\${` y cada backtick como `` \` ``**. Y los
scripts de las páginas no pueden dar por sentado que existe todo: el armador
saca, por ejemplo, el botón de agendar en el calendario.

### Pruebas

`npm test`: 29 pruebas con `node:test`, sobre una base temporal que no toca la
real. Cubren disponibilidad, doble reserva y solapamiento parcial, validaciones,
topes por teléfono y por IP, cancelaciones, panel, cuentas, sesiones, fuerza
bruta, privacidad, personal, bitácora y que el servidor HTTP levante. Reservan
contra el **próximo miércoles**, no contra "mañana", para no depender del día en
que se corren.

### Publicar

Necesita un **hosting con Node** (Railway, Render, Fly.io o un VPS):
`ADMIN_TOKEN='una-clave-larga' PORT=3000 npm start`. Detrás de Nginx o Caddy hay
que pasar `X-Forwarded-For` (para los topes por IP) y `X-Forwarded-Proto` (para
la cookie segura). Un hosting compartido sin Node sirve sólo para el sitio: las
páginas muestran el camino por WhatsApp en lugar de la grilla.

### Diseño de Los Naranjos (no copiarlo)

Negro `#0B0C0E`, papel `#F7F4EF`, naranja `#FF6B14` y verde cancha `#0E6B4F`;
títulos en **Archivo** y texto en **Inter** (Google Fonts); íconos en un sprite
SVG incrustado en cada página. Los colores están en el bloque `:root` de
`public/css/base.css`. **Once Unidos necesita su propia identidad**: sus colores
y su escudo, no la estética de Los Naranjos.

## 4. Venta

### Lo que llevo a la reunión

- **Propuesta** (`propuesta/index.html`, y en PDF de 11 páginas con
  `node herramientas/armar-pdf.mjs propuesta/index.html salida.pdf`). Recorre: el
  problema ("que la cancha se reserve sola, a cualquier hora"), las piezas del
  sistema, cómo se reserva, el panel, los problemas que evita, cómo se adapta al
  club, qué no hace todavía, qué hace falta del club, del sí a la primera
  reserva y cómo probarlo antes de decidir. **No lleva precios.**
- **Cartilla** (`cartilla/index.html`), **interna**: recomendación, tres
  opciones, qué cubre el abono, costos y margen, piso de negociación,
  objeciones, guion de la reunión y una última hoja con las condiciones para el
  cliente, que imprime aparte.
- **Prompt para Cowork** (`propuesta/prompt-planilla-cowork.md`): pide una
  planilla .xlsx de seis hojas (Propuesta, Qué incluye, Las canchas, Datos que
  necesitamos, Condiciones y una calculadora contra las plataformas que cobran
  comisión). Nunca lleva el piso ni el margen.
- **La vista previa** en la notebook, por si no hay wifi.

### Precios de Los Naranjos (octubre de 2026, US$1 = $1.560)

Todavía no hablé de números con ellos.

| Opción | Armado | Abono | Primer año |
| --- | --- | --- | --- |
| **A, la recomendada**: armado y abono, sin permanencia | $650.000 | $90.000 | $1.730.000 |
| B, sin desembolso grande, con 12 meses de permanencia | $350.000 | $125.000 | $1.850.000 |
| C, sólo el sitio, con las reservas por WhatsApp | $400.000 | $35.000 | $820.000 |

- El armado se cobra mitad al arrancar y mitad al publicar. El abono se cobra
  desde que el sistema sale al aire y se ajusta cada 3 meses.
- Opcionales: seña con Mercado Pago $240.000, inscripción a escuela y torneos
  $160.000, logo vectorial $120.000, media hora extra de capacitación $35.000.
- Mis costos: servidor ≈ $12.000/mes y dominio .com.ar $8.500/año. Me quedan
  ≈ $77.290 por mes por club.
- Piso: $550.000 de armado y $75.000 de abono. Si aprietan, se sacan cosas; no
  se baja el precio.
- **Por qué poco armado y más abono**: es más fácil decir que sí, y a la larga
  deja más plata. Lo mensual es lo que se suma de cliente en cliente.
- Mercado (septiembre de 2026): web institucional desde $250.000; web con
  sistema de reservas, de $600.000 a $1.300.000; mantenimiento, de $25.000 a
  $150.000 por mes.

**Para Once Unidos no se copian estos números**: con más deportes, más canchas y
más gente usando el panel, hay que recalcularlos.

### Objeciones y guion

- *"Hay apps de reservas gratis"*: cobran por reserva. Playtomic se lleva el 4%
  de cada turno con tope de €1,99, más una cuota de software. Hacer la cuenta en
  la mesa: turnos por mes × 4% del precio del turno. Y decir lo honesto: esas
  plataformas traen jugadores nuevos y este sistema no; lo que hace es que los
  que ya tienen no esperen a que alguien conteste el WhatsApp.
- *"Ya tenemos el WhatsApp"*: el sistema no lo reemplaza; se lo saca de encima
  al del mostrador y toma reservas a las 2 de la mañana.
- *"Mi sobrino me hace una página"*: una página sí, el sistema no. Mostrar el
  panel, no la home.
- *"Dejalo andando y si funciona te pagamos"*: no. Si hay que ceder, se cede en
  la forma de pago (el armado en tres veces), nunca en cobrar después.
- Guion: que el problema lo digan ellos → la home en el celular → una reserva de
  punta a punta → el panel → la propuesta impresa → la cartilla, opción A
  primero, y callarse después de decir el número → cerrar con la lista de datos
  que faltan.

## 5. Lo que aprendí con Los Naranjos

**Con los datos del club**

- Casi todo lo que salió de internet hubo que corregirlo: la cantidad de canchas
  (eran 7, no 4), qué servicios eran del club (el gimnasio y las canchas de
  fútbol del mismo predio son de otros dueños), cuánto dura un turno (todos de
  90; los de 60 son clases con profesor), que las clases particulares son de 1 a
  4 jugadores y que hay una cancha central con gradas. **Preguntar primero,
  construir después.**
- No atribuirle al club lo que es de otros, aunque esté en el mismo predio.
- Buscar los datos que se contradicen: en Los Naranjos, un turno de 90 minutos
  que arranca a las 22:30 no entra en un cierre a las 23:30. O cierran más tarde,
  o el sistema está tirando el último turno del día.
- El Instagram del club es la mejor fuente pública, y aun así hay que confirmar.

**Con el código**

- Una prueba que depende del día en que se corre no prueba nada: fallaban los
  sábados porque el domingo abre más tarde.
- Si cambia la duración de los turnos, revisar las pruebas que suponen qué cancha
  queda libre: con asignación automática, un turno más largo cae en otra cancha.
- En el armador de la vista previa: escapar `${` y los backticks, y no usar una
  `const` antes de la línea donde se declara.
- En las sesiones de Claude Code en la nube, el contenedor se puede reiniciar y
  perder lo que no se subió (commitear y pushear seguido); `pkill -f` puede matar
  la propia terminal; y si `node_modules` es un enlace simbólico, en
  `.gitignore` va sin barra final.

## 6. Qué cambia con Once Unidos

### Lo que el motor ya resuelve con sólo configurar

- **Varios deportes**: cada uno en `DISCIPLINAS`, con sus canchas en `CANCHAS`,
  sus duraciones y sus precios. El paso "deporte" aparece solo cuando hay más de
  uno, y el de duración cuando un deporte tiene más de una.
- Cantidad, nombre, superficie y techo de cada cancha; una "central" con gradas.
- Horarios por día, feriados, anticipación, cancelación y topes.

### Lo que pide tocar código, si el club lo necesita

- **Una cancha para varios deportes** (un polideportivo para básquet, vóley y
  futsal): hoy cada cancha tiene una sola `disciplina`. Se pasa a
  `disciplinas: [...]` y se filtra con `includes`. Como la ocupación ya es por
  cancha, un turno de básquet bloquea el vóley en ese horario sin hacer nada más.
- **Horarios por deporte o por instalación**: hoy `HORARIOS` vale para todo el
  club.
- **Precio de socio y de no socio**: hoy hay un precio por deporte y duración.
- **Turnos fijos semanales** para los grupos de siempre.
- **Seña con Mercado Pago** y **avisos por WhatsApp o mail** (estos necesitan un
  servicio de envío).
- La **agenda** de varios días tiene ruta en el API pero no pantalla en el panel.

### Lo que dice "Los Naranjos" fuera de `config.js`

| Qué | Dónde |
| --- | --- |
| Prefijo `LN-` de los códigos de turno | `server/db.js`, `server/test.js`, ejemplos en `public/mis-turnos.html` y `public/reservar.html`, armador de la vista previa |
| Cookie `ln_sesion` | `server/cuentas.js`, `server/test.js` |
| Claves `naranjos:*` de `localStorage` y de eventos | `public/js/*.js`, armador de la vista previa |
| Llave maestra por defecto `naranjos-dev` | `server/config.js` |
| Deporte por defecto `padel` | `server/api.js`, `server/seed.js` y el armador; la portada pide `disciplina=padel&duracion=90` fijo (`public/index.html`) |
| Nombre del club en el `.ics` (PRODID, UID, título y alarma) | `public/js/reservar.js` |
| Textos, metadatos y logo | todos los `public/*.html`, `site.webmanifest`, `robots.txt`, `assets/marca.svg`, `assets/favicon.svg` y los comentarios de los CSS |
| Nombre y descripción | `package.json` |

Lo prolijo es que todo eso salga de `CLUB` en `config.js` (un prefijo para los
códigos, un identificador del club para la cookie y las claves): así el próximo
club se adapta tocando un solo archivo.

## 7. Qué preguntarle a Once Unidos

- ¿Qué deportes alquilan por turno? ¿Cuántas canchas de cada uno, cómo se
  llaman, son techadas, qué piso tienen? ¿Alguna sirve para más de un deporte?
- ¿Cuánto dura el turno de cada deporte? ¿Qué cosas no se reservan online
  (escuelas, clases, entrenamientos de las divisiones)?
- ¿Qué horario tiene cada instalación, cada día? ¿Cambia en verano?
- ¿Precios por deporte y por duración? ¿Distintos para socios? ¿Hay horario pico?
- ¿Cobran seña? ¿Con cuánta anticipación se puede cancelar?
- ¿Cómo toman los turnos hoy y quién los toma? ¿Quiénes usarían el panel?
- Dirección, teléfono, WhatsApp de reservas, mail, redes y dominio.
- Escudo en vector, colores oficiales y fotos.
- ¿Qué servicios del predio son del club y cuáles están concesionados (bar,
  gimnasio, pileta)?

## 8. Por dónde arrancar

1. Copiar `base-los-naranjos/` a una carpeta nueva con el nombre del proyecto
   (por ejemplo `once-unidos/`).
2. Correr `npm test` para confirmar que la base anda en la máquina nueva.
3. Sacar lo de Los Naranjos que no es configuración (tabla de la sección 6),
   idealmente pasándolo a `CLUB`.
4. Cargar en `config.js` lo que se sepa del club, todo con `⚠️ VERIFICAR`.
5. Identidad visual nueva en `public/css/base.css` y en los HTML, y textos nuevos.
6. Regenerar la vista previa y armar la propuesta y la cartilla de Once Unidos a
   partir de las de Los Naranjos.
