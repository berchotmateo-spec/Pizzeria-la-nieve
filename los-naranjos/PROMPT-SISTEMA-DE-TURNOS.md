# Prompt para armar un sistema de turnos (como el de Los Naranjos)

Para pegar como primer mensaje en un proyecto nuevo. Antes, completá lo que está
entre corchetes en la parte de "El negocio". Lo que no sepas, dejalo con el
corchete: el prompt le pide que no lo invente y que lo marque para confirmar.

Si además tenés el código de Los Naranjos (el .zip, o la carpeta
`los-naranjos/`), adjuntalo y agregá al final del prompt: "Tenés el código de
Los Naranjos adjunto: partí de ahí y adaptalo, no lo escribas de cero."

---

```
Quiero que armes un sitio web con sistema de turnos online propio para un
negocio. Es para venderlo como servicio: un pago de armado más un abono
mensual. Ya hice uno igual para un club de pádel (Los Naranjos, Mar del Plata)
y quiero que este se arme de la misma manera. Abajo están los datos del
negocio, cómo trabajo, qué tiene que hacer el sistema y cómo está construido.

=== EL NEGOCIO ===

- Nombre: [NOMBRE]
- Rubro: [club de pádel / complejo de fútbol 5 / consultorio / peluquería / …]
- Dirección: [CALLE Y NÚMERO, CIUDAD]
- Qué se reserva y cuántos: [ej.: 4 canchas de fútbol 5, 2 de pádel]
  (si alguno sirve para más de una actividad, decilo)
- Duración de los turnos: [ej.: 60 min fútbol, 90 min pádel]
- Horarios: [día por día, apertura y cierre]
- Precios: [por actividad y duración, si los sé]
- ¿Cobran seña? [sí / no / no sé] · Monto: [fijo o porcentaje]
- Cómo toman los turnos hoy: [WhatsApp / teléfono / planilla / otra app]
- Contacto: [teléfono, WhatsApp de reservas, mail, Instagram]
- Lo que NO es del negocio aunque esté en el mismo lugar: [ej.: el bar está
  concesionado]

=== CÓMO TRABAJO ===

- Todo en español rioplatense, de vos: textos del sitio, comentarios del
  código, nombres de variables y funciones, mensajes de commit.
- Nada inventado. Lo que no está confirmado se marca con ⚠️ VERIFICAR en la
  configuración, y si es un dato que se ve en el sitio (un mail, un precio),
  queda en null y el sitio no lo muestra. Mejor un dato de menos que uno falso.
  Antes de construir mucho, haceme la lista de lo que hay que preguntarle al
  negocio: con Los Naranjos casi todo lo que salió de internet estaba mal (la
  cantidad de canchas, qué servicios eran del club y cuáles de otros dueños
  del mismo predio, cuánto duraba un turno).
- Si hay una sola opción, no se pregunta: con una sola actividad o una sola
  duración, ese paso de la reserva se saltea solo.
- Al dueño se le muestra todo andando: el sitio, una reserva de punta a punta
  y el panel. Para eso necesito una vista previa que se abra con doble clic y
  funcione sin internet.
- Explicame lo que hacés en criollo, sin jerga. Lo técnico va en el código y
  en el README.
- Commiteá y pusheá seguido: el entorno se puede reiniciar y perder lo que no
  se subió.

=== QUÉ TIENE QUE HACER ===

1. Sitio público: el negocio, lo que se reserva, servicios, ubicación,
   horarios, tarifas (ocultas como "Consultar" hasta tener las reales) y la
   disponibilidad del día en la portada.
2. Reserva online: actividad → día → duración → horario → recurso (o "el que
   esté libre") → datos → pago → confirmación con un código corto (tipo
   AB-7K3QP), botón para agendarlo (.ics) y para avisar a los demás por
   WhatsApp. La grilla muestra en vivo qué queda libre. Funciona en celular.
3. Cuentas opcionales: teléfono y contraseña. Con la cuenta se reserva sin
   escribir datos y se ven los turnos y el historial. Al registrarse, los
   turnos que ya había sacado con ese teléfono pasan a su cuenta. Quien no
   quiera cuenta reserva igual, como visitante.
4. "Mis turnos": quien no tiene cuenta consulta y cancela con teléfono y código.
5. Panel del negocio: grilla del día (recursos en filas, horarios en columnas),
   tabla de turnos del día, resumen (turnos, horas vendidas, ocupación, cobrado
   online), bloqueos (mantenimiento, clases, torneos), cancelar cualquier
   turno, un usuario por persona del equipo, bitácora de quién hizo qué,
   "Pagos para revisar" y "Reservar para un cliente" (los turnos que piden por
   WhatsApp, que se cobran en el mostrador).
6. Pagos con Mercado Pago (si cobran seña): el cliente paga la seña o el turno
   entero, y el turno queda firme recién cuando entra la plata, que va directo
   a la cuenta del negocio.

=== CÓMO ESTÁ CONSTRUIDO ===

Stack
- Node 22.5 o más SIN DEPENDENCIAS: node:http, node:sqlite (DatabaseSync),
  node:crypto, node:test, fetch nativo. Sin npm install, sin build, módulos ES.
  Mercado Pago tiene SDK, pero no hace falta: son cuatro llamadas HTTP.
- Navegador: HTML, CSS y JavaScript sin frameworks.
- Un solo archivo SQLite (data/turnos.db, modo WAL, busy_timeout). Respaldar
  es copiarlo.

Carpetas
  server/config.js    Datos del negocio y reglas: lo ÚNICO que se toca para adaptar
  server/tiempo.js    Fechas y horas en la zona horaria del negocio
  server/db.js        Esquema, migraciones, transacciones y consultas
  server/turnos.js    Disponibilidad, validaciones, alta, bloqueos, cancelaciones
  server/cuentas.js   Registro, ingreso, sesiones, claves y personal
  server/pagos.js     Cobro: montos, apartado, confirmación, vencimiento, devoluciones
  server/pasarela.js  Lo único que habla con Mercado Pago (y la pasarela de prueba)
  server/api.js       Tabla de rutas 'MÉTODO /ruta' → función
  server/index.js     Servidor HTTP, archivos estáticos, cabeceras de seguridad
  server/seed.js      Turnos de ejemplo para ver el panel lleno
  server/test.js      Pruebas
  public/             index, reservar, mis-turnos, cuenta, admin, pago-simulado, 404,
                      css/ (base, site, app), js/ (comun + uno por página), assets/
  herramientas/armar-vista-previa.mjs  El sitio entero en un solo HTML
  herramientas/armar-pdf.mjs           HTML → PDF con Playwright (para la propuesta)
Las URLs van limpias: /reservar sirve reservar.html. El servidor no deja salir
de public/ y responde 405 a métodos que no son GET o HEAD fuera del API.

config.js, la única fuente de verdad (el navegador la recibe por GET /api/config)
- NEGOCIO: nombre, claim, dirección, coordenadas, teléfono, WhatsApp (para wa.me:
  54 + 9 + área sin 0 + número sin 15), mail, redes, dominio, zona horaria.
- HORARIOS por día de la semana. "cierra" es el cierre del lugar: un turno se
  ofrece sólo si TERMINA antes. FERIADOS por fecha.
- ACTIVIDADES: slug, nombre, ícono, duraciones en minutos, duración por
  defecto, precios por duración.
- RECURSOS (canchas, consultorios…): id, nombre, actividad, atributos (techada,
  superficie, "central"), orden. Si se suma uno, se cambia un número y el
  sitio, la grilla y el panel se acomodan solos.
- RESERVAS: casillero de 30 min, 14 días de anticipación, 60 min de antelación
  para turnos de hoy, cancelación hasta 6 h antes, 3 turnos activos por
  teléfono, 10 altas por IP por hora, asignación automática del recurso.
- PRECIOS_PUBLICADOS en false hasta tener precios reales.
- PAGOS: seña { tipo: 'fijo' | 'porcentaje', valor }, opciones ['seña',
  'total'], obligatorio, minutosParaPagar (15), descriptor de la tarjeta.
- CUENTAS: clave de 8 como mínimo, sesión de 30 días, freno a los 8 intentos
  fallidos en 15 min. ADMIN y SERVIDOR desde variables de entorno.
- Nada con el nombre del negocio escrito a mano fuera de config.js: el prefijo
  de los códigos, la cookie y las claves de localStorage también salen de ahí.

La doble reserva, imposible por construcción
- Cada turno ocupa casilleros de 30 min en la tabla "ocupacion", con clave
  primaria (recurso_id, fecha, slot) WITHOUT ROWID. El alta corre en una
  transacción BEGIN IMMEDIATE: si dos piden el mismo casillero en el mismo
  instante, el segundo choca contra la base y recibe 409, y el navegador
  recarga la grilla. Los bloqueos usan el mismo mecanismo (tipo 'bloqueo') y
  cancelar libera los casilleros.
- Si un recurso sirve para varias actividades, va con una lista de actividades
  y se filtra con includes: como la ocupación es por recurso, un turno de una
  bloquea las otras sin hacer nada más.
- Fechas como 'YYYY-MM-DD' y horas como minutos desde la medianoche, todo
  anclado a la zona del negocio con Intl.DateTimeFormat
  (America/Argentina/Buenos_Aires): el servidor puede estar en cualquier lado.
- Código de turno: prefijo + 5 caracteres de un alfabeto sin 0/O ni 1/I.

Cuentas y seguridad
- El teléfono es el usuario, normalizado a dígitos sin 0 ni 54 adelante.
- Claves con scrypt de node:crypto (N=16384, r=8, p=1, sal al azar), comparadas
  con timingSafeEqual. Un teléfono sin cuenta tarda lo mismo que una clave
  equivocada (hash señuelo), para no delatar quién tiene cuenta.
- Sesión: token al azar en cookie HttpOnly, SameSite=Lax, Secure sólo si llegó
  por https (también detrás de proxy, por x-forwarded-proto). En la base va el
  sha256 del token, no el token.
- 8 intentos fallidos por teléfono y por IP frenan 15 minutos (en memoria).
- Cambiar la clave cierra las otras sesiones.
- Con sesión abierta, el turno sale a nombre de la cuenta, no del formulario.
- Si un teléfono tiene cuenta, sus turnos no se ven escribiendo el número: hay
  que entrar. Registrarse con un teléfono que ya tiene cuenta no pisa la clave.
- Todo lo que entra al HTML con innerHTML pasa por una función esc().
- Cabeceras: x-content-type-options nosniff, referrer-policy, x-frame-options.
  Cuerpo de los pedidos con límite (32 kB).

Personal del negocio
- Misma tabla de usuarios con rol 'cliente' o 'equipo' (en Los Naranjos,
  'jugador' y 'club'): el dueño que además juega usa una sola cuenta.
- ADMIN_TOKEN es una llave maestra (Authorization: Bearer) para arrancar —
  alguien tiene que cargar a la primera persona— y como salida de emergencia.
  Con la clave por defecto, el panel muestra un cartel de aviso.
- Dar de alta a alguien que ya tiene cuenta no le cambia la clave. Darle de
  baja lo devuelve a cliente y le cierra las sesiones. Nadie se saca el acceso
  a sí mismo.
- Bitácora: ingresos, cancelaciones, bloqueos, altas y bajas, reservas para
  clientes, devoluciones y lo que detecta el sistema solo ("Sistema").
- El personal reserva para un cliente: nombre y teléfono del formulario, sin
  pago online ("lo cobra el mostrador"), sin los topes por teléfono e IP. Si
  el teléfono tiene cuenta, el turno aparece en esa cuenta.

Pagos con Mercado Pago (Checkout Pro por la API REST)
- POST /checkout/preferences con items (unit_price desde la config, ARS),
  external_reference = código del turno, back_urls a /reservar?pago=CÓDIGO,
  auto_return 'approved', binary_mode true, sin efectivo
  (excluded_payment_types ticket y atm), una cuota, expires con
  expiration_date_to en formato con desfase (…-03:00), statement_descriptor.
  notification_url sólo si la dirección es https (localmente no la hay).
  Escrituras con X-Idempotency-Key.
- Un turno que se paga nace 'pendiente' y ocupa sus casilleros hasta vence_en
  (minutos para pagar + 5 de changüí). Si entra el pago pasa a 'confirmada';
  si no, a 'vencida' y se libera. Los apartados vencidos se sueltan dentro de
  la transacción que crea un turno nuevo y, además, cada minuto. Mientras
  tanto, la consulta de disponibilidad ya los ignora. Los pendientes cuentan
  para el tope por teléfono.
- SÓLO la API (GET /v1/payments/{id}, consultada con la credencial del
  negocio) confirma un pago: aprobado, en pesos y por al menos lo mínimo (la
  seña). El aviso de Mercado Pago y la vuelta del cliente (?status=approved)
  sólo dicen qué pago ir a mirar.
- Firma del aviso (x-signature "ts=…,v1=…"): HMAC-SHA256 con la clave secreta
  sobre "id:<data.id>;request-id:<x-request-id>;ts:<ts>;", con el data.id de
  la URL en minúsculas y omitiendo lo que no llegó. Firma mal → 401. Sin
  firma se acepta (la consulta a la API protege) pero con tope por IP; 429
  para que Mercado Pago reintente. El cuerpo del aviso se lee tolerante.
- Tabla "pagos" con clave única (proveedor, id del pago): un aviso repetido
  cuenta una vez.
- Casos raros, sin resolverlos solos: pagó con el apartado vencido → si el
  recurso sigue libre, se recupera; si no, queda en "Pagos para revisar". Lo
  mismo un pago repetido, uno por menos de lo pedido o uno de un turno
  cancelado. Devolver: POST /v1/payments/{id}/refunds con clave de
  idempotencia fija por pago (dos clics, una devolución).
- Pasarela de prueba con PAGOS_SIMULADOS=si: una pantalla propia
  (/pago-simulado, con la estética del sitio, NO imitando a Mercado Pago) para
  aprobar o rechazar, que recorre el mismo camino que un pago real. Nunca se
  prende por descarte: con el sitio publicado, cualquiera confirmaría turnos
  sin pagar.
- La dirección de vuelta sale de URL_PUBLICA o, si no está, del host por el
  que entró el cliente (con x-forwarded-proto).
- Tope por IP a todo lo público que dispare consultas a la API (vuelta,
  reintento, aviso sin firma).
- La vuelta del pago muestra cada desenlace: aprobado (ticket), rechazado (con
  el motivo de Mercado Pago en criollo, reintentar con la misma opción o la
  otra, o soltar el turno), procesando (consulta cada 4 s), vencido.
- Variables: MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, URL_PUBLICA, PAGOS_SIMULADOS.
  El token nunca va al navegador ni al repositorio.
- Mientras falten los montos, esa opción no se ofrece; sin ninguna, se reserva
  como antes, sin pago.

Vista previa offline (herramientas/armar-vista-previa.mjs)
- Empaqueta todo el sitio en un solo HTML que se abre con doble clic: usa el
  CSS y el JS reales, las páginas como "vistas" que se muestran y ocultan, y
  reemplaza window.fetch por un simulador del servidor que corre en el
  navegador con las mismas reglas y guarda en localStorage.
- Turnos de demostración con nombres y pagos, generados con una semilla por
  fecha (la misma fecha da siempre la misma grilla).
- El panel entra con datos de prueba que se muestran en pantalla, y los pagos
  usan la pantalla de prueba con montos de ejemplo marcados como de ejemplo.
- Una cinta arriba aclara que es una vista previa y que nada llega al negocio.
- Opción --fragmento sin el envoltorio <html>, para publicarla como página.
- Ojo: el código del simulador va dentro de un template literal, así que cada
  ${ va como \${, cada backtick como \` y cada barra invertida doble. Conviene
  escribirlo como JavaScript normal y escaparlo con una función. Y los
  scripts de las páginas no pueden dar por sentado que existe todo: el armador
  saca, por ejemplo, el botón del .ics.

Pruebas (npm test, node:test)
- Sobre una base temporal que no toca la real.
- Contra una fecha fija de la semana que viene (el próximo miércoles), NUNCA
  contra "mañana": en Los Naranjos fallaban los sábados porque el domingo abre
  más tarde.
- Un Mercado Pago de mentira (un node:http que levanta la propia prueba) para
  probar preferencias, firma, avisos repetidos, montos, pagos tardíos y
  devoluciones; la pasarela lee su URL de MP_API_URL.
- Cubrir: horarios, doble reserva y solapamiento parcial, validaciones, topes
  por teléfono e IP, cancelaciones, panel con y sin clave, cuentas, sesiones,
  fuerza bruta, privacidad, personal, bitácora, todos los caminos del pago y
  que el servidor HTTP levante.

Publicar
- Hosting con Node (Railway, Render, Fly.io o un VPS). Un hosting compartido
  sin Node sirve sólo para el sitio: si el API no responde, las páginas
  muestran el camino por WhatsApp en lugar de la grilla.
- Detrás de Nginx o Caddy: pasar X-Forwarded-For y X-Forwarded-Proto.
- El servidor avisa al arrancar si la clave del panel es la de fábrica, si los
  pagos están en modo de prueba o si hay montos sin Mercado Pago conectado.

=== EN QUÉ ORDEN ===

1. Relevamiento: la lista de lo que hay que preguntarle al negocio, y todo lo
   dudoso marcado en la config.
2. Config, tiempo, base, turnos, API y servidor, con sus pruebas pasando.
3. Sitio y reserva. Probalos en un navegador de verdad (Playwright), en
   computadora y en celular (375 px, sin scroll horizontal).
4. Mis turnos y cuentas.
5. Panel, personal y bitácora.
6. Pagos, si cobran seña.
7. Vista previa offline, probada también en el navegador.
8. README: cómo se usa, qué se toca para cambiar algo, cómo funciona cada
   parte, API, publicar, y la lista "Pendiente de confirmar con el negocio".
Después de cada paso: pruebas en verde, commit y push.

=== QUÉ ME ENTREGÁS ===

- El código en el repositorio, con las pruebas pasando.
- La vista previa en un solo archivo, y publicada como página para verla desde
  el celular.
- El README con la lista de lo que falta confirmar.
- Al final, en criollo: qué quedó hecho, qué no pudiste probar y por qué, y
  qué tengo que pedirle al negocio.
```
