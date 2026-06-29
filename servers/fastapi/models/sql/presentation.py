from sqlmodel import SQLModel, Field, Relationship, Column
from sqlalchemy import JSON, Text
from datetime import datetime
from uuid import UUID, uuid4
from typing import Optional, List, TYPE_CHECKING


class Presentation(SQLModel, table=True):
    __tablename__ = "presentations"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    title: str = Field(default="", sa_column=Column(Text))
    topic: str = Field(sa_column=Column(Text))
    theme: str = "light"
    language: str = Field(default="English", sa_column=Column(Text))
    tone: str = Field(default="professional", sa_column=Column(Text))
    audience: str = Field(default="", sa_column=Column(Text))
    content_density: str = "standard"
    slide_count: int = 8
    status: str = "draft"  # draft|generating|completed|failed
    source_document_path: Optional[str] = None
    pptx_path: Optional[str] = None
    pdf_path: Optional[str] = None
    json_path: Optional[str] = None
    outline_json: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    # ── Scale & admin control ─────────────────────────────────────────────
    deleted_at: Optional[datetime] = Field(default=None, index=True)  # soft delete
    is_public: bool = Field(default=False)            # shareable via link
    share_token: Optional[str] = Field(default=None, index=True)
    view_count: int = Field(default=0)
    last_opened_at: Optional[datetime] = Field(default=None)
    generation_error: Optional[str] = Field(default=None, sa_column=Column(Text))
    model_used: Optional[str] = Field(default=None)   # which LLM produced it

    slides: List["Slide"] = Relationship(back_populates="presentation")


class Slide(SQLModel, table=True):
    __tablename__ = "slides"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    presentation_id: UUID = Field(foreign_key="presentations.id", index=True)
    slide_number: int = 1
    layout_type: str = "bullets"
    title: Optional[str] = None
    content: Optional[str] = Field(default=None, sa_column=Column(Text))
    speaker_notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    image_prompt: Optional[str] = Field(default=None, sa_column=Column(Text))
    image_url: Optional[str] = Field(default=None, sa_column=Column(Text))
    generation_status: str = "pending"  # pending|generating|done|failed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    presentation: Optional[Presentation] = Relationship(back_populates="slides")


class GeneratedImage(SQLModel, table=True):
    __tablename__ = "generated_images"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    slide_id: Optional[UUID] = Field(default=None, foreign_key="slides.id")
    presentation_id: UUID = Field(foreign_key="presentations.id")
    prompt: str
    model: str = "sdxl-lightning"
    file_path: str
    url: str
    width: int = 1344
    height: int = 768
    created_at: datetime = Field(default_factory=datetime.utcnow)
