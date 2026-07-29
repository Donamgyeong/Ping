import asyncio
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool
from main import app
from library.db import get_db
from library.schema import Base
from config import settings
from library.redis import get_redis
import fakeredis
from unittest.mock import patch, AsyncMock

# 테스트용 PostgreSQL 데이터베이스 설정
DB_URL = (
    "postgresql+asyncpg://"
    + settings.db_user
    + ":"
    + settings.db_password
    + "@"
    + settings.db_host_test  # 테스트 DB 호스트
    + ":"
    + settings.db_port
    + "/"
    + settings.db_name
)

engine = create_async_engine(DB_URL, poolclass=NullPool)
TestingSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# 가짜 Redis 클라이언트 설정
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


client = TestClient(app)


@pytest_asyncio.fixture(scope="function", autouse=True)
async def db_session():
    """
    각 테스트 함수가 실행되기 전에 테이블을 생성하고,
    테스트가 끝나면 테이블을 삭제하여 테스트 격리성을 보장합니다.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await fake_redis_client.flushall()


@pytest.fixture(scope="module")
def test_user_data():
    return {
        "email": "testfeed@example.com",
        "pwd": "password123",
        "nickname": "testfeeduser",
        "birthdate": "2000-01-01",
    }


@pytest.fixture(scope="module")
def other_user_data():
    return {
        "email": "otherfeed@example.com",
        "pwd": "password123",
        "nickname": "otherfeeduser",
        "birthdate": "2000-01-02",
    }


@pytest_asyncio.fixture(scope="function")
async def auth_headers(test_user_data):
    """Helper fixture to create a user and get auth headers."""
    client.post("/user/join", json=test_user_data)
    login_response = client.post(
        "/auth/token",
        data={"username": test_user_data["email"], "password": test_user_data["pwd"]},
    )
    token = login_response.json().get("access_token")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def feed_payload():
    return {
        "content": "This is a test feed.",
        "location": {"long": 127.0637125537546, "lat": 37.6602722815154},
        "images": [],  # 이미지 파일 ID 리스트 (테스트에서는 비워둠)
        "private": False,
    }


@pytest.mark.asyncio
async def test_create_and_get_feed(db_session, test_user_data, feed_payload):
    """
    POST /feed/new
    GET /feed/get/{fid}
    - 피드 생성 및 조회 성공 테스트
    """
    client.post("/user/join", json=test_user_data)
    login_response = client.post(
        "/auth/token",
        data={"username": test_user_data["email"], "password": test_user_data["pwd"]},
    )
    token = login_response.json().get("access_token")
    header = {"Authorization": f"Bearer {token}"}
    # 1. 피드 생성
    create_response = client.post("/feed/new", headers=header, json=feed_payload)
    assert create_response.status_code == 200
    create_json = create_response.json()
    assert create_json["result"] == "success"
    assert "id" in create_json
    fid = create_json["id"]

    # 2. 생성된 피드 조회
    get_response = client.get(f"/feed/get/{fid}", headers=header)
    assert get_response.status_code == 200
    get_json = get_response.json()

    assert get_json["result"] == "success"
    assert get_json["feed"]["fid"] == fid
    assert get_json["feed"]["content"] == feed_payload["content"]


@pytest.mark.asyncio
async def test_update_feed(db_session, test_user_data, feed_payload):
    """
    POST /feed/update
    - 피드 업데이트 성공 테스트
    """
    client.post("/user/join", json=test_user_data)
    login_response = client.post(
        "/auth/token",
        data={"username": test_user_data["email"], "password": test_user_data["pwd"]},
    )
    token = login_response.json().get("access_token")
    header = {"Authorization": f"Bearer {token}"}
    # 1. 피드 생성
    create_response = client.post("/feed/new", headers=header, json=feed_payload)
    fid = create_response.json()["id"]

    # 2. 피드 업데이트
    update_payload = {
        "fid": fid,
        "content": "This is an updated feed.",
        "location": {"long": 128.0, "lat": 38.0},
        "images": [],
        "private": True,
    }
    update_response = client.post("/feed/update", headers=header, json=update_payload)
    assert update_response.status_code == 200
    assert update_response.json()["result"] == "success"

    # 3. 업데이트된 내용 확인
    get_response = client.get(f"/feed/get/{fid}", headers=header)
    updated_feed = get_response.json()["feed"]
    assert updated_feed["content"] == update_payload["content"]
    assert updated_feed["private"] is True
    assert updated_feed["location"]["long"] == update_payload["location"]["long"]
    assert updated_feed["location"]["lat"] == update_payload["location"]["lat"]


@pytest.mark.asyncio
async def test_delete_feed(db_session, test_user_data, feed_payload):
    """
    POST /feed/delete
    - 피드 삭제 성공 테스트
    """
    client.post("/user/join", json=test_user_data)
    login_response = client.post(
        "/auth/token",
        data={"username": test_user_data["email"], "password": test_user_data["pwd"]},
    )
    token = login_response.json().get("access_token")
    header = {"Authorization": f"Bearer {token}"}
    # 1. 피드 생성
    create_response = client.post("/feed/new", headers=header, json=feed_payload)
    fid = create_response.json()["id"]

    # 2. 피드 삭제
    delete_response = client.post(f"/feed/delete?fid={fid}", headers=header)
    assert delete_response.status_code == 200
    assert delete_response.json()["result"] == "success"

    # 3. 삭제 확인 (404)
    get_response = client.get(f"/feed/get/{fid}", headers=header)
    assert get_response.status_code == 404


@pytest.mark.asyncio
async def test_get_feed_by_location(db_session, auth_headers, feed_payload):
    """
    GET /feed/get/location
    - 위치 기반 피드 조회 테스트
    """
    # 1. 피드 생성
    client.post("/feed/new", headers=auth_headers, json=feed_payload)

    # 2. 위치 기반 조회
    import geohash2

    long = feed_payload["location"]["long"]
    lat = feed_payload["location"]["lat"]
    gh = geohash2.encode(lat, long, 7)

    response = client.post(
        "/feed/get/location",
        json={"hashes": [gh]},
        headers=auth_headers,
    )
    assert response.status_code == 200
    response_json = response.json()
    assert response_json["result"] == "success"
    assert len(response_json["feeds"]) > 0


@pytest.mark.asyncio
async def test_feed_authorization(
    db_session, auth_headers, other_user_data, feed_payload
):
    """
    - 다른 사용자가 비공개 피드에 접근 시 403 에러 확인
    """
    # 1. 비공개 피드 생성
    feed_payload["private"] = True
    create_response = client.post("/feed/new", headers=auth_headers, json=feed_payload)
    fid = create_response.json()["id"]

    # 2. 다른 사용자 생성 및 로그인
    client.post("/user/join", json=other_user_data)
    other_login_res = client.post(
        "/auth/token",
        data={"username": other_user_data["email"], "password": other_user_data["pwd"]},
    )
    other_token = other_login_res.json().get("access_token")
    other_headers = {"Authorization": f"Bearer {other_token}"}

    # 3. 다른 사용자가 비공개 피드 조회 시도 (403 Forbidden)
    get_response = client.get(f"/feed/get/{fid}", headers=other_headers)
    assert get_response.status_code == 403


@pytest.mark.asyncio
async def test_geohash_cache_performance_via_api(db_session, auth_headers):
    """
    사용자 생성(/user/join), 로그인(/auth/token), 피드 생성(/feed/new) 및 위치 기반 피드 조회(/feed/get/location)를
    모두 API 경로 요청으로 수행하며, 동일 geohash 구역 30회 초과 조회 시 Redis 캐싱 전/후 실행 시간 차이를 비교합니다.
    """
    import time
    import geohash2

    # 3. 피드 생성 API 요청 (/feed/new)
    feed_payload = {
        "content": "API Geohash Cache Performance Test Feed",
        "location": {"long": 127.0, "lat": 37.5},
        "images": [],
        "private": False,
    }
    create_feed_res = client.post("/feed/new", headers=auth_headers, json=feed_payload)
    assert create_feed_res.status_code == 200
    assert create_feed_res.json()["result"] == "success"

    # 4. Geohash 인코딩 및 위치 조회 요청 데이터 준비
    long = feed_payload["location"]["long"]
    lat = feed_payload["location"]["lat"]
    gh = geohash2.encode(lat, long, 6)
    location_payload = {"hashes": [gh]}

    # 5. 캐싱 전 (DB 쿼리 실행) 1번째 API 조회 소요 시간 측정
    start_uncached = time.perf_counter()
    uncached_response = client.post(
        "/feed/get/location", json=location_payload, headers=auth_headers
    )
    uncached_duration = (time.perf_counter() - start_uncached) * 1000  # ms 단위

    assert uncached_response.status_code == 200
    assert len(uncached_response.json()["feeds"]) > 0

    # 6. Redis 캐싱 조건(score > 30) 충족을 위해 32회 추가 연속 조회 API 요청
    for _ in range(32):
        res = client.post(
            "/feed/get/location", json=location_payload, headers=auth_headers
        )
        assert res.status_code == 200

    # 7. 캐싱 후 (Redis 캐시 조회) API 조회 소요 시간 측정
    start_cached = time.perf_counter()
    cached_response = client.post(
        "/feed/get/location", json=location_payload, headers=auth_headers
    )
    cached_duration = (time.perf_counter() - start_cached) * 1000  # ms 단위

    assert cached_response.status_code == 200

    # 8. 쿼리 실행 시간 비교 결과 출력 및 검증
    print(
        "\n================ [API Path Geohash Cache Performance Result] ================"
    )
    print(f" - Uncached (DB Query via API) Execution Time : {uncached_duration:.4f} ms")
    print(f" - Cached (Redis Cache via API) Execution Time: {cached_duration:.4f} ms")
    print(
        f" - Time Saved                                 : {uncached_duration - cached_duration:.4f} ms"
    )
    if cached_duration > 0:
        print(
            f" - Performance Improvement            : {uncached_duration / cached_duration:.2f}x faster"
        )
    print(
        "============================================================================"
    )

    # 데이터 동일성 및 실행 시간 단축 검증
    assert uncached_response.json()["feeds"] == cached_response.json()["feeds"]
    assert cached_duration < uncached_duration
