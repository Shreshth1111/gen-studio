from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from uuid import UUID, uuid4
from datetime import datetime
import json
import asyncio
import jwt

from database import get_session, AsyncSessionLocal
from models.sql.presentation import Slide
from models.sql.user import User
from api.v1.auth.endpoints import get_current_user, SECRET_KEY, ALGORITHM
from services.llm_client import llm_client
from services.image_generation import image_service
from services.activity import log_generation
from services.presentation_builder import (
    SLIDE_SYSTEM, parse_json_from_text, flatten,
)
from utils.streaming import StreamEvent, format_sse
from utils.partial_json import extract_partial, changed_fields

router = APIRouter()


class SlideUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[dict] = None
    speaker_notes: Optional[str] = None
    image_url: Optional[str] = None
    image_prompt: Optional[str] = None
    layout_type: Optional[str] = None


class RegenerateImageBody(BaseModel):
    prompt: Optional[str] = None
    width: int = 1344
    height: int = 768


class VoiceoverBody(BaseModel):
    word_limit: int = 120
    instruction: Optional[str] = None


# Layouts the auto-picker may choose from (mirrors SlideRenderer.tsx).
PICKABLE_LAYOUTS = [
    "title", "section_header", "bullets", "two_column", "arrow_columns",
    "image_left", "image_right", "image_with_cards", "stats", "big_number",
    "quote", "timeline", "process_steps", "pyramid", "comparison", "table",
    "team", "icon_grid", "agenda", "cta", "code",
    "funnel", "concentric_circles", "venn", "target", "connected_circles",
    "bar_chart", "line_chart", "area_chart", "pie_chart", "donut_chart",
]


def current_text_of(slide) -> str:
    """A short text summary of a slide's existing content (for the auto-picker)."""
    if not slide.content:
        return ""
    try:
        return json.dumps(json.loads(slide.content))[:400]
    except Exception:
        return ""


async def _pick_layout(prompt: str) -> str:
    """Ask the LLM to choose the single best layout for the given prompt.
    Falls back to 'bullets' on any problem."""
    system = (
        "You pick the single best slide layout for a piece of content. "
        "Reply ONLY with JSON: {\"layout\":\"<one layout>\"}. "
        "Choose `code` for source code/commands, `bar_chart`/`line_chart`/`pie_chart` for data, "
        "`comparison`/`table` for side-by-side, `timeline` for chronology, `process_steps` for steps, "
        "`stats`/`big_number` for metrics, `quote` for a quote, `bullets` otherwise."
    )
    user = f"Content/prompt: \"{prompt[:600]}\".\nValid layouts: {', '.join(PICKABLE_LAYOUTS)}."
    try:
        data = await llm_client.generate_structured(system, user)
        layout = (data.get("layout") or "").strip().lower() if isinstance(data, dict) else ""
        return layout if layout in PICKABLE_LAYOUTS else "bullets"
    except Exception:
        return "bullets"


VOICEOVER_SYSTEM = (
    "You are an engaging instructor recording the voiceover narration for a single "
    "presentation slide. Write what the presenter SAYS out loud while this slide is on "
    "screen — natural, spoken, first-person teaching language that explains the slide's "
    "ideas clearly and connects them for the listener. Do NOT use markdown, headings, "
    "bullet points, stage directions, or labels like 'Narrator:'. Return ONLY the spoken script."
)


async def _user_from_query_token(raw_token: Optional[str], session: AsyncSession) -> User:
    """Resolve the user from a ?token= query param. Used for SSE endpoints
    where the browser can't easily send custom headers."""
    if not raw_token:
        raise HTTPException(401, "Token required as ?token= query param")
    try:
        payload = jwt.decode(raw_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(401, "Invalid token")
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    res = await session.execute(select(User).where(User.id == UUID(user_id)))
    user = res.scalars().first()
    if not user:
        raise HTTPException(401, "User not found")
    return user


@router.get("/{slide_id}")
async def get_slide(
    slide_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(select(Slide).where(Slide.id == slide_id))
    slide = result.scalars().first()
    if not slide:
        raise HTTPException(404, "Slide not found")
    content = {}
    if slide.content:
        try:
            content = json.loads(slide.content)
        except Exception:
            pass
    return {
        "id": str(slide.id),
        "slide_number": slide.slide_number,
        "layout_type": slide.layout_type,
        "title": slide.title,
        "content": content,
        "speaker_notes": slide.speaker_notes,
        "image_url": slide.image_url,
        "image_prompt": slide.image_prompt,
    }


@router.put("/{slide_id}")
async def update_slide(
    slide_id: UUID,
    data: SlideUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(select(Slide).where(Slide.id == slide_id))
    slide = result.scalars().first()
    if not slide:
        raise HTTPException(404, "Slide not found")

    if data.title is not None:
        slide.title = data.title
    if data.content is not None:
        slide.content = json.dumps(data.content)
    if data.speaker_notes is not None:
        slide.speaker_notes = data.speaker_notes
    if data.image_url is not None:
        slide.image_url = data.image_url
    if data.image_prompt is not None:
        slide.image_prompt = data.image_prompt
    if data.layout_type is not None:
        slide.layout_type = data.layout_type
    slide.updated_at = datetime.utcnow()

    session.add(slide)
    await session.commit()
    await session.refresh(slide)
    return {"id": str(slide.id), "status": "updated"}


@router.delete("/{slide_id}")
async def delete_slide(
    slide_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    result = await session.execute(select(Slide).where(Slide.id == slide_id))
    slide = result.scalars().first()
    if not slide:
        raise HTTPException(404, "Slide not found")
    await session.delete(slide)
    await session.commit()
    return {"message": "Deleted"}


@router.post("/{slide_id}/voiceover")
async def generate_voiceover(
    slide_id: UUID,
    body: VoiceoverBody,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Generate (or regenerate) an instructor voiceover script for a slide and
    persist it to the slide's speaker_notes. Honours a target word limit."""
    slide = (await session.execute(select(Slide).where(Slide.id == slide_id))).scalars().first()
    if not slide:
        raise HTTPException(404, "Slide not found")

    content = {}
    if slide.content:
        try:
            content = json.loads(slide.content)
        except Exception:
            content = {}

    word_limit = max(20, min(int(body.word_limit or 120), 400))
    extra = f" Additional direction: {body.instruction}." if body.instruction else ""
    user_prompt = (
        f'Slide title: "{slide.title or content.get("title") or "Untitled"}".\n'
        f"Slide content (JSON): {json.dumps(content)[:1500]}\n\n"
        f"Write the spoken voiceover for THIS slide in about {word_limit} words "
        f"(stay close to that length).{extra}"
    )

    script = ""
    async for tok in llm_client.stream_text(VOICEOVER_SYSTEM, user_prompt):
        script += tok
    script = script.strip()
    if not script:
        raise HTTPException(500, "Voiceover generation returned empty text")

    slide.speaker_notes = script
    slide.updated_at = datetime.utcnow()
    session.add(slide)
    await session.commit()

    await log_generation(session, user_id=current_user.id, username=current_user.username,
                         kind="voiceover", presentation_id=slide.presentation_id, slide_id=slide.id,
                         title=slide.title, prompt=body.instruction or "(default narration)",
                         params={"word_limit": word_limit}, result=script)
    return {"id": str(slide_id), "speaker_notes": script, "word_count": len(script.split())}


@router.post("/{slide_id}/regenerate-image")
async def regenerate_slide_image(
    slide_id: UUID,
    body: RegenerateImageBody,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Generate a new image for a slide and persist the URL on the slide.

    Uses an explicit prompt if provided, otherwise the slide's stored
    image_prompt (with a fallback derived from the title).
    """
    result = await session.execute(select(Slide).where(Slide.id == slide_id))
    slide = result.scalars().first()
    if not slide:
        raise HTTPException(404, "Slide not found")

    # Pull theme so the image generation can pick up palette hints.
    from models.sql.presentation import Presentation
    from lib.themes import THEME_IMAGE_HINTS
    pres_res = await session.execute(
        select(Presentation).where(Presentation.id == slide.presentation_id)
    )
    pres = pres_res.scalars().first()
    theme_hint = THEME_IMAGE_HINTS.get(pres.theme if pres else "", "")

    base_prompt = body.prompt or slide.image_prompt
    if not base_prompt:
        base_prompt = f"professional editorial illustration about {slide.title or 'concept'}, no text, clean composition"
    prompt = f"{base_prompt}, {theme_hint}".strip().rstrip(",")

    image_id = str(uuid4())
    img_path = await image_service.generate(
        prompt=prompt,
        image_id=image_id,
        width=body.width,
        height=body.height,
    )
    if not img_path:
        raise HTTPException(500, "Image generation failed")

    image_url = f"/app_data/images/{image_id}.png"
    slide.image_url = image_url
    slide.image_prompt = prompt
    slide.updated_at = datetime.utcnow()

    # Also embed the URL inside the content JSON so layouts that read
    # `content.image_url` (e.g. bullets, image_left/right) re-render.
    try:
        content = json.loads(slide.content) if slide.content else {}
    except Exception:
        content = {}
    content["image_url"] = image_url
    slide.content = json.dumps(content)

    session.add(slide)
    await session.commit()
    await session.refresh(slide)

    await log_generation(session, user_id=current_user.id, username=current_user.username,
                         kind="slide_image", presentation_id=slide.presentation_id, slide_id=slide.id,
                         title=slide.title, prompt=prompt, result=image_url)
    return {
        "id": str(slide.id),
        "image_url": image_url,
        "image_prompt": prompt,
        "content": content,
    }


@router.get("/{slide_id}/regenerate/stream")
async def regenerate_slide_stream(
    slide_id: UUID,
    instruction: Optional[str] = Query(default=None),
    layout_type: Optional[str] = Query(default=None),
    token: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    """Stream a fresh slide-content generation. Auth via ?token= query param.

    Pass ``layout_type=...`` to switch the slide to a new layout — the prompt
    is built from the matching schema and the slide's layout_type is updated
    on completion.
    """
    regen_user = await _user_from_query_token(token, session)

    result = await session.execute(select(Slide).where(Slide.id == slide_id))
    slide = result.scalars().first()
    if not slide:
        raise HTTPException(404, "Slide not found")

    slide_number  = slide.slide_number
    slide_title   = slide.title or f"Slide {slide_number}"

    # layout_type="auto" (used by blank slides + a free-text prompt) → let the
    # model pick the layout that best fits the prompt before we generate.
    if (layout_type or "").strip().lower() == "auto":
        target_layout = await _pick_layout(instruction or current_text_of(slide) or slide_title)
    else:
        target_layout = layout_type or slide.layout_type or "bullets"

    # Record the regeneration prompt up front so it's retrievable even if the
    # stream is interrupted.
    await log_generation(session, user_id=regen_user.id, username=regen_user.username,
                         kind="slide_regen", presentation_id=slide.presentation_id, slide_id=slide.id,
                         title=slide_title, prompt=instruction or "(refresh & improve)",
                         params={"layout_type": target_layout})

    current_content: dict = {}
    if slide.content:
        try:
            current_content = json.loads(slide.content)
        except Exception:
            current_content = {}

    events_queue: asyncio.Queue = asyncio.Queue()

    async def emit(event_type: str, data: dict):
        await events_queue.put((event_type, data))

    async def regenerate():
        try:
            await emit(StreamEvent.SLIDE_START, {
                "slide_number": slide_number,
                "layout_type": target_layout,
                "title": slide_title,
            })

            instr = instruction or "Refresh and improve this slide."
            user_prompt = (
                f'Slide title: "{slide_title}". '
                f'Target layout: {target_layout}. '
                f'Existing content: {json.dumps(current_content)[:600]}. '
                f'Instruction: {instr}. '
                f'Write content JSON for layout "{target_layout}" only.'
            )

            content_text = ""
            last_partial: dict = {}
            tokens_since = 0
            async for token_str in llm_client.stream_text(SLIDE_SYSTEM, user_prompt):
                content_text += token_str
                await emit(StreamEvent.SLIDE_CONTENT_CHUNK, {
                    "slide_number": slide_number,
                    "token": token_str,
                })
                tokens_since += 1
                if tokens_since >= 3 or "}" in token_str or "," in token_str or "]" in token_str:
                    tokens_since = 0
                    current = extract_partial(content_text)
                    diff = changed_fields(last_partial, current)
                    if diff:
                        last_partial = current
                        await emit(StreamEvent.SLIDE_PARTIAL, {
                            "slide_number": slide_number,
                            "layout_type": target_layout,
                            "title": slide_title,
                            "content": current,
                        })

            raw = parse_json_from_text(content_text)
            new_content = flatten(raw) if raw else current_content
            if not new_content.get("title"):
                new_content["title"] = slide_title

            # Preserve image_url unless model explicitly rewrote it
            if "image_url" not in new_content and current_content.get("image_url"):
                new_content["image_url"] = current_content["image_url"]

            async with AsyncSessionLocal() as new_session:
                res = await new_session.execute(select(Slide).where(Slide.id == slide_id))
                s = res.scalars().first()
                if s:
                    s.content = json.dumps(new_content)
                    s.layout_type = target_layout
                    s.title = new_content.get("title", s.title)
                    s.updated_at = datetime.utcnow()
                    new_session.add(s)
                    await new_session.commit()
                    await new_session.refresh(s)

            await emit(StreamEvent.SLIDE_DONE, {
                "slide": {
                    "id": str(slide_id),
                    "slide_number": slide_number,
                    "layout_type": target_layout,
                    "title": new_content.get("title", slide_title),
                    "content": new_content,
                    "image_url": slide.image_url,
                }
            })

        except Exception as e:
            await emit(StreamEvent.ERROR, {"message": str(e)})
        finally:
            await events_queue.put(None)

    async def event_gen():
        task = asyncio.create_task(regenerate())
        while True:
            item = await events_queue.get()
            if item is None:
                break
            event_type, data = item
            yield format_sse(event_type, data)
        await task

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        },
    )
