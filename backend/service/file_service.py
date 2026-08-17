from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, update, select
from library.schema import *
from datetime import datetime
from uuid import uuid4
import json
from redis.asyncio import Redis
from config import settings


async def new_file(
    db: AsyncSession,
    redis: Redis,
    uid: str,
    upload_date: datetime,
):
    fid = str(uuid4())
    new = File(
        fid=fid,
        uid=uid,
        file_type=file_type,
        upload_date=upload_date,
        private=private,
    )

    db.add(new)


async def new_pending_upload(uid: str, private: bool, redis: Redis) -> str:
    fid = str(uuid4())
    await redis.set(
        f"file:upload:{fid}",
        json.dumps({"uid": uid, "private": private}),
        settings.file_url_expire_time,
    )

    return fid


async def get_file_by_fid(db: AsyncSession, fid: str) -> File | None:
    stmt = select(File).where(File.fid == fid)
    result = await db.execute(stmt)

    return result.scalar_one_or_none()


async def delete_file_record(db: AsyncSession, fid: str):
    stmt = delete(File).where(File.fid == fid)

    await db.execute(stmt)
