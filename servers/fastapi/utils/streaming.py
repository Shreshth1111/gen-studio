import json
from typing import AsyncGenerator


class StreamEvent:
    OUTLINE_START       = "outline_start"
    OUTLINE_CHUNK       = "outline_chunk"
    OUTLINE_DONE        = "outline_done"
    STRUCTURE_START     = "structure_start"
    STRUCTURE_DONE      = "structure_done"
    SLIDE_START         = "slide_start"
    SLIDE_CONTENT_CHUNK = "slide_content_chunk"
    SLIDE_PARTIAL       = "slide_partial"
    SLIDE_DONE          = "slide_done"
    IMAGE_START         = "image_start"
    IMAGE_PROGRESS      = "image_progress"
    IMAGE_DONE          = "image_done"
    GENERATION_COMPLETE = "generation_complete"
    ERROR               = "error"


def format_sse(event_type: str, data: dict) -> str:
    """Format an SSE message."""
    payload = json.dumps(data)
    return f"event: {event_type}\ndata: {payload}\n\n"
