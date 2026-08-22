from typing import Annotated
from fastapi import APIRouter, Depends, Form, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from fastapi_restful.tasks import repeat_every
from library.model import ResponseBase, ResponseFileURL
from sqlalchemy.ext.asyncio import AsyncSession
from library.db import get_db
from service.auth_service import validate_token
from service.file_service import (
    make_thumbnail,
    new_file,
    get_file_by_fid,
    get_file_records,
    delete_file_record,
    new_pending_upload,
)
from library.minio import (
    get_download_url_from_minio,
    delete_from_minio,
    find_from_minio,
    get_upload_url_from_minio,
    get_file_list_from_minio,
)
import logging
from datetime import datetime
from urllib.parse import quote
from config import settings
from redis.asyncio import Redis
from library.redis import get_redis

router = APIRouter(prefix="/file", tags=["files"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

image_bucket = settings.s3_bucket
cache_bucket = settings.s3_cache_bucket


@router.get("/upload/url")
async def get_upload_url(
    token: Annotated[str, Depends(oauth2_scheme)],
    private: bool,
    redis: Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
) -> ResponseFileURL:
    user = await validate_token(token, db)
    try:
        fid = await new_pending_upload(user.uid, private, redis)
        url, expiry = await get_upload_url_from_minio(image_bucket, fid)

        return ResponseFileURL(result="success", url=url, valid_until=expiry)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/upload/{fid}/complete")
async def complete_pending_upload(
    token: Annotated[str, Depends(oauth2_scheme)],
    fid: str,
    redis: Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    user = await validate_token(token, db)
    try:
        await new_file(db, redis, user.uid, fid, datetime.now())
        await db.commit()
        await make_thumbnail(fid)

        return ResponseBase(result="success")
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/delete")
async def delete_file(
    token: Annotated[str, Depends(oauth2_scheme)],
    fid: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    user = await validate_token(token, db)
    try:
        file_to_delete = await get_file_by_fid(db, fid)

        if not file_to_delete:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="File not found"
            )

        if file_to_delete.uid != user.uid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to delete this file",
            )

        await delete_from_minio(image_bucket, file_to_delete.fid)
        if await find_from_minio(cache_bucket, file_to_delete.fid + "_thumbnail"):
            await delete_from_minio(cache_bucket, file_to_delete.fid + "_thumbnail")

        await delete_file_record(db, fid)

        await db.commit()

        return ResponseBase(result="success")
    except HTTPException as e:
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error deleting file {fid} for user {user.uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/get/{fid}")
async def get_file(
    fid: str,
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
    thumbnail: bool = False,
) -> ResponseFileURL:
    user = await validate_token(token, db)
    try:
        file_record = await get_file_by_fid(db, fid)

        if not file_record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="File not found"
            )

        if file_record.private and file_record.uid != user.uid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this file",
            )

        bucket = image_bucket
        filename = file_record.fid
        if thumbnail:
            bucket = cache_bucket
            filename = filename + "_thumbnail"

        url, valid_until = await get_download_url_from_minio(bucket, filename)

        return ResponseFileURL(result="success", url=url, valid_until=valid_until)
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting file {fid} for user {user.uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@repeat_every(seconds=86400)
async def delete_invalid_files(db: AsyncSession = Depends(get_db)):
    try:
        saved_files = await get_file_list_from_minio(image_bucket)
        file_records = await get_file_records(db)

        for f in saved_files:
            if not f in file_records:
                await delete_from_minio(image_bucket, f)
    except Exception as e:
        logging.error(f"Error deleting invalid files: {e}")
