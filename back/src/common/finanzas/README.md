# Análisis financiero

Tres capas, de abajo arriba:

| Capa | Archivo | Qué resuelve |
|---|---|---|
| Conceptos | `conceptos.ts` | qué cuenta es el activo en cada formulario |
| Indicadores | `indicadores.ts` | qué es el ROE, en TypeScript **y** en SQL |
| Percentiles | `modules/balances/percentiles.service.ts` | dónde está la empresa respecto de su sector |

Las dos primeras se comparten con los importadores; la tercera se precalcula por
lote y se guarda en tablas.

## La fórmula es un dato, no una función

Cada indicador se calcula en dos sitios: en Node, para la ficha de una compañía,
y en SQL, para recorrer 670.000 balances y sacar los percentiles del sector.
Traer 670.000 balances a Node no es una opción y escribir la fórmula dos veces
tampoco: el día que alguien corrija el ROE en un lado y no en el otro, la empresa
saldría comparada contra un percentil que mide otra cosa y **nada fallaría**.

Por eso la fórmula se declara como datos:

```ts
{ clave: 'pruebaAcida', formula: { num: ['activoCorriente'], menos: ['inventarios'], den: ['pasivoCorriente'] } }
```

y de ahí salen `evaluar()` (TypeScript) y `sqlDeFormula()` (SQL). Añadir un
indicador es añadir una entrada a `INDICADORES`; el SQL se genera solo.

`indicadores.spec.ts` no puede ejecutar el SQL —eso necesita la base—, pero sí
comprueba lo que puede divergir en silencio: que la fórmula nombre magnitudes que
el diccionario de conceptos produce, que el SQL generado use exactamente esas, y
que el denominador vaya protegido.

## Las dos reglas del `null`

1. **Denominador cero → `null`, nunca cero ni infinito.** Con 578.000 empresas
   hay patrimonio cero, activo cero e ingresos cero garantizados. Devolver 0 los
   mezclaría con las que legítimamente tienen un ratio de 0 y hundiría la mediana
   de cualquier sector.
2. **Falta un insumo → `null`.** El formulario fiscal no desglosa inventarios ni
   gastos financieros, así que su prueba ácida y su cobertura de intereses no
   existen. No se aproximan.

En SQL las dos reglas son la misma cosa: una clave ausente en el `jsonb` da
`NULL` y el `NULL` se propaga; el denominador va con `nullif(..., 0)`.

## De cuentas a magnitudes: `balance_magnitud`

Los indicadores se calculan sobre conceptos, y un concepto es una cuenta distinta
en cada formulario. Resolver eso dentro de la consulta de percentiles habría
significado repetir el diccionario de conceptos en SQL.

`balance_magnitud` (vista materializada) hace la traducción una vez: una fila por
(año, expediente) con un `jsonb` de magnitudes ya con nombre de concepto. A partir
de ahí ninguna consulta de percentiles conoce un solo código de cuenta.

El diccionario que usa —`concepto_cuenta`— **no lo llena la migración**: lo vuelca
el servicio desde `CONCEPTOS` en cada recálculo. Si se hubiera escrito en la
migración habría dos diccionarios, y sólo uno se corregiría.

Detalles que no son opcionales:

- **Un año, un formulario, una empresa.** Si una compañía declaró el mismo año en
  los dos formularios gana el IFRS. Sin ese `DISTINCT ON`, las ~17.000 empresas
  que en 2021 presentaron los dos pesarían el doble en la mediana de su sector.
- **Cero declarado vs. concepto inexistente.** Las magnitudes se montan como
  `base || valores`, donde `base` son los conceptos del formulario a cero: en
  `balance_cuenta` la ausencia de fila **es** el cero. Pero un concepto que el
  formulario no trae no está ni en `base`, su clave falta en el `jsonb` y el
  indicador sale sin calcular en vez de salir con un cero que nadie declaró.

## El grupo de pares

Sector = **división CIIU** (letra y dos dígitos: `H49`, transporte terrestre). Es
el nivel al que el taxi ya no comparte mediana con el aeropuerto.

Si esa división tiene menos de 30 empresas ese año, se compara contra la
**sección** (`H`). Con menos de 30, la mediana la mueve una sola empresa y el
percentil 90 es literalmente «la segunda de tres».

La elección se hace **una vez por empresa y año**, no indicador por indicador: si
la liquidez se comparara contra la división y el margen contra la sección, las dos
cifras de la misma fila estarían midiendo contra poblaciones distintas sin que se
note en pantalla. La pantalla dice siempre qué grupo se usó.

Los 84 balances sin rama de actividad se quedan fuera de la comparación. No se
inventa un sector para ellos.

## El percentil es exacto, no interpolado

Teniendo los cortes p10…p90 del sector se puede estimar la posición de una empresa
interpolando, y sale gratis. Sale gratis y sale mal: entre el p50 y el p75 de un
ratio de liquidez caben órdenes de magnitud. Se guarda el percentil real de cada
empresa (`cume_dist()` sobre su grupo de pares) en `indicador_empresa`.

Mide el **porcentaje de empresas del sector que quedan por debajo, repartiendo el
empate**: las estrictamente menores más la mitad de las que valen exactamente lo
mismo. El empate no es un caso de borde aquí —una cuarta parte del país declara
ROE exactamente 0—: contando «menores o iguales» a secas, todas esas empresas se
llevaban el tope del empate y salían en el percentil 48 estando en el cero, con la
media de percentiles del sector en 56 en vez de en 50.

Cuentan sólo las empresas que tienen ese indicador calculado. Por eso `n` se guarda por indicador y
no por sector: en el formulario fiscal no hay inventarios, así que la prueba ácida
de un sector puede tener la mitad de muestra que su liquidez corriente.

Estar arriba no es estar bien: el percentil 90 de «endeudamiento del activo» es lo
contrario del percentil 90 de ROE. La dirección la declara cada indicador
(`mejor: 'alto' | 'bajo' | 'neutro'`) y es lo único que colorea la pantalla. El
apalancamiento se queda sin color a propósito: apalancarse es la forma normal de
crecer y también la forma normal de quebrar.

## Recalcular

```bash
npm run percentiles
```

o, con la API levantada, `POST /balances/percentiles/recalcular`. Es el mismo
servicio. El script existe porque el recálculo tarda minutos y, lanzado contra
`start:dev`, cualquier guardado en `src/` reinicia Nest y se lleva por delante la
transacción a medias.

Refresca `balance_magnitud` y reescribe `indicador_percentil` (cortes por sector)
e `indicador_empresa` (percentil por empresa). Tarda minutos y va en una sola
transacción: entre borrar los percentiles viejos y escribir los nuevos hay tiempo
suficiente para que una pantalla abierta muestre una empresa sin sector.

**Hay que correrlo después de importar balances.** No se dispara solo al
consultar: es un recorrido completo de 670.000 balances, no algo que pueda pasar
mientras alguien espera una respuesta.

El refresco de `balance_magnitud` va **sin** `CONCURRENTLY`, al revés que el del
perfil comercial: esa vista sólo la lee este recálculo —las pantallas leen las dos
tablas de resultado—, así que bloquearla no le quita nada a nadie.
