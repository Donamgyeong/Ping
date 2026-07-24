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

DB_URL = (
    "postgresql+psycopg://"
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
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        await db.close()


async def override_get_redis():
    yield fake_redis_client


app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_redis] = override_get_redis

client = TestClient(app)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function", autouse=True)
async def db_session():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await fake_redis_client.flushall()


@pytest.fixture(scope="module")
def user_data_1():
    return {
        "email": "commenter1@example.com",
        "pwd": "password123",
        "nickname": "commenter1",
        "birthdate": "2000-01-01",
    }


@pytest.fixture(scope="module")
def user_data_2():
    return {
        "email": "commenter2@example.com",
        "pwd": "password123",
        "nickname": "commenter2",
        "birthdate": "2000-01-02",
    }


def create_user_and_get_token(user_data):
    client.post("/user/join", json=user_data)
    login_response = client.post(
        "/auth/token",
        data={"username": user_data["email"], "password": user_data["pwd"]},
    )
    return login_response.json().get("access_token")


@pytest.mark.asyncio
async def test_comment_crud(db_session, user_data_1, user_data_2):
    token1 = create_user_and_get_token(user_data_1)
    headers1 = {"Authorization": f"Bearer {token1}"}

    token2 = create_user_and_get_token(user_data_2)
    headers2 = {"Authorization": f"Bearer {token2}"}

    # 1. Feed 생성
    feed_payload = {
        "content": "Feed for Comment Test",
        "location": {"long": 127.0, "lat": 37.5},
        "images": [],
        "private": False,
    }
    create_feed_res = client.post("/feed/new", headers=headers1, json=feed_payload)
    assert create_feed_res.status_code == 200
    feed_id = create_feed_res.json()["id"]

    # 2. 댓글 작성 (user1)
    comment_payload_1 = {"feed_id": feed_id, "content": "First comment by user1"}
    comment_res_1 = client.post("/comment/new", headers=headers1, json=comment_payload_1)
    assert comment_res_1.status_code == 200
    assert comment_res_1.json()["result"] == "success"
    comment_id_1 = comment_res_1.json()["id"]

    # 3. 댓글 작성 (user2)
    comment_payload_2 = {"feed_id": feed_id, "content": "Second comment by user2"}
    comment_res_2 = client.post("/comment/new", headers=headers2, json=comment_payload_2)
    assert comment_res_2.status_code == 200
    comment_id_2 = comment_res_2.json()["id"]

    # 4. 댓글 목록 조회
    list_res = client.get(f"/comment/list/{feed_id}", headers=headers1)
    assert list_res.status_code == 200
    comments = list_res.json()["comments"]
    assert len(comments) == 2
    assert comments[0]["content"] == "First comment by user1"
    assert comments[1]["content"] == "Second comment by user2"

    # 5. 권한 없는 사용자가 user1 댓글 삭제 시도 (실패: user2가 user1 댓글 삭제 시도)
    del_fail_res = client.delete(f"/comment/{comment_id_1}", headers=headers2)
    assert del_fail_res.status_code == 403

    # 6. 본인 댓글 삭제 (성공: user1이 본인 댓글 삭제)
    del_success_res = client.delete(f"/comment/{comment_id_1}", headers=headers1)
    assert del_success_res.status_code == 200
    assert del_success_res.json()["result"] == "success"

    # 7. 피드 작성자(user1)가 남의 댓글(user2 댓글) 삭제 (성공)
    del_by_owner_res = client.delete(f"/comment/{comment_id_2}", headers=headers1)
    assert del_by_owner_res.status_code == 200
    assert del_by_owner_res.json()["result"] == "success"

    # 8. 삭제 후 목록 재조회 -> 0개
    list_after_del = client.get(f"/comment/list/{feed_id}", headers=headers1)
    assert len(list_after_del.json()["comments"]) == 0
