import redis.asyncio as redis
from config import settings

pool = redis.ConnectionPool(
    host=settings.redis_host,
    port=settings.redis_port,
    ssl=True
    max_connections=100,
    decode_responses=True,
)

redis_client = redis.Redis(
    connection_pool=pool,
)


async def get_redis():
    yield redis_client
