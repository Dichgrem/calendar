import { useSettings } from "./use-settings";

const strings = {
  // Layout nav
  "nav.calendar": { "zh-CN": "日历", en: "Calendar" },
  "nav.settings": { "zh-CN": "设置", en: "Settings" },
  "nav.logout": { "zh-CN": "退出", en: "Logout" },

  // LoginPage
  "login.createAccount": { "zh-CN": "创建账户", en: "Create Account" },
  "login.login": { "zh-CN": "登录", en: "Login" },
  "login.firstUseHint": {
    "zh-CN": "首次使用，请设置用户名和密码。",
    en: "First time user, please set your username and password.",
  },
  "login.username": { "zh-CN": "用户名", en: "Username" },
  "login.password": { "zh-CN": "密码", en: "Password" },
  "login.creating": { "zh-CN": "创建中...", en: "Creating..." },
  "login.loggingIn": { "zh-CN": "登录中...", en: "Logging in..." },
  "login.create": { "zh-CN": "创建", en: "Create" },
  "login.loginBtn": { "zh-CN": "登录", en: "Login" },
  "login.registerFailed": { "zh-CN": "注册失败", en: "Registration failed" },
  "login.loginFailed": { "zh-CN": "用户名或密码错误", en: "Invalid username or password" },

  // CalendarView
  "cal.loading": { "zh-CN": "加载...", en: "Loading..." },
  "cal.failed": { "zh-CN": "失败", en: "Failed" },
  "cal.noCalendars": { "zh-CN": "暂无日历", en: "No calendars" },
  "cal.loadingEvents": { "zh-CN": "加载事件...", en: "Loading events..." },
  "cal.failedEvents": { "zh-CN": "加载事件失败", en: "Failed to load events" },
  "cal.today": { "zh-CN": "今天", en: "Today" },
  "cal.prev": { "zh-CN": "上一月", en: "Previous month" },
  "cal.next": { "zh-CN": "下一月", en: "Next month" },
  "cal.yearPrev": { "zh-CN": "上一年", en: "Previous year" },
  "cal.yearNext": { "zh-CN": "下一年", en: "Next year" },
  "cal.toggleVisibility": { "zh-CN": "切换日历可见性", en: "Toggle calendar visibility" },
  "cal.search": { "zh-CN": "搜索事件...", en: "Search events..." },
  "cal.all": { "zh-CN": "全部", en: "All" },
  "cal.noResults": { "zh-CN": "无匹配结果", en: "No results" },
  "cal.darkMode": { "zh-CN": "深色模式", en: "Dark mode" },
  "cal.lightMode": { "zh-CN": "浅色模式", en: "Light mode" },

  // EventEditor
  "event.create": { "zh-CN": "新建事件", en: "New Event" },
  "event.edit": { "zh-CN": "编辑事件", en: "Edit Event" },
  "event.creating": { "zh-CN": "创建中...", en: "Creating..." },
  "event.calendar": { "zh-CN": "日历", en: "Calendar" },
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

  // Common
  "common.loading": { "zh-CN": "加载中...", en: "Loading..." },
  "common.customColor": { "zh-CN": "自定义颜色", en: "Custom color" },

  // SettingsPage
  "settings.title": { "zh-CN": "设置", en: "Settings" },
  "settings.account": { "zh-CN": "账户", en: "Account" },
  "settings.loading": { "zh-CN": "加载中...", en: "Loading..." },
  "settings.loadFailed": { "zh-CN": "加载设置失败", en: "Failed to load settings" },
  "settings.language": { "zh-CN": "语言", en: "Language" },
  "settings.firstDay": { "zh-CN": "每周第一天", en: "First day of week" },
  "settings.sunday": { "zh-CN": "周日", en: "Sunday" },
  "settings.monday": { "zh-CN": "周一", en: "Monday" },
  "settings.saveError": { "zh-CN": "保存失败，请重试", en: "Failed to save, please retry" },
  "settings.saving": { "zh-CN": "保存中...", en: "Saving..." },
  "settings.saved": { "zh-CN": "已保存", en: "Saved" },
  "settings.save": { "zh-CN": "保存设置", en: "Save settings" },
  "settings.preferences": { "zh-CN": "偏好设置", en: "Preferences" },
  "settings.changePassword": { "zh-CN": "修改密码", en: "Change password" },
  "settings.oldPassword": { "zh-CN": "旧密码", en: "Old password" },
  "settings.newPassword": { "zh-CN": "新密码（至少 8 位）", en: "New password (min 8 chars)" },
  "settings.pwTooShort": {
    "zh-CN": "新密码至少 8 位",
    en: "New password must be at least 8 characters",
  },
  "settings.dataMgmt": { "zh-CN": "数据管理", en: "Data Management" },
  "settings.importIcs": { "zh-CN": "导入 ICS 日历", en: "Import ICS Calendar" },
  "settings.exportIcs": { "zh-CN": "导出 ICS 日历", en: "Export ICS Calendar" },
  "settings.autoBackup": { "zh-CN": "自动备份", en: "Auto Backup" },
  "settings.autoBackupCalendars": { "zh-CN": "选择要自动备份的日历", en: "Select calendars to auto-backup" },
  "settings.autoBackupInterval": { "zh-CN": "备份间隔", en: "Backup interval" },
  "settings.autoBackupOff": { "zh-CN": "关闭", en: "Off" },
  "settings.autoBackup30m": { "zh-CN": "每 30 分钟", en: "Every 30 min" },
  "settings.autoBackup1h": { "zh-CN": "每 1 小时", en: "Every 1 hour" },
  "settings.autoBackup6h": { "zh-CN": "每 6 小时", en: "Every 6 hours" },
  "settings.autoBackup12h": { "zh-CN": "每 12 小时", en: "Every 12 hours" },
  "settings.autoBackup24h": { "zh-CN": "每 24 小时", en: "Every 24 hours" },
  "settings.selectCalendars": { "zh-CN": "选择要导出的日历", en: "Select calendars to export" },
  "settings.selectAll": { "zh-CN": "全选", en: "Select All" },
  "settings.deselectAll": { "zh-CN": "取消全选", en: "Deselect All" },
  "settings.exportSelected": { "zh-CN": "导出选中", en: "Export Selected" },
  "settings.cancel": { "zh-CN": "取消", en: "Cancel" },
  "settings.calendars": { "zh-CN": "日历管理", en: "Calendar Management" },
  "settings.editCalendar": { "zh-CN": "编辑日历", en: "Edit calendar" },
  "settings.deleteCalendar": { "zh-CN": "删除日历", en: "Delete calendar" },
  "settings.confirmDelete": {
    "zh-CN": "确定要删除该日历吗？所有事件将被删除。",
    en: "Delete this calendar? All events will be removed.",
  },
  "settings.deleteFailed": { "zh-CN": "删除失败，请重试", en: "Failed to delete, please retry" },
  "settings.noCalendars": { "zh-CN": "暂无日历", en: "No calendars" },
  "settings.newCalendar": { "zh-CN": "新建日历", en: "New Calendar" },
  "settings.calNamePlaceholder": { "zh-CN": "日历名称", en: "Calendar name" },
  "settings.create": { "zh-CN": "创建", en: "Create" },
  "settings.commonCalendars": { "zh-CN": "导入常用日历", en: "Import Common Calendars" },
  "settings.importing": { "zh-CN": "导入中...", en: "Importing..." },
  "settings.imported": { "zh-CN": "已导入", en: "Imported" },
  "settings.importBtn": { "zh-CN": "导入", en: "Import" },
  "settings.showEventTime": { "zh-CN": "显示事件时间", en: "Show event time" },
  "settings.showLunarCalendar": { "zh-CN": "显示农历", en: "Show Lunar Calendar" },
  "settings.defaultCalendar": { "zh-CN": "默认日历", en: "Default Calendar" },
  "settings.defaultCalendarNone": { "zh-CN": "无（自动选择）", en: "None (auto-select)" },
  "settings.dateFormat": { "zh-CN": "日期格式", en: "Date format" },
  "settings.customFormat": { "zh-CN": "自定义格式...", en: "Custom format..." },
  "settings.formatHint": {
    "zh-CN": "yyyy=年 MM=月 dd=日 HH=时 mm=分 ss=秒",
    en: "yyyy=year MM=month dd=day HH=hour mm=minute ss=second",
  },
  "settings.backupDb": { "zh-CN": "备份数据库", en: "Backup DB" },
  "settings.backingUp": { "zh-CN": "备份中...", en: "Backing up..." },
  "settings.exportConfig": { "zh-CN": "导出配置", en: "Export Config" },
  "settings.serverUrl": { "zh-CN": "服务器地址", en: "Server URL" },
  "settings.serverUrlHint": {
    "zh-CN": "留空使用当前域名，填入完整地址如 http://192.168.1.100:3000",
    en: "Leave empty to use current domain, or enter full URL like http://192.168.1.100:3000",
  },
  "settings.serverUrlSaved": { "zh-CN": "已保存，重启应用生效", en: "Saved, restart app to apply" },
  "settings.unsavedChanges": { "zh-CN": "有未保存的更改", en: "Unsaved changes" },
  "serverDialog.title": { "zh-CN": "连接服务器", en: "Connect to Server" },
  "serverDialog.desc": {
    "zh-CN": "请输入服务器地址以使用日历应用",
    en: "Enter server address to use the calendar app",
  },
  "serverDialog.placeholder": {
    "zh-CN": "http://192.168.1.100:3000",
    en: "http://192.168.1.100:3000",
  },
  "serverDialog.connect": { "zh-CN": "连接", en: "Connect" },
  "serverDialog.skip": { "zh-CN": "稍后设置", en: "Set later" },
  "serverDialog.invalidUrl": {
    "zh-CN": "请输入有效的 http/https 地址",
    en: "Please enter a valid http/https URL",
  },
  "settings.backupDone": { "zh-CN": "备份完成", en: "Backup complete" },
  "settings.backupFailed": { "zh-CN": "备份失败", en: "Backup failed" },
  "settings.exportConfigFailed": { "zh-CN": "导出配置失败", en: "Export config failed" },
  "settings.serverLogs": { "zh-CN": "服务器日志", en: "Server Logs" },
  "settings.logAll": { "zh-CN": "全部", en: "All" },
  "settings.showLogs": { "zh-CN": "显示日志", en: "Show Logs" },
  "settings.logAutoRefresh": { "zh-CN": "自动刷新", en: "Auto-refresh" },
  "settings.logRefresh": { "zh-CN": "刷新", en: "Refresh" },
  "settings.logExport": { "zh-CN": "导出", en: "Export" },

  // ImportPage
  "import.tabFile": { "zh-CN": "文件导入", en: "File" },
  "import.tabUrl": { "zh-CN": "URL 导入", en: "URL" },
  "import.selectFile": { "zh-CN": "点击选择 .ics 文件", en: "Click to select .ics file" },
  "import.urlPlaceholder": { "zh-CN": "输入 ICS 日历链接", en: "Enter ICS calendar URL" },
  "import.fetchBtn": { "zh-CN": "获取预览", en: "Fetch Preview" },
  "import.fetching": { "zh-CN": "获取中...", en: "Fetching..." },
  "import.fetchError": { "zh-CN": "获取失败，请检查链接", en: "Fetch failed, check the URL" },
  "import.parseError": {
    "zh-CN": "解析失败，请检查文件格式",
    en: "Parse failed, check file format",
  },
  "import.parsing": { "zh-CN": "解析中...", en: "Parsing..." },
  "import.events": { "zh-CN": "个事件", en: "events" },
  "import.calName": { "zh-CN": "日历名称", en: "Calendar name" },
  "import.color": { "zh-CN": "日历颜色", en: "Calendar color" },
  "import.overwrite": { "zh-CN": "覆盖", en: "Overwrite" },
  "import.overwriteWarn": {
    "zh-CN": "将清空此日历中现有内容再导入",
    en: "Will clear existing content before importing",
  },
  "import.event": { "zh-CN": "事件", en: "Event" },
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
