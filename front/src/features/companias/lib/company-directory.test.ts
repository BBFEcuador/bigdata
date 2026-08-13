import { describe, expect, it } from 'vitest'

import type { CompaniaResumen } from '../api/companias.types'
import {
  subjectCursor,
  subjectStatus,
  subjectTrackingType,
  subjectTypeLabel,
} from './company-directory'

const naturalSubject = {
  id: 'eb3c0a9a-0f4a-4df6-8ef4-dbaf2d0f2af0',
  tipo: 'natural_no_contable',
  expediente: null,
  ruc: '0100000173001',
  nombre: 'MONSALVE POZO LUIS ALBERTO',
  estadoContribuyente: 'PASIVO',
  situacionLegal: null,
  sriEstadoContribuyente: null,
  representante: null,
  cargo: null,
  telefono: null,
  provincia: 'GALAPAGOS',
  canton: null,
  sriParroquia: null,
  capitalSuscrito: null,
  fechaConstitucion: null,
  sriNumEstablecimientos: null,
  ciiuNivel6: null,
  actividad: null,
} satisfies CompaniaResumen

describe('company directory normalization', () => {
  it('paginates subjects without an expediente using their stable id', () => {
    expect(subjectCursor(naturalSubject)).toBe(naturalSubject.id)
  })

  it('uses the primary taxpayer status when SRI enrichment is absent', () => {
    expect(subjectStatus(naturalSubject)).toBe('PASIVO')
  })

  it('maps natural populations to a commercial label and tracking type', () => {
    expect(subjectTypeLabel(naturalSubject.tipo)).toBe('Persona natural')
    expect(subjectTrackingType(naturalSubject)).toBe('persona_natural')
  })
})
