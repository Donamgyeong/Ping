from pydantic import BaseModel, ConfigDict
from datetime import datetime, date


class FeedID(BaseModel):
    fid: str
    uid: str
    post_date: datetime


class FeedBase(BaseModel):
    content: str
    location: list[str]
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
    feeds: list[FeedItem]


class ResponseFeedID(ResponseBase):
    feedid: list[FeedID]


class ResponseID(ResponseBase):
    id: str


class ResponseFile(ResponseBase):
    file: bytes


class ChatItem(BaseModel):
    cid: str
    uid: str
    message: str
    date: str


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
