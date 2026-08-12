# Importador del Catastro Nacional de Turismo

Carga el Excel que publica el Ministerio de Turismo con los establecimientos
registrados: los autorizados a aplicar la reducción de IVA turístico.

Un archivo = todo el catastro nacional. **35.571 filas y 29.871 RUC**, porque un
contribuyente puede tener varios registros.

## Endpoint

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/imports/turismo` | Recibe el `.xlsx`, devuelve **202** con `jobId`. |

Acepta `?modo=parcial`. Por defecto es snapshot completo, con la misma
protección que los demás: si el archivo dejara fuera más del 20 % de los
registros vigentes, el job falla sin tocar nada.

## Enlaza con las TRES poblaciones, no sólo con `companias`

Es lo que lo diferencia de los otros importadores. De los 29.871 RUC del
catastro:

| | |
|---|---|
| Compañías de la Superintendencia | 5.323 |
| Personas naturales | 24.083 |
| Sociedades no supervisadas | 452 |
| Sin cruce con ninguna | 13 |

Cuatro de cada cinco establecimientos turísticos son de personas naturales. Un
enriquecimiento que sólo tocara `companias` dejaría fuera al 82 % del catastro,
así que las columnas `turismo_*` se añaden a las tres tablas de titulares y
`turismo_establecimiento.tipo_titular` dice a cuál pertenece cada fila.

Esa clasificación **se recalcula entera en cada carga**, no sólo para las filas
tocadas: el padrón del SRI se importa por provincias, así que un RUC que hoy es
`desconocido` puede ser una persona natural en cuanto se cargue su provincia.

Los RUC que apuntan a dos expedientes de `companias` no se enlazan con ninguno,
igual que en el padrón del SRI: elegir uno sería inventar.

## La clave es el número de registro, no (RUC, establecimiento)

Un mismo local puede tener varios registros —un hotel con restaurante son dos
filas con el mismo RUC y el mismo código de establecimiento— y **796 pares
(RUC, código) aparecen repetidos**. La PK es `numero_registro`.

Dos números de registro sí vienen duplicados en el archivo. En uno de los dos
casos las filas difieren en el nombre comercial, así que la deduplicación deja
constancia en los avisos cuando el duplicado no es idéntico.

## Los tres puntos donde copiar la celda tal cual rompe las consultas

**El código de establecimiento.** El archivo escribe el mismo local como `1`,
`01` o `001`; las tres formas conviven. El padrón del SRI lo guarda siempre sin
relleno, así que se normaliza quitando los ceros a la izquierda. Sin eso el
join con `establecimiento` fallaría en las 18.146 filas de tres dígitos.

El número de registro (`0100024025001.001.1013877`) lleva dentro otra copia del
código, y en 120 filas **las dos fuentes no coinciden**. Gana la columna: contra
el padrón del SRI acierta 115 de esas 120 veces, y el número de registro sólo
57. El número de registro sólo se usa como respaldo cuando la columna viene
vacía, que pasa una vez.

**La categoría.** Las 42 categorías distintas del archivo son muchas menos de
verdad: `Categoría Única` aparece además como `Categoria Unica`,
`CategoríaÚnica`, `Categoría ünica` y `CAtegoría Única`, y `3 Estrellas` conviven
con `3 estrellas`. Se guarda la columna cruda **y** una versión normalizada
(`categoria_norm`, en mayúsculas y sin tildes); agrupar por la cruda daría un
grupo por errata.

**El correo.** Va en columna propia indexada porque es el dato con valor
comercial del catastro —29.871 RUC con teléfono y correo directo—, así que sólo
entra ahí lo que tiene forma de correo.

## Lo que no tumba una fila

Una celda mala nunca se lleva por delante el establecimiento entero:

- **Fecha ilegible** → la fila entra con `fecha_registro` a NULL y el texto
  original en `fecha_registro_raw`. Hay una fila con dos fechas en la misma
  celda (`6/07/2026; 28/07/2026`).
- **RUC raro** → entra igual y queda el aviso. Hay un RUC de 14 caracteres
  (`1550149304.001`) que no enlaza con nadie.
- **Número de registro sin puntos** → entra; sólo se pierde el respaldo del
  código de establecimiento.

Se rechaza la fila entera sólo si falta el número de registro, el RUC o la
actividad: sin eso no identifica nada.

## Probar

```bash
npm test   # 17 tests del parser con filas literales del catastro de julio 2026
```
