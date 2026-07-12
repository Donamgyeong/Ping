from typing import List, Optional
from sqlalchemy.orm import Mapped, mapped_column, DeclarativeBase, relationship
from sqlalchemy import ForeignKey, String, Date, DateTime, Boolean, Text, Index
from geoalchemy2 import Geometry
from datetime import date, datetime


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    uid: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    pwd: Mapped[str] = mapped_column(String(20), nullable=False)
    birthdate: Mapped[date] = mapped_column(Date, nullable=False)
    salt: Mapped[str] = mapped_column(String(36), nullable=False)

    __table_args__ = (Index("idx_email", "email"),)

    profile: Mapped[Optional["Profile"]] = relationship(
        "Profile", back_populates="user", cascade="all, delete-orphan"
    )
    files: Mapped[List["File"]] = relationship(
        "File", back_populates="user", cascade="all, delete-orphan"
    )
    feeds: Mapped[List["Feed"]] = relationship(
        "Feed", back_populates="user", cascade="all, delete-orphan"
    )


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

    user: Mapped["User"] = relationship("User", back_populates="files")


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

    user: Mapped["User"] = relationship("User", back_populates="profile")


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
    location: Mapped[Geometry] = mapped_column(Geometry("POINT"), nullable=False)
    private: Mapped[bool] = mapped_column(Boolean, nullable=False)

    __table_args__ = (
        Index("idx_uid", "uid"),
        Index("idx_location", "location"),
        Index("idx_post_date", "post_date"),
    )

    user: Mapped["User"] = relationship("User", back_populates="feeds")
    responses: Mapped[List["FeedResponse"]] = relationship(
        "FeedResponse", back_populates="feed", cascade="all, delete-orphan"
    )
    comments: Mapped[List["Comment"]] = relationship(
        "Comment", back_populates="feed", cascade="all, delete-orphan"
    )


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

    feed: Mapped["Feed"] = relationship("Feed", back_populates="responses")


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

    feed: Mapped["Feed"] = relationship("Feed", back_populates="comments")


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
