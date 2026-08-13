import type {
  FinancialValue,
  IndicatorDirection,
  SectorComparison as SectorComparisonData,
} from '../api/balances.types'
import { formatIndicator, percentileClass } from '../lib/financial-formatters'

function PercentileBar({ percentile, direction }: {
  percentile: FinancialValue
  direction: IndicatorDirection
}) {
  if (percentile === null) return null
  return (
    <div className="barra" title={`Percentil ${percentile} del sector`}>
      <span
        className={`relleno ${percentileClass(percentile, direction)}`}
        style={{ width: `${percentile}%` }}
      />
      <span className="mediana" />
    </div>
  )
}

export function SectorComparison({ data }: { data: SectorComparisonData | null }) {
  if (!data) {
    return (
      <div className="bloque">
        <p className="aviso">
          Esta compañía todavía no tiene percentiles calculados. Se calculan por lote después
          de importar balances.
        </p>
      </div>
    )
  }
  if (data.anios.length === 0) {
    return (
      <div className="bloque">
        <p className="aviso">
          No hay comparación sectorial: falta actividad registrada o ningún indicador pudo
          calcularse.
        </p>
      </div>
    )
  }

  return (
    <div className="bloque sectorial">
      <div className="pares">
        {data.sectores.map(sector => (
          <div key={sector.anio} className="par">
            <strong>{sector.anio}</strong>
            <span className="codigo">{sector.codigo}</span>
            <span className="nombre">{sector.nombre ?? '—'}</span>
            <span className={`nivel ${sector.nivel}`}>
              {sector.nivel === 'division' ? 'división CIIU' : 'sección CIIU'}
            </span>
          </div>
        ))}
      </div>

      {data.grupos.map(group => {
        const indicators = data.indicadores.filter(indicator => indicator.grupo === group.id)
        if (indicators.length === 0) return null
        return (
          <section key={group.id}>
            <h4>{group.titulo}</h4>
            <div className="scroll">
              <table className="tabla comparacion">
                <thead>
                  <tr>
                    <th>Indicador</th>
                    {data.anios.map(year => <th key={year} className="derecha">{year}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {indicators.map(indicator => (
                    <tr key={indicator.clave}>
                      <td>{indicator.etiqueta}</td>
                      {data.anios.map((year, index) => {
                        const percentile = indicator.percentiles[index] ?? null
                        const cut = indicator.cortes[index] ?? null
                        return (
                          <td key={year} className="celda">
                            <div className="linea">
                              <span className="mono valor">
                                {formatIndicator(indicator.valores[index] ?? null, indicator.formato)}
                              </span>
                              <span className={`pct ${percentileClass(percentile, indicator.mejor)}`}>
                                {percentile === null ? '—' : `p${percentile}`}
                              </span>
                            </div>
                            <PercentileBar percentile={percentile} direction={indicator.mejor} />
                            <div className="sector">
                              {cut
                                ? `mediana ${formatIndicator(cut.p50, indicator.formato)} · n ${cut.n.toLocaleString('es-EC')}`
                                : 'sin sector'}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}

      <p className="aviso">
        El percentil indica el porcentaje de empresas comparables que queda por debajo. El grupo
        de pares es la división CIIU; con menos de 30 empresas se usa la sección.
      </p>
    </div>
  )
}
