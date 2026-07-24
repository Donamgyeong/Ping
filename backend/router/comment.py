import logging
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from library.db import get_db
from library.model import (
    CommentCreate,
    ResponseBase,
    ResponseCommentList,
    ResponseID,
)
from service.auth_service import validate_token
from service.comment_service import (
    create_comment,
    delete_comment as delete_comment_service,
    get_comments_by_feed,
)

router = APIRouter(prefix="/comment", tags=["comment"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@router.post("/new")
async def add_comment_endpoint(
    comment_data: CommentCreate,
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
) -> ResponseID:
    user = await validate_token(token, db)
    try:
        comment_id = await create_comment(
            db, user.uid, comment_data.feed_id, comment_data.content
        )
        await db.commit()
        return ResponseID(result="success", id=comment_id)
    except HTTPException as e:
        await db.rollback()
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error creating comment for feed {comment_data.feed_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/list/{feed_id}")
async def get_comment_list_endpoint(
    feed_id: str,
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
) -> ResponseCommentList:
    await validate_token(token, db)
    try:
        comments = await get_comments_by_feed(db, feed_id)
        return ResponseCommentList(result="success", comments=comments)
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error fetching comments for feed {feed_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.delete("/{comment_id}")
async def delete_comment_endpoint(
    comment_id: str,
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    user = await validate_token(token, db)
    try:
        await delete_comment_service(db, comment_id, user.uid)
        await db.commit()
        return ResponseBase(result="success")
    except HTTPException as e:
        await db.rollback()
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error deleting comment {comment_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )
