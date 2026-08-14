from sqlalchemy import delete, update, select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from redis.asyncio import Redis
from library.schema import *
from library.model import *
from uuid import uuid4


async def create_chat(
    db: AsyncSession, uid: str, title: str, participants: list[str]
) -> str:
    cid = str(uuid4())

    new_chat = Chat(cid=cid, creator=uid, title=title)
    participants.append(uid)
    for participant in participants:
        new_user = ChatParticipant(cid=cid, uid=participant)
        db.add(new_user)

    db.add(new_chat)

    return cid


async def delete_chat(db: AsyncSession, uid: str, cid: str):
    stmt = delete(Chat).where(Chat.cid == cid, Chat.creator == uid)

    await db.execute(stmt)


async def add_participant(db: AsyncSession, participant: str, cid: str):
    stmt = select(ChatParticipant).where(
        ChatParticipant.cid == cid, ChatParticipant.uid == participant
    )

    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Participant is already in the chat.",
        )

    new_participant = ChatParticipant(cid=cid, uid=participant)
    db.add(new_participant)


async def remove_participant(db: AsyncSession, participant: str, cid: str):
    stmt1 = select(ChatParticipant).where(
        ChatParticipant.cid == cid, ChatParticipant.uid == participant
    )

    result = await db.execute(stmt1)
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Participant not found.",
        )

    stmt2 = delete(ChatParticipant).where(
        ChatParticipant.cid == cid, ChatParticipant.uid == participant
    )
    await db.execute(stmt2)


async def get_chatrooms_by_user(db: AsyncSession, uid: str) -> list[str]:
    stmt = select(ChatParticipant.cid).where(ChatParticipant.uid == uid)
    result = await db.execute(stmt)
    cids = result.scalars().all()
    return list(cids)


async def get_chatroom_info(db: AsyncSession, cids: list[str]) -> list[Chat]:
    stmt = select(Chat).where(Chat.cid.in_(cids))
    result = await db.execute(stmt)

    return list(result.scalars().all())


async def add_message(
    db: AsyncSession, cid: str, uid: str, content: str, message_date: datetime
) -> str:
    mid = str(uuid4())
    new_message = ChatMessage(
        message_id=mid, cid=cid, sender=uid, content=content, message_date=message_date
    )

    db.add(new_message)

    return mid


async def get_chat_history(
    db: AsyncSession,
    redis: Redis,
    cid: str,
    uid: str,
    limit: int = 50,
    before_mid: str | None = None,
) -> list[ChatItem]:
    participant_stmt = select(ChatParticipant).where(
        ChatParticipant.cid == cid, ChatParticipant.uid == uid
    )
    participant = await db.execute(participant_stmt)
    if not participant.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a participant in this chat.",
        )

    messages_from_redis = await redis.lrange(f"chat:{cid}:recent", -100, -1)
    messages = [ChatItem.model_validate_json(msg) for msg in messages_from_redis]

    query = select(ChatMessage).where(
        ChatMessage.cid == cid,
        ChatMessage.message_date < messages[0].date,
    )

    # if before_mid:
    #     subquery = (
    #         select(ChatMessage.message_date)
    #         .where(ChatMessage.message_id == before_mid)
    #         .scalar_subquery()
    #     )
    #     query = query.where(
    #         ChatMessage.message_date < subquery,
    #     )

    query = query.order_by(desc(ChatMessage.message_date)).limit(limit)
    result = await db.execute(query)
    messages_from_db = list(result.scalars().all())
    messages = messages.extend(
        [
            ChatItem(
                mid=msg.message_id,
                cid=msg.cid,
                uid=msg.sender,
                message=msg.content,
                date=msg.message_date,
            )
            for msg in messages_from_db
        ]
    )

    if messages:
        return messages
    return []
