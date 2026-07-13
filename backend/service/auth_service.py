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


async def generate_token(uid: str) -> str:
    secret_key = settings.secret_key
    expire_minutes_str = settings.expire_time

    expire = datetime.now(timezone.utc) + timedelta(minutes=float(expire_minutes_str))
    encoded = jwt.encode({"sub": uid, "exp": expire}, secret_key, "HS256")

    return encoded


async def validate_token(token: str, db: AsyncSession) -> User:
    secret_key = settings.secret_key

    try:
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        uid = payload.get("sub")
        if uid is None:
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
