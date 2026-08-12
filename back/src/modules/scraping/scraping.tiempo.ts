/**
 * Espera que se corta cuando el proceso se apaga.
 *
 * Un `setTimeout` a secas mantiene vivo el event loop y retrasa el cierre tanto
 * como dure la pausa. Con el `signal` del job, un Ctrl+C no espera a que
 * termine de dormir: el job se reencola y se reanuda al arrancar de nuevo.
 */
export function dormirInterrumpible(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise<void>(resolver => {
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', alAbortar);
      resolver();
    }, ms);
    // `unref` no basta: aquí el que manda es el abort, no el event loop.
    const alAbortar = () => {
      clearTimeout(t);
      resolver();
    };
    signal?.addEventListener('abort', alAbortar, { once: true });
  });
}
