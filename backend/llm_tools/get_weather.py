import os
import math
import time
import requests
from dotenv import load_dotenv
from typing import Optional
from datetime import datetime
from collections import defaultdict

from langchain_core.tools import tool

# ✅ 환경 변수 로드
load_dotenv()
KAKAO_API_KEY = os.getenv("KAKAO_API_KEY")
WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")

# ✅ LLM 툴 정의
@tool
def get_weather_by_location_and_date(location: str, date: Optional[str] = None) -> str:
    """
    [Instruction]
    지역과 날짜를 기반으로 날씨 정보를 조회하는 LLM Tool입니다.

    이 툴은 Kakao 지도 API를 통해 지역명을 위경도로 변환하고,  
    기상청 API를 호출하여 해당 좌표에 대한 시간대별 예보 데이터를 반환합니다.  

    사용자가 "내일 부산 날씨 어때?" 또는 "서울 이번 주말 비 와?" 같은 질문을 할 때 호출하세요.

    [Args]
    입력은 아래 두 파라미터로 이루어져 있습니다:

    - location: 사용자가 언급한 지역명입니다.  
    예: "서울", "부산광역시", "제주도 제주시", "대구 수성구" 등

    - date (optional): 조회할 날짜로, "YYYY-MM-DD" 형식을 사용합니다.  
    생략 시, 오늘 날짜 기준으로 예보를 제공합니다.

    [Output]
    아래 형식의 문자열로 시간대별 하늘 상태(SKY) 및 강수 형태(PTY)를 요약합니다:

    📍 [2024-06-27] 서울 날씨 요약:
    - 0600 | 하늘: 맑음 | 강수: 없음
    - 0900 | 하늘: 흐림 | 강수: 비
    - 1200 | 하늘: 구름많음 | 강수: 없음

    ※ 하늘 상태(SKY): 맑음 / 구름많음 / 흐림  
    ※ 강수 형태(PTY): 없음 / 비 / 비/눈 / 눈 / 빗방울 / 눈날림
    """

    # 1. 날짜 파싱 및 보정
    try:
        base_date = datetime.now().strftime('%Y%m%d')
        requested_date = datetime.strptime(date,'%Y-%m-%d').strftime('%Y%m%d') if date else base_date
    except ValueError:
        print("❌ 날짜 형식 오류. 'YYYY-MM-DD' 형식으로 입력해주세요.")
        return "❌ 날짜 형식 오류. 'YYYY-MM-DD' 형식으로 입력해주세요."
    
    print(f"get_weather tool called: {requested_date}, {location}")
    
    # 2. 좌표 얻기
    lat, lon = get_latlon_from_kakao(location)
    if lat is None or lon is None:
        print(f"❌ 지역명 '{location}'을(를) 찾을 수 없습니다. 정확한 도시명으로 입력해주세요.")
        return f"❌ 지역명 '{location}'을(를) 찾을 수 없습니다. 정확한 도시명으로 입력해주세요."

    # 3. 격자 좌표 변환
    nx, ny = latlon_to_xy(lat, lon)

    # 4. 날씨 요약 정보 반환
    return get_weather_summary_by_date(nx, ny, base_date, requested_date)


# ✅ 1. Kakao API: 주소 → 위경도
def get_latlon_from_kakao(address: str):
    url = "https://dapi.kakao.com/v2/local/search/address.json"
    headers = {"Authorization": f"KakaoAK {KAKAO_API_KEY}"}
    params = {"query": address}

    try:
        response = requests.get(url, headers=headers, params=params, timeout=5)
        response.raise_for_status()
        data = response.json()
        documents = data.get("documents", [])
        if not documents:
            return None, None
        y = float(documents[0]["y"])  # 위도
        x = float(documents[0]["x"])  # 경도
        return y, x
    except Exception:
        return None, None


# ✅ 2. 위경도 → 기상청 격자 좌표
def latlon_to_xy(lat: float, lon: float):
    RE, GRID = 6371.00877, 5.0
    SLAT1, SLAT2 = 30.0, 60.0
    OLON, OLAT = 126.0, 38.0
    XO, YO = 43, 136

    DEGRAD = math.pi / 180.0
    re = RE / GRID
    slat1, slat2 = SLAT1 * DEGRAD, SLAT2 * DEGRAD
    olon, olat = OLON * DEGRAD, OLAT * DEGRAD

    sn = math.log(math.cos(slat1) / math.cos(slat2)) / \
         math.log(math.tan(math.pi * 0.25 + slat2 * 0.5) /
                  math.tan(math.pi * 0.25 + slat1 * 0.5))
    sf = (math.tan(math.pi * 0.25 + slat1 * 0.5) ** sn *
          math.cos(slat1)) / sn
    ro = re * sf / (math.tan(math.pi * 0.25 + olat * 0.5) ** sn)

    ra = re * sf / (math.tan(math.pi * 0.25 + lat * DEGRAD * 0.5) ** sn)
    theta = lon * DEGRAD - olon
    theta = (theta + math.pi) % (2 * math.pi) - math.pi  # normalize
    theta *= sn

    x = int(ra * math.sin(theta) + XO + 0.5)
    y = int(ro - ra * math.cos(theta) + YO + 0.5)
    return x, y


# ✅ 3. 날씨 요약
def get_weather_summary_by_date(nx: int, ny: int, base_date: str, fcst_filter_date: str) -> str:
    url = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"
    params = {
        "serviceKey": WEATHER_API_KEY,
        "pageNo": "1",
        "numOfRows": "2000",
        "dataType": "JSON",
        "base_date": base_date,
        "base_time": "0500",
        "nx": nx,
        "ny": ny,
    }

    try:
        response = requests.get(url, params=params, timeout=5)
        response.raise_for_status()
        items = response.json()["response"]["body"]["items"]["item"]
    except Exception:
        print("❌ 기상청 날씨 데이터를 불러오는 데 실패했습니다.")
        return "❌ 기상청 날씨 데이터를 불러오는 데 실패했습니다."

    sky_map, pty_map = defaultdict(str), defaultdict(str)

    for item in items:
        if item["fcstDate"] != fcst_filter_date:
            continue
    
        time_key = f"{item['fcstDate']} {item['fcstTime']}"
        if item["category"] == "SKY":
            sky_map[time_key] = translate_category("SKY", item["fcstValue"])
        elif item["category"] == "PTY":
            pty_map[time_key] = translate_category("PTY", item["fcstValue"])

    result_lines = [f"📅 [{base_date}] {nx},{ny} 날씨 예보 요약:"]
    for times in sorted(sky_map.keys()):
        hour = times[-4:-2]
        sky = sky_map[times]
        pty = pty_map.get(times, "없음")
        result_lines.append(f"  - {hour}시: 하늘 '{sky}', 강수 '{pty}'")
    return "\n".join(result_lines)


# ✅ 4. 코드 해석기
def translate_category(category: str, value: str):
    category_map = {
        "SKY": {"1": "맑음", "3": "구름많음", "4": "흐림"},
        "PTY": {
            "0": "없음",
            "1": "비",
            "2": "비/눈",
            "3": "눈",
            "5": "빗방울",
            "6": "눈날림"
        }
    }
    return category_map.get(category, {}).get(value, value)
