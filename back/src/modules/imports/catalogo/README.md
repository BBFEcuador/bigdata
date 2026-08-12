# Importador del catálogo de cuentas

Carga el plan de cuentas de la Superintendencia desde un `.txt` con
`código<TAB>nombre` por línea (unas 620 cuentas).

## Por qué NO usa COPY ni staging

El importador de compañías existe para que un millón de filas quepa en memoria
acotada: streaming del XLSX, `COPY FROM STDIN` a una tabla `UNLOGGED`, merge por
particiones. Este archivo son 25 KB. Aplicarle esa maquinaria sólo añadiría
piezas que pueden fallar sin ganar nada.

Aquí el flujo es: leer el archivo entero → decodificar → parsear → derivar la
jerarquía → **un solo `INSERT ... SELECT unnest(...) ON CONFLICT DO UPDATE`**.
Un viaje de red, una sentencia, milisegundos.

Lo que **sí** se comparte con compañías es el ciclo de vida del job
(`import_job`, `import_row_reject`, lock consultivo, endpoints de estado), para
que la pantalla de progreso del frontend sea exactamente la misma.

## La codificación es el punto crítico

**Los archivos de la Superintendencia vienen en Latin-1, no en UTF-8.**

Verificado sobre `catalogo_2025_1.txt`: los únicos bytes altos son
`0xC1 0xC9 0xCD 0xD1 0xD3 0xDA`, es decir `Á É Í Ñ Ó Ú`. Leerlo con el default
de Node **no falla**: entran las 622 filas con todos los nombres acentuados
corruptos y el import se reporta como correcto. Ese es justo el peligro.

`decodificarTexto()` en [common/text/encoding.ts](../../../common/text/encoding.ts)
intenta UTF-8 estricto y cae a Latin-1 si el buffer no es válido. Funciona
porque un texto Latin-1 con acentos españoles es UTF-8 *inválido*, mientras que
todo UTF-8 real se acepta en el primer intento. La codificación detectada se
guarda en `import_job.avisos` y se muestra en la UI.

## La jerarquía se deriva por prefijo, nunca por longitud

Parece que el nivel se puede sacar del largo del código (1 dígito, luego 2 por
nivel). **No se puede**: en el archivo real `30` y `31` tienen longitud 2, y
conviven con longitudes 1, 3, 5, 7, 9 y 11.

El padre es el **prefijo propio más largo que exista en el propio archivo**. Eso
resuelve bien `30` → `3` y `301` → `30`, y también los saltos de nivel.

Además el resultado es un **bosque de 26 raíces**, no un árbol: el archivo no
trae los códigos `4`, `5`, `6`, `7` ni `8`, así que `401`, `501`, `600`, `700` y
`800` no tienen ancestro. No es un error del archivo ni del parseo.

Como el padre siempre es un prefijo estrictamente más corto, **no puede haber
ciclos**: la cadena de padres decrece en longitud y termina sola.

## Idempotencia

Cada cuenta lleva un `row_hash` que cubre nombre, padre, nivel y si es hoja —
no sólo el nombre, porque una recolocación en la jerarquía también es un cambio
que debe escribirse. El `ON CONFLICT DO UPDATE` sólo escribe si el hash cambió,
así que reimportar el mismo archivo escribe **cero** filas.

Las cuentas que ya no vienen se marcan con `ausente_desde_job` y **nunca se
borran**: pueden seguir referenciadas por datos históricos. La UI las muestra
atenuadas si se marca «Incluir las que ya no vienen».

Si un archivo dejara fuera más del 20 % de las cuentas vigentes, el job falla
sin tocar nada. Es la protección contra subir un archivo truncado por error.

## Probar sin cargar nada

Hay un ensayo en seco que hace exactamente lo mismo que el import (decodificar,
parsear, derivar jerarquía) pero **no toca la base**:

```bash
npx ts-node scripts/dry-run-catalogo.ts "ruta\al\catalogo.txt"
```

Informa de la codificación detectada, cuentas válidas, rechazos, duplicados,
raíces, hojas, reparto por nivel y una comprobación de acentos. Útil para
validar un archivo nuevo antes de importarlo.
