export function normalizeHiringType(value: string) {
  const trimmed = value.trim();
  return ['校招', '校园招聘'].includes(trimmed.replace(/\s+/g, '')) ? '校招' : trimmed;
}
