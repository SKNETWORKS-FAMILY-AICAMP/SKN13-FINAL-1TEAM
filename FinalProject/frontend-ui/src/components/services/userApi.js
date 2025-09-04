import createAxios from "./createAxios.js";
import { handleResponse, handleError } from "./responseProcess.js";

class userApi {
    constructor() {
        this.axios = createAxios("");
    }

    logIn = async ({ username, password }) => {
        try {
            const body = new URLSearchParams();
            body.set("username", username);
            body.set("password", password);

            console.log("아이디,비번 url화 - ", body.toString()); // 수정필요 - 삭제

            const res = await this.axios.post("/auth/login", body, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            });

            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    };

    logOut = async () => {
        try {
            const res = await this.axios.post("/logout");
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    };

    updatePassword = async ({ current_password, new_password }) => {
        try {
            const res = await this.axios.put("/auth/password", {
                current_password,
                new_password,
            });
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    };

    updateEmail = async (userId, email) => {
        try {
            const res = await this.axios.put(`/users/${userId}`, {
                email,
            });
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    };

    getUser = async () => {
        try {
            const res = await this.axios.get("/auth/me");
            return handleResponse(res);
        } catch (e) {
            return handleError(e);
        }
    };
}

export default new userApi();
