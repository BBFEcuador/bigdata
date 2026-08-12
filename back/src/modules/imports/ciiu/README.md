# Importador del catálogo CIIU

Carga el catálogo de actividades económicas desde `CIIU.xlsx` (~3.000 filas) y
lo enlaza con las compañías ya cargadas.

## La forma del archivo: el nombre va «para el lado»

A diferencia del plan de cuentas, aquí el nombre **no está en una columna**,
sino repartido en **seis**, una por nivel jerárquico:

```
A          -> columna B (Sección)
A01        -> columna C (División)
A011       -> columna D (Grupo)
A0111      -> columna E (Clase)
A01111     -> columna F (Subclase)
A011111    -> columna G (Actividad Económica)
```

La columna H (`Aplicación`) indica a qué segmentos aplica la actividad.

**Trampa: hay que leer sólo hasta la columna H.** Las columnas J-L contienen una
leyenda («nivel 1 = Sección», …) que ocupa **las mismas filas que los primeros
datos**. Cualquier lectura que recorra «todas las columnas con contenido» se
tragaría esa leyenda como si fueran nombres de nivel.

## Por qué la jerarquía NO es la del plan de cuentas

El código de `catalogo/jerarquia.ts` se parece mucho, pero copiarlo tal cual
produce un árbol que **parece** correcto y no lo es. Hay dos diferencias
deliberadas:

**1. El nivel sale de la longitud del código, no de la cadena de padres.**
Es la definición oficial CIIU. Con una excepción: si el nombre venía en la
columna *Sección*, la fila es de nivel 1 pase lo que pase.

**2. El padre es el prefijo más largo con nivel ESTRICTAMENTE MENOR**, no
simplemente el prefijo más largo.

El motivo son cuatro filas del archivo real donde la columna y la longitud no
concuerdan:

| Código | Longitud dice | Columna dice | Nombre |
|---|---|---|---|
| `G46694` | Subclase | Actividad | Venta al por mayor de otros productos metálicos |
| `N000000` | Actividad | **Sección** | CONSUMO - NO PRODUCTIVO |
| `V000000` | Actividad | **Sección** | VIVIENDA - NO PRODUCTIVO |
| `E000000` | Actividad | **Sección** | EDUCATIVO - NO PRODUCTIVO |

Con la regla del plan de cuentas (prefijo puro), **`N000000` colgaría de la
sección `N`** («Actividades de servicios administrativos y de apoyo») y
`E000000` de `E` («Distribución de agua»). Las dos cosas son falsas: son
categorías especiales añadidas al final del archivo, no subdivisiones. La
restricción de nivel es lo que lo impide.

Las cuatro discrepancias **no se ocultan**: se registran en
`import_row_reject` con su número de fila y se cuentan en «Con aviso».

Resultado sobre el archivo real: **24 raíces** (21 secciones A-U + 3 especiales)
y **0 saltos de nivel**.

## El enlace con `companias`

Los dos archivos usan el mismo código con distinto formato:

```
companias.ciiu_nivel_6   H4923.01     (con punto)
actividad_ciiu.codigo    H492301      (sin punto)
```

En vez de normalizar en cada consulta con `replace()` —que ningún índice puede
aprovechar—, se guarda ya calculada la columna **`codigo_supercias`** con la
forma que usa el archivo de compañías. El join pasa a ser una igualdad directa.

Cobertura real: **1.527 de los 1.533 códigos distintos** que aparecen en
compañías (99,6 %), lo que da nombre de actividad a **225.819 de 225.910**
compañías. Los 6 que no casan (incluido un `ZZZZZ.ZZ` de relleno) se quedan sin
descripción, que es el comportamiento correcto.

Para filtrar por un nivel intermedio (una Clase, un Grupo) sí hace falta comparar
por prefijo sobre el código normalizado, y para eso está el índice funcional
`idx_companias_ciiu6_norm`.

## Ejecutar y probar

```bash
# Ensayo en seco: hace todo el proceso SIN tocar la base
npx ts-node scripts/dry-run-ciiu.ts "ruta\al\CIIU.xlsx"
```

Debe informar 3.048 actividades, 0 rechazos, 24 raíces, 0 saltos de nivel y las
4 discrepancias, con las comprobaciones clave en OK.

La carga real se hace desde `/importar/ciiu`. Es idempotente igual que los otros
importadores: volver a subir el mismo archivo escribe **cero** filas.
