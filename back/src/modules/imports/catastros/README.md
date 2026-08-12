# Importador de los catastros del SRI

Un solo importador para los cuatro catastros que publica el SRI:

| Catastro | Qué significa estar en él | Ejercicios cargados |
|---|---|---|
| `exportador_bienes_ir` | Rebaja de 3 puntos en la tarifa de Impuesto a la Renta | 2020–2024 |
| `exportador_bienes_iva` | Retenciones de IVA como exportador habitual de bienes | 2020–2026 |
| `exportador_servicios_iva` | Lo mismo para exportadores de servicios | 2023–2026 |
| `servicios_digitales` | Proveedores digitales **no residentes** (Netflix, Uber, Spotify) | n/a |

## Endpoint

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/imports/catastros` | Recibe el `.xlsx`, devuelve **202** con `jobId`. |

## El tipo se detecta, no se pide

`?tipo=` existe sólo para forzarlo cuando el SRI cambie los rótulos y la
detección falle. Lo normal es no pasarlo.

Se mira el título que llevan dentro las hojas, no el nombre del fichero: los
tres catastros de exportadores se descargan con nombres casi iguales y el
usuario los renombra. Cargar uno como si fuera otro mezclaría dos beneficios
tributarios distintos en la misma serie histórica **sin que ningún error lo
delatara**.

El orden de las reglas importa: el catastro de la rebaja de renta también dice
«EXPORTADORES HABITUALES DE BIENES», y lo que lo distingue es la rebaja de tres
puntos. Si esa comprobación deja de ir primero, ese catastro se cargaría como el
de IVA.

## Una hoja por ejercicio, y el snapshot es por (catastro, año)

Cada archivo trae entre cuatro y siete hojas, una por año. `readSheets()` existe
para esto: `readRows()` se queda con la primera hoja y perdería en silencio
todos los ejercicios anteriores.

La ausencia se calcula **dentro de los años que trae el archivo**. Marcar como
ausente «todo lo que no venga» borraría los ejercicios que ese archivo no cubre:
el de la rebaja de renta llega hasta 2024 y el de IVA hasta 2026, y cargar el
primero daría por desaparecidos a los exportadores de 2025 y 2026.

El año sale del nombre de la hoja (`LISTADO 2024`, `Exp Serv 2026`, `2021`),
pero **la columna «Año de aplicación fiscal» manda sobre él**: la hoja
`Exp Serv 2024` trae siete filas añadidas después cuyo año es otro.

## El punto frágil: el RUC que perdió su cero

Tres de los cuatro catastros se publican en el `.xls` binario de 1997, donde la
columna de RUC quedó guardada como número. Al leerla, `0101384501001` llega
como `101384501001`: **751 filas de una sola hoja** vienen así. `coerceRuc` las
rellena por la izquierda hasta 13 dígitos, que es lo mismo que hace el
importador de compañías y por el mismo motivo.

Si se dejara pasar, esos RUC no enlazarían con nadie y el catastro parecería
tener un 30 % de contribuyentes desconocidos.

## `.xls`: hay que convertirlo antes

El endpoint sólo acepta `.xlsx`. La librería del proyecto (ExcelJS) no lee el
formato binario antiguo, y aceptarlo aquí daría un error críptico a mitad del
parseo en vez de uno claro en la subida. Se abre en Excel o LibreOffice y se
guarda como «Libro de Excel (.xlsx)».

## Rótulos que cambian entre publicaciones

La cabecera se resuelve por nombre con `buscarCabecera`, nunca por posición. El
catastro de servicios llamaba `Numero Identificacion`, `Descripcion Zonal` y
`Mar obligado contabilidad` en 2023 a lo que en 2024 pasó a ser `RUC`,
`JURISDICCIÓN` y `OBLIGADO A LLEVAR CONTABILIDAD`. Los dos se cargan con el
mismo código porque los alias están en `catastros.constants.ts`.

Una hoja sin columna de RUC no tumba el archivo: se ignora y queda el aviso.

## Duplicados y pies de página

- El archivo repite filas: **354 idénticas** en la hoja de 2024 del catastro de
  bienes. Sin deduplicar, el `ON CONFLICT` del upsert falla con «cannot affect
  row a second time».
- Cada hoja acaba con notas («** Listado sujeto a actualización periódica»,
  «Listado referencial»). Se reconocen porque no traen RUC y se guardan en los
  avisos del job en vez de contarse como rechazos.

## Servicios digitales: sin RUC y con duplicados a propósito

Este catastro no tiene contribuyentes ecuatorianos: son proveedores extranjeros
identificados por **el texto con el que aparecen en el estado de cuenta de la
tarjeta**. Por eso la clave es el nombre y por eso el mismo proveedor aparece
como `NETFLIX`, `Netflix` y `netflix`: cada variante es un patrón de
conciliación real, no basura que haya que limpiar. Vive en su propia tabla y no
enriquece a nadie.

## Probar

```bash
npm test   # 13 tests con títulos, rótulos y filas literales de los cuatro archivos
```
