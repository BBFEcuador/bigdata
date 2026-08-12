# Importador de balances (Superintendencia de Compañías)

Carga los balances de un ejercicio desde un `.txt` separado por tabuladores en
**formato ancho**: una fila por compañía y una columna por cuenta. Un archivo =
un año.

Medido sobre los archivos reales de 2021–2025: **577.557 balances y 25.531.702
celdas con valor**.

## Endpoint

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/imports/balances?modo=snapshot_completo\|parcial` | Recibe el `.txt`, devuelve **202** con `jobId`. |

El resto del ciclo de vida (`GET /imports`, `/imports/:id`, `/imports/:id/rechazos`)
es el común a todos los importadores.

## Por qué el formato es largo y no ancho

Copiar el archivo tal cual —622 columnas `numeric`— dejaría la tabla a 200
columnas del límite duro de Postgres, cada revisión del plan de cuentas sería un
`ALTER TABLE` sobre la tabla grande, y **el 93 % de las celdas serían ceros
almacenados**: la densidad real del archivo de 2025 es del 7,28 %.

Guardando sólo los valores distintos de cero, la ausencia de fila significa cero
—que es exactamente la semántica contable— y 2025 ocupa 6,86 M filas en vez de
94,3 M.

## El sufijo del nombre del archivo NO identifica el formulario

`balances_2023_1` y `balances_2023_2` no son dos períodos: son dos
**formularios**, cada uno con su propio plan de cuentas. Y el número del sufijo
no es estable entre años — comprobado sobre los archivos reales:

| Plan de cuentas | 2021 | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|---|
| 622 (IFRS) → formulario **1** | `_1` | `_1` | `_1` | `_1` | `_1` |
| 868 → formulario **2** | `_2` | `_2` | — | — | — |
| 925 → formulario **3** | `_3` | `_3` | `_2` | — | — |

Por eso **el formulario se detecta por el número de cuentas del encabezado**, no
por el nombre. Un plan desconocido aborta el import en vez de inventarse un
formulario.

Lo bueno: los tres planes son **idénticos byte a byte entre años**. El de 622
cuentas no ha cambiado en cinco ejercicios, así que los comparables interanuales
del formulario 1 son directos.

## Por qué `formulario` está en la clave primaria

Porque **33 códigos se repiten entre planes con significados distintos**:

```
código 3   formulario 1: PATRIMONIO NETO
           formulario 3: ACTIVO CON PARTES RELACIONADAS LOCALES
```

Sin esa columna, la cuenta `3` de una empresa sería patrimonio o activo según el
archivo del que vino, sin forma de saberlo. Un `SUM()` sobre esa mezcla devuelve
un número perfectamente plausible y falso.

Hoy sólo se carga el formulario 1; los demás se rechazan con un mensaje
explícito. La columna existe desde el principio porque añadirla después, siendo
parte de la PK de una tabla de decenas de millones de filas, obliga a
reescribirla entera.

## Los cuatro puntos frágiles

1. **Dos conexiones, no una.** Postgres admite **un solo `COPY` activo por
   sesión**, y cada línea del archivo alimenta a la vez la cabecera y el
   detalle. `BalancesPgSession` abre una conexión secundaria para el `COPY` del
   detalle. La alternativa —acumular las 151.674 cabeceras en memoria hasta
   terminar el detalle— volvería a atar el consumo de memoria al tamaño del
   archivo, que es justo lo que este importador evita.

2. **El `row_hash` cubre los importes, no sólo la identidad.** Es lo que hace
   gratuita la reimportación: si el hash no cambió, el balance es idéntico y sus
   hasta 622 filas de detalle no se tocan. Verificado: reimportar el archivo de
   2025 entero escribe **cero** tuplas (`n_tup_ins/upd/del` sin moverse).

3. **El orden dentro de cada chunk del merge: borrar detalle → insertar detalle
   → sellar cabecera.** Al revés, si el proceso muere en medio, la cabecera
   diría "actualizado" con el detalle del año pasado debajo, y volver a cargar el
   mismo archivo NO lo arreglaría: el hash ya coincidiría.

4. **El detalle se borra antes de insertar, no se hace upsert.** Una cuenta que
   el año pasado tenía importe y este año está a cero **no viene en el archivo**
   —los ceros no se guardan— así que un `ON CONFLICT DO UPDATE` la dejaría ahí
   para siempre, inflando el activo con un saldo que ya no existe.

Y uno que no es frágil sino invisible: **`balances.constants.ts` es la fuente
única del orden de columnas**. Ya rompió una carga real —`formulario` estaba en
la lista del `COPY` pero no en los tipos del staging— y hay un test
(`balances.constants.spec.ts`) que fija la correspondencia. Un desajuste al revés
es peor: no falla, mete los datos corridos de columna.

## Codificación

Los archivos vienen en **Latin-1**, igual que el catálogo, pero pesan 250 MB:
`decodificarTexto()` no sirve porque recibe el buffer entero. `abrirLectorDeLineas()`
en [common/text/lineas.ts](../../../common/text/lineas.ts) detecta la codificación
con los primeros 64 KB y decodifica en streaming.

El detalle que lo hace correcto es el `{ stream: true }` de la detección: sin él,
una secuencia UTF-8 partida en el corte de la muestra haría fallar la prueba
estricta y el archivo se leería como Latin-1, con todos los acentos corruptos y
sin un solo error. Hay un test para eso.

## Validaciones que van a `import_job.avisos`

Ninguna tumba el job: los datos se cargan y el aviso queda visible en la pantalla
de importación.

- Códigos del archivo que no están en `categoria_cuenta` (no se insertan).
- Balances de expedientes que no están en el directorio de compañías. **Se
  cargan igual**: en 2025 son 1.629 empresas que presentaron balance sin figurar
  en el directorio, y descartarlas sesgaría la muestra.
- Balances que no cumplen `ACTIVO = PASIVO + PATRIMONIO`. En los archivos reales
  son 16 de 568.789 — quedan marcados para excluirlos de los indicadores.
- Codificación detectada.

Y una salvaguarda que **sí** aborta: si el archivo dejara fuera más del 20 % de
los balances vigentes **de ese mismo año y formulario**, el job falla sin tocar
nada. El recuento se limita al mismo ejercicio: que una empresa no presente en
2024 no dice nada sobre su balance de 2025.

## Probar sin cargar nada

```bash
npx ts-node scripts/dry-run-balances.ts "ruta\al\balances_2025_1.txt"
```

Recorre el archivo entero haciendo exactamente lo mismo que el import pero sin
tocar la base: codificación, formulario detectado, ejercicios, balances,
rechazos, densidad, celdas ilegibles, comprobación de acentos y descuadres
contables. Sobre los 251 MB de 2025 tarda unos 3 segundos.

## Resultado de la carga real

```
anio | formulario | balances |  celdas
-----+------------+----------+---------
2021 |          1 |    17365 |   473783
2021 |          3 |    92127 |  5337732
2022 |          1 |   123624 |  5391239
2023 |          1 |   137523 |  6211390
2024 |          1 |   147371 |  6591418
2025 |          1 |   151674 |  6863872
```

**669.684 balances y 30.869.434 celdas.** En 2021 hay 109.492 empresas repartidas
entre los dos formularios: ese año la mayoría declaró en el fiscal.

## Cómo se comparan dos formularios distintos

Los planes no tienen nada que ver entre sí, pero las magnitudes grandes existen
en ambos con otro código. El diccionario está en
[common/finanzas/conceptos.ts](../../../common/finanzas/conceptos.ts):

```
concepto     formulario 1 (IFRS)   formulario 3 (fiscal)
activo       1                     499
pasivo       2                     599
patrimonio   3                     698
ingresos     401                   1005
```

El mapeo no está adivinado: se validó comprobando que `activo = pasivo +
patrimonio` cuadra en el **97,1 %** de los balances del formulario 3. Y sobre un
caso real —ACEITES TROPICALES, expediente 1— la serie 2021-2025 cruza los dos
planes sin salto: 1.402.783,28 en 2021 (fiscal) frente a 1.360.051,92 en 2022
(IFRS).

**El formulario 3 trae datos bastante más sucios que el IFRS**: 654 descuadres
contables de 87.268 balances (0,75 %), frente a 0 de 149.175 en el IFRS de 2025.
Es un formulario fiscal autodeclarado, con menos validación en origen.
