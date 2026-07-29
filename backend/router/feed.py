from typing import Annotated
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from library.model import *
from library.schema import Feed
from service.feed_service import (
    create_feed,
    update_feed,
    delete_feed,
    get_feeds_by_uid,
    get_one_feed,
    get_feeds_by_hash,
    get_feeds_count_by_hash,
    get_image_list,
)
from service.auth_service import validate_token
from service.user_service import is_followed, get_following
from datetime import datetime, timedelta, timezone
from geoalchemy2.shape import from_shape, to_shape
from library.db import get_db
from library.redis import get_redis
from redis.asyncio import Redis
import json
import logging
import traceback

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
        logging.error(f"Error creating feed: {e}")
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
    try:
        user = await validate_token(token, db)
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


@router.post("/get/location")
async def get_feed_by_location(
    token: Annotated[str, Depends(oauth2_scheme)],
    geohash: GeoHash,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> ResponseFeedLocation | ResponseFeedCount:
    user = await validate_token(token, db)
    try:
        if geohash.hashes and len(geohash.hashes[0]) <= 5:
            count_list = await get_feeds_count_by_hash(db, redis, geohash.hashes)
            result = list(
                map(
                    lambda x: FeedCountInfo(
                        count=x[0],
                        location=Location(long=float(x[1][1]), lat=float(x[1][0])),
                    ),
                    count_list,
                )
            )
            return ResponseFeedCount(result="success", count=result)
        else:
            feeds = await get_feeds_by_hash(db, redis, geohash.hashes)
            result = list[FeedLocation]()

            following_list = await get_following(db, user.uid)
            following_uids = map(lambda x: x.uid, following_list)
            for feed in feeds:
                print(feed)
                if (
                    feed["uid"] in following_uids
                    or not feed["private"]
                    or feed["uid"] == user.uid
                ):
                    feedID = FeedLocation(
                        fid=feed["feed_id"],
                        uid=feed["uid"],
                        post_date=feed["post_date"],
                        location=Location(
                            long=feed["location"]["lng"], lat=feed["location"]["lat"]
                        ),
                    )
                    result.append(feedID)
            return ResponseFeedLocation(result="success", feeds=result)
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting feeds by location: {e}")
        traceback.print_exc()
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
            if followed or not feed.private or feed.uid == user.uid:
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
async def get_feed(
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

        if feed.private and not (is_owner or followed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this feed",
            )

        point = to_shape(feed.location).point_on_surface()

        image_list = await get_image_list(db, fid)
        feedItem = FeedItem(
            fid=feed.feed_id,
            uid=feed.uid,
            post_date=feed.post_date,
            content=feed.content,
            private=feed.private,
            images=image_list,
            location=Location(long=point.x, lat=point.y),
        )

        return ResponseFeed(result="success", feed=feedItem)
    except HTTPException as e:
        raise e
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
    redis: Redis = Depends(get_redis),
) -> ResponseFeedID:
    user = await validate_token(token, db)
    try:
        follow_list = await get_following(db, user.uid)
        feed_list = list[Feed]()
        for follow in follow_list:
            feeds = await get_feeds_by_uid(db, follow.uid)
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
        logging.error(f"Error getting following feeds: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/get/{fid}/images")
async def get_feed_images(
    token: Annotated[str, Depends(oauth2_scheme)],
    fid: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseIDS:
    user = await validate_token(token, db)
    try:
        feed = await get_one_feed(db, fid)
        if not feed:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found"
            )

        return ResponseIDS(result="success", ids=await get_image_list(db, fid))
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting feed images for feed {fid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )
