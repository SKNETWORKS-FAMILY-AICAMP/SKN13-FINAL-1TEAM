import axios from "axios";
import { BASE_URL } from "./env.js";

const createAxios = (midPath = "") => {
    return axios.create({
        baseURL: `${BASE_URL}${midPath}`,
        headers: {
            "Content-Type": "application/json",
        },
        withCredentials: true,
    });
};

export default createAxios;
