"""
═══════════════════════════════════════════════════════════════════════════════
 presentation_builder.py — THE HEART OF DECK GENERATION
═══════════════════════════════════════════════════════════════════════════════

WHAT THIS FILE DOES
  Turns a topic (and optional uploaded document) into a finished deck, emitting
  Server-Sent Events (SSE) the whole time so the browser can render the deck
  *as it is being written* (Gamma-style live generation).

WHERE IT FITS
  HTTP layer:  api/v1/ppt/endpoints/presentation.py  →  stream_generation()
               opens the SSE response and calls build_presentation_stream(...)
               with an `emit` callback that pushes each event onto the wire.
  This file:   runs the actual 2-phase pipeline and calls `emit(event, data)`.
  Browser:     app/presentation/[id]/generate/page.tsx reads the events and
               dispatches them to the Redux `generationSlice`.

THE PIPELINE (build_presentation_stream)
  PHASE 1 — OUTLINE
     • Optionally prepend uploaded-document text to the prompt.
     • Stream the outline from the LLM token-by-token (OUTLINE_CHUNK events).
     • Parse the JSON list of slide "slots" {slide_number, title, layout_type,
       key_points}. If parsing fails → a LOGICALLY-ORDERED fallback scaffold
       (Agenda → Intro → Concepts → … → Key Takeaways), never random.
  PHASE 2 — SLIDES (one slot at a time, in order)
     • generate_slide(slot): stream the slide's content JSON; every ~3 tokens
       run extract_partial() and emit SLIDE_PARTIAL when a field changed — this
       is what makes the title appear first, then bullets one by one.
     • flatten()/parse the final JSON, choose a real (non-placeholder) title.
     • For image-bearing layouts, call the image service and forward progress.
  FINALISE
     • sort slides by slide_number, write data.json, emit GENERATION_COMPLETE.

KEY SYMBOLS
  OUTLINE_SYSTEM  — system prompt enforcing logical narrative order + variety.
  SLIDE_SYSTEM    — system prompt with the exact JSON schema for every layout
                    (this is the canonical "slide JSON structure" reference).
  flatten()       — coerces messy LLM output into the renderer's expected shape.
  parse_json_from_text() — recovers a JSON object from prose/markdown-fenced text.
  _is_placeholder_title() — rejects titles like "Section 3" / "Slide 4".

TECH: pure async Python; LLM calls via services/llm_client.py (Groq→ZSapiens→
      OpenAI fallback); images via services/image_generation.py.
═══════════════════════════════════════════════════════════════════════════════
"""
import asyncio
import json
import os
from pathlib import Path
from uuid import uuid4
from typing import Optional, Callable
from datetime import datetime

from services.llm_client import llm_client
from services.image_generation import image_service
from lib.themes import THEME_IMAGE_HINTS
from utils.streaming import StreamEvent
from utils.partial_json import extract_partial, changed_fields

OUTLINE_SYSTEM = """You create presentation outlines. Reply ONLY with JSON, no explanation.

Format:
{"title":"string","slides":[{"slide_number":1,"title":"string","layout_type":"string","key_points":["string"]}]}

layout_type must be one of: title, section_header, bullets, two_column, arrow_columns, image_left, image_right, image_with_cards, stats, big_number, quote, timeline, process_steps, pyramid, comparison, table, team, team_image_grid, icon_grid, agenda, cta, code, funnel, concentric_circles, venn, target, connected_circles, bar_chart, line_chart, area_chart, pie_chart, donut_chart

CODE & DEPTH RULES:
 - Use the `code` layout for any slide whose content is source code, commands, or config — NEVER cram code into bullets.
 - If a single topic is too rich for one slide, ALLOCATE MULTIPLE SEQUENTIAL SLIDES for it (e.g. "Neural Networks (1/2)" then "Neural Networks (2/2)"), each with its own layout. Do not overflow one slide; split it. The total may exceed the requested count by a little when the material genuinely needs it.

NARRATIVE ORDER IS MANDATORY. The slides must tell a single, logically-ordered story that builds from start to finish — never a random jumble of topics. Order the slides so a reader who knows nothing can follow along:
 1. Open with the `title` slide.
 2. Set up the topic next — context / introduction / an agenda of what's coming.
 3. Build the body from foundational → advanced: define core concepts BEFORE diving into details, mechanisms, examples, data, or comparisons. Each slide should follow naturally from the one before it.
 4. Then cover implications — benefits, challenges, applications, trends, or what's next.
 5. Close with a synthesis — key takeaways, a summary, a conclusion, or a real call-to-action.
`slide_number` MUST be sequential (1,2,3,…) and reflect this logical reading order. A later slide must never introduce a prerequisite that an earlier slide already needed.

LAYOUT VARIETY (within that fixed narrative order):
 - The first slide is the only one that MUST be `title`.
 - Slide 2 must NOT default to `section_header`. Pick the layout that best fits slide 2's content (bullets, agenda, big_number, image_with_cards, …). Use `section_header` ONLY when the deck has 2+ clearly distinct chapters that need to be visually separated.
 - The last slide must NOT default to `cta`. Use `cta` only when there's a real call-to-action to make. Otherwise close with whatever fits — a quote, a big_number, a summary `bullets`, an `agenda` recap, a `comparison`, etc.
 - Aim for layout variety across the deck: do not repeat the same layout three times in a row. (Variety applies to the *layouts*, never to the *order of ideas* — that stays logical.)

Strong defaults by intent:
 - 3-4 parallel concepts -> arrow_columns
 - story/historical context -> image_with_cards
 - sequential workflow -> process_steps
 - hierarchy / maturity model -> pyramid
 - statistics -> stats or big_number
 - people -> team_image_grid (use if portraits available) or team
 - one big quote or principle -> quote

Smart diagrams (use when the relationship is the point):
 - top-of-funnel narrowing -> funnel
 - nested / containment scope -> concentric_circles
 - shared overlap between two groups -> venn
 - focus / prioritisation rings -> target
 - linear sequence of equal-weight nodes -> connected_circles

Smart charts (use when comparing numbers):
 - compare discrete categories -> bar_chart
 - trend over time -> line_chart or area_chart
 - parts of a whole -> pie_chart or donut_chart"""

SLIDE_SYSTEM = """You write slide content. Reply ONLY with JSON matching the layout.

The "title" field MUST be a short, specific headline (3-7 words) describing the actual content of THIS slide — never a placeholder like "Section 3" or "Slide 4". If the suggested title is generic, replace it with a content-aware headline derived from the key points.

Layouts:
title -> {"title":"string","subtitle":"string"}
section_header -> {"title":"string","subtitle":"string","eyebrow":"PART 2"}
bullets -> {"title":"string","bullets":["point1","point2","point3"],"callout":"optional key takeaway"}
two_column -> {"title":"string","col1_heading":"string","col1_bullets":["string"],"col2_heading":"string","col2_bullets":["string"]}
arrow_columns -> {"title":"string","items":[{"heading":"3-5 words","description":"one sentence"}]}  // exactly 3 or 4 items
image_left -> {"title":"string","content_heading":"string","bullets":["string"]}
image_right -> {"title":"string","content_heading":"string","bullets":["string"]}
image_with_cards -> {"title":"string","eyebrow":"OPTIONAL TAG","cards":[{"heading":"string","description":"string"}]}  // 2-4 cards
stats -> {"title":"string","subtitle":"optional","stats":[{"value":"42%","label":"string","context":"string"}]}
big_number -> {"title":"Headline","value":"87%","label":"What it means","context":"one-line context"}
quote -> {"quote":"string","attribution":"string","role":"string"}
timeline -> {"title":"string","events":[{"year":"2020","label":"string","description":"string"}]}
process_steps -> {"title":"string","steps":[{"heading":"3-5 words","description":"one sentence"}]}  // 3-5 sequential steps
pyramid -> {"title":"string","levels":[{"label":"string","description":"optional"}]}  // top = narrowest/highest, 3-4 levels
comparison -> {"title":"string","option_a":{"label":"A","pros":["..."],"cons":["..."]},"option_b":{"label":"B","pros":["..."],"cons":["..."]}}
table -> {"title":"string","headers":["Feature","Option A","Option B"],"rows":[["Speed","Fast","Slow"],["Cost","Low","High"]]}  // first header/column = the row label; 2-4 columns total; use for side-by-side differences
team -> {"title":"Team","members":[{"name":"string","role":"string","bio":"string"}]}
team_image_grid -> {"title":"string","members":[{"name":"string","bio":"string"}]}  // exactly 3 members
icon_grid -> {"title":"string","items":[{"icon":"⚡","heading":"string","description":"string"}]}
agenda -> {"title":"Agenda","items":[{"number":"01","label":"string"}]}
cta -> {"title":"Get started","subtitle":"string","button_label":"Sign up","contact":"email@example.com"}
code -> {"title":"string","language":"python","code":"def fib(n):\n    return n if n < 2 else fib(n-1)+fib(n-2)","caption":"optional one-line explanation"}  // REAL newlines (\n) and indentation inside "code"; never use bullets for code

// Smart diagrams
funnel -> {"title":"string","stages":[{"label":"string","description":"optional"}]}  // top = widest, 3-5 stages
concentric_circles -> {"title":"string","layers":[{"label":"string","description":"optional"}]}  // outermost first, 3-5 layers
venn -> {"title":"string","set_a":{"label":"string","items":["..."]},"set_b":{"label":"string","items":["..."]},"overlap_label":"optional","overlap_items":["..."]}
target -> {"title":"string","rings":[{"label":"string","description":"optional"}]}  // outermost first, 3-5 rings
connected_circles -> {"title":"string","nodes":[{"label":"3 words","description":"one short sentence"}]}  // 3-5 nodes

// Smart charts — pick plausible numbers from the topic, no commentary
bar_chart -> {"title":"string","subtitle":"optional","categories":["Q1","Q2","Q3","Q4"],"series":[{"name":"Revenue","data":[1.2,1.8,2.4,3.1]}]}
line_chart -> {"title":"string","subtitle":"optional","categories":["2020","2021","2022","2023"],"series":[{"name":"Adoption","data":[10,18,32,55]}]}
area_chart -> same shape as line_chart
pie_chart -> {"title":"string","subtitle":"optional","slices":[{"label":"Mobile","value":52},{"label":"Web","value":34},{"label":"API","value":14}]}
donut_chart -> same shape as pie_chart

Reply ONLY with JSON. No explanation, no markdown."""

# Detect placeholder titles produced by the outline-fallback path so we can
# replace them with the LLM-written `content.title` instead of leaving the
# user staring at "Section 3".
import re
_PLACEHOLDER_TITLE_RE = re.compile(
    r"^(section\s*\d+|slide\s*\d+|untitled|part\s*\d+)$",
    re.IGNORECASE,
)


def _is_placeholder_title(t: str) -> bool:
    if not t or not isinstance(t, str):
        return True
    return bool(_PLACEHOLDER_TITLE_RE.match(t.strip()))


def safe_str(val, fallback=""):
    if val is None:
        return fallback
    if isinstance(val, str):
        return val
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, dict):
        return val.get("title") or val.get("text") or val.get("name") or fallback
    if isinstance(val, list):
        return ", ".join(safe_str(v) for v in val)
    return fallback


# Keys whose values are structural (nested dicts/lists the renderers read
# directly) and must pass through `flatten` completely untouched. Charts and
# diagrams live here — e.g. a chart's `series[].data` is an array of numbers
# that must NOT be stringified.
PASSTHROUGH_KEYS = {
    # existing nested layouts
    "stats", "events", "members", "option_a", "option_b", "items",
    "cards", "steps",
    # charts
    "categories", "series", "slices",
    # comparison table (headers + list-of-list rows)
    "headers", "rows",
    # diagrams
    "stages", "layers", "rings", "nodes", "levels",
    "set_a", "set_b", "overlap_items",
    # free-position image overlays
    "overlays",
}

# Fields inside list-items that are themselves arrays and must be preserved
# verbatim (e.g. each chart series carries a `data` array; comparison options
# carry `pros`/`cons` arrays).
PASSTHROUGH_ITEM_LIST_FIELDS = {"data", "pros", "cons", "items"}


def flatten(content: dict) -> dict:
    """Coerce malformed LLM output into the shape the renderers expect.

    Historically this stringified any nested dict/list it didn't recognise —
    which silently destroyed legitimate structured data like chart series.
    It now passes structural keys through verbatim and only coerces scalar
    fields that arrived wrapped in an object (e.g. `{"title": {"text": "…"}}`).
    """
    if not isinstance(content, dict):
        return {}
    result = {}
    for k, v in content.items():
        if k in PASSTHROUGH_KEYS:
            # Structural data — keep exactly as-is.
            result[k] = v
        elif isinstance(v, dict):
            result[k] = safe_str(v)
        elif isinstance(v, list):
            new_list = []
            for item in v:
                if isinstance(item, dict):
                    flat_item = {}
                    for ik, iv in item.items():
                        # Preserve known array fields (chart data, pros/cons);
                        # stringify stray dicts but keep everything else.
                        if ik in PASSTHROUGH_ITEM_LIST_FIELDS and isinstance(iv, list):
                            flat_item[ik] = iv
                        elif isinstance(iv, dict):
                            flat_item[ik] = safe_str(iv)
                        else:
                            flat_item[ik] = iv
                    new_list.append(flat_item)
                else:
                    new_list.append(item)
            result[k] = new_list
        else:
            result[k] = v
    if "title" in result and isinstance(result["title"], dict):
        result["title"] = safe_str(result["title"])
    return result


def parse_json_from_text(text: str) -> dict:
    text = text.strip()
    if "```" in text:
        parts = text.split("```")
        for part in parts:
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("{"):
                text = part
                break
    start = text.find("{")
    end   = text.rfind("}") + 1
    if start >= 0 and end > start:
        text = text[start:end]
    try:
        return json.loads(text)
    except Exception:
        return {}


def _split_overflowing_slides(slides: list) -> list:
    """Break content that can't fit on one slide onto continuation slides
    ("… (1/2)", "(2/2)"), then renumber 1..N. Applies to:
      • `bullets`  — more than 7 points
      • `code`     — more than ~22 lines (so the font stays readable instead of
                     shrinking to nothing)
    Everything stays visible and readable instead of overflowing one slide."""
    MAX_BULLETS = 7
    MAX_CODE_LINES = 14
    out: list = []

    def emit_chunks(s, content, key, chunks, join=None):
        total = len(chunks)
        base_title = s.get("title") or content.get("title") or "Slide"
        for idx, chunk in enumerate(chunks):
            part = dict(s)
            new_content = dict(content)
            new_content[key] = join.join(chunk) if join is not None else chunk
            title = base_title if total == 1 else f"{base_title} ({idx + 1}/{total})"
            new_content["title"] = title
            part["title"] = title
            part["content"] = new_content
            if idx > 0:
                part["id"] = str(uuid4())
                part["image_url"] = None  # continuation slides don't reuse the image
            out.append(part)

    for s in slides:
        content = s.get("content") or {}
        layout = s.get("layout_type")
        bullets = content.get("bullets")
        code = content.get("code")

        if layout == "bullets" and isinstance(bullets, list) and len(bullets) > MAX_BULLETS:
            chunks = [bullets[i:i + MAX_BULLETS] for i in range(0, len(bullets), MAX_BULLETS)]
            emit_chunks(s, content, "bullets", chunks)
        elif layout == "code" and isinstance(code, str) and code.count("\n") + 1 > MAX_CODE_LINES:
            lines = code.split("\n")
            chunks = [lines[i:i + MAX_CODE_LINES] for i in range(0, len(lines), MAX_CODE_LINES)]
            emit_chunks(s, content, "code", chunks, join="\n")
        else:
            out.append(s)

    for i, s in enumerate(out):
        s["slide_number"] = i + 1
    return out


async def build_presentation_stream(
    presentation_id: str,
    topic: str,
    tone: str,
    audience: str,
    content_density: str,
    slide_count: int,
    theme: str,
    language: str,
    emit: Callable,
    outline_override: Optional[list] = None,
):
    app_data = Path(os.getenv("APP_DATA_DIR", "./app_data"))
    pres_dir = app_data / "presentations" / str(presentation_id)
    pres_dir.mkdir(parents=True, exist_ok=True)

    # Phase 1: Outline
    print(">>> PHASE 1: Outline", flush=True)
    await emit(StreamEvent.OUTLINE_START, {})

    # Pick up source-document text saved alongside the presentation, if any.
    source_excerpt = ""
    source_path = pres_dir / "source.txt"
    if source_path.exists():
        try:
            raw = source_path.read_text(encoding="utf-8")
            # Cap what we feed to the LLM so the prompt stays affordable.
            source_excerpt = raw[:8000].strip()
        except Exception:
            source_excerpt = ""

    if outline_override:
        outline_slides = outline_override
        title = topic[:60]
        await emit(StreamEvent.OUTLINE_DONE, {"outline": outline_slides, "title": title})
    else:
        outline_prompt = (
            f'Topic: "{topic}". Audience: {audience or "general"}. '
            f'Tone: {tone}. Slides: {slide_count}. Language: {language}.\n'
            f'First slide must be layout_type "title". Create outline JSON.'
        )
        if source_excerpt:
            outline_prompt = (
                f'Source document (use as the primary basis):\n"""\n{source_excerpt}\n"""\n\n'
                + outline_prompt
            )

        print(">>> Calling LLM for outline", flush=True)
        outline_text = ""
        async for token in llm_client.stream_text(OUTLINE_SYSTEM, outline_prompt):
            outline_text += token
            await emit(StreamEvent.OUTLINE_CHUNK, {"token": token})

        print(f">>> Outline text length: {len(outline_text)}", flush=True)
        parsed = parse_json_from_text(outline_text)
        outline_slides = parsed.get("slides", [])
        title = parsed.get("title", topic[:60])

        if not outline_slides:
            print(">>> Using fallback outline (logical narrative order)", flush=True)
            # Content-aware default scaffold in a FIXED LOGICAL ORDER so a
            # parse failure still yields a well-structured deck: open → set
            # context → build concepts → detail/mechanism → data → implications
            # → close. Layouts vary, but the sequence of ideas always flows.
            # Each entry: (layout, title_template, hint).
            NARRATIVE = [
                ("agenda",          "Agenda",                            "overview of what's coming"),
                ("bullets",         "Introduction to {t}",               "background and why it matters"),
                ("bullets",         "Key Concepts of {t}",               "foundational ideas"),
                ("arrow_columns",   "Core Components of {t}",            "the main parts, in parallel"),
                ("process_steps",   "How {t} Works",                     "step-by-step mechanism"),
                ("image_with_cards","Why {t} Matters",                   "real-world significance"),
                ("stats",           "{t} by the Numbers",                "supporting data"),
                ("comparison",      "{t}: Strengths & Trade-offs",       "balanced comparison"),
                ("timeline",        "Evolution of {t}",                  "how it developed over time"),
                ("two_column",      "Applications & Challenges of {t}",  "where it's used and limits"),
                ("bullets",         "Best Practices for {t}",            "practical guidance"),
                ("bullets",         "The Future of {t}",                 "what's next"),
            ]
            CLOSER = ("bullets", "Key Takeaways", "summary of the most important points")

            # Slide 1 = title; final slide = closer; middle follows NARRATIVE order.
            scaffold = [("title", topic[:60], "introduce the topic")]
            n_rest = max(0, slide_count - 1)
            if n_rest >= 1:
                body = NARRATIVE[: max(0, n_rest - 1)]
                scaffold.extend(body)
                scaffold.append(CLOSER)  # always end on a synthesis

            outline_slides = [
                {
                    "slide_number": i + 1,
                    "title": scaffold[i][1].format(t=topic),
                    "layout_type": scaffold[i][0],
                    "key_points": [scaffold[i][2], topic],
                }
                for i in range(min(slide_count, len(scaffold)))
            ]
            title = topic[:60]

        print(f">>> Outline done: {len(outline_slides)} slides", flush=True)
        await emit(StreamEvent.OUTLINE_DONE, {"outline": outline_slides, "title": title})

    await emit(StreamEvent.STRUCTURE_DONE, {"slides": outline_slides})

    # Phase 2: Generate slides one by one
    print(">>> PHASE 2: Slides", flush=True)
    completed_slides = []

    async def generate_slide(slot: dict) -> dict:
        slide_num   = slot.get("slide_number", 1)
        layout_type = slot.get("layout_type", "bullets")
        slide_title = slot.get("title", f"Slide {slide_num}")
        key_points  = slot.get("key_points", [slide_title])

        print(f">>> Generating slide {slide_num}: {slide_title}", flush=True)
        await emit(StreamEvent.SLIDE_START, {
            "slide_number": slide_num,
            "layout_type": layout_type,
            "title": slide_title,
        })

        # If the outline gave a placeholder title (e.g. "Section 3" from the
        # fallback path), tell the LLM to invent a content-specific headline.
        title_directive = (
            "Invent a short, specific headline for this slide based on the key points "
            "(do NOT use a placeholder like 'Section N')."
            if _is_placeholder_title(slide_title)
            else f'Suggested title: "{slide_title}" (you may improve it).'
        )
        slide_prompt = (
            f'{title_directive} Layout: {layout_type}. '
            f'Key points: {", ".join(str(p) for p in key_points[:5])}. '
            f'Topic context: "{topic}". '
            f'Language: {language}. Write content JSON.'
        )

        content_text = ""
        last_partial: dict = {}
        tokens_since_parse = 0
        async for token in llm_client.stream_text(SLIDE_SYSTEM, slide_prompt):
            content_text += token
            await emit(StreamEvent.SLIDE_CONTENT_CHUNK, {
                "slide_number": slide_num,
                "token": token,
            })

            # Re-parse partial JSON every few tokens. Cheap regex-based pass
            # — emits only when fields have actually changed so the frontend
            # can render title-first / bullets-as-they-arrive (Gamma style).
            tokens_since_parse += 1
            if tokens_since_parse >= 3 or "}" in token or "," in token or "]" in token:
                tokens_since_parse = 0
                current = extract_partial(content_text)
                diff = changed_fields(last_partial, current)
                if diff:
                    last_partial = current
                    await emit(StreamEvent.SLIDE_PARTIAL, {
                        "slide_number": slide_num,
                        "layout_type": layout_type,
                        "title": slide_title,
                        "content": current,
                    })

        raw     = parse_json_from_text(content_text)
        content = flatten(raw) if raw else {"title": slide_title, "bullets": key_points[:5]}
        if "title" not in content or not isinstance(content.get("title"), str):
            content["title"] = slide_title

        # The LLM-written content.title is authoritative — only fall back to
        # the outline title when content.title is empty or itself a placeholder.
        content_title = (content.get("title") or "").strip()
        if content_title and not _is_placeholder_title(content_title):
            final_title = content_title
        elif not _is_placeholder_title(slide_title):
            final_title = slide_title
            content["title"] = slide_title
        else:
            # Last-resort: derive from the first key point so the slide is
            # never labeled "Section N" in the persisted DB row.
            kp_first = (key_points[0] if key_points else "").strip()
            final_title = kp_first[:60] or slide_title
            content["title"] = final_title

        slide_data = {
            "id": str(uuid4()),
            "slide_number": slide_num,
            "layout_type": layout_type,
            "title": final_title,
            "content": content,
            "speaker_notes": "",
            "image_prompt": None,
            "image_url": None,
        }

        await emit(StreamEvent.SLIDE_DONE, {"slide": slide_data})
        print(f">>> Slide {slide_num} done", flush=True)

        # Image — only for layouts that actually display one. Per-member
        # portrait generation for team_image_grid is handled separately
        # below.
        image_layouts = {"bullets", "image_left", "image_right", "image_with_cards"}
        if layout_type in image_layouts:
            theme_hint = THEME_IMAGE_HINTS.get(theme, "")
            image_prompt = (
                f"professional editorial illustration about {slide_title}, "
                f"{theme_hint}, no text, clean composition, high quality"
            ).strip()
            slide_data["image_prompt"] = image_prompt
            await emit(StreamEvent.IMAGE_START, {"slide_number": slide_num})

            async def progress_cb(pct: int):
                await emit(StreamEvent.IMAGE_PROGRESS, {"slide_number": slide_num, "percent": pct})

            image_id = str(uuid4())
            img_path = await image_service.generate(
                prompt=image_prompt,
                image_id=image_id,
                progress_callback=progress_cb,
            )
            if img_path:
                image_url = f"/app_data/images/{image_id}.png"
                slide_data["image_url"] = image_url
                content["image_url"]   = image_url
                await emit(StreamEvent.IMAGE_DONE, {
                    "slide_number": slide_num,
                    "image_url": image_url,
                })

        # team_image_grid: per-member portrait. Skipped if the layout has
        # no members or member already has an image_url.
        if layout_type == "team_image_grid":
            theme_hint = THEME_IMAGE_HINTS.get(theme, "")
            members = content.get("members", []) if isinstance(content, dict) else []
            if isinstance(members, list):
                await emit(StreamEvent.IMAGE_START, {"slide_number": slide_num})
                for m in members[:3]:
                    if not isinstance(m, dict):
                        continue
                    if m.get("image_url"):
                        continue
                    name = m.get("name", "person")
                    role = m.get("role", "")
                    mp = (
                        f"professional portrait of {name}{' (' + role + ')' if role else ''}, "
                        f"headshot, neutral background, {theme_hint}, no text, high quality"
                    ).strip()
                    mid = str(uuid4())
                    p = await image_service.generate(prompt=mp, image_id=mid)
                    if p:
                        m["image_url"] = f"/app_data/images/{mid}.png"
                content["members"] = members
                await emit(StreamEvent.IMAGE_DONE, {
                    "slide_number": slide_num,
                    "image_url": None,
                })

        return slide_data

    for slot in outline_slides:
        try:
            slide = await generate_slide(slot)
            completed_slides.append(slide)
        except Exception as e:
            print(f">>> Slide {slot.get('slide_number')} error: {e}", flush=True)
            completed_slides.append({
                "id": str(uuid4()),
                "slide_number": slot.get("slide_number", len(completed_slides) + 1),
                "layout_type": "bullets",
                "title": slot.get("title", "Slide"),
                "content": {"title": slot.get("title", "Slide"), "bullets": slot.get("key_points", [])},
                "speaker_notes": "",
                "image_prompt": None,
                "image_url": None,
            })

    completed_slides.sort(key=lambda s: s["slide_number"])

    # Auto-expand: if a bullets slide came back with far more points than fit,
    # spill the overflow onto continuation slide(s) instead of cramming them.
    completed_slides = _split_overflowing_slides(completed_slides)

    # Save JSON
    ppt_json = {
        "id": str(presentation_id),
        "title": title,
        "topic": topic,
        "theme": theme,
        "tone": tone,
        "language": language,
        "created_at": datetime.utcnow().isoformat(),
        "slides": completed_slides,
    }
    (pres_dir / "data.json").write_text(json.dumps(ppt_json, indent=2))

    print(">>> GENERATION COMPLETE", flush=True)
    await emit(StreamEvent.GENERATION_COMPLETE, {
        "presentation": ppt_json,
        "json_path": str(pres_dir / "data.json"),
    })

    return ppt_json
