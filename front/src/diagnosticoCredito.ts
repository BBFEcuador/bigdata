/**
 * Lectura de la trayectoria del crédito tributario.
 *
 * El texto vive aquí y no en cada pantalla porque lo dicen dos sitios —la lista
 * y el informe en PDF— y son los dos que llegan al cliente. Si divergieran, la
 * pantalla y el documento afirmarían cosas distintas sobre la misma empresa.
 *
 * La clasificación la hace la vista `credito_tributario_empresa` en SQL; aquí
 * sólo se traduce a lenguaje.
 */

export const DIAGNOSTICO = {
  acumula: {
    titulo: 'No se está consumiendo',
    texto:
      'El saldo crece año a año y cierra en su máximo: es impuesto pagado que la compañía no ha ' +
      'logrado imputar contra sus obligaciones. Potencialmente recuperable vía devolución.',
    tono: 'recuperable',
  },
  consume: {
    titulo: 'Se viene compensando',
    texto:
      'El saldo baja desde su máximo, lo que indica que se está usando contra las obligaciones ' +
      'del período. Corresponde analizar el detalle para ver qué parte queda sin imputar.',
    tono: 'neutro',
  },
  irregular: {
    titulo: 'Comportamiento irregular',
    texto:
      'El saldo sube y baja sin una tendencia clara. No se puede concluir desde el balance si hay ' +
      'crédito sin imputar: corresponde analizar el detalle.',
    tono: 'neutro',
  },
  sin_saldo: {
    titulo: 'Sin saldo',
    texto: 'No registra crédito en el último ejercicio.',
    tono: 'apagado',
  },
  serie_corta: {
    titulo: 'Serie insuficiente',
    texto:
      'Menos de tres ejercicios con balance: no hay trayectoria que leer. Corresponde analizar el ' +
      'detalle.',
    tono: 'apagado',
  },
}

/**
 * La advertencia que va SIEMPRE, gane la etiqueta que gane.
 *
 * Ninguna trayectoria prueba que la devolución proceda: eso depende de la
 * naturaleza del crédito, de la caducidad y de la documentación de respaldo,
 * y nada de eso está en un balance.
 */
export const ADVERTENCIA_CREDITO =
  'En todos los casos corresponde un análisis de detalle: la procedencia de la devolución depende ' +
  'de la naturaleza del crédito, de los plazos de caducidad y de la documentación de respaldo, que ' +
  'no constan en los estados financieros publicados.'

export const leer = clave => DIAGNOSTICO[clave] ?? DIAGNOSTICO.irregular
