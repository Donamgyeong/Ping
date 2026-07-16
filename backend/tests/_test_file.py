import asyncio
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from main import app
from library.db import get_db
from config import settings
from library.redis import get_redis
from library.schema import Base
import fakeredis
from unittest.mock import patch, MagicMock, AsyncMock
from io import BytesIO

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

engine = create_async_engine(DB_URL)
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

    await fake_redis_client.flushall()


@pytest.fixture(scope="module")
def test_user_data():
    return {
        "email": "testfile@example.com",
        "pwd": "password123",
        "nickname": "testfileuser",
        "birthdate": "2000-01-01",
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
@patch("router.file.upload_to_minio", new_callable=AsyncMock)
async def test_upload_file(mock_upload, test_user_data):
    """
    POST /file/upload
    - 파일 업로드 성공 테스트
    """
    db_session()

    token = create_user_and_get_token(test_user_data)
    headers = {"Authorization": f"Bearer {token}"}

    file_content = b"this is a test file"
    files = {"file": ("test.txt", BytesIO(file_content), "text/plain")}
    data = {"private": "true"}

    response = client.post("/file/upload", headers=headers, files=files, data=data)

    assert response.status_code == 200
    response_json = response.json()
    assert response_json["result"] == "success"
    assert "id" in response_json

    # MinIO 업로드 함수가 호출되었는지 확인
    mock_upload.assert_called_once()


@pytest.mark.asyncio
@patch("router.file.delete_from_minio", new_callable=AsyncMock)
@patch("router.file.upload_to_minio", new_callable=AsyncMock)
async def test_delete_file(mock_delete, mock_upload, db_session, test_user_data):
    """
    POST /file/delete
    - 파일 삭제 성공 테스트
    - 권한 없는 사용자의 삭제 시도 실패 테스트
    """

    db_session()
    # 1. 사용자 생성 및 파일 업로드
    token = create_user_and_get_token(test_user_data)
    headers = {"Authorization": f"Bearer {token}"}

    files = {"file": ("test.txt", BytesIO(b"content"), "text/plain")}
    data = {"private": "true"}
    upload_response = client.post(
        "/file/upload", headers=headers, files=files, data=data
    )
    fid = upload_response.json()["id"]

    # 2. 파일 삭제 성공
    delete_response = client.post("/file/delete", headers=headers, data={"fid": fid})
    assert delete_response.status_code == 200
    assert delete_response.json()["result"] == "success"
    mock_delete.assert_called_once()

    # 3. 존재하지 않는 파일 삭제 시도 (404)
    delete_response_404 = client.post(
        "/file/delete", headers=headers, data={"fid": "non-existent-fid"}
    )
    assert delete_response_404.status_code == 404


@pytest.mark.asyncio
@patch("router.file.get_from_minio", new_callable=AsyncMock)
@patch("router.file.upload_to_minio", new_callable=AsyncMock)
async def test_get_file(mock_get, mock_upload, db_session, test_user_data):
    """
    GET /file/get
    - 파일 다운로드 성공 테스트
    """
    # 1. Mock get_from_minio 설정
    file_content = b"this is the file content"
    mock_response = MagicMock()
    mock_response.stream.return_value = [file_content]
    mock_response.headers = {
        "Content-Type": "text/plain",
        "Content-Disposition": "attachment; filename=test.txt",
    }
    mock_get.return_value = mock_response

    # 2. 사용자 생성 및 파일 업로드
    token = create_user_and_get_token(test_user_data)
    headers = {"Authorization": f"Bearer {token}"}

    files = {"file": ("test.txt", BytesIO(b"content"), "text/plain")}
    data = {"private": "false"}  # 공개 파일로 업로드
    upload_response = client.post(
        "/file/upload", headers=headers, files=files, data=data
    )
    fid = upload_response.json()["id"]

    # 3. 파일 다운로드
    get_response = client.get(f"/file/get?fid={fid}", headers=headers)

    assert get_response.status_code == 200
    assert get_response.content == file_content
    assert get_response.headers["content-type"] == "text/plain"
    assert (
        "attachment; filename=test.txt" in get_response.headers["content-disposition"]
    )
    mock_get.assert_called_once()
