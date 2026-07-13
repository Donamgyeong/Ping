from sqlalchemy import delete, update, select
from sqlalchemy.ext.asyncio import AsyncSession
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
    pass


async def remove_participant(db: AsyncSession, participant: str, cid: str):
    pass
