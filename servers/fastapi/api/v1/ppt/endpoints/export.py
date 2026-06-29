"""
═══════════════════════════════════════════════════════════════════════════════
 export.py — DOWNLOAD AS .pptx  &  HAND-OFF TO SAGESTUDIO
═══════════════════════════════════════════════════════════════════════════════

ROUTES
  POST /export/{id}/pptx
     Loads the deck + slides from the DB, assembles ppt_data, and calls
     PPTXGenerator(THEMES[theme]).generate(...) to write a real .pptx into
     app_data/presentations/{id}/. Returns the download path.
  GET  /export/{id}/pptx/download?token=...
     Streams the generated .pptx back to the browser (FileResponse). Token is a
     query param so a plain <a download> link works without custom headers.
  POST /export/{id}/pptx/push-to-sagestudio
     Exports the .pptx, builds a public URL, then redirects (or POSTs) it to
     SageStudio so a deck can become a narrated video lecture in one click.

NOTE: the actual JSON→.pptx drawing lives in services/pptx_generator.py.
═══════════════════════════════════════════════════════════════════════════════
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from uuid import UUID
from pathlib import Path
import json
import os
import jwt
import httpx
import urllib.parse
from datetime import datetime, timedelta

from database import get_session
from models.sql.presentation import Presentation, Slide
from models.sql.user import User
from api.v1.auth.endpoints import get_current_user, SECRET_KEY, ALGORITHM, create_access_token
from services.pptx_generator import PPTXGenerator
from services.llm_client import llm_client
from lib.themes import THEMES

SAGESTUDIO_URL = os.getenv("SAGESTUDIO_URL", "https://sagestudio.zsapiens.com")
SAGESTUDIO_API_KEY = os.getenv("SAGESTUDIO_API_KEY", "")
# Shared secret with SageStudio backend for signed SSO tokens.
# Must be the same value in both apps' .env files.
SHARED_SSO_SECRET = os.getenv("SHARED_SSO_SECRET", "")


async def _generate_speaker_notes(slides: list, session: AsyncSession) -> None:
    """Generate voiceover scripts for all slides that have empty speaker_notes.

    Sends one batched LLM call so it's fast even for 10+ slide decks.
    Saves results back to DB in-place.
    """
    empty_slides = [s for s in slides if not (s.speaker_notes or "").strip()]
    if not empty_slides:
        return

    # Build a compact description of each slide for the LLM
    lines = []
    for s in empty_slides:
        try:
            content = json.loads(s.content) if s.content else {}
        except Exception:
            content = {}
        bullets = content.get("bullets") or content.get("steps") or content.get("items") or []
        bullet_text = "; ".join(str(b) for b in bullets[:5]) if bullets else ""
        desc = f'Slide {s.slide_number}: "{s.title}" ({s.layout_type})'
        if bullet_text:
            desc += f' — key points: {bullet_text}'
        elif content.get("subtitle"):
            desc += f' — subtitle: {content["subtitle"]}'
        lines.append(desc)

    prompt = (
        "You are writing voiceover scripts for a teacher's lecture slides.\n"
        "For each slide listed below, write a 2-3 sentence spoken script "
        "(what the teacher says aloud while that slide is shown). "
        "Be conversational, informative, and match the slide content precisely.\n\n"
        'Return ONLY a JSON object: {"scripts": ["script for slide 1", "script for slide 2", ...]}\n'
        "One string per slide, in the same order. No markdown, no extra keys.\n\n"
        "Slides:\n" + "\n".join(lines)
    )

    try:
        result = await llm_client.generate_structured(
            "You generate voiceover scripts. Reply ONLY with JSON: {\"scripts\": [\"...\", ...]}",
            prompt
        )
        if isinstance(result, list):
            scripts = result
        elif isinstance(result, dict):
            scripts = result.get("scripts") or result.get("voiceovers") or list(result.values())[0]
        else:
            return

        for slide, script in zip(empty_slides, scripts):
            slide.speaker_notes = str(script).strip()
            session.add(slide)

        await session.commit()
    except Exception:
        pass  # never block the export if note generation fails


async def _user_from_query_token(token: Optional[str], session) -> User:
    if not token:
        raise HTTPException(401, "Token required as ?token= query param")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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

router = APIRouter()


@router.post("/{presentation_id}/generate-all-voiceovers")
async def generate_all_voiceovers(
    presentation_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Bulk-generate LLM voiceover scripts for every slide in the presentation
    that currently has empty speaker_notes. Returns all slides with updated notes."""
    result = await session.execute(
        select(Presentation).where(
            Presentation.id == presentation_id,
            Presentation.user_id == current_user.id,
        )
    )
    pres = result.scalars().first()
    if not pres:
        raise HTTPException(404, "Presentation not found")

    slides_result = await session.execute(
        select(Slide)
        .where(Slide.presentation_id == presentation_id)
        .order_by(Slide.slide_number)
    )
    all_slides = slides_result.scalars().all()

    await _generate_speaker_notes(all_slides, session)

    return {
        "slides": [
            {"id": str(s.id), "slide_number": s.slide_number, "speaker_notes": s.speaker_notes or ""}
            for s in all_slides
        ]
    }


@router.get("/{presentation_id}/speaker-notes")
async def get_speaker_notes(
    presentation_id: UUID,
    token: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    """Return speaker notes for all slides. Auth via ``?token=`` query param
    so SageStudio can fetch them cross-origin without custom headers."""
    await _user_from_query_token(token, session)

    slides_result = await session.execute(
        select(Slide)
        .where(Slide.presentation_id == presentation_id)
        .order_by(Slide.slide_number)
    )
    slides = slides_result.scalars().all()

    return {
        "notes": [
            {"slide_number": s.slide_number, "voiceover_script": s.speaker_notes or ""}
            for s in slides
        ]
    }


@router.post("/{presentation_id}/pptx")
async def export_pptx(
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
    slides = slides_result.scalars().all()

    # Build PPT JSON
    ppt_data = {
        "id": str(pres.id),
        "title": pres.title or pres.topic,
        "theme": pres.theme,
        "slides": [
            {
                "slide_number": s.slide_number,
                "layout_type": s.layout_type,
                "title": s.title,
                "content": json.loads(s.content) if s.content else {},
                "speaker_notes": s.speaker_notes,
                "image_url": s.image_url,
            }
            for s in slides
        ]
    }

    theme = THEMES.get(pres.theme, THEMES["light"])
    app_data = Path(os.getenv("APP_DATA_DIR", "./app_data"))
    export_dir = app_data / "presentations" / str(presentation_id)
    export_dir.mkdir(parents=True, exist_ok=True)
    output_path = str(export_dir / "presentation.pptx")

    generator = PPTXGenerator(theme)
    generator.generate(ppt_data, output_path)

    pres.pptx_path = output_path
    session.add(pres)
    await session.commit()

    return {"url": f"/api/v1/export/{presentation_id}/pptx/download", "path": output_path}


@router.get("/{presentation_id}/pptx/download")
async def download_pptx(
    presentation_id: UUID,
    token: Optional[str] = Query(default=None),
    session: AsyncSession = Depends(get_session)
):
    """Download the generated .pptx. Auth via ``?token=`` query param so the
    browser can fetch via ``window.open`` / ``<a href>`` without custom
    headers."""
    await _user_from_query_token(token, session)
    result = await session.execute(
        select(Presentation).where(Presentation.id == presentation_id)
    )
    pres = result.scalars().first()
    if not pres or not pres.pptx_path:
        raise HTTPException(404, "PPTX not found. Export first.")

    path = Path(pres.pptx_path)
    if not path.exists():
        raise HTTPException(404, "PPTX file not found on disk")

    return FileResponse(
        path=str(path),
        filename=f"{pres.title or 'presentation'}.pptx",
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )


@router.post("/{presentation_id}/pptx/push-to-sagestudio")
async def push_to_sagestudio(
    presentation_id: UUID,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Export the PPTX (if not already done) and push its download URL to
    SageStudio's import endpoint. Returns the SageStudio redirect URL so the
    frontend can navigate the user there."""
    result = await session.execute(
        select(Presentation).where(
            Presentation.id == presentation_id,
            Presentation.user_id == current_user.id,
        )
    )
    pres = result.scalars().first()
    if not pres:
        raise HTTPException(404, "Presentation not found")

    # 1. Fetch all slides
    slides_result = await session.execute(
        select(Slide)
        .where(Slide.presentation_id == presentation_id)
        .order_by(Slide.slide_number)
    )
    all_slides = slides_result.scalars().all()

    # 2. Generate speaker notes for any empty slides (saves to DB)
    await _generate_speaker_notes(all_slides, session)

    # 3. Always rebuild the PPTX so it carries the freshly-generated notes.
    #    Notes are embedded in the PPTX notes slides by pptx_generator.py,
    #    so SageStudio's /api/ppt/inspect will read them back as voiceover scripts.
    ppt_data = {
        "id": str(pres.id),
        "title": pres.title or pres.topic,
        "theme": pres.theme,
        "slides": [
            {
                "slide_number": s.slide_number,
                "layout_type": s.layout_type,
                "title": s.title,
                "content": json.loads(s.content) if s.content else {},
                "speaker_notes": s.speaker_notes,
                "image_url": s.image_url,
            }
            for s in all_slides
        ],
    }
    app_data = Path(os.getenv("APP_DATA_DIR", "./app_data"))
    export_dir = app_data / "presentations" / str(presentation_id)
    export_dir.mkdir(parents=True, exist_ok=True)
    output_path = str(export_dir / "presentation.pptx")
    theme = THEMES.get(pres.theme, THEMES["light"])
    PPTXGenerator(theme).generate(ppt_data, output_path)
    pres.pptx_path = output_path
    session.add(pres)
    await session.commit()

    # 4. Build a short-lived download token so SageStudio can fetch the file.
    short_token = create_access_token({"sub": str(current_user.id)})
    app_base = os.getenv("APP_PUBLIC_URL", "https://artifyai.zsapiens.com")
    pptx_url = (
        f"{app_base}/api/v1/export/{presentation_id}/pptx/download"
        f"?token={short_token}"
    )
    pptx_title = pres.title or pres.topic or "Presentation"

    # Pass speaker notes via a separate short URL instead of inlining them in the
    # redirect. Inlining all slide notes for large decks hits Apache's 414
    # Request-URI Too Long limit. SageStudio fetches the notes from this URL
    # (same token; ArtifyAI CORS is open) and overrides SageStudio's own
    # inspect-generated scripts with ArtifyAI's LLM-generated ones.
    notes_url = (
        f"{app_base}/api/v1/export/{presentation_id}/speaker-notes"
        f"?token={short_token}"
    )

    # Sign a short-lived SSO token so SageStudio can auto-login the user
    # without requiring them to type their Shoolini password again.
    # Only issued when the user authenticated via Shoolini SSO on ArtifyAI.
    sso_token = ""
    if SHARED_SSO_SECRET and current_user.shoolini_username and current_user.full_name:
        sso_payload = {
            # SageStudio User.username == Shoolini text username == ArtifyAI full_name
            "shoolini_username": current_user.full_name,
            # Employee code stored as shoolini_username on ArtifyAI side
            "shoolini_uid": current_user.shoolini_username,
            "exp": datetime.utcnow() + timedelta(seconds=120),
        }
        sso_token = jwt.encode(sso_payload, SHARED_SSO_SECRET, algorithm="HS256")

    redirect = (
        f"{SAGESTUDIO_URL}/dashboard"
        f"?import_pptx_url={urllib.parse.quote(pptx_url, safe='')}"
        f"&pptx_title={urllib.parse.quote(pptx_title, safe='')}"
        f"&import_notes_url={urllib.parse.quote(notes_url, safe='')}"
        + (f"&sso_token={urllib.parse.quote(sso_token, safe='')}" if sso_token else "")
    )
    return {"redirect_url": redirect, "pptx_url": pptx_url, "mode": "redirect"}


@router.get("/{presentation_id}/json/download")
async def download_json(
    presentation_id: UUID,
    current_user: User = Depends(get_current_user),
):
    app_data = Path(os.getenv("APP_DATA_DIR", "./app_data"))
    json_file = app_data / "presentations" / str(presentation_id) / "data.json"
    if not json_file.exists():
        raise HTTPException(404, "JSON not found")
    return FileResponse(path=str(json_file), filename="presentation.json", media_type="application/json")
