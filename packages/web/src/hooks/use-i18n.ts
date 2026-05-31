import { useSettings } from "./use-settings";

const strings = {
  // Layout nav
  "nav.calendar": { "zh-CN": "日历", en: "Calendar" },
  "nav.todos": { "zh-CN": "待办", en: "Todos" },
  "nav.settings": { "zh-CN": "设置", en: "Settings" },

  // CalendarView
  "cal.loading": { "zh-CN": "加载...", en: "Loading..." },
  "cal.failed": { "zh-CN": "失败", en: "Failed" },
  "cal.noCalendars": { "zh-CN": "暂无日历", en: "No calendars" },
  "cal.loadingEvents": { "zh-CN": "加载事件...", en: "Loading events..." },
  "cal.failedEvents": { "zh-CN": "加载事件失败", en: "Failed to load events" },
  "cal.today": { "zh-CN": "今天", en: "Today" },

  // EventEditor
  "event.edit": { "zh-CN": "编辑事件", en: "Edit Event" },
  "event.title": { "zh-CN": "标题", en: "Title" },
  "event.start": { "zh-CN": "开始", en: "Start" },
  "event.end": { "zh-CN": "结束", en: "End" },
  "event.allDay": { "zh-CN": "全天事件", en: "All-day event" },
  "event.location": { "zh-CN": "地点", en: "Location" },
  "event.description": { "zh-CN": "描述", en: "Description" },
  "event.delete": { "zh-CN": "删除", en: "Delete" },
  "event.cancel": { "zh-CN": "取消", en: "Cancel" },
  "event.save": { "zh-CN": "保存", en: "Save" },
  "event.saving": { "zh-CN": "保存中...", en: "Saving..." },
  "event.error": { "zh-CN": "操作失败，请重试", en: "Operation failed, please retry" },

  // TodoListView
  "todo.allLists": { "zh-CN": "全部清单", en: "All lists" },
  "todo.allStatus": { "zh-CN": "全部状态", en: "All statuses" },
  "todo.statusTodo": { "zh-CN": "待完成", en: "To do" },
  "todo.statusInProgress": { "zh-CN": "进行中", en: "In progress" },
  "todo.statusCompleted": { "zh-CN": "已完成", en: "Completed" },
  "todo.new": { "zh-CN": "新建", en: "New" },
  "todo.loading": { "zh-CN": "加载中...", en: "Loading..." },
  "todo.loadFailed": { "zh-CN": "加载失败", en: "Failed to load" },
  "todo.empty": { "zh-CN": "暂无待办", en: "No todos" },
  "todo.dblClickEdit": { "zh-CN": "双击编辑", en: "Double-click to edit" },
  "todo.delete": { "zh-CN": "删除", en: "Delete" },

  // SettingsPage
  "settings.title": { "zh-CN": "设置", en: "Settings" },
  "settings.loading": { "zh-CN": "加载中...", en: "Loading..." },
  "settings.loadFailed": { "zh-CN": "加载设置失败", en: "Failed to load settings" },
  "settings.timezone": { "zh-CN": "时区", en: "Timezone" },
  "settings.language": { "zh-CN": "语言", en: "Language" },
  "settings.reminder": { "zh-CN": "默认提醒时间（分钟）", en: "Default reminder (minutes)" },
  "settings.firstDay": { "zh-CN": "每周第一天", en: "First day of week" },
  "settings.sunday": { "zh-CN": "周日", en: "Sunday" },
  "settings.monday": { "zh-CN": "周一", en: "Monday" },
  "settings.showCompleted": { "zh-CN": "显示已完成的待办", en: "Show completed todos" },
  "settings.saveError": { "zh-CN": "保存失败，请重试", en: "Failed to save, please retry" },
  "settings.saved": { "zh-CN": "已保存", en: "Saved" },
  "settings.save": { "zh-CN": "保存设置", en: "Save settings" },
  "settings.dataMgmt": { "zh-CN": "数据管理", en: "Data Management" },
  "settings.importIcs": { "zh-CN": "导入 ICS 日历", en: "Import ICS Calendar" },

  // ImportPage
  "import.selectFile": { "zh-CN": "点击选择 .ics 文件", en: "Click to select .ics file" },
  "import.parseError": { "zh-CN": "解析失败，请检查文件格式", en: "Parse failed, check file format" },
  "import.parsing": { "zh-CN": "解析中...", en: "Parsing..." },
  "import.events": { "zh-CN": "个事件", en: "events" },
  "import.todos": { "zh-CN": "个待办", en: "todos" },
  "import.calName": { "zh-CN": "日历名称", en: "Calendar name" },
  "import.overwrite": { "zh-CN": "覆盖", en: "Overwrite" },
  "import.overwriteWarn": { "zh-CN": "将清空此日历中现有内容再导入", en: "Will clear existing content before importing" },
  "import.event": { "zh-CN": "事件", en: "Event" },
  "import.todo": { "zh-CN": "待办", en: "Todo" },
  "import.importFailed": { "zh-CN": "导入失败，请重试", en: "Import failed, please retry" },
  "import.imported": { "zh-CN": "已导入", en: "Imported" },
  "import.importBtn": { "zh-CN": "导入", en: "Import" },
  "import.items": { "zh-CN": "项", en: "items" },
} as const;

type Key = keyof typeof strings;

export function useI18n() {
  const { data: settings } = useSettings();
  const lang = (settings?.language ?? "zh-CN") as "zh-CN" | "en";

  function t(key: Key): string {
    return strings[key][lang] ?? strings[key]["zh-CN"];
  }

  return { t, lang };
}
