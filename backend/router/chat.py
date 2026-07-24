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
from library.model import (
    ResponseBase,
    ResponseID,
    ResponseChat,
    ChatItem,
    ChatNew,
    ResponseChatroom,
    Chatroom,
)
from service.auth_service import validate_token
from service.user_service import get_user_by_uid
from service.chat_service import (
    create_chat,
    delete_chat,
    remove_participant,
    add_participant,
    get_chatrooms_by_user,
    add_message,
    get_chatroom_info,
    get_chat_history,
)
from library.db import get_db
from library.redis import get_redis
from redis.asyncio import Redis
from datetime import datetime, timezone
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
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
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


@router.get("/rooms")
async def get_chatrooms(
    token: Annotated[str, Depends(oauth2_scheme)], db: AsyncSession = Depends(get_db)
) -> ResponseChatroom:
    try:
        user = await validate_token(token, db)
        cids = await get_chatrooms_by_user(db, user.uid)

        rooms = await get_chatroom_info(db, cids)
        return ResponseChatroom(
            result="success",
            chatrooms=list(
                map(lambda room: Chatroom(cid=room.cid, title=room.title), rooms)
            ),
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting chatrooms for user: {e}")
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


@router.get("/messages/{cid}")
@router.get("/get/")
async def get_chat(
    token: Annotated[str, Depends(oauth2_scheme)],
    cid: str | None = None,
    limit: int = 50,
    before: str | None = None,
    revision: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> ResponseChat:
    user = await validate_token(token, db)
    target_cid = cid or revision
    if not target_cid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chat ID is required.",
        )
    try:
        messages = await get_chat_history(
            db=db, cid=target_cid, uid=user.uid, limit=limit, before_mid=before
        )
        chat_items = [
            ChatItem(
                mid=msg.message_id,
                cid=msg.cid,
                uid=msg.sender,
                message=msg.content,
                date=msg.message_date,
            )
            for msg in messages
        ]
        return ResponseChat(result="success", chat=chat_items)
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting chat history for cid {target_cid}: {e}")
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


async def client_reader(
    websocket: WebSocket, user_uid: str, redis: Redis, db: AsyncSession, cids: list[str]
):
    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            cid = message_data.get("cid")
            message = message_data.get("message")
            date = datetime.now(timezone.utc)

            if not cid or not message:
                continue

            if cid not in cids:
                logging.warning(
                    f"User {user_uid} tried to send message to unauthorized chat room {cid}"
                )
                continue

            mid = await add_message(db, cid, user_uid, message, date)

            chat_item = ChatItem(
                mid=mid, cid=cid, uid=user_uid, message=message, date=date
            )

            await redis.publish(f"chat:{cid}", chat_item.model_dump_json())
            await redis.expire(f"chat:{cid}", 259200)
    except WebSocketDisconnect:
        logging.info(f"Client {user_uid} disconnected.")
    except Exception as e:
        logging.warning(f"Client reader error for {user_uid}: {e}")


async def periodic_commit(db: AsyncSession, interval_seconds: int):
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await db.commit()
            logging.info("Periodic commit successful.")
        except Exception as e:
            logging.error(f"Periodic commit failed: {e}")


@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    await websocket.accept()
    try:
        auth_msg = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
        if auth_msg.get("type") != "AUTH":
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Authorization header is missing",
            )

        token = auth_msg.get("payload")
        if not token:
            raise WebSocketException(
                code=status.WS_1008_POLICY_VIOLATION,
                reason="Token is missing",
            )

        user = await validate_token(token.replace("Bearer ", ""), db)
    except (WebSocketException, HTTPException, ValueError, asyncio.TimeoutError) as e:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    cids = await get_chatrooms_by_user(db, user.uid)
    pubsub = redis.pubsub()
    if cids:
        await pubsub.subscribe(*[f"chat:{cid}" for cid in cids])

    redis_task = asyncio.create_task(redis_reader(websocket, pubsub))
    client_task = asyncio.create_task(
        client_reader(websocket, user.uid, redis, db, cids)
    )
    commit_task = asyncio.create_task(periodic_commit(db, 60))

    done, pending = await asyncio.wait(
        [redis_task, client_task, commit_task],
        return_when=asyncio.FIRST_COMPLETED,
    )

    for task in pending:
        task.cancel()

    await db.commit()

    await pubsub.unsubscribe()
    await pubsub.aclose()
