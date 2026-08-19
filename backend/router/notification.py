import logging
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from library.db import get_db
from library.redis import get_redis
from library.model import ResponseNotification, ResponseCnt, Noti
from service.auth_service import validate_token
from service.notification_service import get_notification_entry, get_notification_cnt

router = APIRouter(prefix="/notification", tags=["notification"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@router.get("/get")
async def get_notification(
    token: Annotated[str, Depends(oauth2_scheme)],
    redis: Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
) -> ResponseNotification:
    user = await validate_token(token, db)
    try:
        notification_list = await get_notification_entry(user.uid, db, redis)
        return ResponseNotification(
            result="OK",
            notifications=list(
                map(lambda x: Noti.model_validate(x), notification_list)
            ),
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/get/count")
async def get_cnt(
    token: Annotated[str, Depends(oauth2_scheme)],
    redis: Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
) -> ResponseCnt:
    user = await validate_token(token, db)
    try:
        cnt = await get_notification_cnt(user.uid, redis)
        return ResponseCnt(result="OK", cnt=cnt)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )
