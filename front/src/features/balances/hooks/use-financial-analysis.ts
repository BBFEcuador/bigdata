import { useEffect, useState } from 'react'
import { getErrorMessage } from '../../../shared/api/errors'
import { useDebouncedValue } from '../../../shared/hooks/use-debounced-value'
import {
  getComparableSummary,
  getFinancialIndicators,
  getFinancialStatements,
  getSectorComparison,
  listBalances,
} from '../api/balances.api'
import type { BalanceListItem, FinancialAnalysis } from '../api/balances.types'

export function useCompanyBalanceSearch(search: string) {
  const [candidates, setCandidates] = useState<BalanceListItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debouncedSearch = useDebouncedValue(search.trim(), 300)

  useEffect(() => {
    let active = true
    if (debouncedSearch.length < 3) {
      setCandidates([])
      setIsSearching(false)
      setError(null)
      return () => {
        active = false
      }
    }

    const isRuc = /^\d+$/.test(debouncedSearch)
    setIsSearching(true)
    setError(null)
    listBalances({
      [isRuc ? 'ruc' : 'nombre']: debouncedSearch,
      anio: '2025',
      limit: 15,
    })
      .then(result => active && setCandidates(result.datos))
      .catch((unknownError: unknown) => active && setError(getErrorMessage(unknownError)))
      .finally(() => active && setIsSearching(false))

    return () => {
      active = false
    }
  }, [debouncedSearch])

  return { candidates, clearCandidates: () => setCandidates([]), isSearching, error }
}

export function useFinancialAnalysis(expediente: string | null) {
  const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!expediente) return () => undefined

    setIsLoading(true)
    setError(null)

    Promise.all([
      getFinancialStatements(expediente),
      getFinancialIndicators(expediente),
      getComparableSummary(expediente),
      getSectorComparison(expediente).catch(() => null),
    ])
      .then(([estados, indicadores, resumen, sectorial]) => {
        if (!active) return
        setAnalysis({
          estados,
          indicadores,
          resumen,
          sectorial,
          empresa: {
            expediente,
            nombre: indicadores.nombre ?? `Expediente ${expediente}`,
            ruc: indicadores.ruc,
            rama: indicadores.descripcionRama,
          },
        })
      })
      .catch((unknownError: unknown) => active && setError(getErrorMessage(unknownError)))
      .finally(() => active && setIsLoading(false))

    return () => {
      active = false
    }
  }, [expediente])

  return { analysis, isLoading, error }
}
