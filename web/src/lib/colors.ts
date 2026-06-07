export const CALENDAR_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#6366f1",
  "#14b8a6",
  "#e11d48",
  "#84cc16",
];

export function pickDistinctColor(existingColors: string[]): string {
  const used = new Set(existingColors.map((c) => c.toLowerCase()));
  for (const c of CALENDAR_COLORS) {
    if (!used.has(c.toLowerCase())) return c;
  }
  return CALENDAR_COLORS[Math.floor(Math.random() * CALENDAR_COLORS.length)];
}
