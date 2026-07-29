from sqlalchemy import delete, update, select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2 import Geometry, Geography
from geoalchemy2.functions import (
    ST_NumGeometries,
    ST_Contains,
    ST_SetSRID,
    ST_GeomFromGeoHash,
    ST_ClusterDBSCAN,
    ST_Collect,
    ST_Centroid,
    ST_AsGeoJSON,
)
from geoalchemy2.shape import from_shape
from redis.asyncio import Redis
from shapely.geometry import Point
from fastapi import HTTPException, status
from library.schema import *
from library.model import *
from uuid import uuid4
from datetime import datetime, timezone
import geohash2


async def create_feed(db: AsyncSession, uid: str, feed: FeedCreate) -> str:
    location = from_shape(Point(feed.location.long, feed.location.lat), srid=4326)
    feed_id = str(uuid4())
    new_feed = Feed(
        feed_id=feed_id,
        uid=uid,
        content=feed.content,
        location=location,
        post_date=datetime.now(timezone.utc),
        private=feed.private,
    )

    db.add(new_feed)
    for img_id in feed.images:
        new_img = FeedImage(feed_id=feed_id, image_id=img_id)
        db.add(new_img)

    return feed_id


async def get_image_list(db: AsyncSession, fid: str) -> list[str]:
    stmt = select(FeedImage).where(FeedImage.feed_id == fid)
    result = await db.execute(stmt)

    return list(map(lambda x: x.image_id, result.scalars().all()))


async def get_one_feed(db: AsyncSession, fid: str) -> Feed | None:
    stmt = select(Feed).where(Feed.feed_id == fid)
    result = await db.execute(stmt)

    return result.scalar_one_or_none()


async def get_feeds_list(db: AsyncSession, fids: list[str]) -> list[Feed]:
    stmt = select(Feed).where(Feed.feed_id.in_(fids))

    result = await db.scalars(stmt)
    return list(result.all())


async def get_feeds_by_uid(db: AsyncSession, uid: str) -> list[Feed]:
    stmt = select(Feed).where(Feed.uid == uid)

    result = await db.scalars(stmt)

    return list(result.all())


async def get_feeds_by_position(
    db: AsyncSession, long: float, lat: float, radius: int
) -> list[Feed]:
    point = from_shape(Point(long, lat), srid=4326)
    stmt = select(Feed).where(func.ST_DWithin(Feed.location, point, radius / 110000))
    result = await db.scalars(stmt)

    return list(result.all())


async def get_feeds_by_hash(
    db: AsyncSession, redis: Redis, hashes: list[str]
) -> list[Feed]:
    if not hashes:
        return []

    redis.set("", "")

    conditions = []
    for hash in hashes:
        geohash2.decode(hash)
        conditions.append(
            ST_Contains(
                ST_SetSRID(ST_GeomFromGeoHash(hash), 4326),
                Feed.location,
            )
        )

    stmt = select(Feed).where(or_(*conditions))
    result = await db.scalars(stmt)
    return list(result.all())


async def get_feeds_count_by_hash(
    db: AsyncSession, redis: Redis, hashes: list[str]
) -> list:
    counts = []
    for hash in hashes:
        stmt = select(
            ST_NumGeometries(ST_Collect(Feed.location)).label("feed_count"),
            ST_AsGeoJSON(ST_Centroid(ST_Collect(Feed.location))).label("center_point"),
        ).where(
            ST_Contains(
                ST_SetSRID(ST_GeomFromGeoHash(hash), 4326),
                Feed.location,
            )
        )
        result = await db.execute(stmt)
        counts.extend(result.all())

    return counts


async def delete_feed(db: AsyncSession, uid: str, fid: str):
    fetched = await get_one_feed(db, fid)
    if fetched and fetched.uid != uid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized"
        )
    stmt = delete(Feed).where(Feed.feed_id == fid)

    await db.execute(stmt)


async def update_feed(db: AsyncSession, uid: str, feed: FeedUpdate):
    fetched = await get_one_feed(db, feed.fid)
    if fetched and fetched.uid != uid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized"
        )

    location_point = from_shape(Point(feed.location.long, feed.location.lat), srid=4326)

    stmt = (
        update(Feed)
        .where(Feed.feed_id == feed.fid)
        .values(content=feed.content, location=location_point, private=feed.private)
    )

    await db.execute(stmt)
