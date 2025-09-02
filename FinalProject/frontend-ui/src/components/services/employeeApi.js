import createAxios from "./createAxios.js";
import { handleResponse, handleError } from "./responseProcess.js";

const MID_URL = "/users";

class employeeApi {
    constructor() {
        this.axios = createAxios(MID_URL);
    }

    // 사원 리스트 조회
    async getEmployeeList() {
        try {
            const res = await this.axios.get("");
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }

    // 사원 개별 조회
    async getEmployee(userId) {
        try {
            const res = await this.axios.get(`/${userId}`);
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }

    // 사원 계정 생성
    async postEmployee(payload) {
        try {
            // 수정필요-
            const body = {
                username: payload.username, // 이름
                email: payload.email, // 이메일
                // 수정 완료 후 주석 해제
                // usernum: payload.usernum, // 사원번호
                // dept: payload.dept ?? null,
                // position: payload.position ?? null,
                is_manager: payload.is_manager ?? false, // 관리자 여부
            };
            const res = await this.axios.post("", body);
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }

    // 사원 계정 수정
    async updateEmployee(userId, patch) {
        try {
            // 수정필요
            const body = {
                ...(patch.username !== undefined && {
                    username: patch.username,
                }),
                ...(patch.email !== undefined && { email: patch.email }),
                // 수정 완료 후 주석 해제
                // ...(patch.usernum !== undefined && { usernum: patch.usernum }),
                // ...(patch.dept !== undefined && { dept: patch.dept }),
                // ...(patch.position !== undefined && { position: patch.position }),
                ...(patch.is_manager !== undefined && {
                    is_manager: patch.is_manager,
                }),
            };
            const res = await this.axios.put(`/${userId}`, body);
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }

    // 사원 비밀번호 초기화
    async resetPassword(userId) {
        try {
            const res = await this.axios.put(`/${userId}/reset-password`);
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }

    // 사원 계정 삭제
    async deleteEmployee(userId) {
        try {
            const res = await this.axios.delete(`/${userId}`);
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }
}

export default new employeeApi();
