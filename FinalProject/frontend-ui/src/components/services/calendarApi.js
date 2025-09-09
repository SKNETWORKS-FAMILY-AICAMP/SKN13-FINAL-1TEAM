import createAxios from "./createAxios.js";
import { handleError, handleResponse } from "./responseProcess.js";

const MID_URL = "/calendar/events";

/** Date | string → ISO8601 (보낼 때는 기존대로 UTC ISO) */
const toISO = (v) => (v instanceof Date ? v.toISOString() : v);

/** 서버 날짜 문자열 안전 파싱
 *  - 끝에 Z/오프셋이 없으면 UTC로 간주해 'Z'를 붙여 파싱
 *    "2025-08-01T06:30:00"  -> new Date("2025-08-01T06:30:00Z")
 *    "2025-08-01T06:30:00Z" / "+09:00" -> 그대로 파싱
 */
function parseServerDateSafe(val) {
  if (val == null) return val;
  if (val instanceof Date) return val;
  if (typeof val === "string") {
    const hasTZ = /[zZ]$|[+\-]\d{2}:\d{2}$/.test(val);
    return new Date(hasTZ ? val : `${val}Z`);
  }
  return new Date(val);
}

// ✅ 프론트 → 서버 포맷(ISO, all_day)
const toServerEvent = (payload = {}) => {
  const out = { ...payload };
  if ("allDay" in out) {
    out.all_day = out.allDay;
    delete out.allDay;
  }
  if ("start" in out) out.start = toISO(out.start);
  if ("end" in out && out.end) out.end = toISO(out.end);
  return out;
};

// ✅ 서버 → 프론트 포맷(Date, allDay)
const toClientEvent = (payload = {}) => {
  const out = { ...payload };
  if ("start" in out) out.start = parseServerDateSafe(out.start);
  if ("end" in out && out.end) out.end = parseServerDateSafe(out.end);
  if ("all_day" in out) {
    out.allDay = out.all_day;
    delete out.all_day;
  }
  return out;
};

class calendarApi {
  constructor() {
    this.axios = createAxios(MID_URL);
  }

  async getEvents({ start, end }) {
    try {
      const params = { start: toISO(start), end: toISO(end) };
      console.log("[calendarApi.getEvents] params:", params);

      const res = await this.axios.get("", { params });
      const raw = handleResponse(res);
      console.log("[calendarApi.getEvents] server raw:", raw);

      const converted = raw.map(toClientEvent);
      console.log("[calendarApi.getEvents] toClientEvent:", converted);
      return converted;
    } catch (e) {
      return handleError(e);
    }
  }

  async createEvent(eventBody) {
    try {
      console.log("[calendarApi.createEvent] payload(raw):", eventBody);
      const body = toServerEvent(eventBody);
      console.log("[calendarApi.createEvent] payload(toServerEvent):", body);

      const res = await this.axios.post("", body);
      const data = handleResponse(res);
      const conv = toClientEvent(data);

      console.log("[calendarApi.createEvent] server resp(raw):", data);
      console.log("[calendarApi.createEvent] server resp(toClientEvent):", conv);
      return conv;
    } catch (e) {
      return handleError(e);
    }
  }

  async updateEvent(eventId, patchBody = {}) {
    try {
      const filtered = Object.fromEntries(
        Object.entries(patchBody).filter(([, v]) => v !== undefined)
      );
      console.log("[calendarApi.updateEvent] patchBody(raw):", filtered);

      const body = toServerEvent(filtered);
      console.log("[calendarApi.updateEvent] patchBody(toServerEvent):", body);

      const res = await this.axios.put(`/${eventId}`, body);
      const data = handleResponse(res);
      const conv = toClientEvent(data);

      console.log("[calendarApi.updateEvent] server resp(raw):", data);
      console.log("[calendarApi.updateEvent] server resp(toClientEvent):", conv);
      return conv;
    } catch (err) {
      return handleError(err);
    }
  }

  async deleteEvent(eventId) {
    try {
      console.log("[calendarApi.deleteEvent]", eventId);
      await this.axios.delete(`/${eventId}`);
      return true;
    } catch (e) {
      return handleError(e);
    }
  }
}

export default new calendarApi();