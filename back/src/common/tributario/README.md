# Riesgo tributario: estimación presuntiva

Aplica los coeficientes de estimación presuntiva del impuesto a la renta que el
SRI publica por rama de actividad, y compara la base imponible que saldría de
ellos con la que se desprende del balance presentado.

| Pieza | Dónde | Qué resuelve |
|---|---|---|
| Coeficientes | `coeficiente_presuntivo`, `coeficiente_general` | el valor normativo de cada rama y ejercicio |
| Respaldo | `resolucion_presuntiva` | qué resolución ampara cada ejercicio |
| Cálculo | `riesgo_tributario` (vista materializada) | la presunción y la brecha, por empresa y año |
| Carga | `npm run coeficientes -- <archivo.xlsx>` | leer el comparativo del SRI |

## La regla, que no es la intuitiva

No son márgenes de utilidad. Son **multiplicadores que se aplican por separado**
sobre el total de ingresos, el total de costos y gastos y el total de activos, y
la base imponible presunta es **el mayor de los tres resultados** (art. 4 de
cada resolución). Promediar los tres, o usar sólo el de ingresos, da un número
más suave y equivocado.

## Lo que descubrimos al calcularlo sobre los 488.590 balances

**El 92 % de las compañías tiene brecha positiva.** No es un hallazgo sobre el
país: es lo que son estos coeficientes. Se calibran alto porque son un método de
determinación de último recurso, no un retrato de la rentabilidad normal.

De ahí la consecuencia de diseño: **«brecha > 0» no puede ser el indicador de
riesgo.** Señalaría a nueve de cada diez y no distinguiría nada. Lo que
discrimina es la brecha **relativa al tamaño y comparada contra la propia rama**,
que es la misma lección que ya estaba aprendida en el análisis financiero.

Dos datos más del mismo cálculo, que cambian cómo se lee cada caso:

- En el **66 %** de los casos la base que manda es la de **activos**, no la de
  ingresos (que gana en el 0,7 %). Una empresa señalada porque le manda el
  coeficiente de activos es una empresa con patrimonio parado, y el argumento
  frente a ella es otro que el de una con costos inflados. Por eso se guarda
  `base_manda` y no sólo el máximo.
- El **51,6 %** declaró pérdida o cero en el ejercicio 2024. «Declaró poco»
  tampoco separa por sí solo.

## El perfil: percentil dentro de la rama y persistencia

`riesgo_tributario_anio` normaliza la brecha por ingresos (**intensidad**) y la
compara contra el grupo de pares del año; `perfil_riesgo_tributario` resume una
fila por compañía. El grupo de pares es el **grupo CIIU**, con repliegue a
división y a sección por debajo de 30 empresas, elegido una sola vez por empresa
y año.

El percentil cuenta las estrictamente menores más la mitad de los empates, igual
que en el análisis financiero y por la misma razón. Comprobación de que está
bien: la media y la mediana de los percentiles salen exactamente en 0,500.

**Tres poblaciones, un solo ranking.** Sólo se ordenan las `comparable` (46,6 %
en el último ejercicio). Las `sin_utilidad` (16,2 %) tienen por construcción una
brecha igual a toda la base presunta, y las `sin_ingresos` (37,2 %) sacan la
presunción entera del coeficiente de activos: en la misma lista coparían la
cabeza sin que eso signifique nada.

**Lo que ordena es la persistencia.** Un año en el decil alto es ruido —un activo
comprado, un mal ejercicio—; cuatro seguidos es un patrón. De 66.485 compañías
comparables, 401 están en el decil alto los cuatro ejercicios y 1.041 en tres.

Un sesgo que hay que conocer para no leer mal la lista: en el 66 % de los casos
manda el coeficiente de activos, así que la cabeza del ranking son negocios
intensivos en capital (concesiones, terminales, inmobiliarias). La comparación
dentro del grupo CIIU lo neutraliza en parte —los que salen arriba lo hacen
frente a sus propios pares—, pero el método presuntivo castiga al patrimonio por
diseño y eso se ve.

## Lo que este número NO es

1. **No es un impuesto adeudado.** La estimación presuntiva sólo procede cuando
   la contabilidad no permite determinar la base de forma directa (art. 18 y 19
   LRTI). Una compañía con balances presentados está, por definición, en
   determinación directa. Esto mide **exposición**: qué base saldría si se
   aplicara el método, no lo que se debe.
2. **La base declarada es contable, no fiscal.** Usamos
   `utilidadAntesImpuestos`, porque es lo que hay. La base imponible real pasa
   por la conciliación tributaria —participación de trabajadores, gastos no
   deducibles, rentas exentas, amortización de pérdidas— que no está en el
   balance de la Superintendencia. La brecha es un indicador, no una liquidación.
3. **Los ingresos son los ordinarios, no el total.** El concepto `ingresos` es
   la cuenta 401 (IFRS) / 1005 (fiscal), sin otros ingresos. La resolución habla
   del *total*. La presunción sale por lo bajo, que para un indicador de riesgo
   es el error correcto: no inventa exposición que no se puede sostener.
4. **No aplica a RIMPE ni a regímenes simplificados** (art. 7). Se identifican
   por `sri_clase_contribuyente = 'RMP'` —24.555 compañías— y se marcan con
   `rimpe`. Se calculan igual, pero quedan fuera de cualquier ranking.

## El rezago de dos años

Cada resolución se dicta con **dos ejercicios de retraso**: la de 2022 se expidió
en 2024, la de 2023 en 2025 y la de 2024 en enero de 2026. La de 2025 no existe
todavía y correspondería en enero de 2027.

Por eso `resolucion_presuntiva` es una tabla y no un comentario: un ejercicio sin
coeficientes publicados y un ejercicio que nadie cargó se ven igual en los datos,
y sólo uno de los dos es un problema. La vista sólo calcula los años que tienen
resolución registrada, así que 2025 —que sí tiene balances— queda fuera solo.

## Celdas en blanco: son datos, no huecos

45 celdas del comparativo están vacías, y son intencionales. Las ramas Q872,
Q873, Q881, Q889 y S942 aparecen por primera vez en la resolución de 2024, y en
2021 la comercialización de minerales no fijó coeficiente sobre activos. En esos
casos aplica el **general del art. 3**, que es lo que hace `coeficiente_general`.

El repliegue se resuelve **base por base**, no en bloque: un grupo puede tener
coeficiente propio de ingresos y general de activos. Resolverlo en bloque habría
tirado el específico en cuanto faltara cualquiera de los tres.

Cargar un ejercicio sin su coeficiente general aborta la carga entera. Sin esa
comprobación, las ramas sin coeficiente propio se quedarían sin base y saldrían
como «sin riesgo», que es el fallo más caro: silencioso y en la dirección
tranquilizadora.
