import asyncio
import json
from typing import Annotated
from fastapi import (
    APIRouter,
    Depends,
    WebSocket,
    HTTPException,
    status,
    WebSocketDisconnect,
    WebSocketException,
)
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from library.model import ResponseBase, ResponseID, ResponseChat, ChatItem, ChatNew
from service.auth_service import validate_token
from service.user_service import get_user_by_uid
from service.chat_service import (
    create_chat,
    delete_chat,
    remove_participant,
    add_participant,
    get_chat_rooms_by_user,
)
from library.db import get_db
from library.redis import get_redis
from redis.asyncio import Redis
from datetime import datetime
import logging

router = APIRouter(prefix="/chat", tags=["chat"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@router.post("/new")
async def new_chat(
    token: Annotated[str, Depends(oauth2_scheme)],
    chatnew: ChatNew,
    db: AsyncSession = Depends(get_db),
) -> ResponseID:
    creator = await validate_token(token, db)
    try:
        participant_set = set(chatnew.participants)
        if creator.uid in participant_set:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Creator cannot be in the participant list.",
            )
        if len(participant_set) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Participant list cannot be empty.",
            )

        # Check if all participants exist
        for participant_uid in participant_set:
            user = await get_user_by_uid(db, participant_uid)
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Participant not found.",
                )

        cid = await create_chat(db, creator.uid, chatnew.title, list(participant_set))
        await db.commit()

        return ResponseID(result="success", id=cid)
    except HTTPException as e:
        await db.rollback()
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error creating chat for user {creator.uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/delete")
async def close_chat(
    token: Annotated[str, Depends(oauth2_scheme)],
    cid: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    creator = await validate_token(token, db)
    try:
        await delete_chat(db, creator.uid, cid)
        await db.commit()
        return ResponseBase(result="success")
    except HTTPException as e:
        await db.rollback()
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error deleting chat {cid} by user {creator.uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/leave")
async def leave_chat(
    token: Annotated[str, Depends(oauth2_scheme)],
    cid: str,
    db: AsyncSession = Depends(get_db),
):
    user = await validate_token(token, db)
    try:
        await remove_participant(db, user.uid, cid)
        await db.commit()
        return ResponseBase(result="success")
    except HTTPException as e:
        await db.rollback()
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error leaving chat {cid} for user {user.uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/invite")
async def invite_to_chat(
    token: Annotated[str, Depends(oauth2_scheme)],
    cid: str,
    uid: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    inviter = await validate_token(token, db)
    try:
        participant = await get_user_by_uid(db, uid)
        if not participant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User to invite with UID {uid} not found.",
            )

        await add_participant(db, participant.uid, cid)
        await db.commit()
        return ResponseBase(result="success")
    except HTTPException as e:
        await db.rollback()
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(
            f"Error inviting user {uid} to chat {cid} by user {inviter.uid}: {e}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/get/")
async def get_chat(
    token: Annotated[str, Depends(oauth2_scheme)],
    revision: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseChat:
    await validate_token(token, db)
    try:
        # TODO: Implement chat history retrieval logic
        return ResponseChat(result="success", chat=[])
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting chat history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


async def redis_reader(websocket: WebSocket, pubsub):
    try:
        while True:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=None
            )
            if message:
                await websocket.send_text(message["data"].decode())
    except Exception as e:
        logging.warning(f"Redis reader error: {e}")


async def client_reader(websocket: WebSocket, user_uid: str, redis: Redis):
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            cid = message_data.get("cid")
            message = message_data.get("message")

            if not cid or not message:
                continue

            chat_item = ChatItem(
                cid=cid, uid=user_uid, message=message, date=datetime.now().isoformat()
            )

            # TODO: ZADD를 사용하여 cid별로 정렬된 세트에 메시지 저장 (영속성)
            await redis.publish(f"chat:{cid}", chat_item.model_dump_json())
    except WebSocketDisconnect:
        logging.info(f"Client {user_uid} disconnected.")
    except Exception as e:
        logging.warning(f"Client reader error for {user_uid}: {e}")


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    try:
        # 1. 웹소켓 헤더에서 Authorization 토큰 추출
        auth_header = websocket.headers.get("Authorization")
        if not auth_header:
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Authorization header is missing",
            )

        scheme, token = auth_header.split()
        if scheme.lower() != "bearer":
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Invalid authentication scheme",
            )

        # 2. 토큰 검증
        user = await validate_token(token, db)
    except (WebSocketException, HTTPException, ValueError) as e:
        # 3. 인증 실패 시 연결 거부
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept(subprotocol="bearer")

    cids = await get_chat_rooms_by_user(db, user.uid)
    pubsub = redis.pubsub()
    if cids:
        await pubsub.subscribe(*[f"chat:{cid}" for cid in cids])

    redis_task = asyncio.create_task(redis_reader(websocket, pubsub))
    client_task = asyncio.create_task(client_reader(websocket, user.uid, redis))

    done, pending = await asyncio.wait(
        [redis_task, client_task],
        return_when=asyncio.FIRST_COMPLETED,
    )

    for task in pending:
        task.cancel()

    await pubsub.unsubscribe()
    await pubsub.close()
