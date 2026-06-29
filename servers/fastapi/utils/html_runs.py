"""Tiny HTML → PPTX-runs converter.

The rich-text editor in the frontend stores its text as small HTML
fragments. To export those into PowerPoint we walk the HTML tree, track
inline-formatting state (bold/italic/underline/strike/color/link), and emit
flat lists of "runs" grouped by paragraph. Each run carries its formatting
so the exporter can drop multiple distinct runs into a single PPTX paragraph
with the correct fonts.

Block-level elements (`<p>`, `<div>`, `<ul>`/`<ol>` items, `<br>`) terminate
the current paragraph. Lists prepend a bullet glyph (`•  `) or number-of-i
(`1.  `, `2.  ` …) for ordered lists.

Alignment is captured per-paragraph via `text-align` style or `<center>`.

The implementation uses Python's stdlib `html.parser` so we don't add a
beautifulsoup dependency.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import List, Optional
import re


@dataclass
class Run:
    text: str
    bold: bool = False
    italic: bool = False
    underline: bool = False
    strike: bool = False
    color: Optional[str] = None  # "#RRGGBB" or None
    link: Optional[str] = None


@dataclass
class Paragraph:
    runs: List[Run] = field(default_factory=list)
    # PowerPoint alignment hint. None means "use the caller's default".
    align: Optional[str] = None  # "left" | "center" | "right"
    # Bullet prefix already baked into the first run, but we still expose
    # whether the paragraph came from a list so callers can adjust spacing.
    is_list_item: bool = False


# Tags that toggle inline formatting bits.
_INLINE_MARKS = {
    "b":      "bold",
    "strong": "bold",
    "i":      "italic",
    "em":     "italic",
    "u":      "underline",
    "s":      "strike",
    "strike": "strike",
    "del":    "strike",
}

# Tags that break out of the current paragraph.
_BLOCK_TAGS = {
    "p", "div", "section", "header", "footer", "article",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "li", "br",
}


_COLOR_STYLE_RE = re.compile(r"color\s*:\s*([^;]+)", re.IGNORECASE)
_ALIGN_STYLE_RE = re.compile(r"text-align\s*:\s*(left|center|right)", re.IGNORECASE)
_HEX_COLOR_RE = re.compile(r"^#?([0-9a-fA-F]{6})$")
_RGB_COLOR_RE = re.compile(r"rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)")


def _normalise_color(raw: str) -> Optional[str]:
    raw = raw.strip().strip(";")
    if not raw:
        return None
    if raw == "currentColor":
        return None
    m = _HEX_COLOR_RE.match(raw)
    if m:
        return "#" + m.group(1).upper()
    m = _RGB_COLOR_RE.match(raw)
    if m:
        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"#{r:02X}{g:02X}{b:02X}"
    return None


class _HtmlToParagraphs(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._paragraphs: List[Paragraph] = []
        self._cur = Paragraph()
        # Stack of (mark_name, mark_value) entries we have to pop on the
        # matching close-tag. We use a stack of frames so nested tags
        # restore the previous formatting cleanly.
        self._stack: List[dict] = []
        # List nesting: each entry is ("ul", index) or ("ol", index).
        self._list_stack: List[List] = []  # mutable inner list: [type, counter]
        self._cur_align: Optional[str] = None

    # ── State helpers ─────────────────────────────────────────────────────
    def _current_marks(self) -> dict:
        marks = {
            "bold": False, "italic": False, "underline": False,
            "strike": False, "color": None, "link": None,
        }
        for f in self._stack:
            for k, v in f.items():
                if v is False:
                    continue
                marks[k] = v
        return marks

    def _emit(self, text: str):
        if not text:
            return
        m = self._current_marks()
        # Merge with the trailing run if its marks are identical.
        if self._cur.runs:
            last = self._cur.runs[-1]
            if (last.bold == m["bold"] and last.italic == m["italic"]
                and last.underline == m["underline"] and last.strike == m["strike"]
                and last.color == m["color"] and last.link == m["link"]):
                last.text += text
                return
        self._cur.runs.append(Run(
            text=text,
            bold=m["bold"], italic=m["italic"],
            underline=m["underline"], strike=m["strike"],
            color=m["color"], link=m["link"],
        ))

    def _flush_paragraph(self, align: Optional[str] = None, list_item: bool = False):
        # Skip pushing empty paragraphs unless they're explicit blank lines.
        text = "".join(r.text for r in self._cur.runs)
        if text.strip() == "" and not list_item:
            self._cur = Paragraph()
            return
        if align is not None:
            self._cur.align = align
        elif self._cur_align is not None:
            self._cur.align = self._cur_align
        self._cur.is_list_item = list_item
        self._paragraphs.append(self._cur)
        self._cur = Paragraph()

    # ── HTMLParser callbacks ──────────────────────────────────────────────
    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        attrs_dict = dict(attrs)

        if tag in _BLOCK_TAGS or tag in ("ul", "ol"):
            # Close the running paragraph first so block elements get their
            # own line.
            self._flush_paragraph()

        if tag in _INLINE_MARKS:
            self._stack.append({_INLINE_MARKS[tag]: True})
            return
        if tag == "a":
            href = attrs_dict.get("href") or ""
            # Links default to underline + accent — but accent isn't known
            # here, so just underline and let the caller theme it via the
            # link field if desired.
            self._stack.append({"underline": True, "link": href})
            return
        if tag == "font":
            color = attrs_dict.get("color")
            normalised = _normalise_color(color) if color else None
            if normalised:
                self._stack.append({"color": normalised})
            else:
                self._stack.append({})
            return
        if tag == "span":
            style = attrs_dict.get("style", "")
            color_m = _COLOR_STYLE_RE.search(style)
            normalised = _normalise_color(color_m.group(1)) if color_m else None
            frame = {}
            if normalised:
                frame["color"] = normalised
            self._stack.append(frame)
            return
        if tag in ("p", "div"):
            style = attrs_dict.get("style", "")
            align_m = _ALIGN_STYLE_RE.search(style)
            self._cur_align = align_m.group(1).lower() if align_m else None
            return
        if tag == "center":
            self._cur_align = "center"
            return
        if tag == "ul":
            self._list_stack.append(["ul", 0])
            return
        if tag == "ol":
            self._list_stack.append(["ol", 0])
            return
        if tag == "li":
            # Inject bullet/number prefix as a leading run.
            if self._list_stack:
                top = self._list_stack[-1]
                top[1] += 1
                prefix = f"{top[1]}.  " if top[0] == "ol" else "•  "
            else:
                prefix = "•  "
            self._emit(prefix)
            return
        if tag == "br":
            self._flush_paragraph()
            return

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in _INLINE_MARKS or tag in ("a", "font", "span"):
            if self._stack:
                self._stack.pop()
            return
        if tag in ("p", "div"):
            self._flush_paragraph(align=self._cur_align)
            self._cur_align = None
            return
        if tag == "center":
            self._flush_paragraph(align="center")
            self._cur_align = None
            return
        if tag == "li":
            self._flush_paragraph(list_item=True)
            return
        if tag in ("ul", "ol"):
            if self._list_stack:
                self._list_stack.pop()
            return
        if tag in _BLOCK_TAGS:
            self._flush_paragraph()

    def handle_data(self, data):
        # Collapse runs of whitespace but preserve single spaces.
        text = re.sub(r"[ \t]+", " ", data.replace("\r", ""))
        # Skip pure whitespace between block tags.
        if text.strip() == "" and not self._cur.runs:
            return
        self._emit(text)

    # ── Result ────────────────────────────────────────────────────────────
    def finish(self) -> List[Paragraph]:
        # Push the trailing paragraph if it has content.
        self._flush_paragraph()
        # Strip leading/trailing empty paragraphs.
        while self._paragraphs and not "".join(r.text for r in self._paragraphs[0].runs).strip():
            self._paragraphs.pop(0)
        while self._paragraphs and not "".join(r.text for r in self._paragraphs[-1].runs).strip():
            self._paragraphs.pop()
        return self._paragraphs


# Anything between `<` and `>` that doesn't look like a valid tag character
# is treated as plain text — saves us from misclassifying `5 < 10` etc.
_HTML_TAG_RE = re.compile(r"<\s*/?[A-Za-z][^>]*>")


def looks_like_html(s: str) -> bool:
    return bool(s) and bool(_HTML_TAG_RE.search(s))


def parse(text_or_html: str) -> List[Paragraph]:
    """Return a list of Paragraphs. Plain text is split on `\n` and emitted
    as single-run paragraphs."""
    if text_or_html is None:
        return []
    if not isinstance(text_or_html, str):
        text_or_html = str(text_or_html)
    if not looks_like_html(text_or_html):
        return [Paragraph(runs=[Run(text=line)]) for line in text_or_html.split("\n")]
    parser = _HtmlToParagraphs()
    parser.feed(text_or_html)
    parser.close()
    return parser.finish()
