# FRIDAY

Sistema para cargar y consultar el registro de la **Superintendencia de
Compañías del Ecuador**: importa el Excel oficial (~1.000.000 de filas) de forma
idempotente y lo expone con búsqueda y filtros.

- **Frontend:** React 18 + Vite
- **Backend:** NestJS 9 + TypeORM 0.3
- **Base de datos:** PostgreSQL 16 (Docker)

## Puesta en marcha

```bash
docker compose up -d
```

```bash
cd back
npm install --legacy-peer-deps
npm run migration:run
npm run start:dev
```

```bash
cd front
npm install
npm run dev
```

| | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:3001 |
| Salud | http://localhost:3001/health |

## Qué hace

### Importar (`/importar`)

Se sube el .xlsx de la Superintendencia. Como la carga tarda minutos, la
petición devuelve **202** de inmediato con un `jobId` y el proceso continúa en
el servidor; la pantalla muestra dos barras separadas —la subida del archivo y
el procesamiento— y los contadores en vivo: filas leídas, nuevas, actualizadas,
sin cambios, duplicadas y rechazadas.

**Volver a subir el archivo es la operación normal.** Cada fila lleva una huella
de sus 24 campos, así que una segunda carga del mismo archivo no reescribe nada:

| Situación | Resultado |
|---|---|
| Expediente nuevo | Se inserta |
| Expediente con datos distintos | Se actualiza |
| Expediente idéntico | **No se escribe nada** |
| Expediente que ya no viene | Se marca como ausente. **No se borra** |

Si un archivo dejara fuera más del **20 %** de las compañías vigentes, el job
falla sin tocar la base: es la protección contra subir un archivo truncado por
error. Si la reducción es intencional, se sube en modo *parcial*.

### Consultar (`/companias`)

Tabla paginada con filtros por nombre, RUC, provincia, situación legal y tipo.
La paginación es por cursor y los totales se acotan, para que las páginas
profundas no se degraden con un millón de filas.

## Rendimiento

Medido sobre un archivo de 1.000.000 de filas y 152 MB:

| Fase | |
|---|---|
| Lectura del Excel + coerción de tipos | ~25.000 filas/s |
| Carga a Postgres (`COPY`) | concurrente con la lectura |
| Memoria del proceso Node | estable, no crece con el número de filas |

La clave está en no materializar nunca el libro en memoria, usar `COPY FROM
STDIN` contra una tabla `UNLOGGED` en lugar de `INSERT`, y consolidar con una
única sentencia `ON CONFLICT DO UPDATE`.

Los detalles y los puntos frágiles están documentados en
[back/src/modules/imports/README.md](back/src/modules/imports/README.md).

## Estructura

```
front/          React + Vite
back/           NestJS + TypeORM
  src/modules/companias/    consulta
  src/modules/imports/      importador
  src/database/migrations/  esquema
  scripts/                  generador de datos de prueba
db/             init.sql (sólo para un volumen nuevo)
docker-compose.yml
```

## Avisos importantes

1. **`synchronize` está desactivado**, también en desarrollo. Sobre una tabla de
   un millón de filas la sincronización automática de esquema puede reescribirla
   entera con lock exclusivo y borrar índices. Usa migraciones.

2. **`db/init.sql` ya no se ejecuta**: la imagen de Postgres sólo lo corre
   cuando el volumen está vacío, y `postgres_data` ya está inicializado. El DDL
   que se añada ahí se ignora en silencio.

## Pruebas

```bash
cd back
npm test                                       # coerción de tipos y escapado COPY
npm run fixture -- --filas 1000000 --shared    # genera un .xlsx de prueba realista
```

El generador siembra a propósito los casos difíciles: RUC con ceros a la
izquierda emitidos como número, fechas `DD/MM/YYYY` y una imposible
(`31/02/1998`), capitales con coma y con punto decimal, expedientes duplicados y
nombres con tabuladores, saltos de línea y barras invertidas.
