from pydantic import BaseModel, ConfigDict
from datetime import datetime, date


class FeedID(BaseModel):
    fid: str
    uid: str
    post_date: datetime


class Location(BaseModel):
    long: float
    lat: float


class FeedBase(BaseModel):
    content: str
    location: Location
    images: list[str]
    private: bool


class FeedCreate(FeedBase):
    pass


class FeedUpdate(FeedBase):
    fid: str


class FeedItem(FeedBase):
    model_config = ConfigDict(from_attributes=True)
    fid: str
    uid: str
    post_date: datetime


class Token(BaseModel):
    access_token: str
    token_type: str


class ResponseBase(BaseModel):
    result: str


class ResponseFeed(ResponseBase):
    feed: FeedItem
    images: list[str]


class ResponseFeedID(ResponseBase):
    feedid: list[FeedID]


class ResponseID(ResponseBase):
    id: str


class ResponseFile(ResponseBase):
    file: bytes


class ResponseFIDS(ResponseBase):
    fids: list[str]


class ChatItem(BaseModel):
    cid: str
    uid: str
    message: str
    date: str


class ChatNew(BaseModel):
    title: str
    participants: list[str]


class ResponseChat(ResponseBase):
    chat: list[ChatItem]


class UserBase(BaseModel):
    email: str
    pwd: str


class UserInfo(UserBase):
    email: str
    pwd: str
    nickname: str
    birthdate: date
