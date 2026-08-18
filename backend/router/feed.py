from typing import Annotated
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from library.model import *
from library.schema import Feed
from service.feed_service import (
    create_feed,
    get_address_from_position,
    get_feeds_count_by_codes,
    get_hjd_from_bbox,
    update_feed,
    delete_feed,
    get_feeds_by_uid,
    get_one_feed,
    get_feeds_by_codes,
    get_image_list,
    get_sido_list,
    get_sigungu_list,
    get_emd_list,
    get_region_centroid,
)
from service.auth_service import validate_token
from service.user_service import is_followed, get_following, get_profile_by_uid
from service.notification_service import publish_notification
from datetime import datetime, timedelta, timezone
from geoalchemy2.shape import from_shape, to_shape
from library.db import get_db
from library.redis import get_redis
from redis.asyncio import Redis
import logging
import traceback

router = APIRouter(prefix="/feed", tags=["feed"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@router.post("/new")
async def new(
    token: Annotated[str, Depends(oauth2_scheme)],
    feed: FeedCreate,
    redis: Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
) -> ResponseID:
    user = await validate_token(token, db)
    profile = await get_profile_by_uid(db, user.uid)
    try:
        if not profile:
            raise Exception
        feed_id = await create_feed(db, user.uid, feed)

        followers = await get_following(db, user.uid)
        for follower in followers:
            noti = Noti(
                noti_id="None",
                type="Feed",
                receiver=follower.uid,
                content="New Feed is posted by " + profile.nickname,
                link="/feed/" + feed_id,
                date=datetime.now(),
            )
            await publish_notification(db, redis, noti)
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
    bbox: BBox,
    zoom: int,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> ResponseFeedLocation | ResponseFeedCount:
    user = await validate_token(token, db)
    try:
        hjds = await get_hjd_from_bbox(db, bbox)
        if hjds and zoom < 16:
            count_list = await get_feeds_count_by_codes(db, redis, hjds, zoom)
            result = list(
                map(
                    lambda x: FeedCountInfo(
                        count=x[0],
                        location=Location(long=float(x[1][0]), lat=float(x[1][1])),
                    ),
                    count_list,
                )
            )
            return ResponseFeedCount(result="success", count=result)
        else:
            feeds = await get_feeds_by_codes(db, redis, hjds)
            result = list[FeedLocation]()

            following_list = await get_following(db, user.uid)
            following_uids = map(lambda x: x.uid, following_list)
            for feed in feeds:
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


@router.get("/hjd/get/{code}")
async def get_feed_by_hjd(
    token: Annotated[str, Depends(oauth2_scheme)],
    code: str,
    redis: Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
) -> ResponseFeedID:
    user = await validate_token(token, db)
    try:
        feeds = await get_feeds_by_codes(db, redis, [code])
        result = list[FeedID]()
        for feed in feeds:
            feedID = FeedID(
                fid=feed["feed_id"], uid=feed["uid"], post_date=feed["post_date"]
            )
            result.append(feedID)
        return ResponseFeedID(result="success", feedid=result)
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting feeds for hjd {code}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/get/{fid}")
async def get_feed(
    token: Annotated[str, Depends(oauth2_scheme)],
    fid: str,
    redis: Redis = Depends(get_redis),
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
        await redis.zincrby("feed:view", 1, fid)

        return ResponseFeed(result="success", feed=feedItem)
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting feed {fid}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/following/get")
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
            if feed.post_date.astimezone(timezone.utc) >= datetime.now(
                timezone.utc
            ) - timedelta(days=7):
                feedid = FeedID(
                    fid=feed.feed_id, uid=feed.uid, post_date=feed.post_date
                )
                result.append(feedid)

        return ResponseFeedID(result="success", feedid=result)
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting hot feeds: {e}")
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


@router.get("/address")
async def get_address(
    token: Annotated[str, Depends(oauth2_scheme)],
    lat: float,
    long: float,
    db: AsyncSession = Depends(get_db),
) -> ResponseAddress:
    user = await validate_token(token, db)
    try:
        address = await get_address_from_position(db, lat, long)
        if not address:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Address not found"
            )
        return ResponseAddress(
            result="success",
            sido_nm=address.sido_nm,
            sigungu_nm=address.sgg_nm,
            emd_nm=address.emd_nm,
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting address for user : {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/region/sido")
async def get_region_sido(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
) -> ResponseSidoList:
    user = await validate_token(token, db)
    try:
        items = await get_sido_list(db)
        return ResponseSidoList(
            result="success",
            items=[SidoItem(sido_cd=row.sido_cd, sido_nm=row.sido_nm) for row in items],
        )
    except Exception as e:
        logging.error(f"Error getting sido list: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/region/sigungu")
async def get_region_sigungu(
    token: Annotated[str, Depends(oauth2_scheme)],
    sido_cd: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseSigunguList:
    user = await validate_token(token, db)
    try:
        items = await get_sigungu_list(db, sido_cd)
        return ResponseSigunguList(
            result="success",
            items=[
                SigunguItem(sigungu_cd=row.sigungu_cd, sgg_nm=row.sgg_nm)
                for row in items
            ],
        )
    except Exception as e:
        logging.error(f"Error getting sigungu list for sido {sido_cd}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/region/emd")
async def get_region_emd(
    token: Annotated[str, Depends(oauth2_scheme)],
    sigungu_cd: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseEmdList:
    user = await validate_token(token, db)
    try:
        items = await get_emd_list(db, sigungu_cd)
        return ResponseEmdList(
            result="success",
            items=[EmdItem(emd_cd=row.emd_cd, emd_nm=row.emd_nm) for row in items],
        )
    except Exception as e:
        logging.error(f"Error getting emd list for sigungu {sigungu_cd}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.get("/region/centroid")
async def get_centroid(
    token: Annotated[str, Depends(oauth2_scheme)],
    emd_cd: str,
    db: AsyncSession = Depends(get_db),
) -> ResponseCentroid:
    user = await validate_token(token, db)
    try:
        coords = await get_region_centroid(db, emd_cd)
        if not coords:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Region not found"
            )
        return ResponseCentroid(result="success", lat=coords[0], lng=coords[1])
    except HTTPException as e:
        raise e
    except Exception as e:
        logging.error(f"Error getting centroid for region {emd_cd}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )
