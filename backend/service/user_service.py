from sqlalchemy import delete, update, select
from sqlalchemy.ext.asyncio import AsyncSession
from library.schema import *
from uuid import uuid4
from service.auth_service import hash_password
from datetime import date


async def create_user(
    db: AsyncSession, email: str, pwd: str, nickname: str, birthdate: date
) -> tuple:
    uid = str(uuid4())
    salt = str(uuid4())
    hashed_pwd = hash_password(pwd, salt.encode())

    new_user = User(
        uid=uid, email=email, pwd=hashed_pwd, birthdate=birthdate, salt=salt
    )
    new_profile = Profile(uid=uid, nickname=nickname)

    db.add(new_user)
    db.add(new_profile)

    await db.commit()

    return uid, salt


async def delete_user(db: AsyncSession, uid: str):
    stmt = delete(User).where(User.uid == uid)

    await db.execute(stmt)
    await db.commit()


async def update_user(db: AsyncSession, uid: str, email: str, pwd: str):
    stmt = update(User).where(User.uid == uid).values(email=email, pwd=pwd)

    await db.execute(stmt)
    await db.commit()


async def update_profile(db: AsyncSession, uid: str, nickname: str):
    stmt = update(Profile).where(User.uid == uid).values(nickname=nickname)

    await db.execute(stmt)
    await db.commit()


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


async def new_follow(db: AsyncSession, follower_id: str, followee_id: str):
    new = Follow(follower_uid=follower_id, followee_id=followee_id)
    db.add(new)

    await db.commit()


async def is_followed(db: AsyncSession, follower_id: str, followee_id: str) -> bool:
    stmt = select(Follow).where(
        Follow.follower_uid == follower_id, Follow.followee_uid == followee_id
    )

    result = await db.scalars(stmt)
    return len(result.all()) > 0


async def get_following_list(db: AsyncSession, uid: str) -> list[str]:
    stmt = select(Follow).where(Follow.follower_uid == uid)

    result = await db.scalars(stmt)
    return list(map(lambda x: x.followee_uid, result.all()))
