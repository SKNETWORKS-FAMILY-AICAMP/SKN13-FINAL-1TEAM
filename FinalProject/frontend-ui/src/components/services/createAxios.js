import axios from "axios";
import { BASE_URL } from "./env.js";

// 토큰 갱신 중인지 추적하는 변수
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    
    failedQueue = [];
};

const createAxios = (midPath = "") => {
    const instance = axios.create({
        baseURL: `${BASE_URL}${midPath}`,
        headers: {
            "Content-Type": "application/json",
        },
        withCredentials: true,
    });

    // Request interceptor: 헤더에 토큰 추가
    instance.interceptors.request.use(
        (config) => {
            const token = localStorage.getItem("userToken");
            if (token) {
                config.headers["Authorization"] = `Bearer ${token}`;
            }
            return config;
        },
        (error) => {
            return Promise.reject(error);
        }
    );

    // Response interceptor: 401 에러 시 토큰 갱신
    instance.interceptors.response.use(
        (response) => response,
        async (error) => {
            const originalRequest = error.config;

            if (error.response?.status === 401 && !originalRequest._retry) {
                if (isRefreshing) {
                    // 이미 토큰 갱신 중이면 큐에 추가
                    return new Promise((resolve, reject) => {
                        failedQueue.push({ resolve, reject });
                    }).then(token => {
                        originalRequest.headers['Authorization'] = `Bearer ${token}`;
                        return instance(originalRequest);
                    }).catch(err => {
                        return Promise.reject(err);
                    });
                }

                originalRequest._retry = true;
                isRefreshing = true;

                try {
                    // Refresh token으로 새 access token 요청
                    const refreshResponse = await axios.post(`${BASE_URL}/auth/refresh`, {}, {
                        withCredentials: true
                    });

                    const newToken = refreshResponse.data.access_token;
                    localStorage.setItem("userToken", newToken);
                    
                    // 대기 중인 요청들 처리
                    processQueue(null, newToken);
                    
                    // 원래 요청 재시도
                    originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
                    return instance(originalRequest);
                } catch (refreshError) {
                    processQueue(refreshError, null);
                    
                    // Refresh token도 만료되었으면 로그아웃 처리
                    localStorage.removeItem("userToken");
                    // 로그인 페이지로 리다이렉트 (SPA 라우팅 고려)
                    if (window.location.pathname !== "/login") {
                        window.location.href = "/login";
                    }
                    
                    return Promise.reject(refreshError);
                } finally {
                    isRefreshing = false;
                }
            }

            return Promise.reject(error);
        }
    );

    return instance;
};

export default createAxios;
