from fastapi import FastAPI
from router.user import router as user_router
from router.feed import router as feed_router
from router.chat import router as chat_router
from router.file import router as file_router
from router.auth import router as auth_router

app = FastAPI()

app.include_router(user_router)
app.include_router(feed_router)
app.include_router(chat_router)
app.include_router(file_router)
app.include_router(auth_router)