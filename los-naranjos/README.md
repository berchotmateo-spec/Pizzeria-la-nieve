# Los Naranjos — sitio web y sistema de turnos

Sitio institucional y sistema de reservas online para **Los Naranjos**, club de
pádel de Dorrego 333, Mar del Plata: 7 canchas, todas techadas.

El gimnasio y las canchas de fútbol que aparecen en los directorios están en el
mismo predio, pero los maneja otra gente: el sitio es del pádel y así lo dice.

- **Sitio público** — presentación del club, instalaciones, tarifas y ubicación.
- **Reservas online** — grilla en tiempo real, confirmación al instante y código de turno.
- **Panel del socio** — consultá y cancelá tus turnos con el teléfono y el código.
- **Panel del club** — grilla del día por cancha, cancelaciones y bloqueos.

Está hecho **sin dependencias externas**: sólo Node 22 y su SQLite embebido.
No hay `npm install`, ni build, ni servicios de terceros.

---

## Ver el sitio

Un repositorio guarda archivos, no páginas funcionando. Hay tres formas de ver esto:

### 1. La vista previa, sin instalar nada

`vista-previa/index.html` es el sitio entero en **un solo archivo**: se abre con
doble clic y anda. Se puede navegar, reservar un turno de verdad y después
consultarlo o cancelarlo. El sistema de turnos corre dentro del navegador y los
datos quedan guardados en ese dispositivo, así que **no le llegan al club** —hay
un cartel arriba que lo aclara—. También se puede subir a cualquier hosting
estático o mandar por mail.

No incluye el panel del club (necesita el servidor) ni el botón de agendar en el
calendario.

Para regenerarla después de tocar textos, colores o configuración:

```bash
npm run vista-previa
```

### 2. Corriendo el proyecto

```bash
npm start        # → http://localhost:3000
```

Es el sitio completo, con el sistema de turnos y el panel del club de verdad.

### 3. Publicado en una dirección propia

Ver [Publicar](#publicar), más abajo.

---

## Arrancar

```bash
cd los-naranjos
npm start           # http://localhost:3000
```

| Comando | Qué hace |
| --- | --- |
| `npm start` | Levanta el sitio y el API en el puerto 3000. |
| `npm run dev` | Igual, pero reinicia solo al guardar un archivo. |
| `npm test` | Corre las pruebas del sistema de turnos. |
| `node server/seed.js --limpiar` | Llena la base con turnos de ejemplo para ver el panel. |
| `npm run vista-previa` | Regenera `vista-previa/index.html`, el sitio en un solo archivo. |

Variables de entorno:

| Variable | Para qué | Por defecto |
| --- | --- | --- |
| `PORT` | Puerto del servidor | `3000` |
| `HOST` | Interfaz donde escucha | `0.0.0.0` |
| `ADMIN_TOKEN` | **Clave del panel del club** | `naranjos-dev` |
| `DB_PATH` | Ubicación de la base SQLite | `data/turnos.db` |

> **Antes de publicar el sitio hay que definir `ADMIN_TOKEN`.** Con la clave por
> defecto cualquiera entra al panel; el propio panel muestra un cartel de aviso
> mientras eso no se cambie.

---

## Qué se toca para cambiar algo

Casi todo vive en **`server/config.js`**, que es la única fuente de verdad y alimenta
tanto al sistema de turnos como al sitio:

| Querés cambiar… | Dónde |
| --- | --- |
| Dirección, teléfono, WhatsApp, mail, redes | `CLUB` en `server/config.js` |
| Horarios de apertura por día | `HORARIOS` |
| Feriados y cierres puntuales | `FERIADOS` |
| Deportes, duraciones y precios | `DISCIPLINAS` |
| Cantidad y nombre de las canchas | `CANCHAS` |
| Anticipación, cancelaciones, topes | `RESERVAS` |
| Publicar precios en el sitio | `PRECIOS_PUBLICADOS` |
| Textos de la home | `public/index.html` |
| Colores y tipografías | `public/css/base.css` (bloque `:root`) |

### Publicar las tarifas

Los precios arrancan ocultos: el sitio muestra “Consultar” en vez de números que
podrían estar desactualizados. Para publicarlos:

1. Completá `precios` en cada disciplina de `DISCIPLINAS`.
2. Poné `PRECIOS_PUBLICADOS = true`.

El sitio pasa a mostrar los importes formateados en pesos automáticamente.

---

## Cómo está armado

```
los-naranjos/
├── server/
│   ├── config.js     Datos del club, canchas, horarios y reglas  ← se edita acá
│   ├── tiempo.js     Fechas y horas en zona horaria de Mar del Plata
│   ├── db.js         SQLite: esquema, transacciones y consultas
│   ├── turnos.js     Disponibilidad, validaciones y alta de reservas
│   ├── api.js        Endpoints JSON
│   ├── index.js      Servidor HTTP y archivos estáticos
│   ├── seed.js       Turnos de ejemplo
│   └── test.js       Pruebas
├── public/
│   ├── index.html        Home
│   ├── reservar.html     Flujo de reserva
│   ├── mis-turnos.html   Panel del socio
│   ├── admin.html        Panel del club
│   ├── 404.html
│   ├── css/{base,site,app}.css
│   ├── js/{comun,reservar,mis-turnos,admin}.js
│   └── assets/          Logo, favicon e iconos (la copia maestra del sprite
│                        vive en assets/iconos.svg y va incrustada en cada página)
├── herramientas/
│   └── armar-vista-previa.mjs   Empaqueta el sitio en un solo archivo
├── vista-previa/
│   └── index.html    Generado por `npm run vista-previa` — no editar a mano
├── propuesta/
│   └── index.html    Propuesta comercial para presentarle al club
└── data/turnos.db    Base de datos (no se versiona)
```

### Cómo se evita la doble reserva

Cada turno ocupa casilleros de 30 minutos en la tabla `ocupacion`, cuya clave
primaria es `(cancha_id, fecha, slot)`. Dos personas no pueden tomar el mismo
casillero de la misma cancha: la segunda reserva choca contra la base y recibe
un `409`. El alta corre dentro de una transacción `BEGIN IMMEDIATE`, así que la
regla se cumple aunque entren dos pedidos en el mismo instante.

---

## API

Todo devuelve JSON. Las rutas de administración necesitan `Authorization: Bearer <ADMIN_TOKEN>`.

| Método | Ruta | Para qué |
| --- | --- | --- |
| `GET` | `/api/config` | Datos del club, disciplinas, canchas y reglas |
| `GET` | `/api/disponibilidad?fecha=&disciplina=&duracion=` | Grilla de horarios con canchas libres |
| `POST` | `/api/reservas` | Crear un turno |
| `GET` | `/api/reservas?telefono=&codigo=` | Consultar turnos |
| `POST` | `/api/reservas/cancelar` | Cancelar con código + teléfono |
| `POST` | `/api/admin/sesion` | Validar la clave del panel |
| `GET` | `/api/admin/dia?fecha=` | Grilla y turnos del día |
| `GET` | `/api/admin/agenda?desde=&hasta=` | Turnos de un rango de fechas |
| `POST` | `/api/admin/bloqueos` | Bloquear una cancha |
| `POST` | `/api/admin/cancelar` | Cancelar cualquier turno |

Reglas que aplica el servidor: horarios de apertura, anticipación mínima para
turnos de hoy, tope de días para adelante, duraciones permitidas por disciplina,
máximo de turnos activos por teléfono, límite de altas por IP y hora, y ventana
de cancelación.

---

<a id="publicar"></a>

## Publicar

El proyecto es un servidor Node común: sirve en cualquier VPS, Railway, Render,
Fly.io o una máquina propia.

```bash
ADMIN_TOKEN='una-clave-larga-y-propia' PORT=3000 npm start
```

Detrás de Nginx o Caddy conviene pasar `X-Forwarded-For` para que el límite por
IP funcione bien. La base es un único archivo (`data/turnos.db`): para respaldar,
alcanza con copiarlo.

**Sobre hosting compartido:** un plan de hosting web clásico (tipo Hostinger sin
Node) alcanza para el sitio, pero **no** para el sistema de turnos, que necesita
un proceso Node corriendo. Si se publica sólo la carpeta `public/` como sitio
estático, las páginas siguen funcionando y muestran el camino alternativo por
WhatsApp y teléfono en lugar de la grilla.

---

## Pendiente de confirmar con el club

Los datos se tomaron de fuentes públicas y **hay que verificarlos**. Están todos
marcados con `⚠️ VERIFICAR` en `server/config.js`.

### Lo que ya sabemos

- **No usan ninguna plataforma de reservas.** Desde Instagram mandan a WhatsApp,
  y ahí se arregla cada turno a mano. No hay que migrar nada ni convivir con un
  sistema existente.
- **No tienen sitio web.** Sólo Instagram y WhatsApp. Aparecen en directorios de
  terceros, pero no hay una página propia del complejo.
- **El WhatsApp de reservas es el 223 547-0343** (distinto del fijo). Ya está
  cargado en `CLUB.whatsapp`.
- **El club no publica su horario.** Los últimos turnos que ofrece en Instagram
  son a las 22:00 y a las 22:30, lo que encaja con un cierre a las 23:30: ver la
  explicación en `HORARIOS` dentro de `server/config.js`. Falta la hora de
  apertura, para la que no hay ningún dato propio del club.
- **El club sólo ofrece pádel.** Nada de pickleball ni de fútbol: se sacó del
  sitio, de la configuración y de la propuesta. Son 7 canchas, todas techadas.

### Datos del club

- [x] ~~**Número de WhatsApp** de reservas~~ → 223 547-0343, ya cargado.
- [ ] **Correo** de contacto y reservas. Hasta que lo den, `CLUB.email` va en
      `null` y el sitio no muestra ninguno: es preferible un dato de menos que
      uno inventado.
- [ ] **Instagram**: hay tres cuentas dando vueltas en las búsquedas
      (`@losnaranjos_mdq`, `@padel_los_naranjos`, `@losnaranjospadel`). Hoy está
      cargada la última y hay que confirmar cuál es la del club.
- [ ] **Hora de apertura**: es el dato que falta. El cierre a las 23:30 se deduce
      de los turnos que ofrecen; la apertura (7:30) sale de directorios de terceros.
- [ ] **Dominio** definitivo, para el canónico y los datos estructurados.
- [ ] **Coordenadas** exactas del predio, para el mapa.

### Canchas

- [x] ~~**Cuántas canchas de pádel** hay~~ → 7, todas techadas, ya cargadas.
- [ ] **¿Dan clases y arman torneos?** El sitio tiene una sección de escuela,
      clases particulares y americanos que nadie confirmó. Si no la tienen, se
      saca; si la tienen, hay que cargar días, niveles y cupos.
- [ ] **Cómo se llaman/numeran** las canchas, si tienen nombre propio.
- [ ] **Blindex o muro**: no se sabe la mezcla real, hoy no se distingue por cancha.

### Tarifas y reglas

- [ ] **Precios** por disciplina y duración, y si cambian según el horario o el día.
- [ ] **Valor de las clases** y de la escuela, si es que dan.
- [ ] **Seña**: ¿se cobra al reservar? Si sí, hay que sumar un medio de pago
      (Mercado Pago es lo más directo en Argentina).
- [ ] **Política de cancelación** real (hoy está puesta en 6 horas antes).
- [ ] **Anticipación** con la que se puede reservar (hoy, 14 días).

### Material

- [ ] **Fotos** del club: canchas, vestuarios, bar y la fachada.
      Es lo que más le falta al sitio; hoy la estética se resuelve con tipografía
      y trazados de cancha.
- [ ] **Logo** oficial en vector, si existe. El isotipo actual —una rodaja de
      naranja que también es el plano de una cancha— es una propuesta.

### Decisiones a tomar

- [ ] ¿Hace falta **avisar por WhatsApp o mail** cuando alguien reserva? Eso
      requiere contratar un servicio de envío.
- [ ] ¿Quieren **turnos fijos semanales** para los grupos de siempre?
- [ ] ¿El panel del club lo usa **más de una persona**? Hoy hay una sola clave
      compartida; si hace falta, se puede pasar a usuarios con nombre.

---

## Dónde quedó todo

| Qué | Dónde |
| --- | --- |
| Código | Rama `claude/los-naranjos-paddle-site-rp8ckw`, carpeta `los-naranjos/` |
| Pull request | [Pizzeria-la-nieve#1](https://github.com/berchotmateo-spec/Pizzeria-la-nieve/pull/1) — abierto, sin conflictos |
| Vista previa navegable | [claude.ai/code/artifact/ba140d58](https://claude.ai/code/artifact/ba140d58-7016-41d8-86d2-3780c339446d) (privada) |
| Vista previa descargable | `vista-previa/index.html` en este mismo repositorio |
| Propuesta para el club | `propuesta/index.html`, y publicada en [claude.ai/code/artifact/86d5b927](https://claude.ai/code/artifact/86d5b927-34d2-4c8d-a05f-25179114ee89) (privada) |
| Cartilla económica | `cartilla/index.html` — **documento interno**, y publicada en [claude.ai/code/artifact/b49af6f0](https://claude.ai/code/artifact/b49af6f0-9d1b-41b7-9475-44ef35f4f8c1) (privada) |
| Qué falta averiguar | La lista de acá arriba, "Pendiente de confirmar con el club" |

El proyecto vive en una carpeta propia dentro del repositorio de la pizzería,
así que los dos sitios pueden convivir sin pisarse.

> **Ojo con `cartilla/`.** Es la hoja de precios de trabajo: tiene el piso de
> negociación y el margen. No va en ningún paquete que se le mande al club.

### Los tres pasos siguientes

1. **Completar los datos del club** en `server/config.js` (todo lo marcado con
   `⚠️ VERIFICAR`). Lo que más destraba: cuántas canchas de pádel hay y cuáles
   son techadas, los horarios exactos y las tarifas.
2. **Definir `ADMIN_TOKEN`** antes de publicar nada. Con la clave por defecto
   cualquiera entra al panel del club; el propio panel lo avisa en pantalla.
3. **Elegir dónde publicarlo.** El sistema de turnos necesita un hosting con
   Node (Railway, Render, Fly.io o un VPS). Un hosting compartido común alcanza
   sólo para el sitio, sin reservas online.
