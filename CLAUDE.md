# FRIDAY

Proyecto full stack: **React + Vite** (front), **NestJS + TypeORM** (back),
**PostgreSQL 16** (Docker).

Funcionalidad principal: importar el Excel de la Superintendencia de Compañías
del Ecuador (~1.000.000 de filas) de forma idempotente y consultarlo con filtros.

## Estructura

```
FRIDAY/
├── front/                        React 18 + Vite
│   └── src/
│       ├── pages/
│       │   ├── Companias.jsx          tabla paginada con filtros
│       │   └── ImportarCompanias.jsx  subida + progreso
│       └── services/
│           ├── api.js                 instancia axios compartida
│           └── companias.service.js   llamadas del dominio
│
├── back/                         NestJS 9 + TypeORM 0.3
│   ├── scripts/generate-fixture.ts    generador de .xlsx de prueba
│   └── src/
│       ├── data-source.ts             DataSource del CLI (migraciones)
│       ├── database/migrations/       esquema versionado
│       ├── common/text/
│       │   ├── normalize.ts           deaccent, headerKey, nullify
│       │   ├── encoding.ts            detección UTF-8 / Latin-1
│       │   └── lineas.ts              lectura de .txt grandes en streaming
│       └── modules/
│           ├── companias/             consulta de compañías
│           ├── catalogo/              consulta del plan de cuentas
│           ├── ciiu/                  consulta de actividades económicas
│           └── imports/               base común de importación
│               ├── pg/pg-copy.session.ts  COPY con contrapresión (compartido)
│               ├── companias/         importador XLSX masivo <- ver README.md
│               ├── catalogo/          importador TXT         <- ver README.md
│               ├── ciiu/              importador XLSX        <- ver README.md
│               └── balances/          importador TXT masivo  <- ver README.md
│
├── db/init.sql                   SÓLO para un volumen nuevo (ver aviso abajo)
└── docker-compose.yml            Postgres con tuning para carga masiva
```

## Arrancar

```bash
docker compose up -d
cd back && npm install --legacy-peer-deps && npm run migration:run && npm run start:dev
cd front && npm install && npm run dev
```

- Front: http://localhost:3000
- Back: http://localhost:3001
- Salud: http://localhost:3001/health

## Comandos

```bash
# back
npm run start:dev                          # desarrollo (heap de 4 GB)
npm test                                   # tests de coerción y escapado
npm run migration:run                      # aplicar migraciones
npm run migration:revert                   # deshacer la última
npm run fixture -- --filas 1000000 --shared  # .xlsx de prueba

# front
npm run dev
npm run build
```

## Tres cosas que hay que saber de este repo

1. **`synchronize` está desactivado a propósito**, también en desarrollo. Sobre
   la tabla `companias` (un millón de filas) la sincronización automática puede
   lanzar un `ALTER TABLE` que la reescribe entera con lock exclusivo, y borra
   los índices que no conoce. El esquema se toca **sólo** con migraciones.

2. **`db/init.sql` ya no se ejecuta.** La imagen de Postgres sólo lo corre
   cuando el volumen está vacío, y `postgres_data` ya está inicializado.
   Cualquier DDL que se añada ahí se ignora en silencio. Usa una migración.

3. **Cada importador tiene su propio README.** El de compañías
   (`back/src/modules/imports/README.md`) explica los puntos frágiles del camino
   masivo: contrapresión del COPY, caché de `sharedStrings`, orden de escapado.
   El del catálogo (`back/src/modules/imports/catalogo/README.md`) explica por
   qué NO usa esa maquinaria y por qué la codificación Latin-1 es el riesgo
   principal. Léelos antes de tocar esos módulos.

4. **Los archivos de la Superintendencia no siempre son UTF-8.** El catálogo
   viene en Latin-1, y leerlo mal no da error: entra con los acentos corruptos.
   Cualquier lector de texto plano nuevo debe pasar por `decodificarTexto()`.

## Modelo de datos

`companias` — 24 columnas del Excel con tipos reales (`date`, `numeric(18,2)`,
`boolean`, `smallint`), clave primaria `expediente`, más control de import:
`row_hash`, `primer_job_id`, `ultimo_job_id`, `ausente_desde_job`.

`categoria_cuenta` — plan de cuentas: `codigo` (PK), `nombre`, y la jerarquía
derivada en el import (`codigo_padre`, `nivel`, `es_hoja`, `longitud`) con el
mismo control de import que `companias`.

`actividad_ciiu` — actividades económicas: como la anterior, más `aplicacion`,
`nivel_nombre` y **`codigo_supercias`**, que es la forma con punto (`H4923.01`)
con la que se enlaza contra `companias.ciiu_nivel_6`.

**Las tres jerarquías se derivan por prefijo, pero con reglas distintas.** La del
plan de cuentas usa el prefijo más largo a secas; la del CIIU exige además que el
padre tenga un nivel menor. Copiar una en la otra rompe los datos en silencio —
está explicado en el README de cada importador.

`balance` / `balance_cuenta` — los balances presentados, en formato **largo**:
`balance` es la cabecera (PK `anio, formulario, expediente`) y `balance_cuenta`
el detalle (PK `anio, formulario, expediente, codigo_cuenta`), **particionado por
año**. Sólo se guardan los valores distintos de cero: la ausencia de fila
significa cero. Cargados 2021–2025: 577.557 balances y 25.531.702 celdas.

**`formulario` está en la clave primaria y no es opcional.** El sufijo del nombre
del archivo (`balances_2023_1` / `_2`) no es el período sino el tipo de
formulario, y cada uno trae su propio plan de cuentas. 33 códigos se repiten
entre planes con significados distintos: el código `3` es PATRIMONIO NETO en el
formulario 1 y ACTIVO CON PARTES RELACIONADAS LOCALES en el 3. Está explicado en
`back/src/modules/imports/balances/README.md`.

`import_job` — un registro por carga con contadores y progreso. Un índice único
parcial garantiza **un solo import activo a la vez**.

`import_row_reject` — celdas y filas que no se pudieron interpretar, con su
número de fila en el Excel.

## Re-importar

Subir el archivo otra vez es la operación normal y es idempotente:

- Expediente nuevo → se inserta.
- Expediente existente con datos distintos → se actualiza.
- Expediente existente idéntico → **no se escribe nada** (hay un hash por fila).
- Expediente que ya no viene → se marca `ausente_desde_job`. **No se borra.**

Si el archivo dejara fuera más del 20 % de las compañías vigentes, el job falla
sin aplicar cambios: es la protección contra subir un archivo truncado por error.
