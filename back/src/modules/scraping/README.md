# Jobs de scraping

Un job por sujeto, muchos a la vez, con estados propios, reintentos y acciones
de pausar, reanudar y cancelar.

**Un sujeto es un par `(tipo_sujeto, clave)`**, con los tres valores de siempre:
`compania`, `persona_natural` y `sociedad_no_supervisada`. `clave` es el
**expediente** para una compañía y el **RUC** para las otras dos, porque el SRI
no conoce el expediente y nunca lo conocerá. No es una convención nueva: la
usan `segmento_miembro`, `segmento_evento` y `sujeto_estado_comercial` desde la
migración 9000, y `perfil_comercial` la expone con un índice único.

Hay dos ejecutores registrados: **simulada**, para probar la maquinaria sin una
fuente externa, y **dataportal-web**, que inicia sesión en WordPress y deja un
contexto aislado, navega a la búsqueda, espera la carga AJAX y extrae contactos
y nómina. El navegador sólo devuelve observaciones normalizadas; el ejecutor
las reemplaza mediante un puerto de aplicación y reporta sus cantidades.
Cuando el alta no especifica `fuente`, se usa **dataportal-web**; la fuente
simulada debe pedirse explícitamente.

```
POST /scraping/masivo  →  N jobs 'encolado'
                            │
                 despachador (4 workers, SKIP LOCKED)
                            ▼
                        'corriendo'  ──latido()──►  ¿accion_solicitada?
                            │                         │
        completado ◄────────┼─────────► pausado / cancelado
                            │
                     fallido / vuelta a la cola con backoff
```

## Por qué no es `import_job`

Los importadores y los rastreadores `web` y `dataportal` son **un job grande con
una lista de trabajo dentro**: un índice único parcial garantiza uno solo activo
por `kind`, el enum no tiene `pausado` ni `cancelado`, y el `detener()` es un
booleano en memoria del singleton —global, no por job, y no sobrevive a un
reinicio—. Aquí hace falta lo contrario. Reutilizar `import_job` habría exigido
ampliar su enum y reescribir el índice que protege los imports, para acabar
necesitando igualmente una lista de trabajo aparte.

## Los estados, y las dos ausencias deliberadas

`encolado · corriendo · pausado · completado · fallido · cancelado`

**No hay `reintentando`.** Un reintento es un `encolado` con `intentos > 0` y
`proximo_intento_en` en el futuro. Si fuese un estado propio, alguien tendría
que sacarlo de ahí —¿quién, y cuándo?— y la lógica de la cola estaría escrita
dos veces. La pantalla sí lo distingue: «Reintento 2/3 · en 45 s» sale de
combinar la fila, no de un estado guardado.

**No hay `pausando` / `cancelando`.** La orden vive en `accion_solicitada`, que
es otro eje: `estado` dice dónde está el job, no qué le han pedido. Además,
tras una caída un job en `pausando` es ambiguo —¿llegó a pausarse?—, mientras
que `corriendo` + `accion_solicitada` no lo es: el proceso murió, la petición
sigue en pie, la recuperación la aplica.

La tabla completa de transiciones está en `scraping.estados.ts` y la prueba
`scraping.estados.spec.ts`. Pero **la validación de verdad no está ahí**: es el
`WHERE estado IN (...)` de cada UPDATE. Leer el estado y luego escribir sería
una carrera con el despachador.

Una transición que parece razonable y está prohibida: **`pausado → corriendo`
directo**. Reanudar va siempre por `encolado`; si no, reanudar quinientos jobs
de golpe arrancaría quinientas ejecuciones saltándose el tope de workers.

## Cómo funcionan la pausa y la cancelación

La fuente de verdad es la base, no una variable del proceso. El worker lee la
orden en `latido()`, que escribe el avance y devuelve `accion_solicitada` **en la
misma consulta** — así el chequeo no cuesta ni una ida y vuelta extra.

`latido()` **lanza** `CanceladoError` / `PausadoError` en vez de devolver un
booleano. Devolverlo se olvida de mirar, y ese es el bug clásico de los bucles
cooperativos: el job seguiría trabajando después de que alguien lo cancelara.

La latencia que percibe quien pulsa «Pausar» es exactamente el hueco entre dos
llamadas a `latido()`. **Un scraper debe llamarlo entre peticiones HTTP.**

Si el job todavía está `encolado`, la pausa es inmediata: no hay worker a quien
pedírsela, y el mismo UPDATE lo saca de la cola. Por eso el claim exige
`accion_solicitada IS NULL` y **no la borra**: si lo hiciera, una pausa pedida un
instante antes se perdería.

## Tras un reinicio: reencolar, nunca fallar

Un job en `corriendo` cuyo proceso ya no existe **no ha fallado**: lo
interrumpieron. `scraping-recovery.service.ts` lo devuelve a la cola con su
`progreso_pct` y su `checkpoint` intactos. Marcarlo `fallido` significaría que
cada `nest start --watch` manda a la basura todos los jobs en vuelo.

Que un proceso murió se sabe por el **advisory lock**, no por `latido_en`. Cada
worker toma `pg_advisory_lock('scraping_job:<id>')` sobre un `QueryRunner`
propio y lo mantiene mientras trabaja; si el proceso muere, Postgres lo suelta
solo. Que el lock se pueda tomar es prueba de que nadie lo está ejecutando, sin
ventana de falso positivo — que es justo lo que un umbral sobre `latido_en` no
puede prometer: un job legítimamente lento parecería muerto.

El contrapunto, que conviene conocer: un proceso **colgado pero vivo** conserva
su lock y no se recupera nunca. Para eso está `latido_en` en la tabla y en la
pantalla, para verlo a ojo.

> El `QueryRunner` dedicado no es un capricho. Un advisory lock es de **sesión**;
> sobre el pool no hay ninguna garantía de que la consulta que lo toma y la que
> lo suelta usen la misma conexión. `import-jobs.service.ts` lo toma sobre el
> pool y funciona sólo porque lo suelta dentro del mismo `await`.

## `intentos` se incrementa al reclamar, no al fallar

Si se incrementara al fallar, un job que tumba el proceso —OOM, un bucle
infinito— volvería a la cola con los mismos intentos y lo tumbaría otra vez,
para siempre. El precio es que **un reinicio del servidor consume un intento** de
cada job en vuelo: con `max_intentos = 3` y cuatro workers, cuatro intentos por
reinicio.

## Añadir un scraper real

1. Un archivo en `ejecutores/` que implemente `Scraper`.
2. Su clase en `providers` y en el `inject` de la factoría de `scraping.module.ts`.

Nada más. Ni el despachador, ni el servicio, ni la migración, ni la pantalla
saben cuántos scrapers hay: el front los descubre por `GET /scraping/fuentes`.

**Cuidado con el cliente HTTP.** Si el scraper hace `new Cliente()` dentro de
`ejecutar()`, su limitador de peticiones es por job, y con
`SCRAPING_CONCURRENCIA=4` el ritmo real contra la página ajena es cuatro veces
el configurado. Es exactamente lo que hoy hace `web.client.ts`, donde daba igual
porque sólo corría un job. **El cliente tiene que ser un provider singleton**
inyectado en el constructor del scraper.

La regla general que hereda de `web` es escribir observaciones, no promoverlas
como datos de negocio. La excepción controlada de `dataportal-web` son los
contactos y la nómina normalizados: se escriben en `dataportal_contacto` y
`dataportal_nomina` mediante un puerto de aplicación y un adaptador PostgreSQL,
nunca directamente desde Playwright. El reemplazo de ambas listas comparte una
transacción. No toca los campos de `contribuyentes`, `presencia_canal` ni
`perfil_comercial`.

## Rutas

| verbo  | ruta                                     |                                                                              |
| ------ | ---------------------------------------- | ---------------------------------------------------------------------------- |
| `POST` | `/scraping`                              | `{tipoSujeto, clave}` · 201 · 404 si no existe · 409 si ya tiene un job vivo |
| `POST` | `/scraping/masivo`                       | 202 → `{ creados, omitidos }`. **Una población por llamada**                 |
| `GET`  | `/scraping`                              | lista paginada por cursor + resumen por estado                               |
| `GET`  | `/scraping/resumen`                      | contadores + estado del despachador                                          |
| `GET`  | `/scraping/fuentes`                      | los scrapers registrados                                                     |
| `GET`  | `/scraping/:id`                          | job + últimos 20 eventos                                                     |
| `GET`  | `/scraping/:id/resultados`               | los documentos guardados                                                     |
| `GET`  | `/scraping/sujeto/:tipo/:clave`          | el historial de un sujeto                                                    |
| `POST` | `/scraping/:id/pausar` · `/cancelar`     | **202**: si ya corría, la orden la cumple el worker                          |
| `POST` | `/scraping/:id/reanudar` · `/reintentar` | 200                                                                          |

No hay `DELETE` ni un `PATCH { estado }` genérico: un job sólo se mueve por esas
cuatro acciones, cada una con su estado de origen en el `WHERE`. Un PATCH libre
haría inútil la máquina de estados, y borrar un job perdería el rastro de que se
intentó rastrear esa compañía — que es información aunque el intento saliera mal.

Toda escritura exige la cabecera `X-Usuario` y deja una fila en
`scraping_job_evento`. Se audita el **cambio**, no el estado final: «quién
canceló cuatro mil jobs y cuándo» no se reconstruye desde una fila que se
sobrescribe.

## Ajustes

| variable                               | por defecto                 |                                                                    |
| -------------------------------------- | --------------------------- | ------------------------------------------------------------------ |
| `SCRAPING_CONCURRENCIA`                | 4                           | workers **por proceso** (dos instancias dan el doble)              |
| `SCRAPING_INTERVALO_OCIOSO_MS`         | 2000                        | espera del bucle cuando la cola está vacía                         |
| `SCRAPING_TICKS_POR_BARRIDO`           | 60                          | cada cuántas vueltas se buscan jobs huérfanos                      |
| `SCRAPING_MAX_INTENTOS`                | 3                           |                                                                    |
| `SCRAPING_BACKOFF_BASE_MS` / `_MAX_MS` | 30 000 / 600 000            | 30 s, 60 s, 120 s… con tope                                        |
| `SCRAPING_SIM_MS_PASO`                 | 700                         | (simulado) duración de cada paso                                   |
| `SCRAPING_SIM_FALLO_PCT`               | 10                          | (simulado) fallos por paso; 1 de cada 4 es permanente              |
| `SCRAPING_SIM_LENTO_PCT`               | 3                           | (simulado) porcentaje que tarda 30 s                               |
| `SCRAPING_DATAPORTAL_BASE_URL`         | `https://dataportalsys.com` | origen del WordPress                                               |
| `SCRAPING_DATAPORTAL_USERNAME`         | —                           | usuario; obligatorio para `dataportal-web`                         |
| `SCRAPING_DATAPORTAL_PASSWORD`         | —                           | contraseña; obligatoria para `dataportal-web`                      |
| `SCRAPING_DATAPORTAL_TIMEOUT_MS`       | 30 000                      | timeout de acciones y navegaciones                                 |
| `SCRAPING_DATAPORTAL_HEADLESS`         | `true`                      | usar `false` sólo para diagnóstico local                           |
| `SCRAPING_DATAPORTAL_CONCURRENCIA`     | 1                           | contextos simultáneos por proceso y cuenta                         |
| `SCRAPING_DATAPORTAL_DEBUG_ESPERA_MS`  | 0                           | tiempo que se mantiene abierta la página RUC para inspección local |

## Chromium para DataPortal

Playwright está fijado en `package-lock.json`, pero su navegador se instala por
separado en cada entorno operativo:

```bash
npx playwright install chromium
```

En una imagen Linux nueva pueden hacer falta también las bibliotecas del sistema;
se instalan durante la construcción de la imagen con:

```bash
npx playwright install --with-deps chromium
```

No se debe ejecutar la segunda orden durante el arranque de la aplicación. Las
credenciales van en variables de entorno y el adaptador no registra cookies,
valores de campos, HTML ni capturas de páginas autenticadas.

Los fallos del simulado no son ruido: sin ellos, ni el backoff, ni
`max_intentos`, ni el estado `fallido` se ejercitan nunca, y se descubren rotos
el día que entre el scraper de verdad.

## Dónde se comprueba que el sujeto existe

En el alta de **uno solo**, contra la tabla de origen —`companias`,
`persona_natural`, `sociedad_no_supervisada`—, para que un sujeto importado hace
diez minutos no se rechace. En el alta **masiva**, contra `perfil_comercial`, que
es la única con las tres poblaciones en la misma forma y con provincia ya
calculada; ahí sí da igual que sea materializada, porque un barrido de miles no
necesita a los últimos que entraron.

No hay clave foránea en ninguno de los dos casos: el historial de por qué se
rastreó algo tiene que sobrevivir a que el sujeto desaparezca del padrón.

## Lo que no está acotado entre instancias

`SKIP LOCKED` y los advisory locks hacen que dos instancias del backend sean
**correctas** (no se pisan, no ejecutan el mismo job), pero `CONCURRENCIA` es por
proceso. Si algún día se despliega en varias instancias, el tope global tendría
que contar los `corriendo` en la base.
