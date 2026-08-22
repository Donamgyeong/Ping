from uuid import uuid4
from datetime import datetime, timezone
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from library.schema import Comment, Profile, Feed
from library.model import CommentItem, Noti
from service.notification_service import publish_notification
from redis.asyncio import Redis


async def create_comment(
    db: AsyncSession, redis: Redis, writer_uid: str, feed_id: str, content: str
) -> str:
    feed_stmt = select(Feed).where(Feed.feed_id == feed_id)
    feed_res = await db.execute(feed_stmt)
    feed = feed_res.scalar_one_or_none()
    if not feed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feed not found.",
        )

    comment_id = str(uuid4())
    new_comment = Comment(
        comment_id=comment_id,
        feed_id=feed_id,
        writer=writer_uid,
        content=content,
        comment_date=datetime.now(timezone.utc),
    )
    db.add(new_comment)

    if feed.uid != writer_uid:
        noti = Noti(
            noti_id="placeholder",
            type="COMMENT",
            receiver=feed.uid,
            content=f"New comment on your post",
            link=f"/feed/{feed.feed_id}",
            date=datetime.now(),
        )
        await publish_notification(db, redis, noti)
    return comment_id


async def get_comments_by_feed(db: AsyncSession, feed_id: str) -> list[CommentItem]:
    stmt = (
        select(Comment, Profile.nickname)
        .outerjoin(Profile, Comment.writer == Profile.uid)
        .where(Comment.feed_id == feed_id)
        .order_by(Comment.comment_date.asc())
    )
    result = await db.execute(stmt)

    comment_items = []
    for comment, nickname in result.all():
        comment_items.append(
            CommentItem(
                comment_id=comment.comment_id,
                feed_id=comment.feed_id,
                writer=comment.writer,
                writer_nickname=nickname or comment.writer,
                content=comment.content,
                comment_date=comment.comment_date,
            )
        )

    return comment_items


async def delete_comment(db: AsyncSession, comment_id: str, requester_uid: str):
    stmt = select(Comment).where(Comment.comment_id == comment_id)
    res = await db.execute(stmt)
    comment = res.scalar_one_or_none()

    if not comment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found.",
        )

    # Check authorization: comment writer or feed owner
    if comment.writer != requester_uid:
        feed_stmt = select(Feed.uid).where(Feed.feed_id == comment.feed_id)
        feed_res = await db.execute(feed_stmt)
        feed_writer = feed_res.scalar_one_or_none()
        if feed_writer != requester_uid:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to delete this comment.",
            )

    del_stmt = delete(Comment).where(Comment.comment_id == comment_id)
    await db.execute(del_stmt)
