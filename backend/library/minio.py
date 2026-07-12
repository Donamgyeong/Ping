from minio import Minio
from config import settings
from io import BytesIO

client = Minio(
    endpoint=settings.s3_endpoint,
    access_key=settings.s3_access_key,
    secret_key=settings.s3_secret_key,
    secure=False,
)


def upload_to_minio(object_name: str, data: bytes, content_type: str):
    found = client.bucket_exists(settings.s3_bucket)
    if not found:
        client.make_bucket(settings.s3_bucket)

    client.put_object(
        bucket_name=settings.s3_bucket,
        object_name=object_name,
        data=BytesIO(data),
        length=len(data),
        content_type=content_type,
    )


def delete_from_minio(object_name: str):
    client.remove_object(
        bucket_name=settings.s3_bucket,
        object_name=object_name,
    )


def get_from_minio(object_name: str):
    response = client.get_object(
        bucket_name=settings.s3_bucket, object_name=object_name
    )
    return response
