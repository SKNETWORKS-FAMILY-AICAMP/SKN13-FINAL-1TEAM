# database/models/document.py
"""
문서 관련 모델들
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import relationship
from ..base import Base, now_utc


class Document(Base):
    """
    사용자 문서를 관리하는 테이블
    
    업로드된 문서 파일들의 메타데이터를 저장하며, 원본 파일과
    마크다운 변환 파일의 경로를 관리합니다.
    """
    __tablename__ = "documents"
    
    # ✅ 1. 기본키
    id = Column(String(36), primary_key=True, comment="문서 고유 ID (UUID)")
    
    # ✅ 2. 외래키 
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True, comment="문서 소유자")
    
    # ✅ 3. 파일 정보 컬럼
    original_filename = Column(String(255), nullable=False, comment="원본 파일명")
    file_type = Column(String(20), nullable=False, index=True, comment="파일 형식: pdf/docx/hwp/txt/md")
    original_file_path = Column(String(512), nullable=False, comment="원본 파일 저장경로")
    markdown_file_path = Column(String(512), nullable=False, comment="마크다운 변환 파일경로")
    
    # ✅ 4. 벡터DB 인덱싱 정보 컬럼
    indexed_at = Column(DateTime, nullable=True, comment="벡터DB 인덱싱 완료시간")
    indexed_hash = Column(String(64), nullable=True, comment="파일 내용 해시값 (변경감지)")
    vector_namespace = Column(String(100), nullable=True, comment="벡터DB 네임스페이스")
    
    # ✅ 5. 시간 컬럼
    created_at = Column(DateTime, nullable=False, server_default=func.now(), index=True, comment="문서 업로드시간")
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now(), comment="문서 수정시간")
    
    # 관계 정의
    owner = relationship("User", back_populates="documents", passive_deletes=True)  # 문서 소유자
    
    # 인덱스
    __table_args__ = (
        Index("idx_documents_owner_created", "owner_id", "created_at"),    # 소유자별 생성 시간 인덱스
    )