import asyncio
import math
import random
import statistics
import time
from dataclasses import dataclass
from typing import Any, Dict, List

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from config import settings
import fakeredis
from library.db import get_db
from library.redis import get_redis
from library.schema import Base
from main import app

# 테스트용 PostgreSQL 데이터베이스 및 Redis 설정
DB_URL = (
    "postgresql+asyncpg://"
    + settings.db_user
    + ":"
    + settings.db_password
    + "@"
    + settings.db_host_test
    + ":"
    + settings.db_port
    + "/"
    + settings.db_name
)

engine = create_async_engine(DB_URL, poolclass=NullPool)
TestingSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

fake_redis_client = fakeredis.aioredis.FakeRedis()


async def override_get_db():
    """테스트용 비동기 DB 세션 의존성 주입"""
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        await db.rollback()
        await db.close()


async def override_get_redis():
    """테스트용 가짜 Redis 클라이언트 의존성 주입"""
    yield fake_redis_client


# 애플리케이션 의존성을 테스트용으로 변경
app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_redis] = override_get_redis


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function", autouse=True)
async def db_session():
    """테스트 실행 전/후 DB 테이블 및 Redis 초기화"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await fake_redis_client.flushall()


@dataclass
class RequestResult:
    """개별 동시 요청 응답 결과 데이터 구조"""

    user_id: int
    location_name: str
    lat: float
    lng: float
    zoom: int
    status_code: int
    response_time_ms: float
    success: bool
    error_msg: str = ""


# 다양한 위치 (한국 주요 도심 지역 중심 좌표)
TEST_LOCATIONS = [
    {"name": "서울 강남역", "lat": 37.4979, "lng": 127.0276},
    {"name": "서울 홍대입구", "lat": 37.5563, "lng": 126.9226},
    {"name": "서울 여의도", "lat": 37.5215, "lng": 126.9243},
    {"name": "서울 명동", "lat": 37.5636, "lng": 126.9837},
    {"name": "경기 판교역", "lat": 37.3947, "lng": 127.1112},
    {"name": "부산 해운대", "lat": 35.1587, "lng": 129.1604},
    {"name": "부산 서면", "lat": 35.1578, "lng": 129.0592},
    {"name": "인천 송도", "lat": 37.3828, "lng": 126.6568},
    {"name": "대구 동성로", "lat": 35.8694, "lng": 128.5944},
    {"name": "대전 둔산동", "lat": 36.3504, "lng": 127.3845},
]


def make_bbox(lat: float, lng: float, delta: float = 0.01) -> Dict[str, Any]:
    """기준 좌표로부터 Bounding Box (SW, NE) 생성"""
    return {
        "SW": {"lat": round(lat - delta, 6), "long": round(lng - delta, 6)},
        "NE": {"lat": round(lat + delta, 6), "long": round(lng + delta, 6)},
    }


async def register_and_login(async_client: AsyncClient, user_idx: int) -> str:
    """테스트 유저 회원가입 및 토큰 발급"""
    email = f"concurrent_user_{user_idx}_{random.randint(1000, 9999)}@example.com"
    pwd = "Password123!"
    join_data = {
        "email": email,
        "pwd": pwd,
        "nickname": f"user_{user_idx}",
        "birthdate": "2000-01-01",
    }
    join_res = await async_client.post("/user/join", json=join_data)
    assert join_res.status_code == 200, f"회원가입 실패: {join_res.text}"

    login_res = await async_client.post(
        "/auth/token",
        data={"username": email, "password": pwd},
    )
    assert login_res.status_code == 200, f"로그인 실패: {login_res.text}"
    token = login_res.json().get("access_token")
    return token


async def request_feed_at_location(
    async_client: AsyncClient,
    user_id: int,
    token: str,
    location_info: Dict[str, Any],
    zoom: int,
) -> RequestResult:
    """특정 위치 및 줌 레벨(zoom)의 피드 목록을 요청하고 응답 시간을 측정"""
    headers = {"Authorization": f"Bearer {token}"}
    bbox = make_bbox(location_info["lat"], location_info["lng"])

    start_time = time.perf_counter()
    try:
        response = await async_client.post(
            "/feed/get/location", headers=headers, json=bbox, params={"zoom": zoom}
        )
        elapsed_ms = (time.perf_counter() - start_time) * 1000

        is_success = response.status_code == 200
        error_detail = "" if is_success else response.text

        return RequestResult(
            user_id=user_id,
            location_name=location_info["name"],
            lat=location_info["lat"],
            lng=location_info["lng"],
            zoom=zoom,
            status_code=response.status_code,
            response_time_ms=elapsed_ms,
            success=is_success,
            error_msg=error_detail,
        )
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        return RequestResult(
            user_id=user_id,
            location_name=location_info["name"],
            lat=location_info["lat"],
            lng=location_info["lng"],
            zoom=zoom,
            status_code=500,
            response_time_ms=elapsed_ms,
            success=False,
            error_msg=str(exc),
        )


async def mock_get_hjd_from_bbox(db, bbox):
    return ["1111051500"]


async def mock_get_feeds_by_codes(db, redis, hjds):
    from sqlalchemy import select
    from library.schema import Feed

    stmt = select(Feed)
    result = await db.scalars(stmt)
    return [feed.as_dict() for feed in result.all()]


async def mock_get_feeds_count_by_codes(db, redis, hjds, zoom):
    return [(1, (127.02, 37.49))]


@pytest.mark.asyncio
async def test_concurrent_multi_user_location_feed_requests():
    """
    [동시성 피드 요청 테스트]
    - N명의 사용자가 동시에 접속
    - 서로 다른 위치(Bounding Box)와 줌 레벨(Zoom Level)의 피드를 동시에 비동기 요청
    - 각 요청별 응답시간 (Latency) 측정 및 통계 분석 (Min, Max, Mean, Median, P95, P99)
    """
    NUM_USERS = 10  # 동시 사용자 수
    transport = ASGITransport(app=app)

    # 다양한 줌 레벨 테스트 (zoom < 16: 피드 개수 요약, zoom >= 16: 개별 피드 리스트)
    ZOOM_LEVELS = [12, 14, 15, 16, 17, 18]

    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        # 1. 동시 사용자 회원가입 및 토큰 준비
        setup_tasks = [
            register_and_login(async_client, i) for i in range(1, NUM_USERS + 1)
        ]
        tokens = await asyncio.gather(*setup_tasks)

        # 2. 각 사용자별로 서로 다른 위치 및 줌 레벨 할당
        user_requests = []
        for i, token in enumerate(tokens):
            loc_info = TEST_LOCATIONS[i % len(TEST_LOCATIONS)]
            zoom = ZOOM_LEVELS[i % len(ZOOM_LEVELS)]
            user_requests.append(
                request_feed_at_location(
                    async_client=async_client,
                    user_id=i + 1,
                    token=token,
                    location_info=loc_info,
                    zoom=zoom,
                )
            )

        # 3. 동시에 피드 요청 전송 및 응답시간 측정
        total_start = time.perf_counter()
        results: List[RequestResult] = await asyncio.gather(*user_requests)
        total_elapsed_sec = time.perf_counter() - total_start

        # 4. 결과 분석 및 출력
        latencies = [r.response_time_ms for r in results]
        success_count = sum(1 for r in results if r.success)
        fail_count = len(results) - success_count
        sorted_latencies = sorted(latencies)

        mean_lat = statistics.mean(latencies)
        median_lat = statistics.median(latencies)
        min_lat = min(latencies)
        max_lat = max(latencies)

        def percentile(data: List[float], pct: float) -> float:
            k = (len(data) - 1) * (pct / 100.0)
            f = math.floor(k)
            c = math.ceil(k)
            if f == c:
                return data[int(k)]
            d0 = data[int(f)] * (c - k)
            d1 = data[int(c)] * (k - f)
            return d0 + d1

        p95_lat = percentile(sorted_latencies, 95)
        p99_lat = percentile(sorted_latencies, 99)

        # 리포트 출력
        print(
            "\n=========================================================================="
        )
        print(
            "         동시 사용자 위치 및 줌 레벨 기반 피드 요청 테스트 결과          "
        )
        print(
            "=========================================================================="
        )
        print(f"총 동시 요청 수    : {NUM_USERS} 건")
        print(f"전체 테스트 소요시간: {total_elapsed_sec:.3f} 초")
        print(f"성공 건수         : {success_count} 건")
        print(f"실패 건수         : {fail_count} 건")
        print(f"성공률            : {(success_count / NUM_USERS) * 100:.1f}%")
        print(
            "--------------------------------------------------------------------------"
        )
        print("응답시간 통계 (Response Time Statistics):")
        print(f"  - 최소 응답시간 (Min)   : {min_lat:.2f} ms")
        print(f"  - 평균 응답시간 (Mean)  : {mean_lat:.2f} ms")
        print(f"  - 중간 응답시간 (Median): {median_lat:.2f} ms")
        print(f"  - 95%tile (P95)        : {p95_lat:.2f} ms")
        print(f"  - 99%tile (P99)        : {p99_lat:.2f} ms")
        print(f"  - 최대 응답시간 (Max)   : {max_lat:.2f} ms")
        print(
            "--------------------------------------------------------------------------"
        )
        print("개별 요청 상세 내역 (Per-Request Breakdown):")
        print(
            f"{'User ID':<8} | {'요청 위치':<12} | {'위도, 경도':<22} | {'Zoom':<6} | {'상태':<6} | {'응답시간(ms)':<12}"
        )
        print("-" * 80)
        for r in results:
            coords = f"{r.lat:.4f}, {r.lng:.4f}"
            status_str = "OK" if r.success else f"ERR({r.status_code})"
            print(
                f"{r.user_id:<8} | {r.location_name:<12} | {coords:<22} | {r.zoom:<6} | {status_str:<6} | {r.response_time_ms:10.2f} ms"
            )
        print(
            "==========================================================================\n"
        )

        # 5. 검증 (Assertions)
        assert fail_count == 0, f"실패한 요청이 존재합니다 ({fail_count}건 실패)"
        assert success_count == NUM_USERS, "모든 요청이 성공해야 합니다."
        assert (
            mean_lat < 2000.0
        ), f"평균 응답시간이 SLA 기준을 초과했습니다: {mean_lat:.2f}ms"
