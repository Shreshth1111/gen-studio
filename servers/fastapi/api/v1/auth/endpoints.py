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

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
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


# ── Shoolini University SSO ───────────────────────────────────────────────────

SHOOLINI_AUTH_URL = os.getenv(
    "SHOOLINI_AUTH_URL",
    "https://my.shooliniuniversity.com/api/rec_auth.php"
)
SHOOLINI_AUTH_TOKEN = os.getenv("SHOOLINI_AUTH_TOKEN", "")
SHARED_SSO_SECRET = os.getenv("SHARED_SSO_SECRET", "")


class SageStudioSSORequest(BaseModel):
    sso_token: str


@router.post("/sso-from-sagestudio", response_model=Token)
async def sso_from_sagestudio(
    body: SageStudioSSORequest,
    session: AsyncSession = Depends(get_session),
):
    """Accept a short-lived signed token from SageStudio and return an ArtifyAI JWT.

    SageStudio's Flask backend signs the token with SHARED_SSO_SECRET, passing
    the user's Shoolini identity. We validate the signature, find or create the
    local user, and return a standard Bearer token — same shape as /login.
    """
    if not SHARED_SSO_SECRET:
        raise HTTPException(503, "SageStudio SSO is not configured on this server")

    try:
        payload = jwt.decode(body.sso_token, SHARED_SSO_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "SSO token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid SSO token")

    shoolini_username = payload.get("shoolini_username")  # Shoolini text username
    shoolini_uid = payload.get("shoolini_uid")            # employee code

    if not shoolini_username and not shoolini_uid:
        raise HTTPException(400, "No user identity in SSO token")

    # Lookup by employee code (shoolini_username column stores the uid)
    result = await session.execute(
        select(User).where(User.shoolini_username == (shoolini_uid or shoolini_username))
    )
    user = result.scalars().first()

    if not user:
        # Also try by username (employee code stored there on some accounts)
        result = await session.execute(
            select(User).where(User.username == (shoolini_uid or shoolini_username))
        )
        user = result.scalars().first()

    if not user:
        # First time this SageStudio user opens Studio — auto-create ArtifyAI account
        uid = shoolini_uid or shoolini_username
        safe_email = f"{re.sub(r'[^a-zA-Z0-9]', '.', uid)}@shoolini.artify"
        existing = await session.execute(select(User).where(User.email == safe_email))
        if existing.scalars().first():
            safe_email = f"sagestudio.{uid}@artify.internal"

        user = User(
            username=uid,
            email=safe_email,
            hashed_password=get_password_hash(os.urandom(32).hex()),
            full_name=shoolini_username or uid,
            shoolini_username=shoolini_uid or shoolini_username,
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

    if not user.is_active:
        raise HTTPException(403, "This account has been deactivated")

    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/shoolini-login", response_model=Token)
async def shoolini_login(
    body: ShooliniLoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Login via Shoolini University SSO.

    Proxies credentials to the Shoolini auth API. On success, finds or
    auto-creates a local ArtifyAI account linked by shoolini_username so the
    same identity works on both ArtifyAI and SageStudio.
    """
    if not SHOOLINI_AUTH_TOKEN:
        raise HTTPException(503, "Shoolini SSO is not configured on this server")

    # ── 1. Verify with Shoolini ───────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                SHOOLINI_AUTH_URL,
                data={                      # form-encoded, NOT json — Shoolini requires this
                    "username": body.username,
                    "password": body.password,
                    "token": SHOOLINI_AUTH_TOKEN,
                },
            )
        shoolini_data = resp.json()
    except Exception as e:
        raise HTTPException(503, f"Could not reach Shoolini auth service: {e}")

    if not shoolini_data.get("success"):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail=shoolini_data.get("error", "Invalid Shoolini credentials"),
        )

    # Shoolini returns: user id (employee_code), role, username
    shoolini_uid = str(shoolini_data.get("user id") or shoolini_data.get("user_id") or "")
    shoolini_name = shoolini_data.get("username") or body.username
    if not shoolini_uid:
        raise HTTPException(502, "Shoolini returned success but no user id")

    # ── 2. Find or create local ArtifyAI user ────────────────────────────
    result = await session.execute(
        select(User).where(User.shoolini_username == shoolini_uid)
    )
    user = result.scalars().first()

    if not user:
        # First time this Shoolini user logs into ArtifyAI — auto-create account.
        # Username: shoolini id. Email: derived (no real email from Shoolini API).
        safe_email = f"{re.sub(r'[^a-zA-Z0-9]', '.', shoolini_uid)}@shoolini.artify"
        # Make sure the derived email isn't already taken by a non-shoolini account
        existing = await session.execute(select(User).where(User.email == safe_email))
        if existing.scalars().first():
            safe_email = f"shoolini.{shoolini_uid}@artify.internal"

        user = User(
            username=shoolini_uid,
            email=safe_email,
            hashed_password=get_password_hash(os.urandom(32).hex()),  # unusable pw
            full_name=shoolini_name,
            shoolini_username=shoolini_uid,
            is_active=True,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        await log_activity(
            session, action="user.shoolini_register",
            user_id=user.id, username=user.username,
            ip_address=request.client.host if request.client else None,
        )
    else:
        if not user.is_active:
            raise HTTPException(403, "This account has been deactivated")
        # Keep full_name in sync with Shoolini
        if shoolini_name and user.full_name != shoolini_name:
            user.full_name = shoolini_name
        user.last_login_at = datetime.utcnow()
        session.add(user)
        await session.commit()

    await log_activity(
        session, action="user.shoolini_login",
        user_id=user.id, username=user.username,
        ip_address=request.client.host if request.client else None,
    )

    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}
