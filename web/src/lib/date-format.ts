const MONTH_NAMES_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_NAMES_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MONTH_NAMES_ZH = [
  "一月",
  "二月",
  "三月",
  "四月",
  "五月",
  "六月",
  "七月",
  "八月",
  "九月",
  "十月",
  "十一月",
  "十二月",
];

const PAD2 = (n: number) => String(n).padStart(2, "0");

export function formatCalendarDate(d: Date, format: string, lang: string): string {
  if (!format) format = "zh";
  if (format === "zh") return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  if (format === "iso") return `${d.getFullYear()}-${PAD2(d.getMonth() + 1)}`;
  if (format === "en") return `${MONTH_NAMES_EN[d.getMonth()]} ${d.getFullYear()}`;

  const fullNames = lang === "en" ? MONTH_NAMES_EN : MONTH_NAMES_ZH;
  const shortNames = lang === "en" ? MONTH_NAMES_SHORT_EN : MONTH_NAMES_ZH;

  return format
    .replace(/yyyy/g, String(d.getFullYear()))
    .replace(/MMMM/g, fullNames[d.getMonth()])
    .replace(/MMM/g, shortNames[d.getMonth()])
    .replace(/MM/g, PAD2(d.getMonth() + 1))
    .replace(/M/g, String(d.getMonth() + 1))
    .replace(/dd/g, PAD2(d.getDate()))
    .replace(/d/g, String(d.getDate()))
    .replace(/HH/g, PAD2(d.getHours()))
    .replace(/mm/g, PAD2(d.getMinutes()))
    .replace(/ss/g, PAD2(d.getSeconds()));
}

export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
