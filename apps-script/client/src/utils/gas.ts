export function gasRun<T = void>(method: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const g = window.google;
    if (!g) {
      reject(new Error(`Google Apps Script API not available (dev mode) — ${method}`));
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runner = g.script.run as any;
    runner
      .withSuccessHandler((r: unknown) => resolve(r as T))
      .withFailureHandler(reject)
      [method](...args);
  });
}
