from sqlalchemy import delete, update, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from library.schema import *
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
