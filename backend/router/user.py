from typing import Annotated
from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from library.model import ResponseBase
from service.user_service import (
    create_user,
    delete_user,
    update_user,
    update_profile,
    get_user_by_email,
    get_profile_by_uid,
    new_follow,
)
from service.auth_service import validate_token, hash_password, validate_password
from library.db import get_db

router = APIRouter(prefix="/user", tags=["user"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@router.post("/join")
async def join(
    email: str,
    pwd: str,
    nickname: str,
    birthdate: date,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        await create_user(db, email, pwd, nickname, birthdate)
        return ResponseBase(result="success")
    except Exception:
        await db.rollback()
        return ResponseBase(result="fail")


@router.post("/delete")
async def delete(
    token: Annotated[str, Depends(oauth2_scheme)],
    email: str,
    pwd: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        await delete_user(db, user.uid)
        return ResponseBase(result="success")
    except Exception:
        await db.rollback()
        return ResponseBase(result="fail")


@router.post("/update/email")
async def update_email(
    token: Annotated[str, Depends(oauth2_scheme)],
    email: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        await update_user(db, user.uid, email, user.pwd)
        return ResponseBase(result="success")
    except Exception:
        await db.rollback()
        return ResponseBase(result="fail")


@router.post("/update/password")
async def update_password(
    token: Annotated[str, Depends(oauth2_scheme)],
    prev_pwd: str,
    new_pwd: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        if not await validate_password(user.email, prev_pwd, db):
            raise

        pwd = hash_password(new_pwd, user.salt.encode())
        await update_user(db, user.uid, user.email, pwd)
        return ResponseBase(result="success")
    except Exception:
        await db.rollback()
        return ResponseBase(result="fail")


@router.post("/update/nickname")
async def update_nickname(
    token: Annotated[str, Depends(oauth2_scheme)],
    nickname: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        await update_profile(db, user.uid, nickname)
        return ResponseBase(result="success")
    except Exception:
        return ResponseBase(result="fail")


@router.get("/check/email")
async def check_email(
    email: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        await get_user_by_email(db, email)
        return ResponseBase(result="fail")
    except Exception:
        return ResponseBase(result="success")


@router.post("/follow/request")
async def follow_request(
    token: Annotated[str, Depends(oauth2_scheme)],
    follow_uid: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        profile = await get_profile_by_uid(db, follow_uid)

        ...

        await new_follow(db, user.uid, follow_uid)
        return ResponseBase(result="success")
    except Exception:
        await db.rollback()
        return ResponseBase(result="fail")


@router.post("/follow/accept")
async def follow_accept(
    token: Annotated[str, Depends(oauth2_scheme)],
    request_uid: str,
    db: AsyncSession = Depends(get_db),
):
    pass
