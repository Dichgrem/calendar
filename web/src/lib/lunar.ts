import { getLunarDate } from "chinese-days";

interface LunarInfo {
  lunarMonCN: string;
  lunarDayCN: string;
  isLeap: boolean;
}

export function getLunarText(date: Date): string {
  try {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    const lunar = getLunarDate(dateStr) as LunarInfo;

    if (!lunar || !lunar.lunarMonCN || !lunar.lunarDayCN) {
      return "";
    }

    const prefix = lunar.isLeap ? "闰" : "";

    if (lunar.lunarDayCN === "初一") {
      return `${prefix}${lunar.lunarMonCN}`;
    }

    return `${prefix}${lunar.lunarDayCN}`;
  } catch {
    return "";
  }
}
