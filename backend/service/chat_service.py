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
    db: AsyncSession,
    redis: Redis,
    cid: str,
    uid: str,
    content: str,
    message_date: datetime,
) -> int:
    idx = await redis.incr("chat:" + cid, 1)
    new_message = ChatMessage(
        cid=cid, message_idx=idx, sender=uid, content=content, message_date=message_date
    )

    db.add(new_message)

    return idx


async def get_chat_history(
    db: AsyncSession,
    redis: Redis,
    cid: str,
    uid: str,
    last_idx: int,
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

    count = await redis.get("chat:" + cid)
    if not count or int(count) == last_idx:
        return []
    elif int(count) < last_idx:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="INTERNAL SERVER ERROR",
        )

    data_from_redis = await redis.lrange(f"chat:{cid}:recent", -50, -1)
    messages_from_redis = [ChatItem.model_validate_json(msg) for msg in data_from_redis]

    query_idx = 0
    if len(messages_from_redis) != 0 and messages_from_redis[0].idx == last_idx:
        return messages_from_redis
    elif len(messages_from_redis) != 0:
        query_idx = messages_from_redis[0].idx

    stmt = (
        select(ChatMessage)
        .where(
            ChatMessage.message_idx > last_idx,
            ChatMessage.message_idx < query_idx,
            ChatMessage.cid == cid,
        )
        .order_by(ChatMessage.message_idx)
    )

    if query_idx == 0:
        stmt = (
            select(ChatMessage)
            .where(
                ChatMessage.message_idx > last_idx,
                ChatMessage.cid == cid,
            )
            .order_by(ChatMessage.message_idx)
        )

    result = await db.execute(stmt)
    data_from_db = list(result.scalars().all())
    messages = [
        ChatItem(
            idx=msg.message_idx,
            cid=msg.cid,
            uid=msg.sender,
            message=msg.content,
            date=msg.message_date,
        )
        for msg in data_from_db
    ]
    messages.extend(messages_from_redis)

    if messages:
        return messages
    return []
