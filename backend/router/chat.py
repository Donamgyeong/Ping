from typing import Annotated
from fastapi import APIRouter, Depends, WebSocket
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from library.model import ResponseBase, ResponseID, ResponseChat
from service.auth_service import validate_token
from service.user_service import get_user_by_uid
from service.chat_service import (
    create_chat,
    delete_chat,
    remove_participant,
    add_participant,
)
from library.db import get_db

router = APIRouter(prefix="/chat", tags=["chat"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@router.post("/new")
async def new_chat(
    token: Annotated[str, Depends(oauth2_scheme)],
    title: str,
    participants: list[str],
    db: AsyncSession = Depends(get_db),
) -> ResponseID:
    try:
        creator = await validate_token(token, db)
        set_user = set(participants)
        for participant in set_user:
            user = await get_user_by_uid(db, participant)
            if participant == creator.uid:
                raise
        cid = await create_chat(db, creator.uid, title, list(set_user))

        return ResponseID(result="success", id=cid)
    except Exception:
        await db.rollback()
        return ResponseID(result="fail", id="")


@router.post("/delete")
async def close_chat(
    token: Annotated[str, Depends(oauth2_scheme)],
    cid: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        creator = await validate_token(token, db)
        await delete_chat(db, creator.uid, cid)
        return ResponseBase(result="success")
    except Exception:
        await db.rollback()
        return ResponseBase(result="fail")


@router.post("/leave")
async def leave_chat(
    token: Annotated[str, Depends(oauth2_scheme)],
    cid: str,
    db: AsyncSession = Depends(get_db),
):
    try:
        user = await validate_token(token, db)
        await remove_participant(db, user.uid, cid)
        return ResponseBase(result="success")
    except Exception:
        await db.rollback()
        return ResponseBase(result="fail")


@router.post("/invite")
async def invite_to_chat(
    token: Annotated[str, Depends(oauth2_scheme)],
    cid: str,
    uid: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        participant = await get_user_by_uid(db, uid)

        await add_participant(db, participant.uid, cid)
        return ResponseBase(result="success")
    except Exception:
        await db.rollback()
        return ResponseBase(result="fail")


@router.get("/get/")
async def get_chat(
    token: Annotated[str, Depends(oauth2_scheme)],
    revision: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseChat:
    return ResponseChat(result="success", chat=[])


@router.websocket("/get")
async def websocket_endpoint(
    websocket: WebSocket,
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
):
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        await websocket.send_text(f"Message text was: {data}")
