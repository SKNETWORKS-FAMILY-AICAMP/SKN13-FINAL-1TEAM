import axios from "axios";
import { BASE_URL } from "./env.js";

const createAxios = (midPath = "") => {
    const instance = axios.create({
        baseURL: `${BASE_URL}${midPath}`,
        headers: {
            "Content-Type": "application/json",
        },
        withCredentials: true,
    });

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

    return instance;
};

export default createAxios;
