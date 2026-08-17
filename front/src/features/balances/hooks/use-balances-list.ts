import { useCallback, useEffect, useMemo, useState } from 'react'
import { getErrorMessage } from '../../../shared/api/errors'
import { useDebouncedValue } from '../../../shared/hooks/use-debounced-value'
import { getBalancesSummary, listBalances } from '../api/balances.api'
import type { BalanceFilters, BalanceListItem, BalanceYearSummary } from '../api/balances.types'

export const BALANCES_PAGE_SIZE = 50

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
  const [page, setPage] = useState(1)
  const [pageCursor, setPageCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<Array<string | null>>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
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
    listBalances({
      ...debouncedFilters,
      ...(pageCursor ? { cursor: pageCursor } : {}),
      limit: BALANCES_PAGE_SIZE,
    })
      .then(result => {
        if (!active) return
        setRows(result.datos)
        setNextCursor(result.cursorSiguiente)
      })
      .catch((unknownError: unknown) => {
        if (!active) return
        setError(getErrorMessage(unknownError))
        setRows([])
        setNextCursor(null)
      })
      .finally(() => active && setIsLoading(false))
    return () => {
      active = false
    }
  }, [debouncedFilters, pageCursor])

  const totals = useMemo(
    () => ({
      balances: summary.reduce((total, item) => total + item.balances, 0),
      celdas: summary.reduce((total, item) => total + item.celdas, 0),
    }),
    [summary],
  )

  const setFilter = useCallback((field: keyof BalanceFilters, value: string) => {
    setFilters(current => ({ ...current, [field]: value }))
    setPage(1)
    setPageCursor(null)
    setCursorHistory([])
    setNextCursor(null)
  }, [])

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_BALANCE_FILTERS)
    setPage(1)
    setPageCursor(null)
    setCursorHistory([])
    setNextCursor(null)
  }, [])

  const goNext = useCallback(() => {
    if (!nextCursor || isLoading) return
    setCursorHistory(current => [...current, pageCursor])
    setPageCursor(nextCursor)
    setPage(current => current + 1)
    setNextCursor(null)
  }, [isLoading, nextCursor, pageCursor])

  const goPrevious = useCallback(() => {
    if (page === 1 || isLoading) return
    const previousCursor = cursorHistory[cursorHistory.length - 1] ?? null
    setCursorHistory(current => current.slice(0, -1))
    setPageCursor(previousCursor)
    setPage(current => Math.max(1, current - 1))
    setNextCursor(null)
  }, [cursorHistory, isLoading, page])

  const pagination = {
    page,
    pageSize: BALANCES_PAGE_SIZE,
    start: rows.length > 0 ? (page - 1) * BALANCES_PAGE_SIZE + 1 : 0,
    end: rows.length > 0 ? (page - 1) * BALANCES_PAGE_SIZE + rows.length : 0,
    hasNext: Boolean(nextCursor),
    canPrevious: page > 1,
    goNext,
    goPrevious,
  }

  return { filters, rows, summary, totals, isLoading, error, setFilter, clearFilters, pagination }
}
