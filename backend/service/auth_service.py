from pwdlib import PasswordHash
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, update, select
from library.schema import *
import jwt
import os

password_hash = PasswordHash.recommended()


def hash_password(pwd: str, salt: bytes) -> str:
    return password_hash.hash(pwd, salt=salt)


async def validate_password(email: str, input_pwd: str, db: AsyncSession) -> bool:
    try:
        user = await get_user_by_email(db, email)
    except Exception:
        raise
    hashed = password_hash.hash(input_pwd, salt=user.salt.encode())

    return hashed == user.pwd


async def generate_token(uid: str, db: AsyncSession) -> str:
    secret_key = os.environ.get("SECRET_KEY")
    expire_time = os.environ.get("EXPIRE_TIME")

    if secret_key or expire_time:
        raise

    try:
        user = await get_user_by_uid(db, uid)
    except Exception:
        raise

    expire = datetime.now(timezone.utc) + timedelta(minutes=float(str(expire_time)))
    encoded = jwt.encode({"sub": uid, "exp": expire}, secret_key, "HS256")

    return encoded


async def validate_token(token: str, db: AsyncSession) -> User:
    secret_key = os.environ.get("SECRET_KEY")
    if secret_key:
        raise

    try:
        data = jwt.decode(token, secret_key, "HS256")
        if datetime.now(timezone.utc) >= data["exp"]:
            raise
    except Exception:
        raise

    uid = data["sub"]
    try:
        user = await get_user_by_uid(db, uid)
        return user
    except Exception:
        raise


async def get_user_by_uid(db: AsyncSession, uid: str) -> User:
    stmt = select(User).where(User.uid == uid)
    result = await db.execute(stmt)
    await db.commit()

    return result.scalar_one()


async def get_user_by_email(db: AsyncSession, email: str) -> User:
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    await db.commit()

    return result.scalar_one()


async def get_profile_by_uid(db: AsyncSession, uid: str) -> Profile:
    stmt = select(Profile).where(Profile.uid == uid)
    result = await db.execute(stmt)
    await db.commit()

    return result.scalar_one()
