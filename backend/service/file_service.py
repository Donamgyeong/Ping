from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, update, select
from library.schema import *
from datetime import datetime
from uuid import uuid4


async def new_file(
    db: AsyncSession, uid: str, filename: str, private: bool, upload_date: datetime
) -> tuple[str, str]:
    fid = str(uuid4())
    internal_name = uid + "_" + fid
    new = File(
        fid=fid,
        uid=uid,
        filename=internal_name,
        original_filename=filename,
        upload_date=upload_date,
        private=private,
    )

    db.add(new)

    return fid, internal_name


async def get_file_by_fid(db: AsyncSession, fid: str) -> File | None:
    stmt = select(File).where(File.fid == fid)
    result = await db.execute(stmt)

    return result.scalar_one_or_none()


async def delete_file_record(db: AsyncSession, fid: str):
    stmt = delete(File).where(File.fid == fid)

    await db.execute(stmt)
