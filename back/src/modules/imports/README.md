# Importador de compañías (Superintendencia de Compañías)

Carga el Excel de la Superintendencia (~1.000.000 de filas, 24 columnas) de
forma idempotente: se puede volver a subir el archivo actualizado tantas veces
como haga falta.

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/imports/companias?modo=snapshot_completo\|parcial` | Recibe el .xlsx, devuelve **202** con `jobId`. No espera a que termine. |
| `GET` | `/imports` | Últimos 20 jobs. |
| `GET` | `/imports/:id` | Estado y contadores de un job. |
| `GET` | `/imports/:id/rechazos` | Filas y celdas que no se pudieron interpretar. |
| `GET` | `/companias` | Listado paginado con filtros. |
| `GET` | `/companias/facetas` | Valores para los desplegables de filtro. |
| `GET` | `/companias/:expediente` | Detalle. |

### Modos

- **`snapshot_completo`** (por defecto): el archivo es la foto completa del
  registro. Las compañías que ya no vengan se marcan con `ausente_desde_job`.
  **No se borra nada nunca.**
- **`parcial`**: el archivo es un subconjunto. No se marca nada como ausente.

## Por qué es rápido

Tres decisiones concentran casi toda la ganancia:

1. **Lectura en streaming** (`ExcelJS.stream.xlsx.WorkbookReader`). El libro
   nunca se materializa: la memoria se mantiene plana con un millón de filas.
2. **`COPY FROM STDIN`** contra una tabla `UNLOGGED` de staging, en lugar de
   `INSERT`. Postgres ingiere por `COPY` a cientos de miles de filas por segundo
   frente a unos pocos miles por `INSERT`; `UNLOGGED` además no escribe WAL.
3. **Un solo merge set-based** (`INSERT ... SELECT ... ON CONFLICT DO UPDATE`),
   sin ida y vuelta por fila.

La coerción de tipos se hace en Node durante el stream y no en SQL: ahí se
conoce el número de fila para reportar el error, y así una celda basura no puede
abortar un `COPY` de un millón de filas a medio camino.

## Los tres puntos frágiles

Si algo hay que no tocar sin entenderlo, es esto:

1. **La contrapresión** en `pg/import-pg.session.ts`. `stream.write()` devuelve
   `false` cuando el buffer del socket está lleno; hay que esperar el evento
   `drain`. Ignorarlo hace que el parser produzca filas más rápido de lo que
   Postgres las consume y la diferencia se acumula en memoria sin límite. El
   síntoma es "el COPY tiene una fuga de memoria".

2. **`sharedStrings: 'cache'`** en `xlsx/xlsx-row-source.ts`. XLSX guarda las
   cadenas en una tabla compartida que con un millón de razones sociales pesa
   cientos de MB. Sin `'cache'` se queda en memoria.

3. **El orden de escapado** en `transform/copy-text.ts`. La barra invertida se
   escapa PRIMERO; si no, las barras de los propios escapes se re-escapan. Hay
   un test que lo fija.

4. **El lock consultivo del job.** Cada import mantiene un
   `pg_try_advisory_lock` de sesión mientras se ejecuta. Postgres lo libera solo
   cuando la conexión muere, así que al arrancar una instancia puede distinguir
   "este job está vivo en otro proceso" de "quedó colgado" simplemente
   intentando tomarlo. Sin esa comprobación, arrancar un segundo proceso —o que
   `--watch` reinicie el servidor al guardar un archivo— daba por muerto un
   import en curso y le borraba la tabla de staging por debajo.

Y un quinto que no es frágil sino invisible: **`imports.constants.ts` es la
fuente única del orden de columnas**. El DDL del staging, la lista del `COPY`,
el serializador y el `INSERT` del merge se derivan todos de ese array. Si se
desincronizaran, los datos entrarían desplazados de columna sin ningún error.

## Idempotencia

Cada fila lleva un `row_hash` (md5 de los 24 campos **ya coercionados**, guardado
como `uuid`). El merge sólo escribe si el hash cambió:

```sql
WHERE companias.row_hash IS DISTINCT FROM EXCLUDED.row_hash
   OR companias.ausente_desde_job IS NOT NULL
```

Que el hash sea sobre los valores coercionados hace que `1.000,00` y `1000.00`
—o `SI` y `Sí`— produzcan el mismo hash y no generen una actualización espuria.
Volver a subir el mismo archivo escribe **cero** tuplas (verificable con
`n_tup_upd` en `pg_stat_user_tables`).

La segunda condición resucita una compañía que había desaparecido y vuelve con
datos idénticos: sin ella, el guard del hash la saltaría y se quedaría marcada
como ausente para siempre.

## Salvaguarda contra archivos truncados

Antes de marcar ausentes, se cuenta cuántas serían. Si superan el **20 %** de las
vigentes, el job falla y **no se aplica ningún cambio**. Un archivo incompleto
subido por error como snapshot completo marcaría media base de una sola vez.
Si la reducción es intencional, se sube con `?modo=parcial`.

## Ejecutar

```bash
docker compose up -d          # Postgres con el tuning del compose
cd back
npm run migration:run         # crea companias, import_job, import_row_reject
npm run start:dev
```

`synchronize` está **desactivado a propósito** también en desarrollo: sobre una
tabla de un millón de filas puede lanzar un `ALTER TABLE` que la reescribe
entera con lock exclusivo, y borra los índices que no conoce — justo los que
crea este módulo con `CREATE INDEX CONCURRENTLY`. El esquema se gestiona sólo
con migraciones.

El esquema **no** puede ir en `db/init.sql`: ese archivo sólo lo ejecuta la
imagen de Postgres cuando el volumen está vacío, y `postgres_data` ya está
inicializado.

## Probar

```bash
npm test                                              # 49 tests de coerción y escapado
npm run fixture -- --filas 1000000 --shared          # genera un .xlsx de prueba
```

El fixture siembra a propósito: RUC con ceros a la izquierda emitidos como
número, fechas `DD/MM/YYYY` y `31/02/1998`, capitales con coma y con punto
decimal, expedientes duplicados, nombres con tabuladores, saltos de línea,
barras invertidas y un `\N` literal.

## Índices

Los secundarios (`ruc`, `provincia+canton`, `situacion_legal`, `ciiu_nivel_1` y
el GIN de trigramas sobre `nombre`) los crea el propio importador **después** de
la primera carga, con `CREATE INDEX CONCURRENTLY`. Construir un índice sobre
filas ya cargadas es varias veces más rápido que mantenerlo durante la
inserción, y el GIN de trigramas es el caso extremo.

Si alguno falla, el job **no** se marca como fallido —los datos ya están
cargados y son correctos— pero el motivo queda en la columna `avisos` y se
muestra en la pantalla de importación. Quedarse con un millón de filas sin
índices degrada todas las consultas, y ese fallo no puede vivir sólo en el log
del servidor.

## Reiniciar un import a medias

Es seguro: cada carga usa su propia tabla de staging y el merge es idempotente.
Si el proceso muere, al arrancar de nuevo el job queda marcado como fallido, su
staging se borra y basta con volver a subir el archivo.
