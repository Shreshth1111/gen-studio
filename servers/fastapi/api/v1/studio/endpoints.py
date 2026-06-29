"""Artify Studio — standalone AI tools beyond presentations.

  • POST /studio/quiz   → Bloom-tagged quiz questions (MCQ + subjective)
  • POST /studio/notes  → structured lecture notes (sections, tables, charts, refs)
  • POST /studio/images → batch image generation from a prompt

All text generation flows through the shared llm_client fallback chain
(Groq → ZSapiens → OpenAI).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, List
from uuid import uuid4
import asyncio
import json

from database import get_session
from models.sql.user import User
from api.v1.auth.endpoints import get_current_user
from services.llm_client import llm_client
from services.image_generation import image_service
from services.activity import log_generation

router = APIRouter()


async def _save_generation(session: AsyncSession, user, tool: str,
                           prompt: str, title: str, payload) -> None:
    """Persist a Studio output for history + admin oversight (universal log)."""
    await log_generation(session, user_id=user.id, username=user.username,
                         kind=tool, title=title, prompt=prompt, result=payload)


# ════════════════════════════════════════════════════════════════════════
# Quiz
# ════════════════════════════════════════════════════════════════════════
class QuizRequest(BaseModel):
    topic: str
    source_text: Optional[str] = None
    mcq_easy: int = 2
    mcq_medium: int = 2
    mcq_hard: int = 1
    subj_easy: int = 0
    subj_medium: int = 1
    subj_hard: int = 1


@router.post("/quiz")
async def generate_quiz(
    body: QuizRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    total = (body.mcq_easy + body.mcq_medium + body.mcq_hard
             + body.subj_easy + body.subj_medium + body.subj_hard)
    if total == 0:
        raise HTTPException(400, "Request at least one question")
    if total > 40:
        raise HTTPException(400, "Maximum 40 questions per request")

    spec = (
        f"- Multiple-choice: {body.mcq_easy} easy, {body.mcq_medium} medium, {body.mcq_hard} hard\n"
        f"- Subjective (open-ended): {body.subj_easy} easy, {body.subj_medium} medium, {body.subj_hard} hard\n"
    )
    source = f"\n\nBase the questions strictly on this source material:\n\"\"\"\n{body.source_text[:8000]}\n\"\"\"" if body.source_text else ""

    system = (
        "You are an expert assessment designer. You write rigorous quiz questions and tag each "
        "with a Bloom's Taxonomy level (Remember, Understand, Apply, Analyze, Evaluate, Create)."
    )
    user_prompt = f"""Create a quiz on the topic: "{body.topic}".

Produce EXACTLY this many questions:
{spec}
{source}

Return JSON with this exact shape:
{{
  "topic": "string",
  "questions": [
    {{
      "type": "mcq",                     // "mcq" or "subjective"
      "difficulty": "easy",              // "easy" | "medium" | "hard"
      "bloom": "Understand",             // one Bloom level
      "question": "string",
      "options": ["A", "B", "C", "D"],   // ONLY for mcq; omit for subjective
      "answer": "the correct option text (mcq) or a model answer (subjective)",
      "explanation": "1-2 sentence rationale"
    }}
  ]
}}
Rules: MCQs must have exactly 4 plausible options and the answer must match one option verbatim.
Subjective questions must have a thorough model answer. Respect the requested counts precisely."""

    data = await llm_client.generate_structured(system, user_prompt)
    questions = data.get("questions", []) if isinstance(data, dict) else []
    # normalise + id
    out = []
    for i, q in enumerate(questions):
        out.append({
            "id": i + 1,
            "type": (q.get("type") or "mcq").lower(),
            "difficulty": (q.get("difficulty") or "medium").lower(),
            "bloom": q.get("bloom") or "Understand",
            "question": q.get("question") or "",
            "options": q.get("options") if isinstance(q.get("options"), list) else None,
            "answer": q.get("answer") or "",
            "explanation": q.get("explanation") or "",
        })
    result = {"topic": data.get("topic", body.topic), "questions": out}
    await _save_generation(session, user, "quiz", body.topic, body.topic, result)
    return result


# ════════════════════════════════════════════════════════════════════════
# Lecture notes / summary
# ════════════════════════════════════════════════════════════════════════
class NotesRequest(BaseModel):
    topic: str
    source_text: Optional[str] = None
    depth: str = "standard"  # brief | standard | detailed


@router.post("/notes")
async def generate_notes(
    body: NotesRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    depth_hint = {
        "brief": "Keep it concise — 3-4 sections, short.",
        "standard": "Balanced depth — 4-6 sections.",
        "detailed": "In-depth — 6-9 sections with rich detail.",
    }.get(body.depth, "Balanced depth — 4-6 sections.")
    source = f"\n\nBase the notes strictly on this source material:\n\"\"\"\n{body.source_text[:9000]}\n\"\"\"" if body.source_text else ""

    system = (
        "You are an expert educator who writes beautiful, well-structured lecture notes. "
        "You use clear sections, occasional comparison tables, and a simple data chart where it aids understanding."
    )
    user_prompt = f"""Write structured lecture notes on: "{body.topic}".
{depth_hint}
{source}

Return JSON with this exact shape:
{{
  "title": "string",
  "subtitle": "one-line summary",
  "reading_time": "e.g. 6 min",
  "sections": [
    {{
      "heading": "string",
      "body": "2-4 short paragraphs of markdown (use **bold**, lists with '-', and `code` where useful)",
      "table": {{ "title": "optional", "headers": ["..."], "rows": [["..."]] }},   // include ONLY where a comparison helps; else omit
      "chart": {{ "title": "optional", "type": "bar", "labels": ["..."], "values": [1,2,3] }}  // include ONLY where data helps; else omit
    }}
  ],
  "key_terms": [{{ "term": "string", "definition": "string" }}],
  "references": ["Author, Title, Year / URL", "..."]
}}
Include at least one table OR one chart somewhere. Provide 4-8 key terms and 3-6 references."""

    data = await llm_client.generate_structured(system, user_prompt)
    if not isinstance(data, dict):
        raise HTTPException(500, "Notes generation returned an unexpected format")
    data.setdefault("title", body.topic)
    data.setdefault("sections", [])
    data.setdefault("key_terms", [])
    data.setdefault("references", [])
    await _save_generation(session, user, "notes", body.topic, data.get("title", body.topic), data)
    return data


# ════════════════════════════════════════════════════════════════════════
# Image generation (batch)
# ════════════════════════════════════════════════════════════════════════
class StudioImageRequest(BaseModel):
    prompt: str
    count: int = 1
    width: int = 1024
    height: int = 1024


@router.post("/images")
async def generate_images(
    body: StudioImageRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    n = max(1, min(body.count, 4))
    if not body.prompt.strip():
        raise HTTPException(400, "Prompt is required")

    async def one():
        image_id = str(uuid4())
        path = await image_service.generate(
            prompt=body.prompt, image_id=image_id,
            width=body.width, height=body.height,
        )
        if not path:
            return None
        return {"id": image_id, "url": f"/app_data/images/{image_id}.png", "prompt": body.prompt}

    results = await asyncio.gather(*[one() for _ in range(n)])
    images = [r for r in results if r]
    if not images:
        raise HTTPException(500, "Image generation failed")
    await _save_generation(session, user, "image", body.prompt, body.prompt[:80], {"images": images})
    return {"images": images}
