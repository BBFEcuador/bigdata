import {
  ESTADOS_ACTIVOS,
  ESTADOS_TERMINALES,
  EstadoScraping,
  ORIGENES_ACCION,
  TRANSICIONES,
  esTerminal,
  esTransicionLegal,
} from './scraping.estados';
import { calcularBackoffMs, BACKOFF_MAX_MS } from './scraping.constants';

const TODOS = Object.keys(TRANSICIONES) as EstadoScraping[];

describe('máquina de estados del scraping', () => {
  it('cubre exactamente los seis estados del enum de la base', () => {
    expect(TODOS.sort()).toEqual(
      ['cancelado', 'completado', 'corriendo', 'encolado', 'fallido', 'pausado'].sort(),
    );
  });

  it('parte activos y terminales sin solaparse ni dejar huecos', () => {
    expect([...ESTADOS_ACTIVOS, ...ESTADOS_TERMINALES].sort()).toEqual(TODOS.sort());
    for (const e of ESTADOS_ACTIVOS) expect(ESTADOS_TERMINALES).not.toContain(e);
  });

  it('no declara transiciones hacia estados inexistentes', () => {
    for (const destinos of Object.values(TRANSICIONES)) {
      for (const d of destinos) expect(TODOS).toContain(d);
    }
  });

  it('nunca deja un job en un callejón sin salida salvo completado', () => {
    // Un terminal del que no se pueda salir es correcto sólo para 'completado':
    // fallido y cancelado tienen que poder reintentarse, o un error transitorio
    // dejaría la compañía sin rastrear para siempre.
    for (const e of TODOS) {
      if (e === 'completado') expect(TRANSICIONES[e]).toHaveLength(0);
      else expect(TRANSICIONES[e].length).toBeGreaterThan(0);
    }
  });

  it('prohíbe reanudar directamente a corriendo', () => {
    // Reanudar tiene que devolver el job a la cola. Saltar a 'corriendo' dejaría
    // un job que nadie ejecuta y se saltaría el tope de workers.
    expect(esTransicionLegal('pausado', 'corriendo')).toBe(false);
    expect(esTransicionLegal('pausado', 'encolado')).toBe(true);
  });

  it('no permite revivir un job completado', () => {
    for (const e of TODOS) expect(esTransicionLegal('completado', e)).toBe(false);
  });

  it('sólo el despachador entra en corriendo, y sólo desde encolado', () => {
    const origenes = TODOS.filter(e => TRANSICIONES[e].includes('corriendo'));
    expect(origenes).toEqual(['encolado']);
  });

  it('marca como terminal lo que no puede moverse solo', () => {
    expect(esTerminal('completado')).toBe(true);
    expect(esTerminal('fallido')).toBe(true);
    expect(esTerminal('cancelado')).toBe(true);
    expect(esTerminal('corriendo')).toBe(false);
  });

  describe('orígenes de cada acción del usuario', () => {
    // Estas listas van literalmente al WHERE del UPDATE. Si alguien amplía una
    // sin añadir la transición correspondiente, el UPDATE dejaría el job en un
    // estado que la máquina considera imposible, y nada fallaría en caliente.
    const destino: Record<keyof typeof ORIGENES_ACCION, EstadoScraping> = {
      pausar: 'pausado',
      reanudar: 'encolado',
      cancelar: 'cancelado',
      reintentar: 'encolado',
    };

    for (const [accion, origenes] of Object.entries(ORIGENES_ACCION)) {
      it(`${accion}: todos sus orígenes tienen la transición declarada`, () => {
        for (const desde of origenes) {
          expect(esTransicionLegal(desde, destino[accion as keyof typeof destino])).toBe(true);
        }
      });
    }

    it('no deja pausar ni cancelar un job ya terminado', () => {
      for (const t of ESTADOS_TERMINALES) {
        expect(ORIGENES_ACCION.pausar).not.toContain(t);
        expect(ORIGENES_ACCION.cancelar).not.toContain(t);
      }
    });
  });
});

describe('backoff entre reintentos', () => {
  it('crece exponencialmente y se topa', () => {
    expect(calcularBackoffMs(1)).toBe(30_000);
    expect(calcularBackoffMs(2)).toBe(60_000);
    expect(calcularBackoffMs(3)).toBe(120_000);
    expect(calcularBackoffMs(99)).toBe(BACKOFF_MAX_MS);
  });

  it('no devuelve nada negativo con un intento raro', () => {
    expect(calcularBackoffMs(0)).toBeGreaterThan(0);
    expect(calcularBackoffMs(-5)).toBeGreaterThan(0);
  });
});
