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
    try:
        user = await validate_token(token, db)
        file_data = await file.read()

        fid, internal_name = await new_file(
            db, user.uid, file.filename, private, datetime.now()
        )

        upload_to_minio(internal_name, file_data, file.content_type)

        return ResponseID(result="success", id=fid)
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )


@router.post("/delete")
async def delete_file(
    token: Annotated[str, Depends(oauth2_scheme)],
    fid: str = Form(...),
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
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

        delete_from_minio(file_to_delete.filename)
        await delete_file_record(db, fid)

        return ResponseBase(result="success")
    except HTTPException as e:
        await db.rollback()
        raise e
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )


@router.get("/get")
async def get_file(
    fid: str,
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    try:
        user = await validate_token(token, db)
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

        file_stream = get_from_minio(file_record.filename)

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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e)
        )
