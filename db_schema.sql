CREATE TABLE users (
    uid CHAR(36) PRIMARY KEY,
    email VARCHAR(50) NOT NULL UNIQUE,
    pwd VARCHAR(20) NOT NULL,
    birthdate DATE NOT NULL,
    salt CHAR(36) NOT NULL
);

CREATE INDEX idx_email ON users (email);

CREATE TABLE files (
    fid CHAR(36) PRIMARY KEY,
    uid CHAR(36) NOT NULL,
    filename VARCHAR(100) NOT NULL,
    original_filename VARCHAR(100) NOT NULL,
    upload_date TIMESTAMP NOT NULL,
    private BOOLEAN NOT NULL,
    FOREIGN KEY (uid) REFERENCES users (uid) ON DELETE CASCADE
);

CREATE TABLE profiles (
    uid CHAR(36) PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL,
    bio TEXT,
    profile_picture CHAR(36),
    FOREIGN KEY (uid) REFERENCES users (uid) ON DELETE CASCADE,
    FOREIGN KEY (profile_picture) REFERENCES files (fid) ON DELETE SET NULL
);

CREATE TABLE follow (
    follower_uid CHAR(36) NOT NULL,
    followee_uid CHAR(36) NOT NULL,
    PRIMARY KEY (follower_uid, followee_uid),
    FOREIGN KEY (follower_uid) REFERENCES users (uid) ON DELETE CASCADE,
    FOREIGN KEY (followee_uid) REFERENCES users (uid) ON DELETE CASCADE
);

CREATE TABLE feeds (
    feed_id CHAR(36) PRIMARY KEY,
    uid CHAR(36) NOT NULL,
    content TEXT NOT NULL,
    post_date TIMESTAMP NOT NULL,
    location POINT NOT NULL,
    private BOOLEAN NOT NULL,
    FOREIGN KEY (uid) REFERENCES users (uid) ON DELETE CASCADE
);

create index idx_uid on feeds (uid);

create index idx_location on feeds (location);

create index idx_post_date on feeds (post_date);

CREATE TABLE feed_image (
    feed_id CHAR(36) NOT NULL,
    image_id CHAR(36) NOT NULL,
    PRIMARY KEY (feed_id, image_id),
    FOREIGN KEY (feed_id) REFERENCES feeds (feed_id) ON DELETE CASCADE,
    FOREIGN KEY (image_id) REFERENCES files (fid) ON DELETE CASCADE
);

CREATE TABLE feed_responses (
    response_id CHAR(36) PRIMARY KEY,
    feed_id CHAR(36) NOT NULL,
    responder CHAR(36) NOT NULL,
    response CHAR(10) NOT NULL,
    FOREIGN KEY (feed_id) REFERENCES feeds (feed_id) ON DELETE CASCADE,
    FOREIGN KEY (responder) REFERENCES users (uid) ON DELETE CASCADE
);

create index idx_feed_id on feed_responses (feed_id);

CREATE TABLE comments (
    comment_id CHAR(36) PRIMARY KEY,
    feed_id CHAR(36) NOT NULL,
    writer CHAR(36) NOT NULL,
    content TEXT NOT NULL,
    comment_date TIMESTAMP NOT NULL,
    FOREIGN KEY (feed_id) REFERENCES feeds (feed_id) ON DELETE CASCADE,
    FOREIGN KEY (writer) REFERENCES users (uid) ON DELETE CASCADE
);

create index idx_comment_feed_id on comments (feed_id);

CREATE TABLE chat (
    cid CHAR(36) PRIMARY KEY,
    creator CHAR(36),
    title VARCHAR(50) NOT NULL,
    FOREIGN KEY (creator) REFERENCES users (uid) ON DELETE SET NULL
);

CREATE TABLE chat_participant (
    cid CHAR(36) NOT NULL,
    uid CHAR(36) NOT NULL,
    PRIMARY KEY (cid, uid),
    FOREIGN KEY (cid) REFERENCES chat (cid) ON DELETE CASCADE,
    FOREIGN KEY (uid) REFERENCES users (uid) ON DELETE CASCADE
);