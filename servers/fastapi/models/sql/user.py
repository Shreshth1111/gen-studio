from sqlmodel import SQLModel, Field, Column
from sqlalchemy import Text
from datetime import datetime
from uuid import UUID, uuid4
from typing import Optional


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    username: str = Field(unique=True, index=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = Field(default=None)

    # ── Roles & status ────────────────────────────────────────────────────
    is_active: bool = True
    is_admin: bool = Field(default=False)
    is_verified: bool = Field(default=False)          # email verified
    last_login_at: Optional[datetime] = Field(default=None)
    deleted_at: Optional[datetime] = Field(default=None, index=True)  # soft delete

    # ── Profile ───────────────────────────────────────────────────────────
    full_name: Optional[str] = Field(default=None)

    # ── Plan / quota (for scaling & monetisation) ─────────────────────────
    plan: str = Field(default="free")                 # free | pro | enterprise
    credits: int = Field(default=100)                 # remaining generation credits

    # ── Admin oversight ───────────────────────────────────────────────────
    admin_notes: Optional[str] = Field(default=None, sa_column=Column(Text))

    # ── Cross-platform identity ───────────────────────────────────────────
    # Set when user logs in via Shoolini SSO. Matches voicedeck_user_id on SageStudio.
    shoolini_username: Optional[str] = Field(default=None, index=True)
