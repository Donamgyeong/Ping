from pydantic import BaseModel

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
    fid: str
    uid: str
    post_date: str