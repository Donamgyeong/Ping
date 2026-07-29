from sqlalchemy import MetaData
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from config import settings
import logging

DB_URL = (
    "postgresql+psycopg://"
    + settings.db_user
    + ":"
    + settings.db_password
    + "@"
    + settings.db_host
    + ":"
    + settings.db_port
    + "/"
    + settings.db_name
)

logging.basicConfig()
logging.getLogger("sqlalchemy.engine").setLevel(logging.ERROR)
logging.getLogger("sqlalchemy.dialects").setLevel(logging.ERROR)
logging.getLogger("sqlalchemy.pool").setLevel(logging.ERROR)
logging.getLogger("sqlalchemy.orm").setLevel(logging.ERROR)

engine = create_async_engine(DB_URL, echo=False, plugins=["geoalchemy2"])
async_session = async_sessionmaker(engine, autoflush=True, autocommit=False)


async def get_db():
    async with async_session() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
