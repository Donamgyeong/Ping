from typing import List, Optional
from sqlalchemy.orm import Mapped, mapped_column, DeclarativeBase, relationship
from sqlalchemy import ForeignKey, String, Date, DateTime, Boolean, Text, Index
from geoalchemy2 import Geometry, WKBElement
from geoalchemy2.shape import from_shape, to_shape
from datetime import date, datetime


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    uid: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    pwd: Mapped[str] = mapped_column(String(255), nullable=False)
    birthdate: Mapped[date] = mapped_column(Date, nullable=False)
    salt: Mapped[str] = mapped_column(String(36), nullable=False)

    __table_args__ = (Index("idx_email", "email"),)


class File(Base):
    __tablename__ = "files"

    fid: Mapped[str] = mapped_column(String(36), primary_key=True)
    uid: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.uid", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(100), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(100), nullable=False)
    upload_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    private: Mapped[bool] = mapped_column(Boolean, nullable=False)


class Profile(Base):
    __tablename__ = "profiles"

    uid: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.uid", ondelete="CASCADE"), primary_key=True
    )
    nickname: Mapped[str] = mapped_column(String(50), nullable=False)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    profile_picture: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("files.fid", ondelete="SET NULL"), nullable=True
    )
    private: Mapped[bool] = mapped_column(Boolean, nullable=False)


class Follow(Base):
    __tablename__ = "follow"

    follower_uid: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.uid", ondelete="CASCADE"), primary_key=True
    )
    followee_uid: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.uid", ondelete="CASCADE"), primary_key=True
    )


class Feed(Base):
    __tablename__ = "feeds"

    feed_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    uid: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.uid", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    post_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    location: Mapped[Geometry] = mapped_column(
        Geometry("POINT", srid=4326), nullable=False
    )
    private: Mapped[bool] = mapped_column(Boolean, nullable=False)

    __table_args__ = (
        Index("idx_uid", "uid"),
        Index("idx_location", "location"),
        Index("idx_post_date", "post_date"),
    )

    def as_dict(self):
        result = {}
        for c in self.__table__.columns:
            if isinstance(getattr(self, c.name), WKBElement):
                point = to_shape(getattr(self, c.name)).point_on_surface()
                result[c.name] = {"lng": point.x, "lat": point.y}
            else:
                result[c.name] = getattr(self, c.name)
        return result


class FeedImage(Base):
    __tablename__ = "feed_image"

    feed_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("feeds.feed_id", ondelete="CASCADE"), primary_key=True
    )
    image_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("files.fid", ondelete="CASCADE"), primary_key=True
    )


class FeedResponse(Base):
    __tablename__ = "feed_responses"

    response_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    feed_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("feeds.feed_id", ondelete="CASCADE"), nullable=False
    )
    responder: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.uid", ondelete="CASCADE"), nullable=False
    )
    response: Mapped[str] = mapped_column(String(10), nullable=False)

    __table_args__ = (Index("idx_feed_id", "feed_id"),)


class Comment(Base):
    __tablename__ = "comments"

    comment_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    feed_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("feeds.feed_id", ondelete="CASCADE"), nullable=False
    )
    writer: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.uid", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    comment_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    __table_args__ = (Index("idx_comment_feed_id", "feed_id"),)


class Chat(Base):
    __tablename__ = "chat"

    cid: Mapped[str] = mapped_column(String(36), primary_key=True)
    creator: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.uid", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(50), nullable=False)


class ChatParticipant(Base):
    __tablename__ = "chat_participant"

    cid: Mapped[str] = mapped_column(
        String(36), ForeignKey("chat.cid", ondelete="CASCADE"), primary_key=True
    )
    uid: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.uid", ondelete="CASCADE"), primary_key=True
    )


class ChatMessage(Base):
    __tablename__ = "chat_message"
    message_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    cid: Mapped[str] = mapped_column(
        String(36), ForeignKey("chat.cid", ondelete="CASCADE"), nullable=False
    )
    sender: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.uid", ondelete="CASCADE"), nullable=False
    )
    content: Mapped[str] = mapped_column(Text)
    message_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class EMD_Boundaries(Base):
    __tablename__ = "emd_boundaries"

    emd_cd: Mapped[str] = mapped_column(String(10), primary_key=True)
    emd_nm: Mapped[str] = mapped_column(String(100), nullable=False)
    geom: Mapped[Geometry] = mapped_column(Geometry("MULTIPOLYGON", srid=4326))


class SIDO(Base):
    __tablename__ = "sido"

    sido_cd: Mapped[str] = mapped_column(String(2), primary_key=True)
    sido_nm: Mapped[str] = mapped_column(String(100), nullable=False)


class SIGUNGU(Base):
    __tablename__ = "sigungu"

    sigungu_cd: Mapped[str] = mapped_column(String(5), primary_key=True)
    sigungu_nm: Mapped[str] = mapped_column(String(100), nullable=False)
