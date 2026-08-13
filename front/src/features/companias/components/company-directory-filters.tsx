import { Search, SlidersHorizontal, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { FacetasCompanias } from '../api/companias.types'
import type { CompanyDirectoryFilters } from '../hooks/use-company-directory'

interface CompanyDirectoryFiltersProps {
  activeFilterCount: number
  facets: FacetasCompanias | null
  filters: CompanyDirectoryFilters
  onChange: <Key extends keyof CompanyDirectoryFilters>(
    key: Key,
    value: CompanyDirectoryFilters[Key],
  ) => void
  onReset: () => void
}

const CATASTERS = [
  { value: '', label: 'Todas las fuentes públicas' },
  { value: 'turismo', label: 'Catastro de Turismo' },
  { value: 'exportador', label: 'Exportadores habituales' },
  { value: 'exportador_bienes_ir', label: 'Exportador de bienes · IR' },
  { value: 'exportador_bienes_iva', label: 'Exportador de bienes · IVA' },
  { value: 'exportador_servicios_iva', label: 'Exportador de servicios · IVA' },
  { value: 'ninguno', label: 'Sin presencia en catastros' },
]

const SUBJECT_TYPES = [
  { value: 'compania', label: 'Compañías supervisadas' },
  { value: 'natural_contable', label: 'Personas naturales con contabilidad' },
  { value: 'natural_no_contable', label: 'Personas naturales sin contabilidad' },
  { value: 'sociedad_no_supervisada', label: 'Sociedades no supervisadas' },
]

export function CompanyDirectoryFilters({
  activeFilterCount,
  facets,
  filters,
  onChange,
  onReset,
}: CompanyDirectoryFiltersProps) {
  return (
    <section className="company-filters" aria-label="Filtros del directorio">
      <div className="company-search-field">
        <Search aria-hidden="true" />
        <Input
          aria-label="Buscar por nombre o RUC"
          autoComplete="off"
          placeholder="Buscar una empresa o persona por nombre o RUC"
          value={filters.search}
          onChange={event => onChange('search', event.target.value)}
        />
        {filters.search && (
          <Button
            aria-label="Limpiar búsqueda"
            className="company-search-clear"
            onClick={() => onChange('search', '')}
            size="icon"
            variant="ghost"
          >
            <X />
          </Button>
        )}
      </div>

      <div className="company-filter-grid">
        <label>
          <span>Población</span>
          <Select value={filters.tipo} onChange={event => onChange('tipo', event.target.value)}>
            <option value="">Todos los sujetos</option>
            {SUBJECT_TYPES.map(option => {
              const facet = facets?.tipos.find(item => item.valor === option.value)
              return (
                <option key={option.value} value={option.value}>
                  {option.label}{facet ? ` · ${facet.n.toLocaleString('es-EC')}` : ''}
                </option>
              )
            })}
          </Select>
        </label>

        {facets && facets.situaciones.length > 0 && (
          <label>
            <span>Situación societaria</span>
            <Select
              value={filters.situacionLegal}
              onChange={event => onChange('situacionLegal', event.target.value)}
            >
              <option value="">Cualquier situación</option>
              {facets.situaciones.map(option => (
                <option key={option.valor} value={option.valor}>
                  {option.valor} · {option.n.toLocaleString('es-EC')}
                </option>
              ))}
            </Select>
          </label>
        )}

        <label>
          <span>Territorio</span>
          <Select
            value={filters.provincia}
            onChange={event => onChange('provincia', event.target.value)}
          >
            <option value="">Todo Ecuador</option>
            {facets?.provincias.map(option => (
              <option key={option.valor} value={option.valor}>
                {option.valor} · {option.n.toLocaleString('es-EC')}
              </option>
            ))}
          </Select>
        </label>

        <label>
          <span>Señal comercial</span>
          <Select
            value={filters.catastro}
            onChange={event => {
              onChange('catastro', event.target.value)
              onChange('catastroAnio', '')
            }}
          >
            {CATASTERS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </label>

        <label>
          <span>Actividad económica</span>
          <Input
            aria-label="Código CIIU"
            placeholder="Código CIIU, por ejemplo G4669"
            value={filters.ciiu}
            onChange={event => onChange('ciiu', event.target.value)}
          />
        </label>

        {activeFilterCount > 0 && (
          <Button className="company-reset-filters" onClick={onReset} variant="ghost">
            <SlidersHorizontal />
            Limpiar {activeFilterCount} {activeFilterCount === 1 ? 'filtro' : 'filtros'}
          </Button>
        )}
      </div>
    </section>
  )
}
