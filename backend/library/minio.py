from minio import Minio
from config import settings
from io import BytesIO
import asyncio

client = Minio(
    endpoint=settings.s3_endpoint,
    access_key=settings.s3_access_key,
    secret_key=settings.s3_secret_key,
    secure=False,
)


async def upload_to_minio(
    object_name: str, file_stream: BytesIO, file_length: int, content_type: str
):
    def _upload():
        found = client.bucket_exists(settings.s3_bucket)
        if not found:
            client.make_bucket(settings.s3_bucket)

        client.put_object(
            bucket_name=settings.s3_bucket,
            object_name=object_name,
            data=file_stream,
            length=file_length,
            content_type=content_type,
        )

    await asyncio.to_thread(_upload)


async def delete_from_minio(object_name: str):
    def _delete():
        client.remove_object(
            bucket_name=settings.s3_bucket,
            object_name=object_name,
        )

    await asyncio.to_thread(_delete)


async def get_from_minio(object_name: str):
    def _get():
        response = client.get_object(
            bucket_name=settings.s3_bucket, object_name=object_name
        )
        return response

    return await asyncio.to_thread(_get)
