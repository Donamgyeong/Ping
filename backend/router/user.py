from typing import Annotated
from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from datetime import date

router = APIRouter(
    prefix="/user",
    tags=["user"]
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@router.post("/join")
async def join(email: str, pwd: str, nickname: str, birthdate: date):
    return {"result": "success"}


@router.post("/delete")
async def delete(token: Annotated[str, Depends(oauth2_scheme)], email: str, pwd: str):
    return {"result": "success"}


@router.post("/update/email")
async def update_email(token: Annotated[str, Depends(oauth2_scheme)], email: str):
    return {"result": "success"}


@router.post("/update/password")
async def update_password(token: Annotated[str, Depends(oauth2_scheme)], prev_pwd: str, new_pwd: str):
    return {"result": "success"}


@router.post("/update/nickname")
async def update_nickname(token: Annotated[str, Depends(oauth2_scheme)], nickname: str):
    return {"result": "success"}


@router.get("/check/email")
async def check_email(email: str):
    return {"result": "success"}


@router.post("/follow/request")
async def follow_request(token: Annotated[str, Depends(oauth2_scheme)], follow_uid: str):
    return {"result": "success"}


@router.post("/follow/accept")
async def follow_accept(token: Annotated[str, Depends(oauth2_scheme)], request_uid: str):
    return {"result": "success"}