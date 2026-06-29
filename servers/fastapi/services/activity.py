"""
activity.py — fire-and-forget audit logging.

`log_activity()` writes one ActivityLog row. It is deliberately defensive: any
failure is swallowed so audit logging can NEVER break a user-facing request.
Settings helpers read/cache the AppSetting key/value table.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from uuid import UUID

import json as _json
from models.sql.platform import ActivityLog, AppSetting, GenerationLog


async def log_activity(
    session: AsyncSession,
    *,
    action: str,
    user_id: Optional[UUID] = None,
    username: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    detail: Optional[str] = None,
    ip_address: Optional[str] = None,
    commit: bool = True,
) -> None:
    """Record an action. Never raises."""
    try:
        session.add(ActivityLog(
            action=action, user_id=user_id, username=username,
            entity_type=entity_type, entity_id=entity_id,
            detail=detail, ip_address=ip_address,
        ))
        if commit:
            await session.commit()
    except Exception:
        try:
            await session.rollback()
        except Exception:
            pass


async def log_generation(
    session: AsyncSession,
    *,
    user_id: UUID,
    kind: str,
    username: Optional[str] = None,
    presentation_id=None,
    slide_id=None,
    title: Optional[str] = None,
    prompt: Optional[str] = None,
    params=None,
    result=None,
    model_used: Optional[str] = None,
    commit: bool = True,
) -> None:
    """Record one AI generation (prompt + output) so it can be retrieved
    later and browsed by admins. Never raises. `params`/`result` may be dicts
    (serialised to JSON) or strings; oversized values are truncated."""
    def _ser(v, cap):
        if v is None:
            return None
        s = v if isinstance(v, str) else _json.dumps(v, default=str)
        return s[:cap]
    try:
        session.add(GenerationLog(
            user_id=user_id, username=username, kind=kind,
            presentation_id=presentation_id, slide_id=slide_id,
            title=(title or "")[:200] or None,
            prompt=_ser(prompt, 8000), params=_ser(params, 4000),
            result=_ser(result, 200000), model_used=model_used,
        ))
        if commit:
            await session.commit()
    except Exception:
        try:
            await session.rollback()
        except Exception:
            pass


async def get_setting(session: AsyncSession, key: str, default: str = "") -> str:
    try:
        row = (await session.execute(select(AppSetting).where(AppSetting.key == key))).scalars().first()
        return row.value if row else default
    except Exception:
        return default


async def setting_is_true(session: AsyncSession, key: str, default: bool = True) -> bool:
    val = await get_setting(session, key, "true" if default else "false")
    return str(val).strip().lower() in ("1", "true", "yes", "on")
