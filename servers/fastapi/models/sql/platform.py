"""
═══════════════════════════════════════════════════════════════════════════════
 platform.py — PLATFORM-LEVEL TABLES (admin control + scale)
═══════════════════════════════════════════════════════════════════════════════
  • ActivityLog       — audit trail of every meaningful action (admin oversight)
  • AppSetting        — global key/value settings the admin can change at runtime
  • StudioGeneration  — persisted Studio outputs (images / notes / quizzes) so
                        they have history and are visible/auditable by admins
═══════════════════════════════════════════════════════════════════════════════
"""
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import Text
from datetime import datetime
from uuid import UUID, uuid4
from typing import Optional


class ActivityLog(SQLModel, table=True):
    __tablename__ = "activity_logs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: Optional[UUID] = Field(default=None, index=True)   # null for anonymous/system
    username: Optional[str] = Field(default=None)               # denormalised for fast display
    action: str = Field(index=True)                             # e.g. "login", "deck.create"
    entity_type: Optional[str] = Field(default=None)            # "presentation" | "user" | ...
    entity_id: Optional[str] = Field(default=None)
    detail: Optional[str] = Field(default=None, sa_column=Column(Text))
    ip_address: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class AppSetting(SQLModel, table=True):
    __tablename__ = "app_settings"

    key: str = Field(primary_key=True)                          # e.g. "signups_enabled"
    value: str = Field(sa_column=Column(Text))                  # stored as string/JSON
    description: Optional[str] = Field(default=None)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[str] = Field(default=None)


class GenerationLog(SQLModel, table=True):
    """The universal record of EVERY AI generation a user triggers — so any
    prompt or output can be retrieved later, and admins can browse what each
    user has generated.

    kind values:
      deck          — a presentation was created (prompt = topic)
      slide_regen   — a single slide was regenerated (prompt = instruction)
      slide_image   — a slide's image was (re)generated (prompt = image prompt)
      voiceover     — a slide voiceover script (prompt = instruction)
      quiz / notes / image — Studio tools
    """
    __tablename__ = "generation_logs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(index=True)
    username: Optional[str] = Field(default=None)               # denormalised
    kind: str = Field(index=True)
    presentation_id: Optional[UUID] = Field(default=None, index=True)
    slide_id: Optional[UUID] = Field(default=None, index=True)
    title: Optional[str] = Field(default=None)
    prompt: Optional[str] = Field(default=None, sa_column=Column(Text))   # the user's input
    params: Optional[str] = Field(default=None, sa_column=Column(Text))   # JSON extra params
    result: Optional[str] = Field(default=None, sa_column=Column(Text))   # JSON / text output
    model_used: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
