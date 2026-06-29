"""Permissive partial-JSON field extractor.

LLM streams emit one JSON object across many tokens. Until the object is
complete, ``json.loads`` fails — but each "complete-so-far" field is already
visible in the buffer. This module pulls out those fields so the frontend
can render content as it arrives (title first, bullets one at a time, etc.),
exactly the way Gamma AI does it.

It does NOT attempt to be a full JSON parser; it relies on the slide-content
schemas being shallow (one level of nesting at most). Stray characters, leading
markdown fences, or unfinished tokens are tolerated.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List


# ── Regexes ───────────────────────────────────────────────────────────────────
# Match "key": "value" where value is a complete JSON string (closing quote
# present and not escaped). Non-greedy on value content.
_STRING_FIELD_RE = re.compile(
    r'"([A-Za-z_][A-Za-z0-9_]*)"\s*:\s*"((?:[^"\\]|\\.)*)"'
)

# Match an array: "key": [ ... ] (or "key": [ ... — unclosed). We capture
# everything up to the matching close bracket OR end-of-buffer.
_ARRAY_FIELD_RE = re.compile(
    r'"([A-Za-z_][A-Za-z0-9_]*)"\s*:\s*\['
)

# Inside an array body, finds completed string elements: "..."
_ARR_STRING_ITEM_RE = re.compile(r'"((?:[^"\\]|\\.)*)"')


def _decode_json_string(raw: str) -> str:
    """Decode a JSON-escaped string body into a Python string."""
    try:
        return json.loads(f'"{raw}"')
    except Exception:
        return raw


def _find_array_body(buffer: str, start: int) -> str:
    """Given the index right after `[`, return the body up to the matching `]`
    or to end-of-buffer. Tracks nested brackets and respects string quoting so
    a `]` inside a string doesn't end the array.
    """
    depth_sq = 1  # we just consumed `[`
    depth_cu = 0
    in_str = False
    escape = False
    end = len(buffer)
    for i in range(start, len(buffer)):
        ch = buffer[i]
        if escape:
            escape = False
            continue
        if in_str:
            if ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "[":
            depth_sq += 1
        elif ch == "]":
            depth_sq -= 1
            if depth_sq == 0:
                end = i
                break
        elif ch == "{":
            depth_cu += 1
        elif ch == "}":
            depth_cu -= 1
    return buffer[start:end]


def _split_object_items(body: str) -> List[str]:
    """Split an array body on top-level commas, returning the segments
    that look like complete `{...}` objects."""
    items: List[str] = []
    depth = 0
    in_str = False
    escape = False
    start = -1
    for i, ch in enumerate(body):
        if escape:
            escape = False
            continue
        if in_str:
            if ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                items.append(body[start : i + 1])
                start = -1
    return items


def extract_partial(buffer: str) -> Dict[str, Any]:
    """Extract a best-effort dict of top-level fields visible so far.

    Only fields whose value can be confidently parsed are returned. Everything
    else is silently ignored — the next call (with more tokens appended) may
    surface it.

    Returned structure (top-level only):
        - simple string field      → str
        - array of strings         → list[str]
        - array of objects         → list[dict] (each dict's own string fields
                                     are parsed shallowly)

    String fields that appear *inside* an array body are NOT promoted to the
    top level (so e.g. `stats[0].label` doesn't leak out as a top-level
    `label`).
    """
    result: Dict[str, Any] = {}

    # 1) Find every top-level array first and remember its span so we can
    #    exclude string-field matches that fall within it from the top level.
    array_spans: List[tuple[int, int, str, str]] = []  # (body_start, body_end, key, body)
    for m in _ARRAY_FIELD_RE.finditer(buffer):
        body = _find_array_body(buffer, m.end())
        body_start = m.end()
        body_end = body_start + len(body)
        array_spans.append((body_start, body_end, m.group(1), body))

    def _inside_any_array(pos: int) -> bool:
        for start, end, _k, _b in array_spans:
            if start <= pos < end:
                return True
        return False

    # 2) Top-level simple string fields (skip ones inside an array).
    for m in _STRING_FIELD_RE.finditer(buffer):
        if _inside_any_array(m.start()):
            continue
        result.setdefault(m.group(1), _decode_json_string(m.group(2)))

    # 3) Arrays of strings vs arrays of objects.
    for _start, _end, key, body in array_spans:
        body_stripped = body.lstrip()
        if body_stripped.startswith("{"):
            objs: List[Dict[str, Any]] = []
            for obj_text in _split_object_items(body):
                obj_fields: Dict[str, Any] = {}
                for sm in _STRING_FIELD_RE.finditer(obj_text):
                    obj_fields[sm.group(1)] = _decode_json_string(sm.group(2))
                if obj_fields:
                    objs.append(obj_fields)
            if objs:
                result[key] = objs
        else:
            items: List[str] = []
            for sm in _ARR_STRING_ITEM_RE.finditer(body):
                items.append(_decode_json_string(sm.group(1)))
            if items:
                result[key] = items

    return result


def changed_fields(prev: Dict[str, Any], curr: Dict[str, Any]) -> Dict[str, Any]:
    """Return only the fields in `curr` that differ from `prev`.

    Used to avoid emitting redundant slide_partial events on every token.
    """
    diff: Dict[str, Any] = {}
    for k, v in curr.items():
        if prev.get(k) != v:
            diff[k] = v
    return diff
