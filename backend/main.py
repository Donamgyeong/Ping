from fastapi import (
    FastAPI,
    WebSocket,
    Depends,
    WebSocketDisconnect,
    WebSocketException,
    HTTPException,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from library.db import get_db
from library.redis import get_redis
from library.model import SocketMsg, ChatItem, Noti
from service.auth_service import validate_token
from service.chat_service import add_message

from redis.asyncio import Redis
from redis.asyncio.client import PubSub
from sqlalchemy.ext.asyncio import AsyncSession
import asyncio
import logging
from datetime import datetime, timezone

from router.user import router as user_router
from router.feed import router as feed_router
from router.chat import router as chat_router
from router.file import router as file_router
from router.auth import router as auth_router
from router.notification import router as notification_router
from router.comment import router as comment_router
from config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    from library.minio import minio_init

    await minio_init()

    yield


app = FastAPI(lifespan=lifespan)

origins = [
    "https://" + settings.external_host,
    "http://" + settings.external_host,
    "https://localhost",
    "http://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(user_router)
app.include_router(feed_router)
app.include_router(chat_router)
app.include_router(file_router)
app.include_router(auth_router)
app.include_router(comment_router)
app.include_router(notification_router)


@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    await websocket.accept()

    pubsub = None
    try:
        auth_msg = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
        sock_msg = SocketMsg.model_validate_json(auth_msg)

        if sock_msg.type != "AUTH" or not isinstance(sock_msg.payload, str):
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Authorization header is missing",
            )

        token = sock_msg.payload
        user = await validate_token(token.replace("Bearer ", ""), db)

        pubsub = redis.pubsub()
        await pubsub.subscribe(f"user:{user.uid}")

        redis_task = asyncio.create_task(redis_reader(websocket, pubsub))
        client_task = asyncio.create_task(client_reader(websocket, redis, db, user.uid))
        commit_task = asyncio.create_task(periodic_commit(db, 60))

        _, pending = await asyncio.wait(
            [redis_task, client_task, commit_task], return_when=asyncio.FIRST_COMPLETED
        )
    except WebSocketDisconnect as e:
        logging.info(f"Client disconnected.")
    except WebSocketException as e:
        logging.info(f"Client connection has Exception. {e.reason}")
        raise e
    except Exception as e:
        logging.info(f"Client connection has Exception. {e}")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
    finally:
        for task in pending:
            task.cancel()
        await db.commit()

        if pubsub:
            await pubsub.unsubscribe()
            await pubsub.aclose()


async def redis_reader(websocket: WebSocket, pubsub: PubSub):
    while True:
        msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=None)
        if msg:
            await websocket.send_json(msg.get("data"))


async def client_reader(websocket: WebSocket, redis: Redis, db: AsyncSession, uid: str):
    while True:
        msg = await asyncio.wait_for(websocket.receive_json(), timeout=30.0)
        sock_msg = SocketMsg.model_validate_json(msg)
        payload = sock_msg.payload

        match sock_msg.type:
            case "PING":
                await websocket.send_json(
                    SocketMsg(type="PONG", payload=None).model_dump_json()
                )
            case "CHAT":
                if not isinstance(payload, ChatItem):
                    logging.info("Websocket: Wrong payload")
                    continue
                cid = payload.cid
                message = payload.message
                date = datetime.now(timezone.utc)

                await add_message(db, redis, cid, uid, message, date)
            case _:
                continue


async def periodic_commit(db: AsyncSession, interval_seconds: int):
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await db.commit()
            logging.info("Periodic commit successful.")
        except Exception as e:
            logging.error(f"Periodic commit failed: {e}")
            raise Exception
