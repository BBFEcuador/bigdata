import { useEffect, useRef, useState } from 'react';
import {
  ChartNoAxesCombined,
  Check,
  Contact,
  Copy,
  FileText,
  Mail,
  Phone,
  Users,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { listarContactos } from '@/features/contactos/api/contactos.api';
import type { Contacto as ContactoItem } from '@/features/contactos/api/contactos.types';
import { listarNomina } from '@/features/nomina/api/nomina.api';
import type { NominaPersona } from '@/features/nomina/api/nomina.types';

type DialogView = 'analisis' | 'nomina' | 'contactos';
type NumericValue = number | string | null | undefined;

interface EmpresaTributaria {
  id?: string | null;
  expediente: string;
  ruc: string;
  nombre: string;
  grupo_ciiu?: string | null;
  actividad?: string | null;
  rimpe?: boolean;
}

interface EjercicioTributario {
  anio: number;
  ingresos: NumericValue;
  costos_gastos: NumericValue;
  activo: NumericValue;
  coef_ingresos: NumericValue;
  coef_costos_gastos: NumericValue;
  coef_activos: NumericValue;
  coef_especifico?: boolean;
  base_ingresos: NumericValue;
  base_costos_gastos: NumericValue;
  base_activos: NumericValue;
  base_presunta: NumericValue;
  base_manda?: 'ingresos' | 'costos_gastos' | 'activos' | null;
  declarada: NumericValue;
  brecha: NumericValue;
  intensidad: NumericValue;
  percentil: NumericValue;
  nivel_pares?: string | null;
  clave_pares?: string | null;
  n_pares: NumericValue;
}

interface CreditoTributarioEjercicio {
  anio: number;
  iva: NumericValue;
  ir: NumericValue;
  total: NumericValue;
}

interface ResolucionTributaria {
  anio: number;
  resolucion: string;
}

interface FichaTributaria {
  empresa: EmpresaTributaria;
  ejercicios: EjercicioTributario[];
  credito?: CreditoTributarioEjercicio[];
  resoluciones: ResolucionTributaria[];
}

interface TributarioCompanyDialogProps {
  ficha: FichaTributaria;
  onClose: () => void;
}

const dinero = (value: unknown) =>
  value === null || value === undefined
    ? '—'
    : Number(value).toLocaleString('es-EC', { maximumFractionDigits: 0 });

const veces = (value: unknown) =>
  value === null || value === undefined ? '—' : `${Number(value).toFixed(2)}×`;

const pctil = (value: unknown) =>
  value === null || value === undefined
    ? '—'
    : (Number(value) * 100).toFixed(0);

const coef = (value: unknown) =>
  value === null || value === undefined ? '—' : Number(value).toFixed(4);

const claseP = (value: unknown) => {
  if (value === null || value === undefined) return '';
  return Number(value) >= 0.9 ? 'alto' : Number(value) >= 0.75 ? 'medio' : '';
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value
  );
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function LoadingRows() {
  return (
    <div
      aria-label='Cargando información'
      className='tax-dialog-skeleton'
      role='status'
    >
      {[0, 1, 2].map(row => (
        <div className='tax-dialog-skeleton-row' key={row}>
          <Skeleton className='h-4 w-24' />
          <Skeleton className='h-4 w-56 max-w-full' />
          <Skeleton className='h-4 w-28' />
        </div>
      ))}
    </div>
  );
}

function contactLabel(contacto: ContactoItem): string {
  const isWebsite =
    contacto.tipo === 'otro' && /^(https?:\/\/|www\.)/i.test(contacto.valor);
  const label =
    contacto.tipo === 'email'
      ? 'Correo electrónico'
      : contacto.tipo === 'telefono'
        ? 'Teléfono'
        : isWebsite
          ? 'Sitio web'
          : 'Otro contacto';
  return contacto.tipoCodigo ? `${label} · ${contacto.tipoCodigo}` : label;
}

function contactHref(contacto: ContactoItem): string | null {
  if (contacto.tipo === 'email') return `mailto:${contacto.valor}`;
  if (contacto.tipo === 'telefono')
    return `tel:${contacto.valor.replace(/[^\d+]/g, '')}`;
  if (/^https?:\/\//i.test(contacto.valor)) return contacto.valor;
  if (/^www\./i.test(contacto.valor)) return `https://${contacto.valor}`;
  return null;
}

export function TributarioCompanyDialog({
  ficha,
  onClose,
}: TributarioCompanyDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const copyTimerRef = useRef<number | null>(null);
  const [view, setView] = useState<DialogView>('analisis');
  const [nomina, setNomina] = useState<NominaPersona[]>([]);
  const [nominaCursor, setNominaCursor] = useState<string | null>(null);
  const [nominaLoading, setNominaLoading] = useState(false);
  const [nominaLoaded, setNominaLoaded] = useState(false);
  const [nominaError, setNominaError] = useState<string | null>(null);
  const [contactos, setContactos] = useState<ContactoItem[]>([]);
  const [contactosCursor, setContactosCursor] = useState<string | null>(null);
  const [contactosLoading, setContactosLoading] = useState(false);
  const [contactosLoaded, setContactosLoaded] = useState(false);
  const [contactosError, setContactosError] = useState<string | null>(null);
  const [copiedContact, setCopiedContact] = useState<string | null>(null);

  const contribuyenteId = ficha.empresa.id as string | undefined;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
      if (copyTimerRef.current !== null)
        window.clearTimeout(copyTimerRef.current);
    };
  }, [onClose]);

  useEffect(() => {
    setView('analisis');
    setNomina([]);
    setNominaCursor(null);
    setNominaLoaded(false);
    setNominaError(null);
    setContactos([]);
    setContactosCursor(null);
    setContactosLoaded(false);
    setContactosError(null);
  }, [contribuyenteId]);

  const loadNomina = async (cursor: string | null = null) => {
    if (!contribuyenteId || nominaLoading) return;
    setNominaLoading(true);
    setNominaError(null);
    try {
      const query: { limit: number; cursor?: string } = { limit: 50 };
      if (cursor) query.cursor = cursor;
      const result = await listarNomina(contribuyenteId, query);
      setNomina(current =>
        cursor ? [...current, ...result.datos] : result.datos
      );
      setNominaCursor(result.siguiente);
      setNominaLoaded(true);
    } catch {
      setNominaError(
        'No se pudo consultar la nómina. Revisa la conexión e intenta nuevamente.'
      );
    } finally {
      setNominaLoading(false);
    }
  };

  const loadContactos = async (cursor: string | null = null) => {
    if (!contribuyenteId || contactosLoading) return;
    setContactosLoading(true);
    setContactosError(null);
    try {
      const query: { limit: number; cursor?: string } = { limit: 50 };
      if (cursor) query.cursor = cursor;
      const result = await listarContactos(contribuyenteId, query);
      setContactos(current =>
        cursor ? [...current, ...result.datos] : result.datos
      );
      setContactosCursor(result.siguiente);
      setContactosLoaded(true);
    } catch {
      setContactosError(
        'No se pudieron consultar los contactos. Revisa la conexión e intenta nuevamente.'
      );
    } finally {
      setContactosLoading(false);
    }
  };

  const selectView = (nextView: DialogView) => {
    setView(nextView);
    if (nextView === 'nomina' && !nominaLoaded) void loadNomina();
    if (nextView === 'contactos' && !contactosLoaded) void loadContactos();
  };

  const copyContact = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedContact(value);
      if (copyTimerRef.current !== null)
        window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(
        () => setCopiedContact(null),
        1800
      );
    } catch {
      setContactosError(
        'No se pudo copiar automáticamente. Puedes seleccionar el dato manualmente.'
      );
    }
  };

  const tabId = (tab: DialogView) => `tax-dialog-tab-${tab}`;
  const panelId = (tab: DialogView) => `tax-dialog-panel-${tab}`;
  const credito = ficha.credito ?? [];

  return (
    <div
      className='tax-dialog-layer'
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby='tax-dialog-title'
        aria-modal='true'
        className='tax-dialog'
        ref={dialogRef}
        role='dialog'
      >
        <header className='tax-dialog-header'>
          <div className='tax-dialog-identity'>
            <h2 id='tax-dialog-title'>{ficha.empresa.nombre}</h2>
            <p>
              RUC {ficha.empresa.ruc}
              {ficha.empresa.grupo_ciiu ? ` · ${ficha.empresa.grupo_ciiu}` : ''}
              {ficha.empresa.actividad ? ` · ${ficha.empresa.actividad}` : ''}
            </p>
            {ficha.empresa.rimpe && (
              <span className='tax-dialog-rimpe'>
                RIMPE · fuera del alcance
              </span>
            )}
          </div>
          <div className='tax-dialog-actions'>
            <a
              className='tax-dialog-pdf'
              href={`/informe-tributario/${ficha.empresa.expediente}`}
              rel='noreferrer'
              target='_blank'
            >
              <FileText aria-hidden='true' /> <span>Informe PDF</span>
            </a>
            <Button
              aria-label='Cerrar detalle tributario'
              className='tax-dialog-close'
              onClick={onClose}
              ref={closeButtonRef}
              size='icon'
              variant='ghost'
            >
              <X aria-hidden='true' />
            </Button>
          </div>
        </header>

        <div
          aria-label='Información de la compañía'
          className='tax-dialog-tabs'
          role='tablist'
        >
          <button
            aria-controls={panelId('analisis')}
            aria-selected={view === 'analisis'}
            id={tabId('analisis')}
            onClick={() => selectView('analisis')}
            role='tab'
            type='button'
          >
            <ChartNoAxesCombined aria-hidden='true' /> Análisis tributario
          </button>
          <button
            aria-controls={panelId('nomina')}
            aria-selected={view === 'nomina'}
            disabled={!contribuyenteId}
            id={tabId('nomina')}
            onClick={() => selectView('nomina')}
            role='tab'
            title={
              contribuyenteId
                ? 'Consultar nómina'
                : 'UUID del contribuyente no disponible'
            }
            type='button'
          >
            <Users aria-hidden='true' /> Nómina
          </button>
          <button
            aria-controls={panelId('contactos')}
            aria-selected={view === 'contactos'}
            disabled={!contribuyenteId}
            id={tabId('contactos')}
            onClick={() => selectView('contactos')}
            role='tab'
            title={
              contribuyenteId
                ? 'Consultar contactos'
                : 'UUID del contribuyente no disponible'
            }
            type='button'
          >
            <Contact aria-hidden='true' /> Contactos
          </button>
        </div>

        <div className='tax-dialog-body'>
          {view === 'analisis' && (
            <div
              aria-labelledby={tabId('analisis')}
              id={panelId('analisis')}
              role='tabpanel'
            >
              <section className='tax-dialog-section'>
                <div className='tax-dialog-section-heading'>
                  <div>
                    <h3>Estimación presuntiva</h3>
                    <p>
                      Comparación histórica de las tres bases con la utilidad
                      declarada.
                    </p>
                  </div>
                  <span>{ficha.ejercicios.length} ejercicios</span>
                </div>
                <div className='tax-dialog-table-scroll' tabIndex={0}>
                  <table className='tabla tax-dialog-table'>
                    <thead>
                      <tr>
                        <th>Ejercicio</th>
                        {ficha.ejercicios.map(ejercicio => (
                          <th className='num' key={ejercicio.anio}>
                            {ejercicio.anio}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Ingresos</td>
                        {ficha.ejercicios.map(e => (
                          <td className='num' key={e.anio}>
                            {dinero(e.ingresos)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td>Costos y gastos</td>
                        {ficha.ejercicios.map(e => (
                          <td className='num' key={e.anio}>
                            {dinero(e.costos_gastos)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td>Activos</td>
                        {ficha.ejercicios.map(e => (
                          <td className='num' key={e.anio}>
                            {dinero(e.activo)}
                          </td>
                        ))}
                      </tr>
                      <tr className='separador'>
                        <td>Coeficientes (ing. / c+g / act.)</td>
                        {ficha.ejercicios.map(e => (
                          <td className='num coefs' key={e.anio}>
                            {coef(e.coef_ingresos)} /{' '}
                            {coef(e.coef_costos_gastos)} /{' '}
                            {coef(e.coef_activos)}
                            {!e.coef_especifico && (
                              <span className='general'>general art. 3</span>
                            )}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td>Base sobre ingresos</td>
                        {ficha.ejercicios.map(e => (
                          <td
                            className={`num ${e.base_manda === 'ingresos' ? 'manda' : ''}`}
                            key={e.anio}
                          >
                            {dinero(e.base_ingresos)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td>Base sobre costos y gastos</td>
                        {ficha.ejercicios.map(e => (
                          <td
                            className={`num ${e.base_manda === 'costos_gastos' ? 'manda' : ''}`}
                            key={e.anio}
                          >
                            {dinero(e.base_costos_gastos)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td>Base sobre activos</td>
                        {ficha.ejercicios.map(e => (
                          <td
                            className={`num ${e.base_manda === 'activos' ? 'manda' : ''}`}
                            key={e.anio}
                          >
                            {dinero(e.base_activos)}
                          </td>
                        ))}
                      </tr>
                      <tr className='separador'>
                        <td>
                          <strong>Base presunta</strong>
                        </td>
                        {ficha.ejercicios.map(e => (
                          <td className='num fuerte' key={e.anio}>
                            {dinero(e.base_presunta)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td>Declarado (utilidad antes de impuestos)</td>
                        {ficha.ejercicios.map(e => (
                          <td className='num' key={e.anio}>
                            {dinero(e.declarada)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td>Brecha</td>
                        {ficha.ejercicios.map(e => (
                          <td className='num brecha' key={e.anio}>
                            {dinero(e.brecha)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td>Intensidad (brecha / ingresos)</td>
                        {ficha.ejercicios.map(e => (
                          <td className='num' key={e.anio}>
                            {veces(e.intensidad)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td>Percentil en su rama</td>
                        {ficha.ejercicios.map(e => (
                          <td
                            className={`num percentil ${claseP(e.percentil)}`}
                            key={e.anio}
                          >
                            {pctil(e.percentil)}
                            <span className='pares'>
                              {e.nivel_pares} {e.clave_pares} · n=
                              {dinero(e.n_pares)}
                            </span>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              {credito.length > 0 && (
                <section className='tax-dialog-section'>
                  <div className='tax-dialog-section-heading'>
                    <div>
                      <h3>Crédito tributario · devolución potencial</h3>
                      <p>
                        Impuesto pagado que permanece en el activo hasta el
                        último balance disponible.
                      </p>
                    </div>
                    <span>{credito.length} ejercicios</span>
                  </div>
                  <div className='tax-dialog-table-scroll' tabIndex={0}>
                    <table className='tabla tax-dialog-table tax-dialog-credit-table'>
                      <thead>
                        <tr>
                          <th>Ejercicio</th>
                          {credito.map(c => (
                            <th className='num' key={c.anio}>
                              {c.anio}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Crédito por IVA</td>
                          {credito.map(c => (
                            <td className='num' key={c.anio}>
                              {dinero(c.iva)}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td>Crédito por impuesto a la renta</td>
                          {credito.map(c => (
                            <td className='num' key={c.anio}>
                              {dinero(c.ir)}
                            </td>
                          ))}
                        </tr>
                        <tr className='separador'>
                          <td>
                            <strong>Devolución potencial</strong>
                          </td>
                          {credito.map(c => (
                            <td className='num fuerte' key={c.anio}>
                              {dinero(c.total)}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <p className='tax-dialog-source'>
                <strong>Respaldo normativo:</strong>{' '}
                {ficha.resoluciones
                  .map(
                    resolucion => `${resolucion.anio}: ${resolucion.resolucion}`
                  )
                  .join(' · ')}
              </p>
            </div>
          )}

          {view === 'nomina' && (
            <div
              aria-labelledby={tabId('nomina')}
              id={panelId('nomina')}
              role='tabpanel'
            >
              <section className='tax-dialog-section'>
                <div className='tax-dialog-section-heading'>
                  <div>
                    <h3>Nómina</h3>
                    <p>Personas registradas para este contribuyente.</p>
                  </div>
                  {nominaLoaded && (
                    <span>
                      {nomina.length}
                      {nominaCursor ? '+' : ''} personas
                    </span>
                  )}
                </div>
                {nominaError && (
                  <div className='tax-dialog-state error' role='alert'>
                    <span>{nominaError}</span>
                    <Button
                      onClick={() => void loadNomina()}
                      size='sm'
                      variant='outline'
                    >
                      Reintentar
                    </Button>
                  </div>
                )}
                {nominaLoading && nomina.length === 0 && <LoadingRows />}
                {!nominaLoading &&
                  !nominaError &&
                  nominaLoaded &&
                  nomina.length === 0 && (
                    <p className='tax-dialog-state'>
                      No hay personas registradas en la nómina de este
                      contribuyente.
                    </p>
                  )}
                {nomina.length > 0 && (
                  <>
                    <div className='tax-dialog-table-scroll' tabIndex={0}>
                      <table className='tax-dialog-related-table'>
                        <thead>
                          <tr>
                            <th>Cédula</th>
                            <th>Nombre</th>
                            <th>Rol</th>
                            <th>Ingreso</th>
                            <th>Posible salario</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nomina.map(persona => (
                            <tr key={persona.cedula}>
                              <td>{persona.cedula}</td>
                              <td>{persona.nombre ?? 'No disponible'}</td>
                              <td>{persona.rol ?? 'No disponible'}</td>
                              <td>{formatDate(persona.fechaIngreso)}</td>
                              <td>{dinero(persona.posibleSalario)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {nominaCursor && (
                      <div className='tax-dialog-more'>
                        <Button
                          disabled={nominaLoading}
                          onClick={() => void loadNomina(nominaCursor)}
                          size='sm'
                          variant='outline'
                        >
                          {nominaLoading ? 'Cargando…' : 'Cargar más'}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          )}

          {view === 'contactos' && (
            <div
              aria-labelledby={tabId('contactos')}
              id={panelId('contactos')}
              role='tabpanel'
            >
              <section className='tax-dialog-section'>
                <div className='tax-dialog-section-heading'>
                  <div>
                    <h3>Contactos</h3>
                    <p>
                      Correos, teléfonos y otros datos públicos disponibles.
                    </p>
                  </div>
                  {contactosLoaded && (
                    <span>
                      {contactos.length}
                      {contactosCursor ? '+' : ''} contactos
                    </span>
                  )}
                </div>
                {contactosError && (
                  <div className='tax-dialog-state error' role='alert'>
                    <span>{contactosError}</span>
                    {contactos.length === 0 && (
                      <Button
                        onClick={() => void loadContactos()}
                        size='sm'
                        variant='outline'
                      >
                        Reintentar
                      </Button>
                    )}
                  </div>
                )}
                <p aria-live='polite' className='sr-only'>
                  {copiedContact ? 'Contacto copiado al portapapeles' : ''}
                </p>
                {contactosLoading && contactos.length === 0 && <LoadingRows />}
                {!contactosLoading &&
                  !contactosError &&
                  contactosLoaded &&
                  contactos.length === 0 && (
                    <p className='tax-dialog-state'>
                      No hay contactos registrados para este contribuyente.
                    </p>
                  )}
                {contactos.length > 0 && (
                  <>
                    <ul className='tax-dialog-contact-list'>
                      {contactos.map(contacto => {
                        const href = contactHref(contacto);
                        const ContactIcon =
                          contacto.tipo === 'email'
                            ? Mail
                            : contacto.tipo === 'telefono'
                              ? Phone
                              : Contact;
                        const copied = copiedContact === contacto.valor;
                        return (
                          <li key={`${contacto.tipo}-${contacto.valor}`}>
                            <ContactIcon aria-hidden='true' />
                            <div>
                              <span>{contactLabel(contacto)}</span>
                              {href ? (
                                <a
                                  href={href}
                                  rel='noreferrer'
                                  target={
                                    contacto.tipo === 'otro'
                                      ? '_blank'
                                      : undefined
                                  }
                                >
                                  {contacto.valor}
                                </a>
                              ) : (
                                <strong>{contacto.valor}</strong>
                              )}
                            </div>
                            <Button
                              aria-label={
                                copied
                                  ? 'Contacto copiado'
                                  : `Copiar ${contacto.valor}`
                              }
                              onClick={() => void copyContact(contacto.valor)}
                              size='icon'
                              title={copied ? 'Copiado' : 'Copiar'}
                              variant='ghost'
                            >
                              {copied ? (
                                <Check aria-hidden='true' />
                              ) : (
                                <Copy aria-hidden='true' />
                              )}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                    {contactosCursor && (
                      <div className='tax-dialog-more'>
                        <Button
                          disabled={contactosLoading}
                          onClick={() => void loadContactos(contactosCursor)}
                          size='sm'
                          variant='outline'
                        >
                          {contactosLoading
                            ? 'Cargando…'
                            : 'Cargar más contactos'}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
