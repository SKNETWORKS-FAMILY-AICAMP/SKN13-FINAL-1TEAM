import { startOfDay, compareAsc } from "date-fns";

/** 이벤트를 날짜(자정) 기준으로 그룹핑해서 [{ date, items }, ...] 반환 */
export function groupEventsByDate(events = []) {
    const map = new Map();

    for (const ev of events) {
        const s = ev.start instanceof Date ? ev.start : new Date(ev.start);
        const key = startOfDay(s).getTime();
        if (!map.has(key)) map.set(key, { date: startOfDay(s), items: [] });
        map.get(key).items.push(ev);
    }

    const sections = Array.from(map.values()).sort((a, b) =>
        compareAsc(a.date, b.date)
    );

    sections.forEach((sec) =>
        sec.items.sort((a, b) => {
            const sa = a.start instanceof Date ? a.start : new Date(a.start);
            const sb = b.start instanceof Date ? b.start : new Date(b.start);
            return sa.getTime() - sb.getTime();
        })
    );

    return sections;
}
