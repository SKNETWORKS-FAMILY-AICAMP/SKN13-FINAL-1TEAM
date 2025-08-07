from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Generator
import json

from chat_agent import agent, generate_config

# FastAPI 인스턴스 생성

app = FastAPI()

# CORS 미들웨어 설정
origins = [
    "http://localhost",
    "http://localhost:5173",  # 프론트엔드 개발 서버
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 인메모리 세션 저장소 ---
chat_sessions: Dict[str, List[Dict[str, str]]] = {}

# --- Pydantic 모델 ---
class MessageSaveRequest(BaseModel):
    session_id: str
    role: str
    content: str

# --- API 엔드포인트 ---

@app.post("/chat/save")
async def save_message(request: MessageSaveRequest):
    """프론트엔드에서 보낸 메시지를 저장합니다."""
    if request.session_id not in chat_sessions:
        chat_sessions[request.session_id] = []
    chat_sessions[request.session_id].append({"role": request.role, "content": request.content})
    return {"status": "success"}

@app.get("/chat/sessions")
async def get_chat_sessions():
    """저장된 모든 채팅 세션의 목록을 반환합니다."""
    sessions_list = []
    for session_id, messages in chat_sessions.items():
        title = "새로운 대화"
        if messages:
            first_user_message = next((msg["content"] for msg in messages if msg["role"] == "user"), None)
            if first_user_message:
                title = first_user_message[:50]  # 첫 메시지의 50자로 제목 생성
        sessions_list.append({"id": session_id, "title": title})
    return {"sessions": sessions_list}

@app.get("/chat/messages/{session_id}")
async def get_messages(session_id: str):
    """특정 세션 ID의 모든 메시지를 반환합니다."""
    messages = chat_sessions.get(session_id, [])
    return {"messages": messages}

@app.get("/llm/stream")
async def llm_stream(session_id: str, prompt: str):
    """LLM의 응답을 실시간 스트리밍으로 반환합니다."""
    config = generate_config(session_id)
    chat_agent = agent()

    return StreamingResponse(_stream_llm_response(session_id, prompt, chat_agent, config, chat_sessions), media_type="text/event-stream")

async def _stream_llm_response(session_id: str, prompt: str, chat_agent, config, chat_sessions: Dict[str, List[Dict[str, str]]]) -> Generator:
    """AI 응답을 조각내어 실시간으로 생성하는 제너레이터"""
    full_response_content = ""
    
    # 세션 ID로 전체 대화 기록을 가져옴
    history = chat_sessions.get(session_id, [])
    
    # LangGraph가 이해하는 형식으로 대화 기록을 변환
    messages = []
    for msg in history:
        role = "ai" if msg["role"] == "assistant" else msg["role"]
        messages.append((role, msg["content"]))
    
    # 현재 프롬프트를 대화 기록에 추가 (중복 방지)
    if not messages or messages[-1] != ("user", prompt):
        messages.append(("user", prompt))

    input_data = {"messages": messages}

    # astream_events를 사용하여 각 단계를 스트리밍
    async for event in chat_agent.astream_events(input_data, config=config, version="v1"):
        kind = event["event"]
        if kind == "on_chat_model_stream":
            content = event["data"]["chunk"].content
            if content:
                # 생성된 콘텐츠 조각을 클라이언트로 바로 전송   
                yield f"data: {json.dumps({'content': content})}\n\n"
                full_response_content += content
                
        elif kind == "on_tool_start":
            tool_name = event.get("name", "Unknown Tool")
            tool_input = event["data"].get("input", {})
            print(f"DEBUG: on_tool_start event data: {event}") # 디버깅을 위한 print 문 추가
            thinking_message = f"[AI Thinking]: Using tool '{tool_name}' with input: {tool_input}"
            yield f"data: {json.dumps({'thinking_message': thinking_message})}\n\n"
            full_response_content += thinking_message + "\n"

        elif kind == "on_tool_end":
            tool_output = event["data"].get("output", "")
            if tool_output:
                # 도구 사용 결과를 클라이언트로 전송하고, 전체 응답에 추가
                formatted_output = f"[Tool Output]: {tool_output}"
                yield f"data: {json.dumps({'tool_message': formatted_output})}\n\n"
                full_response_content += formatted_output + "\n"

    # 스트리밍이 끝나면, 완성된 AI 응답 전체를 저장
    if full_response_content:
        if session_id not in chat_sessions:
            chat_sessions[session_id] = []
        chat_sessions[session_id].append({"role": "ai", "content": full_response_content})