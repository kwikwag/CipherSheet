export const buf2b64 = (b: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(b)));

export const b642buf = (s: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(s), c => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;

export const buf2hex = (b: ArrayBuffer): string =>
  Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');

export const b64url2buf = (s: string): Uint8Array =>
  b642buf(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));

export const buf2b64url = (b: ArrayBuffer): string =>
  buf2b64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

export function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
