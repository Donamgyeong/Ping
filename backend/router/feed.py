from typing import Annotated
from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordBearer
from library.feed import FeedBase, FeedCreate, FeedUpdate, FeedItem

router = APIRouter(
    prefix="/feed",
    tags=["feed"]
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

@router.post("/new")
async def new_feed(token: Annotated[str, Depends(oauth2_scheme)], feed: FeedCreate):
    return {"result": "success", "fid": "feed"}


@router.post("/update")
async def update_feed(token: Annotated[str, Depends(oauth2_scheme)], feed: FeedUpdate):
    return {"result": "success"}


@router.post("/delete")
async def delete_feed(token: Annotated[str, Depends(oauth2_scheme)], fid: str):
    return {"result": "success"}


@router.get("/get/location")
async def get_feed_by_location(token: Annotated[str, Depends(oauth2_scheme)], lat: float, lon: float, radius: float):
    return {"result": "success", "feeds": []}


@router.get("/get/user/{uid}")
async def get_feed_by_user(token: Annotated[str, Depends(oauth2_scheme)], uid: str):
    return {"result": "success", "feeds": []}


@router.get("/get/{fid}")
async def get_feed(token: Annotated[str, Depends(oauth2_scheme)], fid: str):
    return {"result": "success", "feed": {}}


@router.get("/get/following")
async def get_following_feeds(token: Annotated[str, Depends(oauth2_scheme)]):
    return {"result": "success", "feeds": []}