from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from uuid import UUID
import os
import jwt
import httpx
import re
from passlib.context import CryptContext

from fastapi import Request

from database import get_session, AsyncSessionLocal
from models.sql.user import User
from services.activity import log_activity, setting_is_true

router = APIRouter()

SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-change-in-production-please")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 7

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


class Token(BaseModel):
    access_token: str
    token_type: str


class UserOut(BaseModel):
    id: UUID
    username: str
    email: str
    is_active: bool
    is_admin: bool = False


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class ShooliniLoginRequest(BaseModel):
    username: str
    password: str


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise credentials_exception

    result = await session.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalars().first()
    if user is None:
        raise credentials_exception
    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency guard: only allow users with the admin role through."""
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


async def ensure_admin_user():
    """Bootstrap a default admin account from env vars if no users exist yet."""
    username = os.getenv("AUTH_USERNAME", "admin")
    password = os.getenv("AUTH_PASSWORD", "changeme123")
    email = os.getenv("AUTH_EMAIL", f"{username}@example.com")
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.username == username))
        existing = result.scalars().first()
        if not existing:
            user = User(
                username=username,
                email=email,
                hashed_password=get_password_hash(password),
                is_admin=True,
            )
            session.add(user)
            await session.commit()
        elif not existing.is_admin:
            # Keep the bootstrap account privileged across restarts.
            existing.is_admin = True
            session.add(existing)
            await session.commit()


@router.post("/register", response_model=UserOut)
async def register(
    body: RegisterRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    # Admin-controlled signup switch (app_settings.signups_enabled)
    if not await setting_is_true(session, "signups_enabled", True):
        raise HTTPException(status_code=403, detail="Registrations are currently disabled")
    # Check email uniqueness
    res = await session.execute(select(User).where(User.email == body.email))
    if res.scalars().first():
        raise HTTPException(status_code=409, detail="Email already registered")
    # Check username uniqueness
    res = await session.execute(select(User).where(User.username == body.username))
    if res.scalars().first():
        raise HTTPException(status_code=409, detail="Username already taken")
    if len(body.password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=get_password_hash(body.password),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    await log_activity(session, action="user.register", user_id=user.id,
                       username=user.username, entity_type="user", entity_id=str(user.id),
                       ip_address=request.client.host if request.client else None)
    return UserOut(id=user.id, username=user.username, email=user.email, is_active=user.is_active)


@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_session)
):
    await ensure_admin_user()
    # Accept either email or username in the OAuth2 `username` field
    identifier = form_data.username.strip().lower()
    if "@" in identifier:
        result = await session.execute(select(User).where(User.email == identifier))
    else:
        result = await session.execute(select(User).where(User.username == identifier))
    user = result.scalars().first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This account has been deactivated")
    # Maintenance mode: only admins may sign in while it's on
    if not user.is_admin and await setting_is_true(session, "maintenance_mode", False):
        raise HTTPException(status_code=503, detail="The platform is under maintenance. Please try again later.")
    user.last_login_at = datetime.utcnow()
    session.add(user)
    await session.commit()
    await log_activity(session, action="user.login", user_id=user.id, username=user.username,
                       ip_address=request.client.host if request.client else None)
    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        is_active=current_user.is_active,
        is_admin=current_user.is_admin,
    )


@router.post("/logout")
async def logout():
    return {"message": "Logged out successfully"}

# Shoolini University SSO and SageStudio SSO endpoints have been removed.
# This app now uses standard email/password login only.
