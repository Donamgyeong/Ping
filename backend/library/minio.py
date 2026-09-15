import boto3
from botocore.config import Config
from config import settings
from typing import BinaryIO
from datetime import timedelta, datetime
import asyncio

client = boto3.client(
    "s3",
    aws_access_key_id=settings.s3_access_key,
    aws_secret_access_key=settings.s3_secret_key,
    region_name=settings.s3_region,
    config=Config(
        signature_version="s3v4",
        s3={"addressing_style": "virtual"},
    ),
)


async def minio_init():
    buckets = client.list_buckets()
    if not settings.s3_bucket in buckets:
        client.create_bucket(Bucket=settings.s3_bucket, ACL="public-read-write")
    if not settings.s3_cache_bucket in buckets:
        client.create_bucket(Bucket=settings.s3_cache_bucket, ACL="public-read-write")


async def upload_to_minio(
    bucket: str,
    object_name: str,
    file_stream: BinaryIO,
    file_length: int,
    content_type: str,
):
    def _upload():
        client.put_object(
            Bucket=bucket,
            Key=object_name,
            Body=file_stream,
            ContentLength=file_length,
            ContentType=content_type,
        )

    await asyncio.to_thread(_upload)


async def delete_from_minio(bucket: str, object_name: str):
    def _delete():
        client.delete_object(Bucket=bucket, Key=object_name)

    await asyncio.to_thread(_delete)


async def get_from_minio(bucket: str, object_name: str):
    def _get():
        response = client.get_object(Bucket=bucket, Key=object_name)
        return response.get("Body")

    return await asyncio.to_thread(_get)


async def get_upload_url_from_minio(
    bucket: str, object_name: str
) -> tuple[str, datetime]:
    def _get():
        return (
            client.generate_presigned_url(
                ClientMethod="put_object",
                Params={"Bucket": bucket, "Key": object_name},
                ExpiresIn=settings.file_url_expire_time,
                HttpMethod="PUT",
            ),
            datetime.now() + timedelta(seconds=settings.file_url_expire_time),
        )

    return await asyncio.to_thread(_get)


async def get_download_url_from_minio(
    bucket: str, object_name: str
) -> tuple[str, datetime]:
    # def _get():
    #     return (
    #         client.generate_presigned_url(
    #             ClientMethod="get_object",
    #             Params={"Bucket": bucket, "Key": object_name},
    #             ExpiresIn=settings.file_url_expire_time,
    #             HttpMethod="GET",
    #         ),
    #         datetime.now() + timedelta(seconds=settings.file_url_expire_time),
    #     )

    # return await asyncio.to_thread(_get)
    if bucket == settings.s3_cache_bucket:
        return (
            f"{settings.cloudfront_url_cache}/{object_name}",
            datetime.now() + timedelta(seconds=settings.file_url_expire_time),
        )
    else:
        return (
            f"{settings.cloudfront_url_image}/{object_name}",
            datetime.now() + timedelta(seconds=settings.file_url_expire_time),
        )


async def get_file_info(bucket: str, object_name: str) -> tuple[str, int] | None:
    def _info():
        try:
            res = client.head_object(Bucket=bucket, Key=object_name)
            if not res:
                return None
            return res.get("ContentType"), res.get("ContentLength")
        except Exception:
            return None

    return await asyncio.to_thread(_info)


async def find_from_minio(bucket: str, object_name: str) -> bool:
    def _find():
        try:
            client.stat_object(bucket, object_name)
            return True
        except Exception:
            return False

    return await asyncio.to_thread(_find)


async def get_file_list_from_minio(bucket: str) -> list[str]:
    def _get():
        result = list[str]()
        try:
            objects = client.list_objects(Bucket=bucket)
            for o in objects:
                if o.object_name:
                    result.append(o.object_name)
            return result
        except Exception:
            return result

    return await asyncio.to_thread(_get)
