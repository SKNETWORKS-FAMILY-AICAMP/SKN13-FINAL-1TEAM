// src/components/FeatureWindow/panels/calendar/GanttView.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import GSTC from "gantt-schedule-timeline-calendar";
import "gantt-schedule-timeline-calendar/dist/style.css";
import "./ganttView.css";
import { startOfMonth, endOfMonth, addMonths, differenceInCalendarDays } from "date-fns";
import { EVENT_TYPE_COLORS, matchTypeByColor } from "./calendarConstants";

const LICENSE_KEY = import.meta.env?.VITE_GSTC_LICENSE_KEY || "";

const toMs = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_MS = 30 * 60 * 1000;

function normalizeInterval(ev) {
  const s = toMs(ev.start);
  let e = ev.end != null ? toMs(ev.end) : NaN;
  if (!Number.isFinite(s)) return null;
  if (!Number.isFinite(e) || e <= s) e = s + MIN_MS;

  const type = (ev.type ? String(ev.type).toLowerCase() : matchTypeByColor(ev.color)) || "etc";
  const color = ev.color ?? EVENT_TYPE_COLORS[type]?.bg;

  return { start: s, end: e, title: ev.title || "", type, color, ev };
}

function monthRange(currentDate) {
  const base = currentDate ? new Date(currentDate) : new Date();
  const mStart = startOfMonth(base);
  const nextStart = addMonths(mStart, 1);
  return { mStart, nextStart };
}

function monthIntersectSeg(norm, mStartMs, nextStartMs) {
  let s = Math.max(norm.start, mStartMs);
  let e = Math.min(norm.end, nextStartMs);
  if (e === nextStartMs) e = nextStartMs - 1;
  if (e <= s) return null;
  return { start: s, end: e, title: norm.title, type: norm.type, color: norm.color, ev: norm.ev };
}

/* ================= Fallback(CSS) ================= */
function FallbackGantt({ currentDate, events = [], height = 360, dayWidth = 110, onEventClick }) {
  const scrollRef = useRef(null);

  const { mStart, nextStart } = useMemo(() => monthRange(currentDate), [currentDate]);
  const mStartMs = mStart.getTime();
  const nextStartMs = nextStart.getTime();

  const daysInMonth = useMemo(
    () => differenceInCalendarDays(endOfMonth(mStart), mStart) + 1,
    [mStart]
  );
  const days = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  const segs = useMemo(() => {
    return (events || [])
      .map(normalizeInterval)
      .filter(Boolean)
      .map((n) => monthIntersectSeg(n, mStartMs, nextStartMs))
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);
  }, [events, mStartMs, nextStartMs]);

  const items = useMemo(() => {
    return segs.map((seg, idx) => {
      const left = ((seg.start - mStartMs) / DAY_MS) * dayWidth;
      const width = Math.max(((seg.end - seg.start) / DAY_MS) * dayWidth, 4);
      return { id: seg.ev.id ?? `seg-${idx}`, event: seg.ev, title: seg.title, left, width, type: seg.type, color: seg.color };
    });
  }, [segs, mStartMs, dayWidth]);

  const contentWidth = daysInMonth * dayWidth;

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || items.length === 0) return;
    const targetLeft = Math.max(0, items[0].left - dayWidth);
    scroller.scrollTo({ left: targetLeft, behavior: "smooth" });
  }, [items, dayWidth, mStartMs, nextStartMs]);

  return (
    <div className="fgantt" style={{ height, ["--fg-dayw"]: `${dayWidth}px` }}>
      <div ref={scrollRef} className="fgantt-scroll simple-scroll">
        <div className="fgantt-content" style={{ width: `${contentWidth}px` }}>
          <div className="fgantt-header" style={{ gridTemplateColumns: `repeat(${daysInMonth}, var(--fg-dayw))` }}>
            {days.map((d) => (
              <div key={d} className="fgantt-day">{d}</div>
            ))}
          </div>

          <div className="fgantt-canvas">
            {items.map((it, row) => (
              <div key={it.id} className="fgantt-row" style={{ top: row * 56 }}>
                <div
                  className={`fgantt-bar bar--${it.type}`}
                  style={{ left: it.left, width: it.width, backgroundColor: it.color }}
                  title={it.title}
                  onClick={() => onEventClick?.(it.event)}
                >
                  <span className="fgantt-bar-text">{it.title}</span>
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <div className="px-3 py-2 text-sm text-neutral-500">이 달에 표시할 간트 바가 없어요</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= GSTC ================= */
function isValidLicenseKey(k) {
  if (!k || typeof k !== "string") return false;
  const t = k.trim();
  return t.length >= 24 && !/^(your-|test|dummy)/i.test(t);
}

export default function GanttView({ currentDate, events = [], height = 360, onEventClick }) {
  const [fallbackOnError, setFallbackOnError] = useState(false);
  const useFallback = fallbackOnError || !isValidLicenseKey(LICENSE_KEY);

  const { mStart, nextStart } = useMemo(() => monthRange(currentDate), [currentDate]);
  const mStartMs = mStart.getTime();
  const nextStartMs = nextStart.getTime();

  const segs = useMemo(() => {
    return (events || [])
      .map(normalizeInterval)
      .filter(Boolean)
      .map((n) => monthIntersectSeg(n, mStartMs, nextStartMs))
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);
  }, [events, mStartMs, nextStartMs]);

  if (useFallback) {
    return (
      <FallbackGantt
        currentDate={currentDate}
        events={events}
        height={height}
        onEventClick={onEventClick}
      />
    );
  }

  const hostRef = useRef(null);
  const stateRef = useRef(null);
  const initedRef = useRef(false);
  const itemMapRef = useRef({});

  const { rows, items, itemMap } = useMemo(() => {
    const r = {};
    const i = {};
    const map = {};
    const GSTCID = GSTC.api.GSTCID;

    segs.forEach((seg, idx) => {
      const baseId = seg.ev.id ?? idx;
      const rowId = GSTCID(`row-${baseId}`);
      const itemId = GSTCID(`item-${baseId}`);

      r[rowId] = { id: rowId, label: "" };
      i[itemId] = {
        id: itemId,
        label: seg.title,
        rowId,
        time: { start: seg.start, end: seg.end },
        className: `bar bar--${seg.type}`,
        style: { background: seg.color },
      };
      map[itemId] = seg.ev;
    });

    return { rows: r, items: i, itemMap: map };
  }, [segs]);

  useEffect(() => {
    if (!hostRef.current || initedRef.current) return;

    try {
      const config = {
        licenseKey: LICENSE_KEY,
        list: { rows, columns: {}, row: { height: 44 } },
        chart: {
          items,
          time: { from: mStartMs, to: nextStartMs, zoom: 21 },
          calendar: {
            levels: [
              { unit: "month", format: "M월" },
              { unit: "day", format: "d" },
            ],
          },
        },
        scroll: { horizontal: { precise: true } },
      };

      const state = GSTC.api.stateFromConfig(config);
      GSTC({ element: hostRef.current, state });
      stateRef.current = state;
      initedRef.current = true;

      const el = hostRef.current;
      const onClick = (e) => {
        const node = e.target.closest("[data-gstcid]");
        if (!node) return;
        const id = node.getAttribute("data-gstcid");
        const ev = itemMapRef.current[id];
        if (ev) onEventClick?.(ev);
      };
      el.addEventListener("click", onClick);

      return () => {
        try { state.destroy(); } catch {}
        el.removeEventListener("click", onClick);
        initedRef.current = false;
      };
    } catch (err) {
      console.error("[GSTC init error]", err);
      setFallbackOnError(true);
    }
  }, []); // eslint-disable-line

  useEffect(() => { itemMapRef.current = itemMap; }, [itemMap]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    try {
      state.update("config", (cfg) => {
        cfg.list.rows = rows;
        cfg.chart.items = items;
        return cfg;
      });
    } catch (err) {
      console.error("[GSTC update items error]", err);
      setFallbackOnError(true);
    }
  }, [rows, items]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    try {
      state.update("config.chart.time", (t) => ({ ...t, from: mStartMs, to: nextStartMs }));
    } catch (err) {
      console.error("[GSTC update time error]", err);
      setFallbackOnError(true);
    }
  }, [mStartMs, nextStartMs]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state || segs.length === 0) return;
    try {
      const firstStart = segs[0].start;
      if (GSTC.api?.scrollToTime) {
        GSTC.api.scrollToTime(state, firstStart);
      } else {
        state.update("config.chart.time.centerTime", () => firstStart);
      }
    } catch {}
  }, [segs]);

  return (
    <div className="gstc-wrapper" style={{ height }}>
      <div ref={hostRef} className="gstc-host" />
    </div>
  );
}