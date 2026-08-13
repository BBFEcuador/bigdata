import { useCallback, useEffect, useMemo, useState } from 'react'
import { getErrorMessage } from '../../../shared/api/errors'
import { useDebouncedValue } from '../../../shared/hooks/use-debounced-value'
import { getBalancesSummary, listBalances } from '../api/balances.api'
import type { BalanceFilters, BalanceListItem, BalanceYearSummary } from '../api/balances.types'

export const EMPTY_BALANCE_FILTERS: BalanceFilters = {
  anio: '',
  nombre: '',
  ruc: '',
  rama: '',
}

export function useBalancesList() {
  const [filters, setFilters] = useState<BalanceFilters>(EMPTY_BALANCE_FILTERS)
  const [rows, setRows] = useState<BalanceListItem[]>([])
  const [summary, setSummary] = useState<BalanceYearSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debouncedFilters = useDebouncedValue(filters, 250)

  useEffect(() => {
    let active = true
    getBalancesSummary()
      .then(result => active && setSummary(result))
      .catch((unknownError: unknown) => active && setError(getErrorMessage(unknownError)))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError(null)
    listBalances({ ...debouncedFilters, limit: 50 })
      .then(result => active && setRows(result.datos))
      .catch((unknownError: unknown) => {
        if (!active) return
        setError(getErrorMessage(unknownError))
        setRows([])
      })
      .finally(() => active && setIsLoading(false))
    return () => {
      active = false
    }
  }, [debouncedFilters])

  const totals = useMemo(
    () => ({
      balances: summary.reduce((total, item) => total + item.balances, 0),
      celdas: summary.reduce((total, item) => total + item.celdas, 0),
    }),
    [summary],
  )

  const setFilter = useCallback((field: keyof BalanceFilters, value: string) => {
    setFilters(current => ({ ...current, [field]: value }))
  }, [])

  const clearFilters = useCallback(() => setFilters(EMPTY_BALANCE_FILTERS), [])

  return { filters, rows, summary, totals, isLoading, error, setFilter, clearFilters }
}
