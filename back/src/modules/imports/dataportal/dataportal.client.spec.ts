import { DataportalClient } from './dataportal.client';

/**
 * El ritmo tiene que aplicarse a CADA petición HTTP, no a cada RUC.
 *
 * Fue el primer fallo real de este importador y costó diagnosticarlo porque el
 * síntoma no cambiaba: la pausa estaba en el bucle de RUC del servicio, así que
 * `consultar()` disparaba sus cinco endpoints de golpe. Con "1 petición por
 * segundo" configurado, el portal recibía ráfagas de cinco y devolvía 429
 * exactamente igual que con cinco por segundo. Bajar el ritmo no arreglaba nada
 * porque el ritmo nunca se había aplicado donde importaba.
 */
describe('DataportalClient · ritmo', () => {
  const token = () => 'token-de-prueba';
  let originalFetch: typeof globalThis.fetch;
  let momentos: number[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    momentos = [];
    globalThis.fetch = (async () => {
      momentos.push(Date.now());
      return {
        ok: true,
        status: 200,
        headers: new Map(),
        json: async () => ({}),
      } as unknown as Response;
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('espacia las CINCO peticiones de un mismo RUC, no sólo los RUC entre sí', async () => {
    // 20 por segundo -> 50 ms entre peticiones. Cinco recursos = cuatro huecos.
    const client = new DataportalClient(token, { rps: 20 });
    await client.consultar('1790013731001');

    expect(momentos).toHaveLength(5);
    for (let i = 1; i < momentos.length; i++) {
      const hueco = momentos[i] - momentos[i - 1];
      // Margen amplio hacia abajo: el temporizador de Node no es exacto. Lo que
      // se fija es que HAYA separación, que es lo que faltaba.
      expect(hueco).toBeGreaterThanOrEqual(35);
    }
  });

  it('mantiene el ritmo entre RUC consecutivos', async () => {
    const client = new DataportalClient(token, { rps: 20 });
    await client.consultar('1790013731001');
    await client.consultar('0992111585001');

    expect(momentos).toHaveLength(10);
    const huecoEntreRucs = momentos[5] - momentos[4];
    expect(huecoEntreRucs).toBeGreaterThanOrEqual(35);
  });

  it('no acumula deuda: tras una pausa larga la siguiente sale enseguida', async () => {
    // Ritmo lento a propósito: 4/s son 250 ms de hueco, y la prueba es que la
    // espera sea muy inferior a eso. Con 20/s el margen quedaba en 35 ms y el
    // test fallaba al correr la suite entera en paralelo — no por el código,
    // sino porque el temporizador de Node no es puntual con la máquina cargada.
    // Un test que sólo pasa con el equipo ocioso no prueba nada.
    const client = new DataportalClient(token, { rps: 4 });
    await client.consultar('1790013731001');
    await new Promise((r) => setTimeout(r, 300)); // el trabajo de guardar en base

    const antes = Date.now();
    await client.consultar('0992111585001');
    // La primera del segundo RUC no debe esperar por huecos ya vencidos.
    expect(momentos[5] - antes).toBeLessThan(120);
  });
});
