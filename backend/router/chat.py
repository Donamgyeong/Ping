from typing import Annotated
from fastapi import APIRouter, Depends, WebSocket, HTTPException, status
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
import logging

router = APIRouter(prefix="/chat", tags=["chat"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@router.post("/new")
async def new_chat(
    token: Annotated[str, Depends(oauth2_scheme)],
    title: str,
    participants: list[str],
    db: AsyncSession = Depends(get_db),
) -> ResponseID:
    creator = await validate_token(token, db)
    try:
        participant_set = set(participants)
        if creator.uid in participant_set:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Creator cannot be in the participant list.",
            )

        # Check if all participants exist
        for participant_uid in participant_set:
            user = await get_user_by_uid(db, participant_uid)
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Participant with UID {participant_uid} not found.",
                )

        cid = await create_chat(db, creator.uid, title, list(participant_set))
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
