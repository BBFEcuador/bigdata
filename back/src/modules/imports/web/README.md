# Presencia digital: web y redes sociales

Busca el sitio y las redes de cada compañía. La fuente no es un archivo ni una
API: son los propios servidores de las empresas.

**Nada de lo que encuentra queda como bueno.** Todo entra como propuesta y lo
valida una persona desde `/presencia`. Este módulo genera trabajo para el
revisor; no es una fuente de verdad.

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/imports/web` | Siembra las compañías vigentes y arranca el rastreo. Devuelve 202. |
| `POST` | `/imports/web/detener` | Para tras la compañía en curso. El avance queda guardado. |
| `GET` | `/imports/web/estado` | Avance, motivos de descarte y cuánto queda por revisar. |

La revisión humana vive en otro módulo: `back/src/modules/presencia/`.

## Cómo encuentra un sitio sin usar un buscador

No hay ninguna consulta a Google ni a Bing, y no se raspan resultados de
búsqueda. El recorrido es:

1. **Conjeturar** hasta ocho dominios desde lo que ya sabemos: el dominio del
   correo, el nombre comercial del SRI y la razón social, combinados con
   `.com.ec`, `.ec` y `.com`.
2. **Resolver el DNS**, que descarta casi todos en milisegundos.
3. **Pedir la portada** de los que existen, respetando `robots.txt`.
4. **Leer** título, descripción y enlaces a redes.
5. **Proponer**. Nunca confirmar.

### Cuánto acierta, medido de verdad

Rastreo real de 100 compañías cuya web ya conocemos por el catastro de turismo,
probando **todos** los candidatos de cada una. Por origen del dominio:

| De dónde sale el dominio | Acierta | Se equivoca |
|---|---|---|
| Correo × `.com.ec` | 11 | 1 |
| Correo × `.com` | 19 | 7 |
| Correo × `.ec` | 2 | 0 |
| Nombre comercial × `.com` | 10 | **59** |
| Nombre comercial × `.com.ec` | 3 | 8 |
| Nombre comercial × `.ec` | 1 | 6 |
| Razón social (cualquier TLD) | **0** | 7 |

Tres conclusiones, y ninguna era la esperada:

1. **El dominio del correo es el módulo entero**: 80 % de acierto. No es una
   conjetura — lo escribió la empresa en un formulario oficial.
2. **`nombre comercial × .com` producía dos tercios de toda la basura.**
   `HOSTERIA LA PRIMAVERA` aterrizaba en `oracle.com` y `ASERLACO` en
   `crepes.com`. Ese TLD ya no se conjetura desde un nombre.
3. **La razón social no acertó ni una vez.** `SOROA S.A.` opera un hotel
   Marriott y `DEGEREMCIA S.A.` está en `naturissimo.com`: del nombre legal
   ecuatoriano no se deduce ningún dominio.

Con la regla actual —correo sin condiciones, nombre sólo si la página menciona
a la compañía— la precisión sube del 55 % al 79 %.

### El límite real, que no es el código

La regla buena necesita un correo con dominio propio, y en toda la base hay
**1.396 compañías** con uno (0,6 %). Las otras 225.000 sólo tienen el nombre, y
del nombre no sale casi nada.

Dicho de otro modo: este rastreador está listo y funciona, pero está esperando
su materia prima. Quien la trae es el enriquecimiento de DataPortal, que ahora
mismo tiene **0 RUC consultados** por el problema de permisos de la cuenta.
Resuelto aquello, la regla del 80 % pasa de aplicar al 0,6 % de las compañías a
aplicar a la mayoría. Ese es el cuello de botella, y no es de programación.

## Las tres decisiones que sostienen el módulo

### 1. El rastreador nunca sobrescribe una fila que ya existe

`ON CONFLICT (expediente, canal, valor) DO NOTHING`, y no `DO UPDATE`. Si
alguien confirmó un Instagram o descartó un dominio equivocado, el siguiente
recorrido tiene que respetarlo. Con `DO UPDATE`, cada rastreo devolvería a
'propuesto' lo ya revisado y el revisor vería los mismos casos una y otra vez
sin entender por qué.

Por la misma razón, **descartar no borra**: la fila se queda con
`revision = 'descartado'` justamente para que no se vuelva a proponer.

### 2. El correo gratuito se filtra antes que nada

Miles de compañías dan un Gmail como contacto. Sin la lista de proveedores
gratuitos de [`web.dominios.ts`](./web.dominios.ts), `gmail.com` entraría como
"sitio web" de todas ellas — y con la mejor prioridad, porque el dominio del
correo es el primer candidato.

### 3. Los botones de compartir no son perfiles

Casi toda web lleva un `facebook.com/sharer.php?u=…`. Sin la lista de rutas
excluidas de [`web.html.ts`](./web.html.ts), media base de datos acabaría con el
mismo Facebook falso. Lo mismo con `twitter.com/intent/tweet` y
`linkedin.com/shareArticle`.

## Lo que sí se filtra automáticamente

Sólo lo que no es una web de empresa en absoluto: dominios en venta, portadas
por defecto de Apache o nginx, y páginas vacías. Eso no es decidir por el
revisor, es no hacerle perder el tiempo.

Todo lo demás llega a la cola con sus indicios —el título, si el nombre de la
compañía aparecía en la página, de qué regla salió el dominio— y decide él.

## Cortesía con servidores ajenos

Son cientos de miles de peticiones contra máquinas de terceros:

- `robots.txt` se consulta y se respeta.
- `User-Agent` identificable y configurable (`WEB_USER_AGENT`). Un administrador
  que ve tráfico raro tiene que poder saber qué es; si no, bloquea el rango.
- 8 peticiones por segundo en total (`WEB_RPS`), no por dominio.
- **Sin reintentos.** Si un dominio conjeturado no contesta, lo más probable es
  que no sea de nadie; reintentar triplicaría el recorrido para rescatar cuatro
  casos.
- Se leen 512 KB como máximo por página, cortando el stream. Un `res.text()` con
  recorte posterior ya se habría comido el megabyte.

## Variables de entorno

```
WEB_RPS=8
WEB_TIMEOUT_MS=10000
WEB_USER_AGENT=FRIDAY-webcheck/1.0 (+https://tu-dominio/bot; contacto@tu-dominio)
```

Pon un contacto real en `WEB_USER_AGENT` antes de la primera carga grande.

## Estado de verificación

Las partes puras —generación de candidatos y lectura de HTML— están cubiertas
por 25 tests:

```bash
npm test
```

La ruta de red sí está probada: 100 compañías rastreadas contra internet real,
con ~700 dominios comprobados.

**Si todos los candidatos salen `sin_dns`, mira el resolvedor antes que los
datos.** Es el fallo que se comió la primera prueba entera: `dns.getServers()`
devolvía `127.0.0.1` —un stub local de VPN o de Docker Desktop— y `resolve4`
daba `ECONNREFUSED` en una máquina con internet perfectamente funcional. Por eso
`resuelve()` va por `dns.lookup`, que usa el resolvedor del sistema y es además
el mismo que usa `fetch`. Para diagnosticarlo:

```bash
node -e "const d=require('dns');console.log(d.getServers());d.lookup('example.com',console.log);d.resolve4('example.com',console.log)"
```

## Lo que no hace, y por qué

- **No busca en Google.** Raspar resultados es un bloqueo garantizado. Con API
  de pago sería un módulo distinto y unos 1.100–2.200 USD para las 226.191
  compañías.
- **No busca perfiles de redes por nombre.** No hay API pública para eso, y
  adivinar `facebook.com/<slug>` produce basura verosímil, que es la peor clase
  de basura. Las redes salen de los enlaces del propio sitio.
- **No usa el correo del enriquecimiento de DataPortal**, que multiplicaría los
  candidatos de buena calidad. Es un módulo aparte a propósito; añadir ese
  `JOIN` es una línea el día que se quiera.
- **No toca `companias` ni `perfil_comercial.sitio_web`.** Ese dato viene del
  catastro de turismo, es oficial y declarado por el titular; mezclarlo con una
  conjetura borraría la diferencia.
