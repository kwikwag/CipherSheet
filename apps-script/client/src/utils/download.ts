export function downloadJson(obj: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: filename,
  }).click();
}
