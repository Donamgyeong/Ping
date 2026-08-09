from pydantic import BaseModel, ConfigDict
from datetime import datetime, date


class Noti(BaseModel):
    noti_id: str
    type: str
    receiver: str
    content: str
    link: str
    date: datetime

    model_config = ConfigDict(from_attributes=True)


class Location(BaseModel):
    lat: float
    long: float


class BBox(BaseModel):
    SW: Location
    NE: Location


class FeedCountInfo(BaseModel):
    count: int
    location: Location


class FeedID(BaseModel):
    fid: str
    uid: str
    post_date: datetime


class FeedLocation(FeedID):
    location: Location


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
    refresh_token: str | None = None
    token_type: str


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class ResponseBase(BaseModel):
    result: str


class ResponseDetail(ResponseBase):
    detail: str


class ResponseFeed(ResponseBase):
    feed: FeedItem


class ResponseFeedID(ResponseBase):
    feedid: list[FeedID]


class ResponseFeedLocation(ResponseBase):
    feeds: list[FeedLocation]


class ResponseFeedCount(ResponseBase):
    count: list[FeedCountInfo]


class ResponseID(ResponseBase):
    id: str


class ResponseFile(ResponseBase):
    file: bytes


class ResponseIDS(ResponseBase):
    ids: list[str]


class ChatItem(BaseModel):
    mid: str
    cid: str
    uid: str
    message: str
    date: datetime


class ChatNew(BaseModel):
    title: str
    participants: list[str]


class Chatroom(BaseModel):
    cid: str
    title: str


class ResponseChat(ResponseBase):
    chat: list[ChatItem]


class ResponseChatroom(ResponseBase):
    chatrooms: list[Chatroom]


class ResponseProfile(ResponseBase):
    uid: str
    nickname: str
    bio: str | None
    profile_picture: str | None
    private: bool


class UserBase(BaseModel):
    email: str
    pwd: str


class UserInfo(UserBase):
    email: str
    pwd: str
    nickname: str
    birthdate: date


class FollowerInfo(BaseModel):
    uid: str
    nickname: str


class ResponseFollowing(ResponseBase):
    following: list[FollowerInfo]


class CommentCreate(BaseModel):
    feed_id: str
    content: str


class CommentItem(BaseModel):
    comment_id: str
    feed_id: str
    writer: str
    writer_nickname: str | None = None
    content: str
    comment_date: datetime


class ResponseCommentList(ResponseBase):
    comments: list[CommentItem]


class ResponseAddress(ResponseBase):
    sido_nm: str
    sigungu_nm: str
    emd_nm: str


class SidoItem(BaseModel):
    sido_cd: str
    sido_nm: str


class SigunguItem(BaseModel):
    sigungu_cd: str
    sgg_nm: str


class EmdItem(BaseModel):
    emd_cd: str
    emd_nm: str


class ResponseSidoList(ResponseBase):
    items: list[SidoItem]


class ResponseSigunguList(ResponseBase):
    items: list[SigunguItem]


class ResponseEmdList(ResponseBase):
    items: list[EmdItem]


class ResponseCentroid(ResponseBase):
    lat: float
    lng: float


class ResponseNotification(ResponseBase):
    notifications: list[Noti]


class ResponseCnt(ResponseBase):
    cnt: int


class ResponseFileURL(ResponseBase):
    url: str
    valid_until: datetime
