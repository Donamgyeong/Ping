from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from library.model import ResponseBase, UserInfo, UserBase
from library.security import hash_password
from service.user_service import (
    create_user,
    delete_user,
    update_user,
    update_profile,
    get_user_by_email,
    get_profile_by_uid,
    new_follow,
)
from service.auth_service import validate_token, validate_password
from library.db import get_db
import logging

router = APIRouter(prefix="/user", tags=["user"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@router.post("/join")
async def join(
    user: UserInfo,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        await create_user(db, user.email, user.pwd, user.nickname, user.birthdate)
        await db.commit()
        return ResponseBase(result="success")
    except IntegrityError:
        logging.warning(f"User with email {user.email} already exists.")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this email already exists.",
        )
    except Exception as e:
        await db.rollback()
        logging.error(f"Error creating user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/delete")
async def delete(
    token: Annotated[str, Depends(oauth2_scheme)],
    userbase: UserBase,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    user = await validate_token(token, db)
    # 비밀번호 검증 로직 추가
    if not await validate_password(user, userbase.pwd) and user.email != userbase.email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )
    try:
        await delete_user(db, user.uid)
        await db.commit()
        return ResponseBase(result="success")
    except Exception as e:
        await db.rollback()
        logging.error(f"Error deleting user {user.uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/update/email")
async def update_email(
    token: Annotated[str, Depends(oauth2_scheme)],
    email: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        await update_user(db, user.uid, email=email, pwd=user.pwd)
        await db.commit()
        return ResponseBase(result="success")
    except IntegrityError:
        logging.warning(f"Attempted to update to an existing email: {email}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already in use.",
        )
    except Exception as e:
        await db.rollback()
        logging.error(f"Error updating email for user {user.uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/update/password")
async def update_password(
    token: Annotated[str, Depends(oauth2_scheme)],
    prev_pwd: str,
    new_pwd: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        if not await validate_password(user, prev_pwd):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect previous password",
            )
        pwd = hash_password(new_pwd, user.salt.encode())
        await update_user(db, user.uid, email=user.email, pwd=pwd)
        await db.commit()
        return ResponseBase(result="success")
    except Exception as e:
        await db.rollback()
        logging.error(f"Error updating password for user {user.uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/update/nickname")
async def update_nickname(
    token: Annotated[str, Depends(oauth2_scheme)],
    nickname: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        await update_profile(db, user.uid, nickname)
        await db.commit()
        return ResponseBase(result="success")
    except Exception as e:
        await db.rollback()
        logging.error(f"Error updating nickname for user {user.uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/check/email")
async def check_email(
    email: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        await get_user_by_email(db, email)
        # 사용자가 존재하면 이메일이 중복됨
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already exists"
        )
    except HTTPException as e:
        raise e
    except Exception:
        # 사용자가 존재하지 않으면 사용 가능한 이메일
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
        await db.commit()
        return ResponseBase(result="success")
    except Exception:
        return ResponseBase(result="fail")


@router.post("/follow/accept")
async def follow_accept(
    token: Annotated[str, Depends(oauth2_scheme)],
    request_uid: str,
    db: AsyncSession = Depends(get_db),
):
    pass
