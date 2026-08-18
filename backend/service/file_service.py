from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, update, select
from library.schema import *
from library.minio import get_file_info, get_from_minio, upload_to_minio
from datetime import datetime
from uuid import uuid4
import json
from redis.asyncio import Redis
from tempfile import SpooledTemporaryFile
from PIL import Image
from config import settings

image_bucket = settings.s3_bucket
cache_bucket = settings.s3_cache_bucket


async def new_file(
    db: AsyncSession,
    redis: Redis,
    uid: str,
    fid: str,
    upload_date: datetime,
):
    pending = await redis.get(f"file:upload:{fid}")
    if not pending:
        raise Exception
    file_entry = json.loads(pending)

    if file_entry["uid"] != uid:
        raise Exception

    info = await get_file_info(settings.s3_bucket, fid)
    if not info:
        raise Exception

    await redis.delete(f"file:upload:{fid}")

    file_type, _ = info

    new_file = File(
        fid=fid,
        uid=uid,
        file_type=file_type,
        upload_date=upload_date,
        private=file_entry["private"],
    )

    db.add(new_file)


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


async def make_thumbnail(image_name: str):
    original_stream = await get_from_minio(image_bucket, image_name)

    with SpooledTemporaryFile(
        max_size=10 * 1024 * 1024
    ) as orig_file, SpooledTemporaryFile(max_size=10 * 1024 * 1024) as thumb_file:

        for chunk in original_stream.stream(32 * 1024):
            orig_file.write(chunk)
        orig_file.seek(0)

        image = Image.open(orig_file)
        image.thumbnail((256, 256))
        image.save(thumb_file, "PNG")

        thumb_file.seek(0, 2)
        file_size = thumb_file.tell()
        thumb_file.seek(0)

        await upload_to_minio(
            cache_bucket,
            image_name + "_thumbnail",
            thumb_file,
            file_size,
            "image/png",
        )
