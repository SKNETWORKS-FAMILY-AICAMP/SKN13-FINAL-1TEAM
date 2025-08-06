from fastapi import FastAPI
from pydantic import BaseModel
from typing import Any, Optional, Dict, List
from uuid import uuid4
from chat_agent import agent, generate_config
from fastapi.middleware.cors import CORSMiddleware # 이 줄을 추가

app = FastAPI()

# CORS 미들웨어 추가 (이 부분을 추가)
origins = [
    "http://localhost",
    "http://localhost:5173", # 프론트엔드 개발 서버 주소
    # 여기에 필요한 다른 오리진을 추가할 수 있다.
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 인메모리 스토리지 (임시)
# 실제 애플리케이션에서는 데이터베이스를 사용해야 함
chat_sessions: Dict[str, List[Dict[str, str]]] = {}

class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    prompt: str

class ChatResponse(BaseModel):
    response: Any
    session_id: str

class MessageSaveRequest(BaseModel):
    session_id: str
    role: str
    content: str

@app.post("/chat/generate", response_model=ChatResponse)
async def chat(request: ChatRequest):
    session_id = request.session_id if request.session_id else str(uuid4())
    config = generate_config(session_id)
    chat_agent = agent()
    
    input_message = {"messages": [("user", request.prompt)]}
    
    response_generator = chat_agent.astream(input_message, config=config)
    
    full_response = ""
    async for response_chunk in response_generator:
        if "messages" in response_chunk:
            full_response += response_chunk["messages"][-1].content

    # 새 메시지를 세션에 추가 (사용자 메시지)
    if session_id not in chat_sessions:
        chat_sessions[session_id] = []
    chat_sessions[session_id].append({"role": "user", "content": request.prompt})
    chat_sessions[session_id].append({"role": "assistant", "content": full_response})

    return ChatResponse(response=full_response, session_id=session_id)

@app.post("/chat/save")
async def save_message(request: MessageSaveRequest):
    if request.session_id not in chat_sessions:
        chat_sessions[request.session_id] = []
    chat_sessions[request.session_id].append({"role": request.role, "content": request.content})
    return {"status": "success"}

@app.get("/chat/sessions")
async def get_chat_sessions():
    # 세션 ID와 첫 번째 메시지 또는 기본 제목을 반환
    sessions_list = []
    for session_id, messages in chat_sessions.items():
        title = "새로운 대화"
        if messages:
            # 첫 번째 사용자 메시지를 제목으로 사용
            first_user_message = next((msg["content"] for msg in messages if msg["role"] == "user"), None)
            if first_user_message:
                title = first_user_message[:50] + "..." if len(first_user_message) > 50 else first_user_message
        sessions_list.append({"id": session_id, "title": title})
    return {"sessions": sessions_list}

@app.get("/chat/messages/{session_id}")
async def get_messages(session_id: str):
    messages = chat_sessions.get(session_id, [])
    return {"messages": messages}

@app.get("/")
def read_root():
    return {"Hello": "World"}