const MONTH_NAMES_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_NAMES_SHORT_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const PAD2 = (n: number) => String(n).padStart(2, "0");

export function formatCalendarDate(d: Date, format: string, lang: string): string {
  if (format === "zh") return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  if (format === "iso") return `${d.getFullYear()}-${PAD2(d.getMonth() + 1)}`;
  if (format === "en") return `${MONTH_NAMES_EN[d.getMonth()]} ${d.getFullYear()}`;

  return format
    .replace(/yyyy/g, String(d.getFullYear()))
    .replace(/MMMM/g, MONTH_NAMES_EN[d.getMonth()])
    .replace(/MMM/g, MONTH_NAMES_SHORT_EN[d.getMonth()])
    .replace(/MM/g, PAD2(d.getMonth() + 1))
    .replace(/M/g, String(d.getMonth() + 1))
    .replace(/dd/g, PAD2(d.getDate()))
    .replace(/d/g, String(d.getDate()))
    .replace(/HH/g, PAD2(d.getHours()))
    .replace(/mm/g, PAD2(d.getMinutes()))
    .replace(/ss/g, PAD2(d.getSeconds()));
}

export function formatClock(d: Date): string {
  return `${PAD2(d.getHours())}:${PAD2(d.getMinutes())}:${PAD2(d.getSeconds())}`;
}
