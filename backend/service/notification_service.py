from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis
from uuid import uuid4

from library.model import *
from library.schema import Notification


async def publish_notification(db: AsyncSession, redis: Redis, notification: Noti):
    noti_id = uuid4()
    noti = Notification(
        noti_id=noti_id,
        type=notification.type,
        receiver=notification.receiver,
        content=notification.content,
        link=notification.link,
        date=notification.date,
    )

    await redis.incr("noti:cnt:" + notification.receiver)

    db.add(noti)
    await db.flush()


async def get_notification_entry(
    uid: str, db: AsyncSession, redis: Redis
) -> list[Notification]:
    stmt = (
        select(Notification)
        .where(Notification.receiver == uid)
        .order_by(Notification.date.desc())
    )

    result = await db.execute(stmt)
    entries = list(result.scalars())

    cnt = len(entries)
    await redis.decr("noti:cnt:" + uid, cnt)

    return entries


async def get_notification_cnt(uid: str, redis: Redis) -> int:
    cnt = await redis.get("noti:cnt:" + uid)
    if cnt:
        return int(cnt)
    return 0
