import asyncio
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool
from main import app
from library.db import get_db
from library.schema import Profile, Base
from config import settings
from library.redis import get_redis
import fakeredis

# 테스트용 PostgreSQL 데이터베이스 설정
DB_URL = (
    "postgresql+psycopg://"
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

client = TestClient(app)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
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

    # 각 테스트 후 가짜 Redis 데이터 초기화
    await fake_redis_client.flushall()


@pytest.fixture(scope="module")
def test_user_data():
    return {
        "email": "test@example.com",
        "pwd": "password123",
        "nickname": "testuser",
        "birthdate": "2000-01-01",
    }


@pytest.fixture(scope="module")
def test_user_data2():
    return {
        "email": "test2@example.com",
        "pwd": "password123",
        "nickname": "testuser2",
        "birthdate": "2000-01-02",
    }


def create_user_and_get_token(user_data):
    """Helper function to create a user and get a token."""
    client.post("/user/join", json=user_data)
    login_response = client.post(
        "/auth/token",
        data={"username": user_data["email"], "password": user_data["pwd"]},
    )
    return login_response.json().get("access_token")


@pytest.mark.asyncio
async def test_join(db_session, test_user_data):
    """
    POST /user/join
    - 회원가입 성공 테스트
    - 중복 이메일 회원가입 실패 테스트
    """
    # 회원가입 성공
    response = client.post("/user/join", json=test_user_data)
    assert response.status_code == 200
    assert response.json() == {"result": "success"}

    # 중복 이메일로 회원가입 시도 (409 Conflict)
    response = client.post("/user/join", json=test_user_data)
    assert response.status_code == 409
    assert response.json()["detail"] == "User with this email already exists."


@pytest.mark.asyncio
async def test_check_email(db_session, test_user_data, test_user_data2):
    """
    GET /user/check/email
    - 이메일 중복 확인 테스트
    """
    # 존재하지 않는 이메일
    response = client.get(f"/user/check/email?email={test_user_data2['email']}")
    assert response.status_code == 200
    assert response.json() == {"result": "success"}

    # 사용자 생성
    client.post("/user/join", json=test_user_data)

    # 존재하는 이메일
    response = client.get(f"/user/check/email?email={test_user_data['email']}")
    assert response.status_code == 409
    assert response.json()["detail"] == "Email already exists"


def test_update_nickname(db_session, test_user_data):
    """
    POST /user/update/nickname
    - 닉네임 변경 성공 테스트
    """
    token = create_user_and_get_token(test_user_data)
    headers = {"Authorization": f"Bearer {token}"}

    new_nickname = "new_nickname"
    response = client.post(
        f"/user/update/nickname?nickname={new_nickname}", headers=headers
    )

    assert response.status_code == 200
    assert response.json() == {"result": "success"}


@pytest.mark.asyncio
async def test_update_password(db_session, test_user_data):
    """
    POST /user/update/password
    - 비밀번호 변경 성공 테스트
    - 이전 비밀번호 불일치 실패 테스트
    """
    token = create_user_and_get_token(test_user_data)
    headers = {"Authorization": f"Bearer {token}"}

    # 비밀번호 변경 성공
    response = client.post(
        "/user/update/password",
        params={"prev_pwd": test_user_data["pwd"], "new_pwd": "new_password"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json() == {"result": "success"}

    # 이전 비밀번호 불일치
    response = client.post(
        "/user/update/password",
        params={"prev_pwd": "wrong_password", "new_pwd": "another_new_password"},
        headers=headers,
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect previous password"


@pytest.mark.asyncio
async def test_update_email(db_session, test_user_data):
    """
    POST /user/update/email
    - 이메일 변경 성공 테스트
    - 이미 사용중인 이메일로 변경 실패 테스트
    """
    token = create_user_and_get_token(test_user_data)
    headers = {"Authorization": f"Bearer {token}"}

    # 이메일 변경 성공
    new_email = "new.test@example.com"
    response = client.post(f"/user/update/email?email={new_email}", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"result": "success"}

    # 다른 사용자 생성
    client.post(
        "/user/join",
        json={
            "email": "another@example.com",
            "pwd": "password123",
            "nickname": "anotheruser",
            "birthdate": "2000-01-01",
        },
    )

    # 이미 사용중인 이메일로 변경 시도
    response = client.post(
        f"/user/update/email?email=another@example.com", headers=headers
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "This email is already in use."


@pytest.mark.asyncio
async def test_delete_user(db_session, test_user_data):
    """
    POST /user/delete
    - 회원 탈퇴 성공 테스트
    - 비밀번호 불일치 실패 테스트
    """
    token = create_user_and_get_token(test_user_data)
    headers = {"Authorization": f"Bearer {token}"}

    # 비밀번호 불일치
    delete_payload = {"email": test_user_data["email"], "pwd": "wrong_password"}
    response = client.post("/user/delete", headers=headers, json=delete_payload)
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect password"

    # 회원 탈퇴 성공
    delete_payload = {"email": test_user_data["email"], "pwd": test_user_data["pwd"]}
    response = client.post("/user/delete", headers=headers, json=delete_payload)
    assert response.status_code == 200
    assert response.json() == {"result": "success"}

    # 탈퇴 후 로그인 시도 (실패)
    login_response = client.post(
        "/auth/token",
        data={"username": test_user_data["email"], "password": test_user_data["pwd"]},
    )
    assert login_response.status_code == 401


@pytest.mark.asyncio
async def test_follow(db_session, test_user_data, test_user_data2):
    """
    POST /user/follow/request
    - 팔로우 요청/성공 테스트
    - 이미 팔로우한 경우 실패 테스트
    """
    # 유저 1 생성 및 토큰 발급
    token1 = create_user_and_get_token(test_user_data)
    headers1 = {"Authorization": f"Bearer {token1}"}

    # 유저 2 생성
    res = client.post("/user/join", json=test_user_data2)
    assert res.status_code == 200
    assert res.json() == {"result": "success"}

    # 유저 2의 정보 가져오기 (uid 획득)
    from service.user_service import get_user_by_email

    user2_uid = None
    async for db in override_get_db():
        user2 = await get_user_by_email(db, test_user_data2["email"])
        if user2:
            user2_uid = user2.uid

    # 팔로우 요청 (유저2가 공개 계정이라고 가정)
    response = client.post(
        f"/user/follow/request?follow_uid={user2_uid}", headers=headers1
    )
    assert response.status_code == 200
    assert response.json()["detail"] == "Follow completed"

    # 이미 팔로우한 경우 (409 Conflict)
    response = client.post(
        f"/user/follow/request?follow_uid={user2_uid}", headers=headers1
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Already followed"


@pytest.mark.asyncio
async def test_follow_private_and_accept(db_session, test_user_data, test_user_data2):
    """
    POST /user/follow/request (private)
    POST /user/follow/accept
    - 비공개 계정 팔로우 요청 및 수락 테스트
    """
    from service.user_service import get_user_by_email

    # 유저 1 (팔로워) 생성
    token1 = create_user_and_get_token(test_user_data)
    headers1 = {"Authorization": f"Bearer {token1}"}
    user1_uid = None
    async for db in override_get_db():
        user1 = await get_user_by_email(db, test_user_data["email"])
        user1_uid = user1.uid

    # 유저 2 (팔로위, 비공개 계정) 생성
    token2 = create_user_and_get_token(test_user_data2)
    headers2 = {"Authorization": f"Bearer {token2}"}
    user2_uid = None
    async for db in override_get_db():
        user2 = await get_user_by_email(db, test_user_data2["email"])
        user2_uid = user2.uid

        # 유저 2 프로필을 비공개로 설정 (테스트를 위해 직접 DB 수정)
        profile = await db.get(Profile, user2_uid)
        if profile:
            profile.private = True
            await db.commit()

    # 팔로우 요청 (비공개 계정이므로 'requested' 상태가 되어야 함)
    response = client.post(
        f"/user/follow/request?follow_uid={user2_uid}", headers=headers1
    )
    assert response.status_code == 200
    assert response.json()["detail"] == "Follow requested"

    # 팔로우 수락
    response = client.post(
        f"/user/follow/accept?request_uid={user1_uid}", headers=headers2
    )
    assert response.status_code == 200
    assert response.json() == {"result": "success"}
