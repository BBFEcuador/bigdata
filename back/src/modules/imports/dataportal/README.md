# Enriquecimiento desde DataPortal

Completa las compañías con lo que las fuentes públicas no traen: **correos,
móviles, nómina con sueldos y vehículos**. La fuente es la API REST de
`dataportalsys.com`, no un archivo.

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/imports/dataportal` | Siembra los RUC pendientes y arranca la extracción. Devuelve 202. |
| `POST` | `/imports/dataportal?segmento=<codigo>` | Igual, pero acotado a un segmento comercial. |
| `POST` | `/imports/dataportal/detener` | Para tras el RUC en curso. El avance queda guardado. |
| `GET` | `/imports/dataportal/estado` | Reparto por estado y cuántos datos se llevan extraídos. |

## Acotar a un segmento

```
POST /imports/dataportal?segmento=salto_umbral_auditoria
```

Recorrer las 226.191 compañías cuesta ~31 horas. Un segmento comercial suele ser
de miles, y es lo razonable cuando lo que se quiere es enriquecer una lista de
trabajo concreta.

El parámetro es un **código de segmento**, nunca un fragmento SQL: se valida
contra la tabla `segmento` y viaja como parámetro de consulta. La condición del
segmento se evalúa en su módulo y no llega hasta aquí.

**El filtro se aplica al tomar el lote, no sólo al sembrar.** Es el detalle que
parece redundante y no lo es: si una carga anterior ya sembró los 226.191 RUC,
todos siguen en `pendiente`, y sembrar de menos no quita ninguno. Con el filtro
sólo en la siembra, el job "acotado" se pondría a recorrer la lista entera.

Por lo mismo, **el ámbito no se guarda en el job**: para reanudar una carga
acotada hay que volver a pasar el mismo `?segmento=`. Sin él continúa por todos
los pendientes.

Si el segmento no tiene miembros el job no arranca: se responde 400 en vez de
terminar "con éxito" en un segundo sin haber consultado nada. Un segmento
definido pero nunca corrido tiene cero miembros.

## Las credenciales

Van en `back/.env`, **nunca en el código**:

```
DATAPORTAL_TOKEN=...
DATAPORTAL_RPS=5
```

`.env` está en `.gitignore`. El cliente **relee el token en cada petición**, no
lo captura al arrancar: una carga larga puede sobrevivir a una revocación si se
actualiza el archivo, y el job sigue sin reiniciarse.

Un `401` o `403` **no se reintenta**: para la carga entera. Insistir 1,13 M de
veces con una credencial muerta no la revive.

### La autenticación es el `?token=`, y sólo eso

Las credenciales de WordPress **no autorizan estas rutas**. Medido el
12/08/2026, mismo RUC, cuatro variantes:

| Cómo se pide | Respuesta |
|---|---|
| `?token=` en la query | **200** |
| Contraseña de aplicación por `Authorization: Basic` | 401 `usuario no autorizado` |
| Contraseña de la cuenta por `Authorization: Basic` | 401 `usuario no autorizado` |
| Sin nada | 401 `usuario no autorizado` |

El token sale del propio panel: en `wp-admin`, la pantalla **Buscar por Ruc**
llama a estos mismos cinco endpoints con el token en la URL. Se ve en la
pestaña de red del navegador.

**Este README afirmaba lo contrario** —que no había ningún `?token=` y que la
autenticación era la de WordPress— y costó una noche entera. La deducción de la
que salía parecía sólida: el índice de la API declara `dni` como único argumento
de cada ruta, y el raíz anuncia `application-passwords` como método de
autenticación. Ninguna de las dos cosas describe cómo autoriza el plugin, pero
las dos apuntaban al sitio equivocado y el `401` no distingue "valor
equivocado" de "mecanismo equivocado", así que la hipótesis nunca se caía sola.

Si algún día vuelve a dar 401: **mira por red qué pide el panel del portal**
antes de tocar credenciales. Y ojo con los `429` — el portal limita el ritmo
*antes* de comprobar la autorización, así que tapan el `401` que hay debajo y
hacen creer que la credencial es buena.

### El contador de consultas

`wp-admin/profile.php` muestra, abajo del todo, cuántas consultas lleva hechas
el usuario, separadas por cédula y por RUC. Si el portal tiene cuota, es ahí
donde se ve. Conviene mirarlo antes y después de una carga grande.

## Los cinco recursos por RUC

```
GET /wp-json/datacenter/v1/ruc/{RUC}              datos principales
GET /wp-json/datacenter/v1/contacto_ruc/{RUC}     móviles y correos
GET /wp-json/datacenter/v1/contacto_nomina/{RUC}  empleados con sueldo
GET /wp-json/datacenter/v1/carro/{RUC}            vehículos
GET /wp-json/datacenter/v1/propiedades/{RUC}      propiedades
```

Un `404` en un recurso es normal: significa que esa empresa no tiene ese dato.
Sólo se marca `sin_datos` cuando **ninguno** de los cinco devuelve nada.

## Enriquecer, nunca reemplazar

Todo vive en tablas `dataportal_*`. Nada sobrescribe `companias` ni el padrón:
la razón social buena es la de la Superintendencia, y el portal además la
devuelve con la codificación rota.

## Se guarda el JSON crudo

`dataportal_consulta.payload` conserva la respuesta literal de los cinco
recursos. Recorrer las 226.191 compañías cuesta ~31 horas; **reparsear lo ya
descargado cuesta segundos**. Si un campo se modela mal, se corrige el parser y
se vuelve a derivar sin pedir nada otra vez. Con las trampas que tiene este
portal, no es una precaución teórica.

## Las trampas del portal

1. **Mojibake.** Los textos vienen doblemente codificados: `TUBAY CARREÃ‘O` en
   vez de `CARREÑO`. Se reparan con
   [`repararMojibake`](../../../common/text/mojibake.ts). Sólo importa para
   nombres de empleados y ocupaciones — los de compañía ya los tenemos limpios.
   **`Á` e `Í` mayúsculas son irrecuperables**: sus bytes (0x81, 0x8D) no
   existen en Windows-1252 y se perdieron en el origen, así que "GARCÍA" llega
   mutilado y se guarda tal cual en vez de a medias.
2. **`subClassName` contiene un correo**, no una subclase de vehículo. No se
   guarda en la columna que su nombre sugiere; queda en el payload crudo.
3. **El tipo de contacto es un código numérico sin catálogo** (`8` y `3` son los
   únicos vistos). La clasificación real se hace por el CONTENIDO —si hay una
   arroba, es un correo—, y el código se guarda por si algún día se conoce.
4. **`fechaSupencionDefinitiva`**, con esa falta de ortografía, es el nombre real
   del campo.
5. **El `dni` trae un espacio al final** en todas las filas de nómina.
6. **Dos formatos de fecha conviven**: `1975-03-17 00:00:00` en la ficha y
   `30/4/2026` sin ceros de relleno en los vehículos.

## Reanudación

`dataportal_consulta` es a la vez la lista de trabajo y la memoria del avance.
El lote se reserva con `FOR UPDATE SKIP LOCKED`, así que dos procesos pueden
trabajar a la vez sin pisarse. Una interrupción cuesta un lote, no la carga.

Las tablas 1:N se reemplazan enteras por RUC en cada consulta: si un empleado
deja la empresa, su fila desaparece. Un upsert la dejaría ahí para siempre.

## Probar

```bash
npm test   # 24 tests: parser sobre respuestas reales + reparación de mojibake
```
