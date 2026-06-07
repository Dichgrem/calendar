import React, { useRef, useCallback, useMemo } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";

interface Event {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  color?: string;
  calendarId: string;
  allDay?: boolean;
}

interface Props {
  events: Event[];
  visibleCalendars: Set<string>;
  dark: boolean;
  onDayPress: (date: string) => void;
  onEventPress: (event: Event) => void;
  onMonthChange: (year: number, month: number) => void;
}

function buildHtml(dark: boolean) {
  const bg = dark ? "#111" : "#fff";
  const text = dark ? "#eee" : "#333";
  const border = dark ? "#333" : "#e5e5e5";
  const todayBg = dark ? "rgba(59,130,246,0.15)" : "rgba(59,130,246,0.1)";
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<link href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.min.css" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,system-ui,sans-serif;background:${bg};color:${text}}
.fc{font-size:13px}.fc-toolbar-title{font-size:15px!important;font-weight:600}.fc-button{font-size:12px!important;padding:4px 8px!important}
.fc-daygrid-day-number{font-size:12px;padding:4px 6px}.fc-col-header-cell{padding:4px 0;font-size:11px}
.fc-daygrid-day-frame{min-height:48px}.fc-scrollgrid{border-color:${border}!important}
.fc td,.fc th{border-color:${border}!important}.fc-theme-standard .fc-scrollgrid{border-color:${border}!important}
.fc-day-today{background:${todayBg}!important}.fc-event{font-size:11px;padding:2px 3px;border-radius:3px;cursor:pointer;margin:1px 2px}
${dark ? '.fc{--fc-border-color:#333;--fc-page-bg-color:#111;--fc-neutral-bg-color:#222}.fc .fc-col-header-cell{background:#222;color:#999}.fc-daygrid-day-number{color:#ccc}.fc-day-other .fc-daygrid-day-top{opacity:.4}.fc-event-title{color:#fff!important}.fc-more-popover{background:#222;border-color:#333}.fc-popover-body,.fc-more-popover .fc-popover-header{background:#222;color:#ccc}' : ''}
</style></head><body><div id="cal"></div>
<script src="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.15/index.global.min.js"></script>
<script>
const cal = new FullCalendar.Calendar(document.getElementById("cal"),{
  initialView:"dayGridMonth",firstDay:1,height:"auto",
  headerToolbar:{left:"prev",center:"title",right:"next"},
  dayCellDidMount(info){info.el.addEventListener("click",()=>ReactNativeWebView.postMessage(JSON.stringify({type:"dayPress",date:info.date.toISOString().slice(0,10)})))},
  eventClick(info){ReactNativeWebView.postMessage(JSON.stringify({type:"eventPress",id:info.event.id}))},
  datesSet(info){ReactNativeWebView.postMessage(JSON.stringify({type:"monthChange",start:info.start.toISOString()}))},
});
cal.render();
window.addEventListener("message",function(e){try{var d=JSON.parse(e.data);if(d.type==="events"){cal.removeAllEvents();d.data.forEach(function(ev){cal.addEvent({id:ev.id,title:ev.title,start:ev.startAt,end:ev.endAt,color:ev.color,allDay:ev.allDay})})}}catch(e){}});
ReactNativeWebView.postMessage(JSON.stringify({type:"ready"}));
</script></body></html>`;
}

export function WebCalendar({ events, visibleCalendars, dark, onDayPress, onEventPress, onMonthChange }: Props) {
  const wvRef = useRef<WebView>(null);

  const filtered = useMemo(
    () => events.filter((e) => visibleCalendars.has(e.calendarId)),
    [events, visibleCalendars],
  );

  const source = useMemo(() => ({ html: buildHtml(dark) }), [dark]);

  const sendEvents = useCallback(() => {
    wvRef.current?.postMessage(JSON.stringify({ type: "events", data: filtered }));
  }, [filtered]);

  const onMessage = useCallback((e: any) => {
    try {
      const d = JSON.parse(e.nativeEvent.data);
      if (d.type === "ready") sendEvents();
      else if (d.type === "dayPress") onDayPress(d.date);
      else if (d.type === "eventPress") {
        const ev = events.find((x) => x.id === d.id);
        if (ev) onEventPress(ev);
      } else if (d.type === "monthChange") onMonthChange(new Date(d.start).getFullYear(), new Date(d.start).getMonth());
    } catch {}
  }, [onDayPress, onEventPress, onMonthChange, events, sendEvents]);

  return (
    <View style={{ flex: 1, backgroundColor: dark ? "#111" : "#fff" }}>
      <WebView
        ref={wvRef}
        source={source}
        onMessage={onMessage}
        style={{ flex: 1 }}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={["*"]}
      />
    </View>
  );
}
