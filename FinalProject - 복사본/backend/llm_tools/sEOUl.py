import os
from langchain_core.tools import tool
import requests
import xml.etree.ElementTree as ET
import time
SEOUL_OPEN_API_KEY = os.getenv("SEOUL_OPEN_API_KEY")

@tool
def get_data_seoul(AREA_NM: str, category: str = "all"):
    """
    서울 실시간 도시데이터를 요청하고, 선택한 카테고리에 따라 필터링된 데이터를 반환합니다.

    Args:
        AREA_NM (str): 조회할 장소명
            - 사용자 입력을 다음 조회 가능한 장소 중 하나로 자동 매칭해야 합니다.
            - 매칭 규칙:
              1. 사용자가 "홍대", "홍대입구역", "홍대역" 등으로 입력 시 → "홍대입구역(2호선)" 사용
              2. 사용자가 "강남", "강남역" 등으로 입력 시 → "강남역" 사용
              3. 사용자가 "명동" 등으로 입력 시 → "명동 관광특구" 사용
              4. 사용자가 "이태원" 등으로 입력 시 → "이태원 관광특구" 또는 "이태원역" 중 문맥에 맞는 것 선택
              5. 완전히 일치하지 않는 경우, 가장 유사한 장소를 자동 선택하거나 사용자에게 옵션 제시
            
            [조회 가능한 장소 - 정확한 매칭 필요]
            관광특구: 강남 MICE 관광특구, 동대문 관광특구, 명동 관광특구, 이태원 관광특구, 잠실 관광특구, 종로·청계 관광특구, 홍대 관광특구
            문화재: 경복궁, 광화문·덕수궁, 보신각, 서울 암사동 유적, 창덕궁·종묘
            지하철역: 가산디지털단지역, 강남역, 건대입구역, 고덕역, 고속터미널역, 교대역, 구로디지털단지역, 구로역, 군자역, 대림역, 동대문역, 뚝섬역, 미아사거리역, 발산역, 사당역, 삼각지역, 서울대입구역, 서울식물원·마곡나루역, 서울역, 선릉역, 성신여대입구역, 수유역, 신논현역·논현역, 신도림역, 신림역, 신촌·이대역, 양재역, 역삼역, 연신내역, 오목교역·목동운동장, 왕십리역, 용산역, 이태원역, 장지역, 장한평역, 천호역, 총신대입구(이수)역, 충정로역, 합정역, 혜화역, 홍대입구역(2호선), 회기역, 신정네거리역, 잠실새내역, 잠실역
            기타 지역: 가락시장, 가로수길, 광장(전통)시장, 김포공항, 노량진, 덕수궁길·정동길, 북촌한옥마을, 서촌, 성수카페거리, 쌍문역, 압구정로데오거리, 여의도, 연남동, 영등포 타임스퀘어, 용리단길, 이태원 앤틱가구거리, 인사동, 창동 신경제 중심지, 청담동 명품거리, 청량리 제기동 일대 전통시장, 해방촌·경리단길, 북창동 먹자골목, 남대문시장, 익선동, 잠실롯데타워 일대, 송리단길·호수단길, 신촌 스타광장
            공원/시설: DDP(동대문디자인플라자), DMC(디지털미디어시티), 강서한강공원, 고척돔, 광나루한강공원, 광화문광장, 국립중앙박물관·용산가족공원, 난지한강공원, 남산공원, 노들섬, 뚝섬한강공원, 망원한강공원, 반포한강공원, 북서울꿈의숲, 서리풀공원·몽마르뜨공원, 서울광장, 서울대공원, 서울숲공원, 아차산, 양화한강공원, 어린이대공원, 여의도한강공원, 월드컵공원, 응봉산, 이촌한강공원, 잠실종합운동장, 잠실한강공원, 잠원한강공원, 청계산, 청와대, 보라매공원, 서대문독립공원, 안양천, 여의서로, 올림픽공원, 홍제폭포

        category (str): 필터링할 카테고리 
            - 가능한 값: '도로', '날씨', '대중교통', '인구', '주차장', '따릉이', '전기차', '문화행사', '상권', '소비자'

    Returns:
        str: 필터링된 XML 태그와 값 목록
        
    Note: 
        - 사용자가 "홍대입구역 대중교통 상황"이라고 입력하면 AREA_NM을 "홍대입구역(2호선)"으로 자동 변환
        - 사용자가 "강남역 주차장"이라고 입력하면 AREA_NM을 "강남역"으로 사용
        - 애매한 경우에는 가장 적절한 매칭을 선택하되, 확실하지 않으면 사용자에게 옵션 제시
    """
    url = f"http://openapi.seoul.go.kr:8088/{SEOUL_OPEN_API_KEY}/xml/citydata/1/5/{AREA_NM}"
    print(f"get_data_seoul tool called: {AREA_NM} / category: {category}")
    time.sleep(1)

    response = requests.get(url, timeout=5)
    root = ET.fromstring(response.content)

    category_keywords = {
        "공통": ["RESULT", "list_total_count"],
        "인구": ["PPLTN", "CONGEST"],
        "도로": ["ROAD_"],
        "주차장": ["PRK_"],
        "대중교통": ["SUB_","BUS_"],
        "따릉이": ["SBIKE_"],
        "날씨": ["TEMP", "WIND", "WEATHER", "HUMIDITY", "SUN", "PM"],
        "전기차": ["CHARGER_", "STAT_"],
        "문화행사": ["EVENT_", "CULTURALEVENTINFO"],
        "상권": ["CMRCL_", "PAYMENT"],
        "소비자": ["RATE"]
    }

    selected_keywords = category_keywords.get(category, [])
    
    def is_relevant(tag):
        if category == "all":
            return True
        return any(keyword in tag for keyword in selected_keywords)

    result = []
    for elem in root.iter():
        tag = elem.tag
        text = elem.text.strip() if elem.text and elem.text.strip() else "null"
        if is_relevant(tag):
            result.append(f"{tag}\t{text}")

    return '\n'.join(result) if result else f"No data found for category '{category}'"
