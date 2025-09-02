import createAxios from "./createAxios.js";
import { handleResponse, handleError } from "./responseProcess.js";

class userApi {
    constructor() {
        this.axios = createAxios("");
    }

    /**
     * 로그인
     * @param {{ username: string, password: string }} formData
     * @returns {{ access_token: string, token_type: string, must_change_password: boolean }}
     */
    async logIn({ username, password }) {
        try {
            const body = new URLSearchParams();
            body.set("username", username);
            body.set("password", password);

            console.log("아이디,비번 url화 - ", body.toString()); // 수정필요 - 삭제

            // FastAPI OAuth2PasswordRequestForm 규격 → x-www-form-urlencoded
            const res = await this.axios.post("/token", body, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            });

            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }

    // 로그아웃
    async logOut() {
        try {
            const res = await this.axios.post("/logout");
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }

    /**
     * 비밀번호 변경
     * @param {{ current_password: string, new_password: string }} payload
     * @returns {{ message: string }}
     */
    async updatePassword({ current_password, new_password }) {
        try {
            const res = await this.axios.put("/auth/change-password", {
                current_password,
                new_password,
            });
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }

    // 이메일 변경
    async updateEmail() {}

    // 사원 정보 조회
    async getUser() {
        try {
            const res = await this.axios.get("/me");
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    }
}

export default new userApi();
