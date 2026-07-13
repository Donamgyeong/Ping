from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from library.model import Token, ResponseBase
from sqlalchemy.ext.asyncio import AsyncSession
from library.db import get_db
from service.auth_service import validate_password, generate_token
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

        token = await generate_token(user.uid)
        return Token(access_token=token, token_type="bearer")
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
