from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Header, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from library.model import Token, RefreshRequest
from sqlalchemy.ext.asyncio import AsyncSession
from library.db import get_db
from service.auth_service import validate_password, generate_tokens, validate_refresh_token
import logging
from service.user_service import get_user_by_email

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@router.post("/token")
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: AsyncSession = Depends(get_db),
) -> Token:
    try:
        user = await get_user_by_email(db, form_data.username)
        if not user:
            logging.warning(
                f"Login failed: User not found for email {form_data.username}"
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
            )

        if not await validate_password(user, form_data.password):
            logging.warning(f"Login failed: Incorrect password for user {user.email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
            )

        access_token, refresh_token = await generate_tokens(user.uid)
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
        )
    except HTTPException as e:
        await db.rollback()
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(
            f"An unexpected error occurred during login for {form_data.username}: {e}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )


@router.post("/refresh")
async def refresh(
    body: RefreshRequest | None = None,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
) -> Token:
    token_str: str | None = None

    if body and body.refresh_token:
        token_str = body.refresh_token
    elif authorization and authorization.startswith("Bearer "):
        token_str = authorization.split(" ")[1]

    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is required",
        )

    try:
        user = await validate_refresh_token(token_str, db)
        access_token, refresh_token = await generate_tokens(user.uid)
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
        )
    except HTTPException as e:
        await db.rollback()
        raise e
    except Exception as e:
        await db.rollback()
        logging.error(f"An error occurred during token refresh: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )
