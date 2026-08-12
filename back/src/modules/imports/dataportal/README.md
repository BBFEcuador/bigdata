# Enriquecimiento desde DataPortal

Completa las compañías con lo que las fuentes públicas no traen: **correos,
móviles, nómina con sueldos y vehículos**. La fuente es la API REST de
`dataportalsys.com`, no un archivo.

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/imports/dataportal` | Siembra los RUC pendientes y arranca la extracción. Devuelve 202. |
| `POST` | `/imports/dataportal/detener` | Para tras el RUC en curso. El avance queda guardado. |
| `GET` | `/imports/dataportal/estado` | Reparto por estado y cuántos datos se llevan extraídos. |

## Las credenciales

Van en `back/.env`, **nunca en el código**:

```
DATAPORTAL_USER=...
DATAPORTAL_PASSWORD=...
DATAPORTAL_RPS=5
```

`.env` está en `.gitignore`. El cliente **relee las credenciales en cada
petición**, no las captura al arrancar: una carga dura ~31 horas y la contraseña
puede revocarse por el camino, así que se actualiza el archivo y el job sigue
sin reiniciarse.

Un `401` o `403` **no se reintenta**: para la carga entera. Insistir 1,13 M de
veces con una credencial muerta no la revive.

### No hay ningún `?token=`

Es el error que parece obvio y no lo es. La autenticación es la de WordPress:
**contraseña de aplicación** por cabecera `Authorization: Basic`. Comprobable
contra el propio servidor, sin credenciales:

```bash
curl https://dataportalsys.com/wp-json/datacenter/v1   # args de cada ruta: sólo "dni"
curl https://dataportalsys.com/wp-json                 # authentication: application-passwords
```

Mandar un token por query string devuelve `401` **exactamente igual** que no
mandar nada, así que el síntoma no distingue "valor equivocado" de "mecanismo
equivocado". Si algún día vuelve a dar 401, empieza por esos dos `curl`.

Y la contraseña **no es la de la cuenta**: WordPress sólo acepta por Basic las
de aplicación, que se generan en `wp-admin/profile.php` y tienen la forma
`abcd EFGH ijkl MNOP`. **Los espacios son parte del valor**, no se recortan.

La cabecera se construye en base64 **latin1**, no UTF-8 (RFC 7617): con un
usuario o contraseña acentuados, hacerlo en UTF-8 da un 401 desconcertante.

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
