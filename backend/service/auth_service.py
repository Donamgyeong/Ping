from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from library.schema import *
import jwt
from service.user_service import get_user_by_uid
from fastapi import HTTPException, status
from config import settings
from library.security import password_hash


async def validate_password(user: User, input_pwd: str) -> bool:
    hashed = password_hash.hash(input_pwd, salt=user.salt.encode())
    return hashed == user.pwd


async def generate_tokens(uid: str) -> tuple[str, str]:
    secret_key = settings.secret_key
    expire_minutes = float(settings.expire_time)
    refresh_expire_minutes = float(getattr(settings, "refresh_expire_time", 10080))

    now = datetime.now(timezone.utc)
    access_expire = now + timedelta(minutes=expire_minutes)
    refresh_expire = now + timedelta(minutes=refresh_expire_minutes)

    access_token = jwt.encode(
        {"sub": uid, "exp": access_expire, "type": "access"},
        secret_key,
        "HS256",
    )
    refresh_token = jwt.encode(
        {"sub": uid, "exp": refresh_expire, "type": "refresh"},
        secret_key,
        "HS256",
    )

    return access_token, refresh_token


async def generate_token(uid: str) -> str:
    access_token, _ = await generate_tokens(uid)
    return access_token


async def validate_token(token: str, db: AsyncSession) -> User:
    secret_key = settings.secret_key

    try:
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        uid = payload.get("sub")
        token_type = payload.get("type", "access")

        if uid is None or token_type != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload"
            )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )

    try:
        user = await get_user_by_uid(db, uid)
        if user:
            return user
        else:
            raise Exception
    except Exception:
        # 사용자가 토큰 발급 후 삭제되었을 경우
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )


async def validate_refresh_token(token: str, db: AsyncSession) -> User:
    secret_key = settings.secret_key

    try:
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        uid = payload.get("sub")
        token_type = payload.get("type")

        if uid is None or token_type != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
            )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token has expired"
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token"
        )

    try:
        user = await get_user_by_uid(db, uid)
        if user:
            return user
        else:
            raise Exception
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
