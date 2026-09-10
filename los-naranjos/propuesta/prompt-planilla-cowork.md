# Prompt para Cowork — propuesta en planilla

Este archivo guarda el prompt que se le pasa a Cowork para que genere la
propuesta de Los Naranjos como planilla de Excel (`.xlsx`), pensada para
presentar en el club.

Está escrito para funcionar **sin ningún contexto previo**: Cowork arranca de
cero, así que el prompt lleva adentro todos los datos del club, del sistema y
de las condiciones. Si algo del proyecto cambia (cantidad de canchas, horarios,
precios), hay que actualizarlo también acá.

Lo que **no** entra nunca en la planilla: el piso de negociación, los costos de
hosting y el margen. Eso vive en `cartilla/index.html`, que es interno.

---

## El prompt

```
Necesito una planilla de Excel (.xlsx) para presentarle una propuesta a un club
de pádel. Es un documento comercial que voy a mostrar en una reunión, en una
notebook, y también imprimir. Tiene que verse profesional y prolijo, no una
tabla pelada.

Contexto: soy Mateo Berchot, desarrollador, de Mar del Plata. Le construí a este
club un sitio web con sistema de reservas online. Ya está hecho y funcionando;
la reunión es para mostrárselo y cerrar.

=== EL CLIENTE ===

Los Naranjos — club de pádel
Dorrego 333, Mar del Plata, Buenos Aires, Argentina
WhatsApp de reservas: 223 547-0343 · Teléfono: (0223) 472-9295
Instagram: @losnaranjos_mdq

Cómo trabajan hoy: no tienen sitio web ni plataforma de reservas. Todo pasa por
WhatsApp e Instagram, y desde Instagram mandan al WhatsApp. Las reservas las
toma a mano quien esté atendiendo.

Qué tienen:
- 7 canchas de pádel, todas techadas, césped sintético, luz LED.
- Una de las siete es la central, con gradas. Ahí se juegan las finales.
- Vestuarios con duchas.
- Bar, para comprar algo al salir de la cancha.
- Escuela de pádel por niveles (iniciación, intermedio, competitivo).
- Clases particulares de 1 a 4 jugadores.
- Americanos semanales y torneos por categoría.
- Importante: en el mismo predio hay un gimnasio y canchas de fútbol, pero son
  de otra administración. No son del club y la planilla no se los tiene que
  atribuir.

=== LO QUE LE CONSTRUÍ ===

Un sitio web propio con sistema de turnos. Cuatro partes:

1. Sitio público: presentación del club, las canchas, la escuela, ubicación,
   horarios, y disponibilidad en vivo en la portada.
2. Reserva online: el jugador elige día, duración (60 o 90 minutos) y horario;
   ve en tiempo real qué canchas quedan libres; puede elegir cancha (incluida la
   central, que aparece marcada "con gradas") o dejar que el sistema le asigne
   una. Deja nombre y teléfono y recibe un código de reserva (formato LN-XXXXX).
   Funciona las 24 horas, también de madrugada.
3. Panel del socio ("Mis turnos"): con el teléfono consulta sus turnos y cancela
   solo, sin llamar. Hoy configurado hasta 6 horas antes del turno.
4. Panel del club: la grilla del día completa, canchas en las filas y horarios
   en las columnas. Muestra quién reservó cada turno, permite cancelar y
   bloquear una cancha por torneo o mantenimiento, y resume turnos y horas
   vendidas del día.

Características que importan y conviene que la planilla destaque:
- Es imposible que dos personas reserven la misma cancha en el mismo horario:
  no es una validación que se puede escapar, lo garantiza la base de datos.
- No hay comisión por reserva. Ni al club ni al jugador.
- Las reservas y los datos de los jugadores quedan en poder del club.
- El jugador no necesita bajarse ninguna aplicación ni crearse una cuenta.
- Anda en celular.
- Los turnos se reservan hasta 14 días para adelante (ajustable).
- Máximo 3 turnos activos por teléfono, para que nadie acapare la grilla.
- El WhatsApp del club no desaparece: queda para clases, torneos y consultas.
  El sistema le saca de encima los turnos, que son el 90% de los mensajes.

=== LA PLANILLA QUE NECESITO ===

Un archivo .xlsx llamado "Propuesta-Los-Naranjos.xlsx" con seis hojas, en este
orden y con estos nombres exactos:

--- Hoja 1: "Propuesta" ---
Portada. Título grande "Los Naranjos — Sitio web y sistema de turnos", debajo
"Propuesta de servicio · Mateo Berchot · [fecha de hoy]".
Un párrafo corto explicando qué es, escrito para el dueño de un club, no para un
técnico. Debajo, cuatro celdas destacadas con los números que resumen todo:
7 canchas · reservas 24 horas · 0 comisión por reserva · 1 minuto para reservar.
Cerrá con dos o tres líneas sobre el problema que resuelve: hoy cada turno pasa
por una persona contestando WhatsApp, y lo que no se contesta a tiempo se pierde.

--- Hoja 2: "Qué incluye" ---
Tabla de tres columnas: Módulo | Qué hace | Estado.
Filas agrupadas por las cuatro partes del sistema (sitio público, reserva
online, panel del socio, panel del club), con las funciones de cada una en
filas propias. La columna Estado dice "Listo" en todas, porque está construido.
Usá subtítulos de grupo con fondo de color para separar las cuatro partes.

--- Hoja 3: "Las canchas" ---
Tabla con las 7 canchas: N° | Nombre | Superficie | Techada | Gradas | Blindex o muro.
Cargá los datos que sé (todas techadas, césped sintético) y dejá en blanco, con
fondo amarillo, lo que hay que confirmar: cuál es la central y qué canchas son
de blindex y cuáles de muro.
Debajo, una tabla de horarios: Día | Abre | Cierra, de lunes a domingo, con los
valores que tengo cargados hoy (lunes a viernes 07:30–23:30, sábado 08:00–23:30,
domingo 09:00–22:30) y una nota aclarando que el horario de cierre lo deduje de
los últimos turnos que publican en Instagram (22:00 y 22:30) y que la hora de
apertura hay que confirmarla.
Esta hoja es para corregir en la reunión, en vivo: dejala editable y cómoda de
completar.

--- Hoja 4: "Datos que necesitamos" ---
La más importante para la reunión. Cuatro columnas:
Qué necesitamos | Por qué | Respuesta | Listo
La columna "Respuesta" va vacía con fondo amarillo, para completarla ahí mismo
mientras hablamos. La columna "Listo" con casillas de verificación o una lista
desplegable Sí/No.
Las filas, agrupadas por tema:

Horarios y tarifas
- Hora de apertura, día por día
- Precio del turno de 60 minutos
- Precio del turno de 90 minutos
- Si el precio cambia según el día o la franja horaria
- Feriados o fechas en que no abren

Las canchas
- Cuál de las siete es la central
- Cuáles son de blindex y cuáles de muro
- Si las canchas tienen nombre propio o sólo número

Escuela y torneos
- Días, niveles y cupos de la escuela
- Precio de la clase particular (de 1 a 4 jugadores)
- Precio de la escuela y de la inscripción a torneos

Reglas del sistema
- Con cuánta anticipación quieren permitir reservar (hoy: 14 días)
- Hasta cuándo aceptan una cancelación sin cargo (hoy: 6 horas antes)
- Si quieren cobrar seña al reservar
- Quiénes del club van a usar el panel

Contacto y material
- Correo de contacto
- Si ya tienen un dominio comprado o hay que registrarlo
- Logo oficial en archivo vectorial, si existe
- Fotos del club: canchas, vestuarios, bar, fachada

--- Hoja 5: "Condiciones" ---
Los valores, en pesos argentinos, formateados como moneda:

Opción recomendada
- Armado, pago único: $550.000. Se abona mitad al comenzar y mitad al publicar.
  Incluye el sitio completo, el sistema de reservas, el panel del club, la carga
  de los datos reales, el dominio configurado y la publicación.
- Servicio mensual: $55.000. Incluye servidor, dominio, copias de seguridad
  diarias, actualización de horarios y tarifas, cambios menores y soporte.
  Sin permanencia mínima. Se actualiza cada tres meses.
- Total primer año: $1.210.000 (calculalo con fórmula, no a mano).

Alternativa, para arrancar con menos desembolso
- Armado: $250.000 · Servicio mensual: $95.000 · Permanencia mínima 12 meses.
- Total primer año: $1.390.000 (también por fórmula).

Opcionales, se suman si los quieren
- Seña online con Mercado Pago: $180.000
- Inscripción online a escuela y torneos: $120.000
- Logo vectorial y manual de marca chico: $90.000

Cerrá con una nota: valores vigentes por 30 días, y el abono se actualiza cada
tres meses.

--- Hoja 6: "Comparación" ---
Una calculadora, y es la hoja que más me interesa que quede bien.
La mayoría de las plataformas de reservas de pádel no cobran un abono: cobran un
porcentaje de cada turno. Quiero mostrar en vivo qué significa eso en plata.

Arriba, celdas de entrada editables, con fondo distinto y borde, para completar
con los datos reales del club durante la reunión:
- Turnos por mes (poné 300 como valor de ejemplo)
- Precio promedio del turno (poné 25.000 de ejemplo)
- Comisión de la plataforma (4%)
- Tope por reserva (3.500, con nota de que equivale a unos 2 dólares)

Abajo, calculado con fórmulas que se actualicen solas al cambiar las entradas:
- Costo mensual con plataforma por comisión: turnos × el menor entre
  (precio × comisión) y el tope. Usá MIN().
- Costo mensual con este sistema: 55.000, fijo.
- Diferencia por mes y diferencia por año.

Y una línea honesta, que quiero que esté sí o sí: las plataformas grandes traen
jugadores de afuera, este sistema no; lo que hace es que los que ya los buscan
no tengan que esperar respuesta. Ponelo como nota al pie de la hoja, no
escondido.

=== CÓMO TIENE QUE VERSE ===

- Español rioplatense, de vos. Nada de "usted", nada de lenguaje técnico:
  el lector es el dueño de un club, no un programador.
- Paleta: negro carbón para los títulos, naranja (#E86A17) como color de acento,
  fondo blanco o gris muy claro. Verde sólo para los "Listo". El club se llama
  Los Naranjos, así que el naranja es la marca, pero usalo con medida: en los
  encabezados de tabla y en los destaques, no en todos lados.
- Encabezados de tabla con fondo de color y texto claro, fila congelada.
- Columnas anchas de verdad: nada de texto cortado ni de columnas de ####.
  Ajustá el ancho a lo que realmente entra, y activá ajuste de texto donde haga
  falta.
- Los importes en pesos, con separador de miles y sin decimales.
- Bordes finos, no una grilla pesada. Filas con alto cómodo.
- Amarillo suave para todo lo que hay que completar, con una referencia visible
  que explique qué significa el amarillo.
- Configuración de impresión: A4, márgenes normales, cada hoja entra en el ancho
  de una página, y el título de la hoja repetido arriba.
- Sin macros, sin nada que Excel abra con advertencias.

=== LO QUE NO VA ===

- Nada de datos inventados. Si un dato no está en este prompt (precios del club,
  correo, cantidad de alumnos, cuántas reservas pierden hoy), va en blanco y en
  amarillo, para completar. Prefiero un casillero vacío que un número inventado.
- No pongas costos míos, márgenes ni mínimos de negociación. La planilla la ve
  el cliente.
- No inventes testimonios, casos de éxito, logos ni estadísticas de mercado.
- No prometas plazos de entrega: eso lo hablo yo en la reunión.

Cuando termines, mostrame un resumen de qué quedó en cada hoja y pasame el
archivo para descargar.
```

---

## Después de generarla

Vale la pena abrirla y revisar tres cosas antes de la reunión:

1. Que la hoja **Comparación** recalcule bien al cambiar las celdas de entrada.
2. Que **Datos que necesitamos** entre en una sola página impresa: es la hoja
   que se completa a mano y conviene tenerla en papel.
3. Que no haya quedado ningún dato inventado en los casilleros amarillos.
