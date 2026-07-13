from sqlalchemy import delete, update, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from library.schema import *
from library.model import *
from uuid import uuid4
from datetime import datetime


async def create_feed(db: AsyncSession, uid: str, feed: FeedCreate) -> str:
    feed_id = str(uuid4())
    new_feed = Feed(feed_id=feed_id, uid=uid, post_date=datetime.now(), **feed.dict())

    db.add(new_feed)

    return feed_id


async def get_one_feed(db: AsyncSession, fid: str) -> Feed | None:
    stmt = select(Feed).where(Feed.feed_id == fid)

    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_feeds_list(db: AsyncSession, fids: list[str]) -> list[Feed]:
    stmt = select(Feed).where(Feed.feed_id.in_(fids))

    result = await db.scalars(stmt)
    return list(result.all())


async def get_feeds_by_uid(db: AsyncSession, uid: str) -> List[Feed]:
    stmt = select(Feed).where(Feed.uid == uid)

    result = await db.scalars(stmt)

    return list(result.all())


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

    stmt = update(Feed).where(Feed.feed_id == feed.fid).values(**feed.model_dump())

    await db.execute(stmt)
