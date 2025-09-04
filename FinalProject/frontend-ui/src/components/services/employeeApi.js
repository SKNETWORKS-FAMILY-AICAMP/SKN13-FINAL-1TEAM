import createAxios from "./createAxios.js";
import { handleResponse, handleError } from "./responseProcess.js";

const MID_URL = "/users";

class employeeApi {
    constructor() {
        this.axios = createAxios();
    }

    // 사원 계정 생성
    async postEmployee(payload) {
        try {
            const body = {
                username: payload.username,
                email: payload.email,
                unique_auth_number: payload.unique_auth_number,
                dept: payload.dept || null,
                position: payload.position || null,
                is_manager: payload.is_manager || false,
            };
            const res = await this.axios.post(MID_URL, body);
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }

    // 사원 리스트 조회
    async getEmployeeList() {
        try {
            const res = await this.axios.get(MID_URL, {
                params: {
                    _: new Date().getTime(),
                },
            });
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }

    // 사원 개별 조회
    async getEmployee(userId) {
        try {
            const res = await this.axios.get(`${MID_URL}/${userId}`);
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }

    // 사원 계정 삭제
    async deleteEmployee(userId) {
        try {
            const res = await this.axios.delete(`${MID_URL}/${userId}`);
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }

    // 사원 계정 수정
    async updateEmployee(userId, patch) {
        try {
            const body = {
                ...(patch.username !== undefined && {
                    username: patch.username,
                }),
                ...(patch.email !== undefined && { email: patch.email }),
                ...(patch.unique_auth_number !== undefined && {
                    unique_auth_number: patch.unique_auth_number,
                }),
                ...(patch.dept !== undefined && { dept: patch.dept }),
                ...(patch.position !== undefined && {
                    position: patch.position,
                }),
                ...(patch.is_manager !== undefined && {
                    is_manager: patch.is_manager,
                }),
            };
            const res = await this.axios.put(`${MID_URL}/${userId}`, body);
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }

    // 사원 비밀번호 초기화
    async resetPassword(userId) {
        try {
            const res = await this.axios.put(
                `${MID_URL}/${userId}/reset-password`
            );
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }
}

export default new employeeApi();
