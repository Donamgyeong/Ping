from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from router.user import router as user_router
from router.feed import router as feed_router
from router.chat import router as chat_router
from router.file import router as file_router
from router.auth import router as auth_router

from router.notification import router as notification_router
from router.comment import router as comment_router
from config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    from library.minio import minio_init

    await minio_init()

    yield


app = FastAPI(lifespan=lifespan)

origins = [
    "https://localhost",
    "http://localhost",
    "http://localhost:8002",
    "https://localhost:8002",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(user_router)
app.include_router(feed_router)
app.include_router(chat_router)
app.include_router(file_router)
app.include_router(auth_router)
app.include_router(comment_router)
app.include_router(notification_router)
