from typing import Annotated
from fastapi import APIRouter, Depends, WebSocket
from fastapi.security import OAuth2PasswordBearer

router = APIRouter(
    prefix="/chat",
    tags=["chat"]
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

@router.post("/new")
async def new_chat(token: Annotated[str, Depends(oauth2_scheme)], title: str, participants: list[str]):
    return {"result": "success", "cid": "chat"}


@router.post("/delete")
async def delete_chat(token: Annotated[str, Depends(oauth2_scheme)], cid: str):
    return {"result": "success"}


@router.post("/invite")
async def invite_to_chat(token: Annotated[str, Depends(oauth2_scheme)], cid: str, uid: str):
    return {"result": "success"}


@router.get("/get/")
async def get_chat(token: Annotated[str, Depends(oauth2_scheme)], revision: str):
    return {"result": "success", "chat": {}}


@router.websocket("/get")
async def websocket_endpoint(websocket: WebSocket, token: Annotated[str, Depends(oauth2_scheme)]):
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        await websocket.send_text(f"Message text was: {data}")