from minio import Minio, S3Error
from minio.datatypes import Object
from config import settings
from typing import BinaryIO
from datetime import timedelta, datetime
import asyncio

client = Minio(
    endpoint=settings.s3_endpoint,
    region=settings.s3_region,
    access_key=settings.s3_access_key,
    secret_key=settings.s3_secret_key,
    secure=True,
)


async def minio_init():
    if not client.bucket_exists(settings.s3_bucket):
        client.make_bucket(settings.s3_bucket)
    if not client.bucket_exists(settings.s3_cache_bucket):
        client.make_bucket(settings.s3_cache_bucket)
    if not client.bucket_exists(settings.s3_geo_bucket):
        client.make_bucket(settings.s3_geo_bucket)


async def upload_to_minio(
    bucket: str,
    object_name: str,
    file_stream: BinaryIO,
    file_length: int,
    content_type: str,
):
    def _upload():
        client.put_object(
            bucket_name=bucket,
            object_name=object_name,
            data=file_stream,
            length=file_length,
            content_type=content_type,
        )

    await asyncio.to_thread(_upload)


async def delete_from_minio(bucket: str, object_name: str):
    def _delete():
        client.remove_object(
            bucket_name=bucket,
            object_name=object_name,
        )

    await asyncio.to_thread(_delete)


async def get_from_minio(bucket: str, object_name: str):
    def _get():
        response = client.get_object(bucket_name=bucket, object_name=object_name)
        return response

    return await asyncio.to_thread(_get)


async def get_upload_url_from_minio(
    bucket: str, object_name: str
) -> tuple[str, datetime]:
    def _get():
        return (
            client.presigned_put_object(
                bucket_name=bucket,
                object_name=object_name,
                expires=timedelta(seconds=settings.file_url_expire_time),
            ).replace(
                f"http://{settings.s3_endpoint}",
                f"https://{settings.external_host}:9000",
            ),
            datetime.now() + timedelta(seconds=settings.file_url_expire_time),
        )

    return await asyncio.to_thread(_get)


async def get_download_url_from_minio(
    bucket: str, object_name: str
) -> tuple[str, datetime]:
    def _get():
        return (
            client.presigned_get_object(
                bucket_name=bucket,
                object_name=object_name,
                expires=timedelta(seconds=settings.file_url_expire_time),
            ).replace(
                f"http://{settings.s3_endpoint}",
                f"https://{settings.external_host}:9000",
            ),
            datetime.now() + timedelta(seconds=settings.file_url_expire_time),
        )

    return await asyncio.to_thread(_get)


async def get_file_info(bucket: str, object_name: str) -> tuple[str, int] | None:
    def _info():
        try:
            object = client.stat_object(bucket, object_name)
            if not object.content_type or not object.size:
                return None
            return object.content_type, object.size
        except S3Error:
            return None

    return await asyncio.to_thread(_info)


async def find_from_minio(bucket: str, object_name: str) -> bool:
    def _find():
        try:
            client.stat_object(bucket, object_name)
            return True
        except S3Error:
            return False

    return await asyncio.to_thread(_find)


async def get_file_list_from_minio(bucket: str) -> list[str]:
    def _get():
        result = list[str]()
        try:
            objects = client.list_objects(bucket_name=bucket)
            for o in objects:
                if o.object_name:
                    result.append(o.object_name)
            return result
        except S3Error:
            return result

    return await asyncio.to_thread(_get)
