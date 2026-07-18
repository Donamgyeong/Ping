from typing import Annotated
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import StreamingResponse
from library.model import ResponseBase, ResponseID
from sqlalchemy.ext.asyncio import AsyncSession
from library.db import get_db
from service.auth_service import validate_token
from service.file_service import new_file, get_file_by_fid, delete_file_record
from library.minio import upload_to_minio, delete_from_minio, get_from_minio
import logging
from datetime import datetime

router = APIRouter(prefix="/file", tags=["files"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@router.post("/upload")
async def upload_file(
    token: Annotated[str, Depends(oauth2_scheme)],
    file: UploadFile = File(...),
    private: bool = Form(...),
    db: AsyncSession = Depends(get_db),
) -> ResponseID:
    user = await validate_token(token, db)
    if not file.size or not file.filename or not file.content_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is missing",
        )
    try:
        fid, internal_name = await new_file(
            db, user.uid, file.filename, private, datetime.now()
        )

        await file.seek(0)
        file_size = file.size
        await upload_to_minio(internal_name, file.file, file_size, file.content_type)

        await db.commit()

        return ResponseID(result="success", id=fid)
    except HTTPException as e:
        await db.rollback()
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error uploading file for user {user.uid}: {e}")
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

        await delete_from_minio(file_to_delete.filename)
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

        file_stream = await get_from_minio(file_record.filename)

        return StreamingResponse(
            file_stream.stream(32 * 1024),
            media_type=file_stream.headers.get(
                "Content-Type", "application/octet-stream"
            ),
            headers={
                "Content-Disposition": f"attachment; filename={file_record.original_filename}"
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
