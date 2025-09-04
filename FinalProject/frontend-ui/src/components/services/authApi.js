// ✅ src/components/services/authApi.js
import createAxios from "./createAxios";

// 실제 API는 여기에 연동. (우리 원칙대로 UI/통신 분리)
export async function requestEmailCode(email) {
    if (!email) throw new Error("이메일을 입력하세요.");
    // TODO: await fetch( .../auth/email/code )
    return Promise.resolve();
}

export async function verifyEmailCode(email, code) {
    if (!email || !code) throw new Error("이메일과 코드를 입력하세요.");
    // TODO: await fetch( .../auth/email/verify )
    return Promise.resolve();
}

export async function updateUsername(email, newUsername) {
    if (!newUsername) throw new Error("변경할 아이디를 입력하세요.");
    // TODO: await fetch( .../auth/username, { method: 'PATCH' } )
    return Promise.resolve();
}

export async function updatePassword(email, newPassword) {
    if (!newPassword) throw new Error("변경할 비밀번호를 입력하세요.");
    // TODO: await fetch( .../auth/password, { method: 'PATCH' } )
    return Promise.resolve();
}

export async function login(userId, password) {
    const axios = createAxios();
    const response = await axios.post(
        "/auth/login",
        {
            unique_auth_number: userId,
            password: password,
        },
        {
            headers: {
                "Content-Type": "application/json",
            },
        }
    );
    return response.data;
}