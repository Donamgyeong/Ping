from typing import Annotated
from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordBearer

router = APIRouter(
    prefix="/file",
    tags=["files"]
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@router.post("/upload")
async def upload_file(token: Annotated[str, Depends(oauth2_scheme)], file: bytes, filename: str, private: bool):
    return {"result": "success", "fid": "file"}


@router.post("/delete")
async def delete_file(token: Annotated[str, Depends(oauth2_scheme)], fid: str):
    return {"result": "success"}


@router.get("/get")
async def get_file(token: Annotated[str, Depends(oauth2_scheme)], fid: str):
    return {"result": "success", "file": b""}