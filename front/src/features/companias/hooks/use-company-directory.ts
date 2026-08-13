import { useCallback, useEffect, useRef, useState } from 'react'

import { getErrorMessage } from '@/shared/api/errors'
import { listarCompanias, obtenerFacetas } from '../api/companias.api'
import type {
  CompaniaResumen,
  FacetasCompanias,
  FiltrosCompanias,
  QueryCompanias,
  TotalConsulta,
} from '../api/companias.types'
import { subjectCursor } from '../lib/company-directory'

export type CompanyDirectoryFilters = {
  search: string
  provincia: string
  situacionLegal: string
  tipo: string
  ciiu: string
  catastro: string
  catastroAnio: string
}

const EMPTY_FILTERS: CompanyDirectoryFilters = {
  search: '',
  provincia: '',
  situacionLegal: '',
  tipo: '',
  ciiu: '',
  catastro: '',
  catastroAnio: '',
}

function toApiFilters(filters: CompanyDirectoryFilters): FiltrosCompanias {
  const search = filters.search.trim()
  const isRuc = /^\d+$/.test(search)
  return {
    nombre: isRuc ? '' : search,
    ruc: isRuc ? search : '',
    provincia: filters.provincia,
    situacionLegal: filters.situacionLegal,
    tipo: filters.tipo,
    ciiu: filters.ciiu.trim(),
    catastro: filters.catastro,
    catastroAnio: filters.catastroAnio,
  }
}

export function useCompanyDirectory() {
  const [filters, setFilters] = useState<CompanyDirectoryFilters>(EMPTY_FILTERS)
  const [data, setData] = useState<CompaniaResumen[]>([])
  const [facets, setFacets] = useState<FacetasCompanias | null>(null)
  const [total, setTotal] = useState<TotalConsulta | null>(null)
  const [page, setPage] = useState(0)
  const [cursors, setCursors] = useState<Array<string | null>>([null])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    obtenerFacetas().then(setFacets).catch(() => setFacets(null))
  }, [])

  const load = useCallback(async (cursor: string | null, currentFilters: CompanyDirectoryFilters) => {
    const currentRequest = ++requestId.current
    setIsLoading(true)
    setError(null)

    const query: QueryCompanias = {
      ...toApiFilters(currentFilters),
      cursor,
      limit: 25,
    }

    try {
      const result = await listarCompanias(query)
      if (currentRequest !== requestId.current) return
      setData(result.datos)
      setTotal(result.total)
      const fallbackCursor = result.hayMas
        ? subjectCursor(result.datos[result.datos.length - 1])
        : null
      setNextCursor(result.cursorSiguiente ?? fallbackCursor)
    } catch (unknownError: unknown) {
      if (currentRequest !== requestId.current) return
      setData([])
      setNextCursor(null)
      setError(getErrorMessage(unknownError))
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(0)
      setCursors([null])
      void load(null, filters)
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [filters, load])

  const setFilter = <Key extends keyof CompanyDirectoryFilters>(
    key: Key,
    value: CompanyDirectoryFilters[Key],
  ) => setFilters(current => ({ ...current, [key]: value }))

  const resetFilters = () => setFilters(EMPTY_FILTERS)

  const goNext = () => {
    if (!nextCursor || isLoading) return
    const targetPage = page + 1
    setCursors(current => [...current.slice(0, targetPage), nextCursor])
    setPage(targetPage)
    void load(nextCursor, filters)
  }

  const goPrevious = () => {
    if (page === 0 || isLoading) return
    const targetPage = page - 1
    setPage(targetPage)
    void load(cursors[targetPage] ?? null, filters)
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length

  return {
    activeFilterCount,
    data,
    error,
    facets,
    filters,
    goNext,
    goPrevious,
    isLoading,
    nextCursor,
    page,
    resetFilters,
    setFilter,
    total,
  }
}
