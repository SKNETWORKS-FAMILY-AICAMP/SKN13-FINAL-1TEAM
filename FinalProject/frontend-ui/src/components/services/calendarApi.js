import createAxios from "./createAxios.js";
import { handleError, handleResponse } from "./responseProcess.js";

const MID_URL = "/events";

/** Date | string → ISO8601 */
const toISO = (v) => (v instanceof Date ? v.toISOString() : v);

// ✅ 프론트 이벤트(Date, allDay) → 서버 포맷(ISO, all_day)
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

// ✅ 서버 응답(ISO, allDay camelCase) → 프론트 포맷(Date, allDay)
const toClientEvent = (payload = {}) => {
    const out = { ...payload };
    if ("start" in out) out.start = new Date(out.start);
    if ("end" in out && out.end) out.end = new Date(out.end);
    // 서버는 allDay를 camelCase로 주니까 그대로 둬도 되지만, 안전하게 한 번 정리
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

    // 일정 조회
    async getEvents({ start, end }) {
        try {
            const res = await this.axios.get("", {
                params: { start: toISO(start), end: toISO(end) },
            });
            const data = handleResponse(res);
            return data.map(toClientEvent); // 배열 변환
        } catch (e) {
            return handleError(e);
        }
    }

    // 일정 등록
    async createEvent(eventBody) {
        try {
            const body = toServerEvent(eventBody);
            const res = await this.axios.post("", body);
            return toClientEvent(handleResponse(res));
        } catch (e) {
            return handleError(e);
        }
    }

    // 일정 수정(부분/전체) — undefined 필드 제거 후 전송
    async updateEvent(eventId, patchBody = {}) {
        try {
            const filtered = Object.fromEntries(
                Object.entries(patchBody).filter(([, v]) => v !== undefined)
            );
            const body = toServerEvent(filtered);
            const res = await this.axios.put(`/${eventId}`, body);
            return toClientEvent(handleResponse(res));
        } catch (err) {
            return handleError(err);
        }
    }

    // 일정 삭제
    async deleteEvent(eventId) {
        try {
            const res = await this.axios.delete(`/${eventId}`);
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }
}
export default new calendarApi();
