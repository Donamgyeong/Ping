from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
from library.model import (
    ResponseBase,
    UserInfo,
    UserBase,
    ResponseDetail,
    ResponseIDS,
    ResponseFollowing,
    FollowerInfo,
    ResponseProfile,
    ResponseID,
)
from library.security import hash_password
from service.user_service import (
    create_user,
    delete_user,
    update_user,
    update_profile,
    get_user_by_email,
    get_profile_by_uid,
    get_user_by_uid,
    new_follow,
    get_followers,
    is_followed,
    get_following,
)
from service.auth_service import validate_token, validate_password
from library.db import get_db
from library.redis import get_redis
from redis.asyncio import Redis
import logging
from datetime import date

router = APIRouter(prefix="/user", tags=["user"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@router.get("/me")
async def get_me(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
) -> ResponseID:
    try:
        user = await validate_token(token, db)
        return ResponseID(result="success", id=user.uid)
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting me: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/join")
async def join(
    user: UserInfo,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        await create_user(db, user.email, user.pwd, user.nickname, user.birthdate)
        await db.commit()
        return ResponseBase(result="success")
    except IntegrityError:
        logging.warning(f"User with email {user.email} already exists.")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this email already exists.",
        )
    except Exception as e:
        await db.rollback()
        logging.error(f"Error creating user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/delete")
async def delete(
    token: Annotated[str, Depends(oauth2_scheme)],
    userbase: UserBase,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    user = await validate_token(token, db)
    # 비밀번호 검증 로직 추가
    if (
        not user
        or not await validate_password(user, userbase.pwd)
        or user.email != userbase.email
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )
    try:
        await delete_user(db, user.uid)
        await db.commit()
        return ResponseBase(result="success")
    except HTTPException as e:
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error deleting user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/update/email")
async def update_email(
    token: Annotated[str, Depends(oauth2_scheme)],
    email: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        await update_user(db, user.uid, email=email, pwd=user.pwd)
        await db.commit()
        return ResponseBase(result="success")
    except IntegrityError:
        logging.warning(f"Attempted to update to an existing email: {email}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email is already in use.",
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error updating email for user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/update/password")
async def update_password(
    token: Annotated[str, Depends(oauth2_scheme)],
    prev_pwd: str,
    new_pwd: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        if not await validate_password(user, prev_pwd):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect previous password",
            )
        pwd = hash_password(new_pwd, user.salt.encode())
        await update_user(db, user.uid, email=user.email, pwd=pwd)
        await db.commit()
        return ResponseBase(result="success")
    except HTTPException as e:
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error updating password for user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/update/nickname")
async def update_nickname(
    token: Annotated[str, Depends(oauth2_scheme)],
    nickname: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        await update_profile(db, user.uid, nickname=nickname)
        await db.commit()
        return ResponseBase(result="success")
    except HTTPException as e:
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error updating nickname: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/update/picture")
async def update_picture(
    token: Annotated[str, Depends(oauth2_scheme)],
    profile_picture: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        await update_profile(db, user.uid, profile_picture=profile_picture)
        await db.commit()
        return ResponseBase(result="success")
    except HTTPException as e:
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error updating profile picture: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/update/bio")
async def update_bio(
    token: Annotated[str, Depends(oauth2_scheme)],
    bio: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        await update_profile(db, user.uid, bio=bio)
        await db.commit()
        return ResponseBase(result="success")
    except HTTPException as e:
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error updating bio: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/check/email")
async def check_email(
    email: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await get_user_by_email(db, email)

        if not user:
            return ResponseBase(result="success")

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already exists"
        )
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/follow/request")
async def follow_request(
    token: Annotated[str, Depends(oauth2_scheme)],
    follow_uid: str,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> ResponseDetail:
    try:
        follower = await validate_token(token, db)
        followee = await get_user_by_uid(db, follow_uid)

        if not followee:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
            )

        if await is_followed(db, follower.uid, follow_uid):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Already followed"
            )

        profile = await get_profile_by_uid(db, follow_uid)
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found"
            )

        if profile.private:
            await redis.set(
                "follow:" + follow_uid + ":" + follower.uid, date.today().ctime()
            )
            return ResponseDetail(result="success", detail="Follow requested")
        else:
            await new_follow(db, follower.uid, follow_uid)
            await db.commit()
            return ResponseDetail(result="success", detail="Follow completed")
    except HTTPException as e:
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error creating follow request: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/follow/accept")
async def follow_accept(
    token: Annotated[str, Depends(oauth2_scheme)],
    request_uid: str,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        redis_key = f"follow:{user.uid}:{request_uid}"
        if await redis.get(redis_key) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Follow request not found",
            )
        await new_follow(db, request_uid, user.uid)

        await redis.delete(redis_key)
        await db.commit()

        return ResponseBase(result="success")
    except HTTPException as e:
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error accepting follow request: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/following", response_model=ResponseFollowing)
async def get_following_list(
    token: Annotated[str, Depends(oauth2_scheme)],
    uid: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        user = await validate_token(token, db)
        target_uid = uid if uid else user.uid
        following_list = await get_following(db, target_uid)
        return ResponseFollowing(
            result="success",
            following=[
                FollowerInfo(uid=f.uid, nickname=f.nickname) for f in following_list
            ],
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting following list: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/followers", response_model=ResponseFollowing)
async def get_followers_list(
    token: Annotated[str, Depends(oauth2_scheme)],
    uid: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        user = await validate_token(token, db)
        target_uid = uid if uid else user.uid
        followers_list = await get_followers(db, target_uid)
        return ResponseFollowing(
            result="success",
            following=[  # 모델 재사용
                FollowerInfo(uid=f.uid, nickname=f.nickname) for f in followers_list
            ],
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting followers list: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/follow/request/list")
async def get_follow_request_list(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> ResponseIDS:
    try:
        user = await validate_token(token, db)
        ids = await redis.keys("follow:" + user.uid + ":*")

        result = []
        for id in ids:
            if isinstance(id, bytes):
                result.append(id.decode())
            else:
                result.append(id)

        return ResponseIDS(
            result="success",
            ids=result,
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error creating follow request: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/profile/{uid}")
async def get_profile(
    token: Annotated[str, Depends(oauth2_scheme)],
    uid: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseProfile:
    try:
        user = await validate_token(token, db)
        profile = await get_profile_by_uid(db, uid)
        if not profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found",
            )

        return ResponseProfile(
            result="success",
            uid=uid,
            nickname=profile.nickname,
            bio=profile.bio,
            profile_picture=profile.profile_picture,
            private=profile.private,
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error creating follow request: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )
