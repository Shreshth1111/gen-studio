"""
═══════════════════════════════════════════════════════════════════════════════
 presentation.py — PRESENTATION REST + THE LIVE SSE GENERATION ENDPOINT
═══════════════════════════════════════════════════════════════════════════════

WHAT THIS FILE DOES
  CRUD for presentations (list/create/get/update/delete/reorder) PLUS the
  single most important route: the streaming generator.

THE SSE ENDPOINT  —  GET /{id}/generate/stream?token=...
  • Auth is via a ?token= QUERY PARAM (not a header) because EventSource/SSE
    can't set custom headers and we want to avoid a CORS preflight on the
    long-lived stream.
  • Marks the deck "generating", then runs build_presentation_stream() in a
    background task that pushes events onto an asyncio.Queue.
  • event_gen() drains that queue and yields format_sse(event, data) frames;
    FastAPI's StreamingResponse keeps the HTTP connection open and flushes
    each frame (Nginx must have `proxy_buffering off`).
  • When the pipeline finishes it deletes the old Slide rows and inserts the
    freshly generated ones, then marks the deck "completed".

OTHER ROUTES
  GET  ""                     list current user's decks
  POST ""                     create a draft (saves uploaded source text to disk)
  GET  /{id}                  fetch a deck + its slides (ordered)
  PUT  /{id}                  update title/theme/tone
  POST /{id}/reorder          persist a new slide order (renumber 1..N)
  DELETE /{id}                delete deck + slides + images
  GET  /{id}/json             raw generated JSON

HELPERS: presentation_to_out() / slide_to_out() shape DB rows for the API.
═══════════════════════════════════════════════════════════════════════════════
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime
import json
import asyncio

from database import get_session, AsyncSessionLocal
from models.sql.presentation import Presentation, Slide
from models.sql.user import User
from api.v1.auth.endpoints import get_current_user, SECRET_KEY, ALGORITHM
from services.presentation_builder import build_presentation_stream
from services.activity import log_activity, log_generation
from utils.streaming import StreamEvent, format_sse
import jwt

router = APIRouter()


class PresentationCreate(BaseModel):
    topic: str
    tone: str = "professional"
    audience: str = ""
    content_density: str = "standard"
    slide_count: int = 8
    theme: str = "light"
    language: str = "English"
    source_text: Optional[str] = None  # extracted text from uploaded PDF/DOCX


class PresentationUpdate(BaseModel):
    title: Optional[str] = None
    theme: Optional[str] = None
    tone: Optional[str] = None


def presentation_to_out(p: Presentation, slides: list = None) -> dict:
    return {
        "id": str(p.id),
        "title": p.title or p.topic[:50],
        "topic": p.topic,
        "theme": p.theme,
        "tone": p.tone,
        "language": p.language,
        "slide_count": p.slide_count,
        "status": p.status,
        "slides": [slide_to_out(s) for s in (slides or [])],
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    }


def slide_to_out(s: Slide) -> dict:
    content = {}
    if s.content:
        try:
            content = json.loads(s.content)
        except Exception:
            content = {}
    return {
        "id": str(s.id),
        "slide_number": s.slide_number,
        "layout_type": s.layout_type,
        "title": s.title,
        "content": content,
        "speaker_notes": s.speaker_notes,
        "image_url": s.image_url,
        "generation_status": s.generation_status,
    }


@router.get("")
async def list_presentations(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(
        select(Presentation)
        .where(Presentation.user_id == current_user.id)
        .order_by(Presentation.created_at.desc())
    )
    return [presentation_to_out(p) for p in result.scalars().all()]


@router.post("")
async def create_presentation(
    data: PresentationCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    pres = Presentation(
        user_id=current_user.id,
        topic=data.topic,
        title=data.topic[:60],
        tone=data.tone,
        audience=data.audience,
        content_density=data.content_density,
        slide_count=data.slide_count,
        theme=data.theme,
        language=data.language,
        status="draft"
    )
    session.add(pres)
    await session.commit()
    await session.refresh(pres)

    # Persist source-document text alongside the presentation so the
    # generation pipeline can pick it up. We store it as a file so we don't
    # need a new schema column.
    if data.source_text and data.source_text.strip():
        import os
        from pathlib import Path
        app_data = Path(os.getenv("APP_DATA_DIR", "./app_data"))
        pres_dir = app_data / "presentations" / str(pres.id)
        pres_dir.mkdir(parents=True, exist_ok=True)
        (pres_dir / "source.txt").write_text(data.source_text, encoding="utf-8")

    await log_activity(session, action="deck.create", user_id=current_user.id,
                       username=current_user.username, entity_type="presentation",
                       entity_id=str(pres.id), detail=(pres.topic or "")[:120])
    await log_generation(session, user_id=current_user.id, username=current_user.username,
                         kind="deck", presentation_id=pres.id, title=pres.title,
                         prompt=pres.topic,
                         params={"tone": pres.tone, "audience": pres.audience,
                                 "slide_count": pres.slide_count, "theme": pres.theme,
                                 "content_density": pres.content_density,
                                 "has_document": bool(data.source_text)})
    return presentation_to_out(pres)


@router.get("/{presentation_id}")
async def get_presentation(
    presentation_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(
        select(Presentation).where(
            Presentation.id == presentation_id,
            Presentation.user_id == current_user.id
        )
    )
    pres = result.scalars().first()
    if not pres:
        raise HTTPException(404, "Presentation not found")
    slides_result = await session.execute(
        select(Slide).where(Slide.presentation_id == presentation_id).order_by(Slide.slide_number)
    )
    return presentation_to_out(pres, slides_result.scalars().all())


@router.put("/{presentation_id}")
async def update_presentation(
    presentation_id: UUID,
    data: PresentationUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(
        select(Presentation).where(
            Presentation.id == presentation_id,
            Presentation.user_id == current_user.id
        )
    )
    pres = result.scalars().first()
    if not pres:
        raise HTTPException(404, "Presentation not found")
    if data.title is not None: pres.title = data.title
    if data.theme is not None: pres.theme = data.theme
    if data.tone  is not None: pres.tone  = data.tone
    pres.updated_at = datetime.utcnow()
    session.add(pres)
    await session.commit()
    await session.refresh(pres)
    return presentation_to_out(pres)


class AddSlideBody(BaseModel):
    after_slide_number: Optional[int] = None   # insert after this slide (None = append)
    layout_type: str = "blank"


@router.post("/{presentation_id}/slides")
async def add_slide(
    presentation_id: UUID,
    body: AddSlideBody,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Insert a new (blank by default) slide and renumber the deck."""
    pres = (await session.execute(
        select(Presentation).where(
            Presentation.id == presentation_id,
            Presentation.user_id == current_user.id,
        )
    )).scalars().first()
    if not pres:
        raise HTTPException(404, "Presentation not found")

    slides = (await session.execute(
        select(Slide).where(Slide.presentation_id == presentation_id).order_by(Slide.slide_number)
    )).scalars().all()

    # Position: right after `after_slide_number`, else at the end.
    insert_at = len(slides) + 1
    if body.after_slide_number is not None:
        insert_at = body.after_slide_number + 1
    # Shift everything at/after the insert point down by one.
    for s in slides:
        if s.slide_number >= insert_at:
            s.slide_number += 1
            session.add(s)

    new_slide = Slide(
        presentation_id=presentation_id,
        slide_number=insert_at,
        layout_type=body.layout_type or "blank",
        title="",
        content=json.dumps({}),
        generation_status="done",
    )
    session.add(new_slide)
    await session.commit()
    await session.refresh(new_slide)
    return slide_to_out(new_slide)


class ReorderBody(BaseModel):
    slide_ids: list[str]


@router.post("/{presentation_id}/reorder")
async def reorder_slides(
    presentation_id: UUID,
    body: ReorderBody,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Persist a new slide order. `slide_ids` is the full ordered list; each
    slide's `slide_number` is rewritten to match its index (1-based)."""
    pres = (await session.execute(
        select(Presentation).where(
            Presentation.id == presentation_id,
            Presentation.user_id == current_user.id,
        )
    )).scalars().first()
    if not pres:
        raise HTTPException(404, "Presentation not found")

    slides = (await session.execute(
        select(Slide).where(Slide.presentation_id == presentation_id)
    )).scalars().all()
    by_id = {str(s.id): s for s in slides}

    order = 1
    for sid in body.slide_ids:
        s = by_id.get(sid)
        if s:
            s.slide_number = order
            s.updated_at = datetime.utcnow()
            session.add(s)
            order += 1
    await session.commit()
    return {"status": "reordered", "count": order - 1}


@router.delete("/{presentation_id}")
async def delete_presentation(
    presentation_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(
        select(Presentation).where(
            Presentation.id == presentation_id,
            Presentation.user_id == current_user.id
        )
    )
    pres = result.scalars().first()
    if not pres:
        raise HTTPException(404, "Presentation not found")

    # SQLAlchemy doesn't cascade through the ORM by default; child tables
    # have NOT NULL FKs so they can't be NULLed. Delete dependent rows
    # explicitly before removing the parent.
    from models.sql.presentation import GeneratedImage
    await session.execute(
        delete(GeneratedImage).where(GeneratedImage.presentation_id == presentation_id)
    )
    await session.execute(
        delete(Slide).where(Slide.presentation_id == presentation_id)
    )
    await session.delete(pres)
    await session.commit()
    await log_activity(session, action="deck.delete", user_id=current_user.id,
                       username=current_user.username, entity_type="presentation",
                       entity_id=str(presentation_id))
    return {"message": "Deleted"}


@router.get("/{presentation_id}/generate/stream")
async def stream_generation(
    presentation_id: UUID,
    # Accept token via query param to avoid CORS preflight on SSE
    token: Optional[str] = Query(default=None),
    authorization: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session)
):
    """SSE endpoint — auth via ?token= query param to avoid CORS preflight."""
    from fastapi import Request
    from fastapi.security import OAuth2PasswordBearer

    # Extract token from query param
    raw_token = token or authorization
    if not raw_token:
        raise HTTPException(401, "Token required as ?token= query param")

    # Validate JWT
    try:
        payload  = jwt.decode(raw_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id  = payload.get("sub")
        if not user_id:
            raise HTTPException(401, "Invalid token")
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

    # Get user
    from models.sql.user import User as UserModel
    user_result = await session.execute(
        select(UserModel).where(UserModel.id == UUID(user_id))
    )
    current_user = user_result.scalars().first()
    if not current_user:
        raise HTTPException(401, "User not found")

    # Get presentation
    result = await session.execute(
        select(Presentation).where(
            Presentation.id == presentation_id,
            Presentation.user_id == current_user.id
        )
    )
    pres = result.scalars().first()
    if not pres:
        raise HTTPException(404, "Presentation not found")

    outline_override = None
    if pres.outline_json:
        try:
            outline_override = json.loads(pres.outline_json)
        except Exception:
            pass

    pres.status = "generating"
    session.add(pres)
    await session.commit()

    # Capture values before session closes
    pres_topic    = pres.topic
    pres_tone     = pres.tone
    pres_audience = pres.audience or ""
    pres_density  = pres.content_density
    pres_count    = pres.slide_count
    pres_theme    = pres.theme
    pres_language = pres.language

    events_queue: asyncio.Queue = asyncio.Queue()

    async def emit(event_type: str, data: dict):
        await events_queue.put((event_type, data))

    async def run_pipeline():
        try:
            result = await build_presentation_stream(
                presentation_id=str(presentation_id),
                topic=pres_topic,
                tone=pres_tone,
                audience=pres_audience,
                content_density=pres_density,
                slide_count=pres_count,
                theme=pres_theme,
                language=pres_language,
                emit=emit,
                outline_override=outline_override,
            )
            async with AsyncSessionLocal() as new_session:
                existing = await new_session.execute(
                    select(Slide).where(Slide.presentation_id == presentation_id)
                )
                for s in existing.scalars().all():
                    await new_session.delete(s)
                await new_session.flush()

                for slide_data in result.get("slides", []):
                    new_session.add(Slide(
                        presentation_id=presentation_id,
                        slide_number=slide_data["slide_number"],
                        layout_type=slide_data["layout_type"],
                        title=slide_data.get("title"),
                        content=json.dumps(slide_data.get("content", {})),
                        speaker_notes=slide_data.get("speaker_notes"),
                        image_url=slide_data.get("image_url"),
                        image_prompt=slide_data.get("image_prompt"),
                        generation_status="done",
                    ))

                pres_res = await new_session.execute(
                    select(Presentation).where(Presentation.id == presentation_id)
                )
                pres_db = pres_res.scalars().first()
                if pres_db:
                    pres_db.status  = "completed"
                    pres_db.title   = result.get("title", pres_topic[:60])
                    pres_db.updated_at = datetime.utcnow()
                    new_session.add(pres_db)

                await new_session.commit()

        except Exception as e:
            print(f"Pipeline error: {e}", flush=True)
            await events_queue.put((StreamEvent.ERROR, {"message": str(e)}))
        finally:
            await events_queue.put(None)

    async def event_generator():
        pipeline_task = asyncio.create_task(run_pipeline())
        while True:
            item = await events_queue.get()
            if item is None:
                break
            event_type, data = item
            yield format_sse(event_type, data)
        await pipeline_task

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )


@router.put("/{presentation_id}/outline")
async def save_outline(
    presentation_id: UUID,
    data: dict,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(
        select(Presentation).where(
            Presentation.id == presentation_id,
            Presentation.user_id == current_user.id
        )
    )
    pres = result.scalars().first()
    if not pres:
        raise HTTPException(404, "Presentation not found")
    pres.outline_json  = json.dumps(data.get("outline", []))
    pres.updated_at    = datetime.utcnow()
    session.add(pres)
    await session.commit()
    return {"message": "Outline saved"}


@router.get("/{presentation_id}/json")
async def get_presentation_json(
    presentation_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    import os
    from pathlib import Path
    json_file = Path(os.getenv("APP_DATA_DIR", "./app_data")) / "presentations" / str(presentation_id) / "data.json"
    if json_file.exists():
        return json.loads(json_file.read_text())
    result = await session.execute(select(Presentation).where(Presentation.id == presentation_id))
    pres = result.scalars().first()
    if not pres:
        raise HTTPException(404, "Presentation not found")
    slides_result = await session.execute(
        select(Slide).where(Slide.presentation_id == presentation_id).order_by(Slide.slide_number)
    )
    return {
        "id": str(pres.id), "title": pres.title, "theme": pres.theme,
        "slides": [slide_to_out(s) for s in slides_result.scalars().all()]
    }
