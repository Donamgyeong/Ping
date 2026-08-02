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
    ST_GeoHash,
)
from geoalchemy2.shape import from_shape
from redis.asyncio import Redis
from shapely.geometry import Point
from fastapi import HTTPException, status
from library.schema import *
from library.model import *
from uuid import uuid4
from datetime import datetime, timezone
import time
import geohash2
import json


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
    db: AsyncSession, redis: Redis, hjd_cds: list[str]
) -> list[Feed]:
    key = "feed:rate:" + get_current_time_bucket(10)
    feeds = []
    for hjd in hjd_cds:
        feed = await redis.get("feed:cached:" + hjd)
        if feed:
            print("------------from cache-----------")
            data = json.loads(feed)
            feeds.extend(data)
        else:
            stmt = select(Feed).where(
                EMD_Boundaries.emd_cd == hjd,
                ST_Contains(
                    EMD_Boundaries.geom,
                    Feed.location,
                ),
            )
            result = await db.scalars(stmt)
            feed_list = list(map(lambda x: x.as_dict(), result.all()))

            score = await redis.zscore(key, hjd)
            if not score:
                await redis.zadd(key, {hjd: 1})
                await redis.expire(key, 900)
                continue
            else:
                await redis.zincrby(key, 1, hjd)

            if score > 30:
                await redis.set(
                    "feed:cached:" + hjd,
                    json.dumps(feed_list, default=datetime_to_json_formatting),
                )
                await redis.expire("feed:cached:" + hjd, 60)

            feeds.extend(feed_list)

    return feeds
<<<<<<< HEAD


async def get_feeds_count_by_codes(
    db: AsyncSession, redis: Redis, hjds: list[str]
) -> list[tuple]:
    counts = []
    query_list = []

    for code in hjds:
        count = await redis.get("feed:count:" + code)
        if count:
            geojson = await redis.get("feed:location:" + code)
            if geojson:
                coords = json.loads(geojson)
                counts.append((int(count), (coords["lng"], coords["lat"])))
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Internal Server Error",
                )
        else:
            query_list.append(code)

    if len(query_list) == 0:
        print("------------from cache-----------")
        return counts

    stmt = (
        select(
            EMD_Boundaries.emd_cd.label("code"),
            func.count(Feed.feed_id).label("feed_count"),
            ST_AsGeoJSON(ST_Centroid(EMD_Boundaries.geom)).label("center_point"),
        )
        .where(
            ST_Contains(EMD_Boundaries.geom, Feed.location),
            EMD_Boundaries.emd_cd.in_(query_list),
        )
        .group_by(EMD_Boundaries.emd_cd)
    )

    result = await db.execute(stmt)
    for row in result.all():
        geojson = json.loads(row.center_point)
        coords = geojson.get("coordinates")
        counts.append((row.feed_count, (coords[0], coords[1])))

        await redis.set("feed:count:" + row.code, row.feed_count)
        await redis.set(
            "feed:location:" + row.code,
            json.dumps({"lng": coords[0], "lat": coords[1]}),
        )
        await redis.expire("feed:count:" + row.code, 1800)

    return counts
=======
>>>>>>> 54dc0c2b619392575af067d754703c2250b3bb4a


async def get_feeds_by_hash(
    db: AsyncSession, redis: Redis, hashes: list[str]
) -> list[dict]:
    if not hashes:
        return []

    key = "feed:rate:" + get_current_time_bucket(10)
    feeds = []
    for hash in hashes:
        feed = await redis.get("feed:cached:" + hash)
        if feed:
            print("------------from cache-----------")
            data = json.loads(feed)
            feeds.extend(data)
        else:
            stmt = select(Feed).where(
                ST_Contains(
                    ST_SetSRID(ST_GeomFromGeoHash(hash), 4326),
                    Feed.location,
                )
            )
            result = await db.scalars(stmt)
            feed_list = list(map(lambda x: x.as_dict(), result.all()))

            score = await redis.zscore(key, hash)
            if not score:
                await redis.zadd(key, {hash: 1})
                await redis.expire(key, 900)
                continue
            else:
                await redis.zincrby(key, 1, hash)

            if score > 30:
                await redis.set(
                    "feed:cached:" + hash,
                    json.dumps(feed_list, default=datetime_to_json_formatting),
                )
                await redis.expire("feed:cached:" + hash, 60)

            feeds.extend(feed_list)

    return feeds


async def get_feeds_count_by_hash(
    db: AsyncSession, redis: Redis, hashes: list[str]
) -> list[tuple]:
    counts = []
    query_list = []

    start = datetime.now()

    for hash in hashes:
        count = await redis.get("feed:count:" + hash)
        if count:
            counts.append((int(count), geohash2.decode_exactly(hash)))
        else:
            query_list.append(hash)

    if len(query_list) == 0:
        print("------------from cache-----------")
        return counts

    precision = len(query_list[0])
    geohashes = ST_GeoHash(Feed.location, precision).label("geohash")
    stmt = (
        select(
            geohashes,
            func.count(Feed.feed_id).label("feed_count"),
            ST_AsGeoJSON(ST_Centroid(ST_Collect(Feed.location))).label("center_point"),
        )
        .where(geohashes.in_(query_list))
        .group_by(geohashes)
    )

    result = await db.execute(stmt)
    for row in result.all():
        geojson = json.loads(row.center_point)
        coords = geojson.get("coordinates")
        counts.append((row.feed_count, (coords[0], coords[1])))

        await redis.set("feed:count:" + row.geohash, row.feed_count)
        await redis.expire("feed:count:" + row.geohash, 1800)

    print("-------------" + str((datetime.now() - start).microseconds))

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


async def get_address_from_position(
    db: AsyncSession, lat: float, long: float
) -> str | None:
    point = from_shape(Point(long, lat), srid=4326)
    stmt = select(EMD_Boundaries.emd_cd).where(ST_Contains(EMD_Boundaries.geom, point))
    result = await db.execute(stmt)
    emd_cd = result.scalar_one_or_none()

    return emd_cd


def get_current_time_bucket(interval_minutes: int = 10) -> str:
    current_time = int(time.time())
    bucket_timestamp = current_time - (current_time % (interval_minutes * 60))
    return str(bucket_timestamp)


def datetime_to_json_formatting(o):
    if isinstance(o, (date, datetime)):
        return o.isoformat()
