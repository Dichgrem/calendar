export function parseMeta(meta: string | null | undefined) {
  if (!meta) return null;
  try { return JSON.parse(meta); } catch { return null; }
}
