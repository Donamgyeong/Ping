import redis.asyncio as redis
from config import settings

redis_client = redis.from_url(f"redis://{settings.redis_host}:{settings.redis_port}")


async def get_redis():
    yield redis_client
