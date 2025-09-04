from sqlalchemy.orm import sessionmaker
from datetime import datetime, timezone
from passlib.context import CryptContext

from .database import User,engine  # get_db 대신 직접 세션 생성

# bcrypt 해시 설정 (FastAPI 인증 로직과 동일하게 맞춤)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SessionLocal = sessionmaker(bind=engine)
session = SessionLocal()

# 테스트 계정용 평문 비밀번호
admin_plain_password = "1234"
employee_plain_password = "1234"

# bcrypt 해싱 (여기서 반드시 같은 방식으로 암호화해야 로그인 가능)
admin_hashed_password = pwd_context.hash(admin_plain_password)
employee_hashed_password = pwd_context.hash(employee_plain_password)

# 관리자 계정
admin_user = User(
    unique_auth_number="ADM20250904",
    username="테스트관리자",
    hashed_password=admin_hashed_password,
    email="admin@example.com",
    is_manager=True,
    dept="경영지원팀",
    position="팀장",
    must_change_password=True,
    created_at=datetime.now(timezone.utc),
)

# 일반 사원 계정
employee_user = User(
    unique_auth_number="EMP20250904",
    username="테스트사원",
    hashed_password=employee_hashed_password,
    email="employee@example.com",
    is_manager=False,
    dept="개발팀",
    position="사원",
    must_change_password=True,
    created_at=datetime.now(timezone.utc),
)

# DB에 저장
session.add_all([admin_user, employee_user])
session.commit()

print("✅ 테스트 계정(관리자/사원) 생성 완료")
print(f"관리자 로그인 → 사번: AUTH001 / 비밀번호: {admin_plain_password}")
print(f"사원 로그인 → 사번: AUTH002 / 비밀번호: {employee_plain_password}")
