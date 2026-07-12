from typing import Annotated
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends
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

router = APIRouter(prefix="/feed", tags=["feed"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@router.post("/new")
async def new(
    token: Annotated[str, Depends(oauth2_scheme)],
    feed: FeedCreate,
    db: AsyncSession = Depends(get_db),
) -> ResponseID:
    try:
        user = await validate_token(token, db)
        await create_feed(db, user.uid, feed)

        return ResponseID(result="success", id="feed")
    except Exception:
        await db.rollback()
        return ResponseID(result="fail", id="")


@router.post("/update")
async def update(
    token: Annotated[str, Depends(oauth2_scheme)],
    feed: FeedUpdate,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        await update_feed(db, user.uid, feed)

        return ResponseBase(result="success")
    except Exception:
        await db.rollback()
        return ResponseBase(result="fail")


@router.post("/delete")
async def delete(
    token: Annotated[str, Depends(oauth2_scheme)],
    fid: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseBase:
    try:
        user = await validate_token(token, db)
        await delete_feed(db, user.uid, fid)

        return ResponseBase(result="success")
    except Exception:
        await db.rollback()
        return ResponseBase(result="fail")


@router.get("/get/location")
async def get_feed_by_location(
    token: Annotated[str, Depends(oauth2_scheme)],
    lat: float,
    long: float,
    radius: float,
    db: AsyncSession = Depends(get_db),
) -> ResponseFeed:
    return ResponseFeed(result="success", feeds=[])


@router.get("/get/user/{uid}")
async def get_feed_id_by_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    uid: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseFeedID:
    try:
        user = await validate_token(token, db)
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
    except Exception:
        return ResponseFeedID(result="fail", feedid=[])


@router.get("/get/{fid}")
async def get_feeds(
    token: Annotated[str, Depends(oauth2_scheme)],
    fid: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseFeed:
    try:
        await validate_token(token, db)
        feed = await get_one_feed(db, fid)
        feedItem = FeedItem.model_validate(feed)
        return ResponseFeed(result="success", feeds=[feedItem])
    except Exception:
        return ResponseFeed(result="fail", feeds=[])


@router.get("/get/following")
async def get_following_feeds(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
) -> ResponseFeedID:
    try:
        user = await validate_token(token, db)
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
    except Exception:
        return ResponseFeedID(result="fail", feedid=[])
