import redis.asyncio as redis
from fastapi import HTTPException, status
import logging
from config import settings

pool = redis.ConnectionPool(
    host=settings.redis_host,
    port=settings.redis_port,
    max_connections=50,
    decode_responses=True,
)

redis_client = redis.Redis(
    connection_pool=pool,
)


async def get_redis():
    try:
        yield redis_client
    except Exception as e:
        logging.error(f"Error occurred while getting Redis client: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Redis connection error",
        )
    finally:
        await redis_client.close()
