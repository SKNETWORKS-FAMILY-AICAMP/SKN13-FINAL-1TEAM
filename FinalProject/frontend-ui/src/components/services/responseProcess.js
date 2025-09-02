export const handleResponse = (response) => {
    // 성공적인 응답 (2xx 범위)
    console.log("서버 응답:", response.data);
    return response.data;
};

export const handleError = (error) => {
    if (error.response) {
        // 서버가 상태 코드로 응답했지만, 2xx 범위는 아닌 경우
        console.error("서버 응답 오류:", error.response.data);
        if (error.response.status >= 400 && error.response.status < 500) {
            throw new Error(`Client Error: ${error.response.status}`);
        } else if (error.response.status >= 500) {
            throw new Error(`Server Error: ${error.response.status}`);
        } else {
            throw new Error(`Unexpected Error: ${error.response.status}`);
        }
    } else if (error.request) {
        // 요청이 만들어졌으나 응답을 받지 못한 경우
        console.error("서버로부터 응답을 받지 못함:", error.request);
        throw new Error(
            "No response from server: 서버로부터 응답을 받지 못했습니다."
        );
    } else {
        // 요청을 설정하는 중에 오류가 발생한 경우
        console.error("요청 설정 오류:", error.message);
        throw new Error(`Request setup error: ${error.message}`);
    }
};
