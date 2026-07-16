from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator


class Settings(BaseSettings):
    db_user: str = Field(..., validation_alias="DB_USER")
    db_password: str = Field(..., validation_alias="DB_PASSWORD")
    db_name: str = Field(..., validation_alias="DB_NAME")
    db_host: str = Field(..., validation_alias="DB_HOST")
    db_host_test: str = Field(..., validation_alias="DB_HOST_TEST")
    db_port: str = Field(..., validation_alias="DB_PORT")
    s3_endpoint: str = Field(..., validation_alias="S3_ENDPOINT")
    s3_access_key: str = Field(..., validation_alias="S3_ACCESS_KEY")
    s3_secret_key: str = Field(..., validation_alias="S3_SECRET_KEY")
    s3_bucket: str = Field(..., validation_alias="S3_BUCKET")
    redis_host: str = Field(..., validation_alias="REDIS_HOST")
    redis_port: int = Field(..., validation_alias="REDIS_PORT")
    secret_key: str = Field(..., validation_alias="SECRET_KEY")
    expire_time: int = Field(..., validation_alias="EXPIRE_TIME")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
