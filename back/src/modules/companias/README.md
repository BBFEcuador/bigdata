# Contribuyentes empresariales

`/companias` devuelve las cuatro poblaciones empresariales de `contribuyentes`:

- `companies`: sociedades con expediente de la Superintendencia.
- `natural_contable`: personas naturales obligadas a llevar contabilidad.
- `natural_no_contable`: las demás personas naturales.
- `sociedad_no_supervisada`: sociedades registradas en el SRI sin expediente de la Superintendencia.

La tabla física es única. Se puede restringir una población con
`poblacion=companies|natural_contable|natural_no_contable|sociedad_no_supervisada`; por compatibilidad,
`tipo` también acepta esos valores y sigue filtrando `tipo_compania` para los
tipos jurídicos de las compañías. Provincia, RUC, nombre, catastros, conteos,
paginación y `/companias/csv` usan el mismo universo.
