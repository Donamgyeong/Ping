from typing import Annotated
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from library.model import (
    FeedID,
    FeedBase,
    FeedCreate,
    FeedUpdate,
    FeedItem,
    ResponseBase,
    ResponseFeed,
    ResponseFeedID,
    ResponseID,
)
from library.schema import Feed
from service.feed_service import (
    create_feed,
    update_feed,
    delete_feed,
    get_feeds_by_uid,
    get_one_feed,
)
from service.auth_service import validate_token
from service.user_service import is_followed, get_following_list
from datetime import datetime, timedelta, timezone
from library.db import get_db
import logging

router = APIRouter(prefix="/feed", tags=["feed"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@router.post("/new")
async def new(
    token: Annotated[str, Depends(oauth2_scheme)],
    feed: FeedCreate,
    db: AsyncSession = Depends(get_db),
) -> ResponseID:
    user = await validate_token(token, db)
    try:
        feed_id = await create_feed(db, user.uid, feed)
        await db.commit()
        return ResponseID(result="success", id=feed_id)
    except HTTPException as e:
        await db.rollback()
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error creating feed for user {user.uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/update")
async def update(
    token: Annotated[str, Depends(oauth2_scheme)],
    feed: FeedUpdate,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    user = await validate_token(token, db)
    try:
        await update_feed(db, user.uid, feed)
        await db.commit()
        return ResponseBase(result="success")
    except HTTPException as e:
        await db.rollback()
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error updating feed {feed.fid} for user {user.uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/delete")
async def delete(
    token: Annotated[str, Depends(oauth2_scheme)],
    fid: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    user = await validate_token(token, db)
    try:
        await delete_feed(db, user.uid, fid)
        await db.commit()
        return ResponseBase(result="success")
    except HTTPException as e:
        await db.rollback()
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"Error deleting feed {fid} for user {user.uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/get/location")
async def get_feed_by_location(
    token: Annotated[str, Depends(oauth2_scheme)],
    lat: float,
    long: float,
    radius: float,
    db: AsyncSession = Depends(get_db),
) -> ResponseFeed:
    # TODO: Implement location-based feed search
    await validate_token(token, db)
    try:
        return ResponseFeed(result="success", feeds=[])
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting feeds by location: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/get/user/{uid}")
async def get_feed_id_by_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    uid: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseFeedID:
    user = await validate_token(token, db)
    try:
        followed = await is_followed(db, user.uid, uid)

        feeds = await get_feeds_by_uid(db, uid)
        result = list[FeedID]()
        for feed in feeds:
            if followed or not feed.private:
                feedID = FeedID(
                    fid=feed.feed_id, uid=feed.uid, post_date=feed.post_date
                )
                result.append(feedID)

        return ResponseFeedID(result="success", feedid=result)
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting feeds for user {uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/get/{fid}")
async def get_feeds(
    token: Annotated[str, Depends(oauth2_scheme)],
    fid: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseFeed:
    user = await validate_token(token, db)
    try:
        feed = await get_one_feed(db, fid)
        if not feed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found"
            )

        is_owner = feed.uid == user.uid
        followed = await is_followed(db, user.uid, feed.uid)

        if feed.private and not is_owner and not followed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this feed",
            )

        feedItem = FeedItem.model_validate(feed)
        return ResponseFeed(result="success", feeds=[feedItem])
    except Exception as e:
        logging.error(f"Error getting feed {fid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/get/following")
async def get_following_feeds(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
) -> ResponseFeedID:
    user = await validate_token(token, db)
    try:
        follow_list = await get_following_list(db, user.uid)
        feed_list = list[Feed]()
        for follow in follow_list:
            feeds = await get_feeds_by_uid(db, follow)
            feed_list.extend(feeds)

        feeds = sorted(feed_list, key=lambda x: x.post_date, reverse=True)

        result = list[FeedID]()

        for feed in feeds:
            if feed.post_date >= datetime.now(timezone.utc) - timedelta(days=7):
                feedid = FeedID(
                    fid=feed.feed_id, uid=feed.uid, post_date=feed.post_date
                )
                result.append(feedid)

        return ResponseFeedID(result="success", feedid=result)
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting following feeds for user {user.uid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )
