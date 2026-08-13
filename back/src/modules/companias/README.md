# Contribuyentes empresariales

`/companias` devuelve las tres poblaciones empresariales de `contribuyentes`:

- `companies`: sociedades con expediente de la Superintendencia.
- `natural_contable`: personas naturales obligadas a llevar contabilidad.
- `natural_no_contable`: las demás personas naturales.

La tabla física es única. Se puede restringir una población con
`poblacion=companies|natural_contable|natural_no_contable`; por compatibilidad,
`tipo` también acepta esos valores y sigue filtrando `tipo_compania` para los
tipos jurídicos de las compañías. Provincia, RUC, nombre, catastros, conteos,
paginación y `/companias/csv` usan el mismo universo.
