import redis.asyncio as redis
from config import settings

redis_client = redis.Redis(
    host=settings.redis_host, port=settings.redis_port, password=settings.redis_pass
)


async def get_redis():
    yield redis_client
