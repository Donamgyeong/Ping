from typing import Annotated
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import StreamingResponse
from rich import json
from library.model import ResponseBase, ResponseID, ResponseFileURL
from sqlalchemy.ext.asyncio import AsyncSession
from library.db import get_db
from service.auth_service import validate_token
from service.file_service import (
    new_file,
    get_file_by_fid,
    delete_file_record,
    new_pending_upload,
)
from library.minio import (
    upload_to_minio,
    delete_from_minio,
    get_from_minio,
    find_from_minio,
    get_upload_url_from_minio,
)
import logging
from datetime import datetime
from PIL import Image
from io import BytesIO
from tempfile import SpooledTemporaryFile
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
    private: bool = Form(...),
    redis: Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
) -> ResponseFileURL:
    user = await validate_token(token, db)
    try:
        fid = await new_pending_upload(user.uid, private, redis)
        url, expiry = await get_upload_url_from_minio(image_bucket, fid)

        return ResponseFileURL(result="OK", url=url, valid_until=expiry)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/upload/{fid}/complete")
async def complete_pending_upload(
    token: Annotated[str, Depends(oauth2_scheme)],
    redis: Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
):
    user = await validate_token(token, db)
    try:
        await new_file(db, redis, user.uid, datetime.now())
        pass
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/delete")
async def delete_file(
    token: Annotated[str, Depends(oauth2_scheme)],
    fid: str = Form(...),
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
) -> StreamingResponse:
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

        file_stream = None
        if thumbnail:
            if await find_from_minio(cache_bucket, file_record.fid + "_thumbnail"):
                file_stream = await get_from_minio(
                    cache_bucket, file_record.fid + "_thumbnail"
                )
            else:
                try:
                    original_stream = await get_from_minio(
                        image_bucket, file_record.fid
                    )

                    with SpooledTemporaryFile(
                        max_size=10 * 1024 * 1024
                    ) as orig_file, SpooledTemporaryFile(
                        max_size=10 * 1024 * 1024
                    ) as thumb_file:

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
                            file_record.fid + "_thumbnail",
                            thumb_file,
                            file_size,
                            "image/png",
                        )

                    file_stream = await get_from_minio(
                        cache_bucket, file_record.fid + "_thumbnail"
                    )
                except Exception as e:
                    logging.warning(
                        f"Failed to generate thumbnail on the fly for {file_record.fid}: {e}"
                    )
                    file_stream = await get_from_minio(image_bucket, file_record.fid)
        else:
            file_stream = await get_from_minio(image_bucket, file_record.fid)

        encoded_filename = quote(file_record.fid)
        return StreamingResponse(
            file_stream.stream(32 * 1024),
            media_type=file_stream.headers.get(
                "Content-Type", "application/octet-stream"
            ),
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
            },
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting file {fid} for user {user.uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/geojson/{code}")
async def get_geojson_from_minio(
    token: Annotated[str, Depends(oauth2_scheme)],
    code: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    user = await validate_token(token, db)
    try:
        file_stream = await get_from_minio(settings.s3_geo_bucket, code + ".geojson")
        return file_stream.json()
    except Exception as e:
        logging.error(f"Error retrieving GeoJSON from MinIO: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )
