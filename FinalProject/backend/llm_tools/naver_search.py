import os
import json
import time
import asyncio
from typing import Optional, Type
from dotenv import load_dotenv

from langchain_core.tools import BaseTool
from pydantic import BaseModel, Field

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# 환경 변수 로드
load_dotenv()
SMITHERY_API_KEY = os.getenv("SMITHERY_API_KEY")
class NaverSearchInput(BaseModel):
    """네이버 검색 입력 스키마"""
    query: str = Field(description="검색어")
    tool_name: str = Field(default="search_webkr",description="사용할 검색 MCP 도구")
    display: Optional[int] = Field(default=10, description="한 번에 가져올 결과 수")
    start: Optional[int] = Field(default=1, description="검색 시작 위치")
    sort: Optional[str] = Field(default="sim", description="정렬 방식 (sim: 유사도순, date: 날짜순)")

class NaverSearchTool(BaseTool):
    """네이버 검색 MCP 도구"""
    name: str = "naver_search"
    description: str = """
# 네이버 검색 MCP 도구 설명서
네이버 검색 MCP 도구에는 5가지 도구가 있습니다.
각 도구는 공통적인 5개의 인자를 가집니다.

## search_webkr (네이버 웹 문서 검색)
```
[Instruction]
네이버 웹에서 주제를 검색합니다.
범용성이 가장 높은 웹 검색도구입니다.

[Args]
- query: 검색할 키워드 (예: "근처 맛집", "근처 카페", "근처 숙소")
- tool_name: "search_webkr" (필수)
- sort: 정렬 방식 ("sim": 유사도순, "date": 날짜순)
- display: 가져올 결과 수 (기본 10개)
- start: 검색 시작 위치 (기본 1)

[Returns]
주제에 대한 다양한 정보를 반환합니다.
하지만 낮은 확률로 잘못된 정보일 수도 있습니다.
```

## search_news (네이버 뉴스 검색)
```
[Instruction]
네이버 뉴스에서 최신 뉴스 기사를 검색합니다.
실시간 뉴스나 특정 주제의 최신 정보가 필요할 때 호출하세요.

[Args]
- query: 검색할 키워드 (예: "AI 기술", "경제 동향", "코로나19")
- tool_name: "search_news" (필수)
- sort: 정렬 방식 ("sim": 유사도순, "date": 날짜순)
- display: 가져올 결과 수 (기본 10개)
- start: 검색 시작 위치 (기본 1)

[Returns]
뉴스 제목, 내용 요약, 발행일시, 언론사 등의 정보를 반환합니다.
실제 존재하는 뉴스 기사만 반환되므로 할루시네이션 없이 신뢰할 수 있습니다.
```

## search_cafearticle (네이버 카페글 검색)
```
[Instruction]
네이버 카페에서 사용자들이 작성한 실제 카페글을 검색합니다.
커뮤니티 의견이나 실사용 후기가 필요할 때 호출하세요.

[Args]
- query: 검색할 키워드 (예: "맛집 추천", "여행 후기", "제품 리뷰")
- tool_name: "search_cafearticle" (필수)
- sort: 정렬 방식 ("sim": 유사도순, "date": 날짜순)
- display: 가져올 결과 수 (기본 10개)
- start: 검색 시작 위치 (기본 1)

[Returns]
카페글 제목, 내용 일부, 작성일, 카페명 등의 정보를 반환합니다.
실제 존재하는 카페글만 반환되므로 신뢰성이 높습니다.
```

## search_blog (네이버 블로그 검색)
```
[Instruction]
네이버 블로그에서 개인 블로거들이 작성한 실제 포스팅을 검색합니다.
상세한 체험기나 개인적인 견해가 필요할 때 호출하세요.

[Args]
- query: 검색할 키워드 (예: "맛집 방문기", "여행 일정", "상품 사용후기")
- tool_name: "search_blog" (필수)
- sort: 정렬 방식 ("sim": 유사도순, "date": 날짜순)
- display: 가져올 결과 수 (기본 10개)
- start: 검색 시작 위치 (기본 1)

[Returns]
블로그 포스팅 제목, 내용 요약, 작성일, 블로거명 등의 정보를 반환합니다.
실제 존재하는 블로그 글만 반환되므로 허위 정보 없이 안전합니다.
```

## search_kin (네이버 지식iN 검색)
```
[Instruction]
네이버 지식iN에서 질문과 답변을 검색합니다.
구체적인 문제 해결 방법이나 전문적인 답변이 필요할 때 호출하세요.

[Args]
- query: 검색할 키워드 (예: "법률 문의", "건강 상담", "기술 질문")
- tool_name: "search_kin" (필수)
- sort: 정렬 방식 ("sim": 유사도순, "date": 날짜순)
- display: 가져올 결과 수 (기본 10개)
- start: 검색 시작 위치 (기본 1)

[Returns]
질문 제목, 답변 내용, 작성일, 분야 등의 정보를 반환합니다.
실제 사용자들의 질문과 답변만 반환되므로 실용적이고 신뢰할 수 있습니다.
```

## 중요 사항

**⚠️ 할루시네이션 방지**
- 모든 도구는 네이버의 실제 데이터만 반환합니다
- 존재하지 않는 정보를 생성하지 않습니다
- 검색 결과가 없으면 "검색 결과 없음"으로 명확히 표시됩니다

**📌 사용 가능한 도구**
이 MCP에서는 위의 5개 도구만 사용 가능합니다:
- search_webkr (웹)
- search_news (뉴스)
- search_cafearticle (카페글)
- search_blog (블로그)
- search_kin (지식iN)

기타 네이버 검색 도구들(쇼핑, 이미지, 백과사전 등)은 이 MCP에서 지원하지 않습니다.
"""
    args_schema: Type[BaseModel] = NaverSearchInput
    
    class Config:
        arbitrary_types_allowed = True
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # MCP 서버 파라미터를 private 속성으로 설정
        object.__setattr__(self,'_server_params',self._create_server_params())
    
    def _create_server_params(self) -> StdioServerParameters:
        """MCP 서버 파라미터 생성"""
        return StdioServerParameters(
            type = "stdio",
            command = "npx",
            args = [
                "-y",
                "@smithery/cli@latest",
                "run",
                "@isnow890/naver-search-mcp",
                "--key",
                SMITHERY_API_KEY,
                "--profile",
                "junior-wren-VXm7o3"
            ]
        )
    
    @property
    def server_params(self) -> StdioServerParameters:
        """서버 파라미터 접근"""
        return self._server_params
    
    def _run(self, query: str, tool_name: str = "search_webkr", display: int = 10, start: int = 1, sort: str = "sim") -> str:
        """동기 실행 (비동기 함수를 래핑)"""
        return asyncio.run(self._arun(query, tool_name, display, start, sort))
    
    async def _arun(self, query: str, tool_name: str = "search_webkr", display: int = 10, start: int = 1, sort: str = "sim") -> str:
        """비동기 네이버 검색 실행"""
        try:
            async with stdio_client(self.server_params) as (read, write):
                async with ClientSession(read, write) as session:
                    # MCP 서버 초기화
                    await session.initialize()
                    
                    # 검색 실행
                    print(f"naver_search tool called: {tool_name}, {query}")
                    result = await session.call_tool(
                        tool_name,
                        {
                            "query": query,
                            "display": display,
                            "start": start,
                            "sort": sort
                        }
                    )
                    # 결과 포맷팅
                    if result.content:
                        search_results = []
                        for item in result.content:
                            if hasattr(item, 'text'):
                                data = json.loads(item.text)
                                for article in data.get('items', []):
                                    search_results.append({
                                        'title': article.get('title', '').replace('<b>', '').replace('</b>', ''),
                                        'description': article.get('description', '').replace('<b>', '').replace('</b>', ''),
                                        'link': article.get('link', ''),
                                        'pubDate': article.get('pubDate', '')
                                    })
                        
                        return json.dumps(search_results, ensure_ascii=False, indent=2)
                    else:
                        return "검색 결과를 찾을 수 없습니다."
                        
        except Exception as e:
            return f"검색 중 오류가 발생했습니다: {str(e)}"