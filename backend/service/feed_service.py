from sqlalchemy import Row, delete, update, select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2 import Geometry, Geography
from geoalchemy2.functions import (
    ST_Intersects,
    ST_MakeEnvelope,
    ST_Contains,
    ST_Collect,
    ST_Centroid,
    ST_AsGeoJSON,
    ST_MakePoint,
    ST_SetSRID,
    ST_Union,
    ST_AsText,
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


async def get_feeds_by_codes(
    db: AsyncSession, redis: Redis, hjd_cds: list[str]
) -> list[dict]:
    key = "feed:rate:" + get_current_time_bucket(10)
    feeds = []
    for hjd in hjd_cds:
        feed = await redis.get("feed:cached:" + hjd)
        if feed:
            data = json.loads(feed)
            feeds.extend(data)
        else:
            stmt = (
                select(Feed)
                .join(EMD_Boundaries, EMD_Boundaries.emd_cd.startswith(hjd))
                .where(
                    ST_Contains(
                        EMD_Boundaries.geom,
                        Feed.location,
                    ),
                )
            )
            result = await db.scalars(stmt)
            feed_list = list(map(lambda x: x.as_dict(), result.all()))

            feeds.extend(feed_list)

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

    return feeds


async def get_feeds_count_by_codes(
    db: AsyncSession,
    redis: Redis,
    hjds: list[str],
    zoom: int,
) -> list[tuple]:
    counts = []
    query_list = []

    codes = set(hjds)
    code_len = len(hjds[0])
    if zoom < 14 and zoom >= 11:
        codes = set(map(lambda x: x[:5], hjds))
        code_len = 5
    elif zoom < 11:
        codes = set(map(lambda x: x[:2], hjds))
        code_len = 2

    for code in codes:
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
        return counts

    code_expr = func.left(EMD_Boundaries.emd_cd, code_len)
    stmt = (
        select(
            code_expr.label("code"),
            ST_AsGeoJSON(ST_Centroid(ST_Collect(EMD_Boundaries.geom))).label(
                "center_point"
            ),
            func.count(Feed.feed_id).label("feed_count"),
        )
        .join(
            Feed,
            ST_Contains(EMD_Boundaries.geom, Feed.location),
        )
        .where(
            code_expr.in_(query_list),
        )
        .group_by(code_expr)
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


async def get_hjd_from_bbox(db: AsyncSession, bbox: BBox) -> list[str]:
    stmt = (
        select(EMD_Boundaries.emd_cd)
        .where(
            ST_Intersects(
                ST_MakeEnvelope(
                    bbox.SW.long, bbox.SW.lat, bbox.NE.long, bbox.NE.lat, 4326
                ),
                EMD_Boundaries.geom,
            )
        )
        .distinct()
    )

    result = await db.execute(stmt)
    return list(map(lambda x: x[0], result.all()))


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
) -> Row | None:
    stmt = select(SIDO.sido_nm, SIGUNGU.sgg_nm, EMD_Boundaries.emd_nm).where(
        ST_Contains(EMD_Boundaries.geom, ST_SetSRID(ST_MakePoint(long, lat), 4326)),
        func.left(EMD_Boundaries.emd_cd, 2) == SIDO.sido_cd,
        func.left(EMD_Boundaries.emd_cd, 5) == SIGUNGU.sigungu_cd,
    )
    result = await db.execute(stmt)
    address = result.first()

    return address


async def get_sido_list(db: AsyncSession) -> list[Row]:
    stmt = select(SIDO.sido_cd, SIDO.sido_nm).order_by(SIDO.sido_cd)
    result = await db.execute(stmt)
    return list(result.all())


async def get_sigungu_list(db: AsyncSession, sido_cd: str) -> list[Row]:
    stmt = (
        select(SIGUNGU.sigungu_cd, SIGUNGU.sgg_nm)
        .where(func.left(SIGUNGU.sigungu_cd, 2) == sido_cd)
        .order_by(SIGUNGU.sigungu_cd)
    )
    result = await db.execute(stmt)
    return list(result.all())


async def get_emd_list(db: AsyncSession, sigungu_cd: str) -> list[Row]:
    stmt = (
        select(EMD_Boundaries.emd_cd, EMD_Boundaries.emd_nm)
        .where(func.left(EMD_Boundaries.emd_cd, 5) == sigungu_cd)
        .order_by(EMD_Boundaries.emd_cd)
    )
    result = await db.execute(stmt)
    return list(result.all())


async def get_region_centroid(
    db: AsyncSession, code: str
) -> tuple[float, float] | None:
    import logging
    from sqlalchemy import func as sqlfunc

    code_len = len(code)
    logging.info(f"[get_region_centroid] code={code!r} len={code_len}")

    # Build the centroid subquery using ST_X/ST_Y to avoid WKT parsing issues
    if code_len == 2:
        filter_cond = func.left(EMD_Boundaries.emd_cd, 2) == code
    elif code_len == 5:
        filter_cond = func.left(EMD_Boundaries.emd_cd, 5) == code
    elif code_len == 8:
        filter_cond = EMD_Boundaries.emd_cd == code
    else:
        logging.warning(f"[get_region_centroid] Unsupported code length: {code_len}")
        return None

    # Method 1: ST_X/ST_Y on the union centroid
    try:
        union_centroid = ST_Centroid(ST_Union(EMD_Boundaries.geom))
        stmt = select(
            sqlfunc.ST_X(union_centroid).label("lng"),
            sqlfunc.ST_Y(union_centroid).label("lat"),
        ).where(filter_cond)

        result = await db.execute(stmt)
        row = result.first()
        logging.info(f"[get_region_centroid] Method1 row={row}")

        if row and row.lat is not None and row.lng is not None:
            return float(row.lat), float(row.lng)
    except Exception as e:
        logging.warning(f"[get_region_centroid] Method1 failed: {e}")

    # Method 2: Fallback — average of individual polygon centroids
    try:
        stmt2 = select(
            sqlfunc.avg(sqlfunc.ST_X(ST_Centroid(EMD_Boundaries.geom))).label("lng"),
            sqlfunc.avg(sqlfunc.ST_Y(ST_Centroid(EMD_Boundaries.geom))).label("lat"),
        ).where(filter_cond)

        result2 = await db.execute(stmt2)
        row2 = result2.first()
        logging.info(f"[get_region_centroid] Method2 row={row2}")

        if row2 and row2.lat is not None and row2.lng is not None:
            return float(row2.lat), float(row2.lng)
    except Exception as e:
        logging.error(f"[get_region_centroid] Method2 failed: {e}")

    logging.warning(f"[get_region_centroid] No result for code={code!r}")
    return None


def get_current_time_bucket(interval_minutes: int = 10) -> str:
    current_time = int(time.time())
    bucket_timestamp = current_time - (current_time % (interval_minutes * 60))
    return str(bucket_timestamp)


def datetime_to_json_formatting(o):
    if isinstance(o, (date, datetime)):
        return o.isoformat()
