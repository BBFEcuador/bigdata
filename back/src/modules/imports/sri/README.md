# Importador del padrón del SRI

Carga el registro de contribuyentes del SRI desde CSV provinciales separados por
barras verticales (`|`), en UTF-8. **Un archivo = una provincia.**

Los 24 archivos juntos son 2,9 GB y **8.432.317 filas**:

| | |
|---|---|
| Personas naturales | 7.648.243 filas |
| Sociedades | 783.977 filas |
| Filas mal formadas | 97 |

## Endpoint

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/imports/sri` | Recibe el CSV de una provincia, devuelve **202** con `jobId`. |

No acepta el parámetro `modo`: **siempre es parcial**, y no por comodidad. Los
otros importadores tratan el archivo como la foto completa del registro y marcan
lo que no viene; aquí eso significaría que cargar Azuay marca como
desaparecidos a los contribuyentes de las otras 23 provincias. No se implementa
el modo completo en vez de dejarlo como una opción que alguien podría pulsar.

## Tres destinos, no uno

El archivo mezcla dos poblaciones que no tienen nada que ver, y las sociedades
se reparten a su vez en dos:

```
TIPO_CONTRIBUYENTE = PERSONA NATURAL   ->  persona_natural
TIPO_CONTRIBUYENTE = SOCIEDAD
        y su RUC está en companias     ->  enriquece companias
        y su RUC NO está en companias  ->  sociedad_no_supervisada
todas                                  ->  establecimiento (1:N)
```

**Las personas naturales se separan físicamente.** No presentan balances ni
tienen indicadores financieros, y meterlas en la misma tabla que las empresas
obligaría a que cada consulta se acordara de excluirlas. Un olvido, y un
promedio sectorial pasa a incluir a siete millones de personas sin balance.

**Las sociedades no supervisadas son ~40 % de las sociedades del padrón**:
fundaciones, cooperativas, entidades públicas, sociedades de hecho. No son
basura ni fallos de enlace — tienen RUC, actividad económica y establecimientos,
así que son prospectos válidos. Simplemente nunca tendrán balances.

## Una fila por establecimiento, no por RUC

En Galápagos son 27.618 filas para 20.252 RUC. Los datos del contribuyente se
repiten en cada uno de sus locales, así que el merge deduplica con
`DISTINCT ON (ruc) ORDER BY ruc, numero_establecimiento`: gana la matriz. Sin
eso, `ON CONFLICT` falla con «cannot affect row a second time» en cuanto un RUC
tiene dos locales, es decir, casi siempre.

## El punto frágil: la barra vertical dentro de un campo

El archivo es *casi* un `split('|')`, y ese *casi* es lo peligroso. 97 filas
traen un `|` literal dentro de `RAZON_SOCIAL`, entrecomillado:

```
0101888055001|"VINTIMILLA VIVAR PEDRO JOSE|"|AZUAY|ACTIVO|...
```

Eso da **22 campos en vez de 21** y corre todas las columnas una posición:
`TIPO_CONTRIBUYENTE` pasa a valer `"N"`, la provincia deja de ser la provincia,
y **nada de eso produce un error**. Se cargarían 97 filas silenciosamente
corruptas y clasificadas en el destino equivocado.

`parsearFilaSri` intenta primero el `split` rápido —que cubre los 8,4 millones
de filas— y sólo cuando el número de campos no cuadra reintenta con un parser
que respeta las comillas. Hacer el caro siempre costaría minutos sobre este
volumen. Un tipo de contribuyente desconocido se **rechaza**, nunca se adivina:
clasificar mal es peor que perder la fila.

## El enlace con `companias` es por RUC, y se resuelve una sola vez

El SRI no conoce el `expediente`. El puente se materializa durante el import en
las columnas `sri_*` de `companias`, en vez de hacer el join por RUC en cada
consulta.

Los **8 RUC que apuntan a dos expedientes** no enlazan con ninguno: elegir uno
sería inventar. Quedan registrados en los avisos del job.

Sólo se escriben columnas `sri_*`: lo que trae el directorio de la
Superintendencia no se pisa nunca.

## Idempotencia

Dos hashes por fila, y no uno: `row_hash` cubre los datos del contribuyente
—que se repiten en todos sus locales— y `row_hash_estab` los del
establecimiento. Así un local que cambia de nombre no fuerza a reescribir la
ficha del contribuyente, ni al revés.

## Probar

```bash
npm test   # 15 tests del parser, incluidas las filas reales que rompen el split
```

Los tests usan filas literales del padrón de Azuay y Galápagos, no ejemplos
inventados.
