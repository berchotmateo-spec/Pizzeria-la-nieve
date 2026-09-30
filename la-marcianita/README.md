# La Marcianita — sitio web

Sitio de **Pizzería La Marcianita**, Mar del Plata, abierta el 7 de noviembre de 1959.
Tres sucursales: Av. Colón 3232 · Constitución 5892 · Olavarría 3268.

Todo el sitio es **un solo archivo**: [`index.html`](index.html). No hay build, ni
dependencias, ni imágenes aparte (los dibujos son SVG dentro del HTML). Lo único
que baja de internet son las tipografías de Google Fonts; sin conexión usa las de
respaldo y sigue andando.

- **Origen:** el Artifact https://claude.ai/artifact/GU5o7BiGbe6mixQ4nuN56i,
  versión `1790275823-7859`, bajado el 29/9/2026.
- **Copia exacta:** sha256 `f5608400510c7dfbb85c3cdb8f163146335099b21e3fbf7f12e5e8128682cc47`.
- La línea 1 (`<!doctype html>…<body>`) y la última (`</body></html>`) las agrega
  claude.ai al publicar. El código propio arranca en la línea 2 (`<title>`).

## Ver el sitio

Doble clic en `index.html`. Se puede elegir sucursal, armar un pedido y mandarlo
por WhatsApp (mientras sea vista previa va al número de prueba, ver abajo).

Para volver a publicarlo **en el mismo link**, pedirle a Claude que publique
`la-marcianita/index.html` en https://claude.ai/artifact/GU5o7BiGbe6mixQ4nuN56i.

## Dónde tocar

Todo lo que cambia se edita en las constantes del principio del `<script>`.
Debajo de la línea 1598 (*"de acá para abajo no hace falta tocar nada"*) está la lógica.

| Línea | Constante | Qué es | Estado hoy |
|---|---|---|---|
| 1432 | `VISTA_PREVIA` | En `false` saca la franja amarilla, los chips de "de ejemplo" y todo lo que tiene `data-preview` | `true` |
| 1436 | `WHATSAPP_DEMO` | Adonde van los pedidos de las sucursales sin WhatsApp mientras sea vista previa | `5492235337853` |
| 1461 | `SUCURSALES` | Dirección, teléfono, WhatsApp, delivery, PedidosYa, envío, salón y horario de cada una | Casi todo vacío |
| 1513 | `TELEFONOS_SIN_ASIGNAR` | Teléfonos que no sabemos de qué sucursal son | `0223 494-2932`, `0223 479-5535` |
| 1517 | `MEDIOS_DE_PAGO` | Se muestran tal cual se escriben | Vacío |
| 1521 | `APERTURA` | De acá salen los años y el aviso del aniversario | 7/11/1959 |
| 1531 | `CARTA` | Pestañas → grupos → productos (`n` nombre, `d` descripción, `p` precio, `u` unidad) | Precios de ejemplo |

Formatos que espera el código (están explicados en los comentarios del archivo):

- **Precios:** números sin puntos. `14500` es $ 14.500.
- **WhatsApp:** sólo números. Celular `549` + `223` + número sin el 15; fijo con
  WhatsApp Business `54` + `223` + número, sin el 9.
- **Delivery:** `"si"`, `"no"` o `"confirmar"`. Con `"no"` la página no deja elegir delivery.
- **Horario:** `{ dias:"Martes a domingo", d:[2,3,4,5,6,0], abre:"19:30", cierra:"00:30" }`
  (0 = domingo). Con horario cargado aparece solo el "Abierto ahora".
- El `id` de las pestañas de `CARTA` no se cambia: `"marcianitos"` también arma la
  sección destacada de arriba.
- No repetir nombres de producto: dos iguales suman al mismo.

Si algo queda mal escrito, la página no se rompe: avisa en la consola (F12) qué revisar.

## Cómo está armado `index.html`

| Líneas | Qué hay |
|---|---|
| 2–7 | `<title>`, descripción y Google Fonts (Barlow, Barlow Condensed, Yellowtail) |
| 9–902 | CSS. Los colores están en `:root` (fórmica, cielo, tinta, tomate, mostaza, rosa) |
| 907 | Franja de vista previa |
| 915 | Navegación: anclas, selector de sucursal (segmentado en compu, flecha en celular) |
| 962 | `#inicio` — portada: el cartel, el Sputnik "Desde 1959" y las tres flechas |
| 1022 | `#marcianitos` — la especialidad de la casa |
| 1073 | `#carta` — buscador, pestañas y tablero |
| 1130 | `#sucursales` — tarjetas que arma el script |
| 1143 | `#preguntas` — FAQ; algunas respuestas las escribe el script con los datos |
| 1201 | `#contacto` — "Tu sucursal", teléfonos y medios de pago |
| 1248 | Pie |
| 1283 | Barra de pedido (aparece cuando hay algo en el pedido) |
| 1296, 1308 | Hojas que suben desde abajo: elegir sucursal y tu pedido |
| 1371 | Íconos (sprite SVG) |
| 1413–2816 | JavaScript |

Otros detalles del funcionamiento:

- Guarda la sucursal y el pedido en el navegador (`localStorage`: `marcianita-sucursal`
  y `marcianita-pedido`).
- Un link con `#colon`, `#constitucion` u `#olavarria` al final entra con esa
  sucursal elegida.
- El pedido sale como mensaje de WhatsApp armado (`wa.me`), o se copia al portapapeles.

## Reglas de diseño que respeta el código

- Cada forma tiene un solo trabajo: **paralelogramo** = algo que se aprieta;
  **flecha** = una sucursal o una dirección; **borde punteado** = dato sin confirmar
  (nada más en la página es punteado).
- Yellowtail (letra de cartelista) sólo para "La Marcianita" y "Los Marcianitos".
- La página va siempre de día, aunque el navegador esté en modo oscuro.
- La portada es lo único ruidoso; el rojo tomate aparece sólo en lo que se toca.
- **No inventar** la historia del nombre, reseñas ni testimonios. La única prueba
  social es Tripadvisor: 3,8 de 5 con 89 reseñas (septiembre de 2026).

## Pendiente de confirmar con el local

- [ ] Teléfono, WhatsApp, horario, salón y delivery (con zona y costo) de cada sucursal.
      Constitución está en PedidosYa; falta saber si también reparte por WhatsApp.
- [ ] De qué sucursal es cada teléfono: `0223 494-2932` y `0223 479-5535`
      (el segundo figura en Tripadvisor sin la característica).
- [ ] Medios de pago.
- [ ] La carta completa y **todos** los precios. Confirmado hasta ahora: pizzas (la
      muzzarella clásica es la más nombrada), Marcianitos, empanadas de masa casera,
      flan casero y bombón helado.
- [ ] Qué variedades de Marcianitos hacen, cómo se venden y a qué precio.
- [ ] De dónde sale el nombre La Marcianita (la pregunta del FAQ está reservada).
- [ ] El dominio: `lamarcianita.com.ar` no existía al 24/9/2026.

**Antes de poner `VISTA_PREVIA = false`:** cargar el WhatsApp de las tres sucursales.
Sin vista previa, una sucursal sin WhatsApp no toma pedidos por la página (muestra
su teléfono en su lugar).
