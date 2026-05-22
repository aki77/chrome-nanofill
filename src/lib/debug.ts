declare const __DEV__: boolean;
const enabled = __DEV__;

export function mark(label: string): void {
  if (!enabled) return;
  console.log(`[nanofill] ${label} @ ${performance.now().toFixed(1)}ms`);
}

export async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!enabled) return fn();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    console.log(`[nanofill] ${label}: ${(performance.now() - t0).toFixed(1)}ms`);
  }
}
