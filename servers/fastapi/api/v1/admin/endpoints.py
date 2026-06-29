"""Admin control panel API.

Every route here is gated by `require_admin`, so only users with the admin
role can read analytics or mutate other accounts.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from pydantic import BaseModel
from datetime import datetime, timedelta
from uuid import UUID
from typing import Optional

from database import get_session
from models.sql.user import User
from models.sql.presentation import Presentation, Slide, GeneratedImage
from models.sql.platform import ActivityLog, AppSetting, GenerationLog
from api.v1.auth.endpoints import require_admin
from services.activity import log_activity

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────
class AdminStats(BaseModel):
    total_users: int
    active_users: int
    admin_users: int
    total_presentations: int
    total_slides: int
    total_images: int
    presentations_by_status: dict
    new_users_7d: int
    new_presentations_7d: int


class AdminUserRow(BaseModel):
    id: UUID
    username: str
    email: str
    is_active: bool
    is_admin: bool
    created_at: datetime
    last_login_at: Optional[datetime]
    presentation_count: int


class AdminPresentationRow(BaseModel):
    id: UUID
    title: str
    topic: str
    theme: str
    status: str
    slide_count: int
    created_at: datetime
    owner_username: Optional[str]
    owner_email: Optional[str]


class UserUpdate(BaseModel):
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None


# ── Analytics ──────────────────────────────────────────────────────────────
@router.get("/stats", response_model=AdminStats)
async def get_stats(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    week_ago = datetime.utcnow() - timedelta(days=7)

    total_users = (await session.execute(select(func.count(User.id)))).scalar() or 0
    active_users = (await session.execute(
        select(func.count(User.id)).where(User.is_active == True)  # noqa: E712
    )).scalar() or 0
    admin_users = (await session.execute(
        select(func.count(User.id)).where(User.is_admin == True)  # noqa: E712
    )).scalar() or 0
    new_users_7d = (await session.execute(
        select(func.count(User.id)).where(User.created_at >= week_ago)
    )).scalar() or 0

    total_pres = (await session.execute(select(func.count(Presentation.id)))).scalar() or 0
    total_slides = (await session.execute(select(func.count(Slide.id)))).scalar() or 0
    total_images = (await session.execute(select(func.count(GeneratedImage.id)))).scalar() or 0
    new_pres_7d = (await session.execute(
        select(func.count(Presentation.id)).where(Presentation.created_at >= week_ago)
    )).scalar() or 0

    status_rows = (await session.execute(
        select(Presentation.status, func.count(Presentation.id)).group_by(Presentation.status)
    )).all()
    by_status = {row[0] or "unknown": row[1] for row in status_rows}

    return AdminStats(
        total_users=total_users,
        active_users=active_users,
        admin_users=admin_users,
        total_presentations=total_pres,
        total_slides=total_slides,
        total_images=total_images,
        presentations_by_status=by_status,
        new_users_7d=new_users_7d,
        new_presentations_7d=new_pres_7d,
    )


# ── Users ──────────────────────────────────────────────────────────────────
@router.get("/users", response_model=list[AdminUserRow])
async def list_users(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    # Presentation counts per user, in one grouped query.
    counts = dict(
        (row[0], row[1])
        for row in (await session.execute(
            select(Presentation.user_id, func.count(Presentation.id)).group_by(Presentation.user_id)
        )).all()
    )
    users = (await session.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
    return [
        AdminUserRow(
            id=u.id,
            username=u.username,
            email=u.email,
            is_active=u.is_active,
            is_admin=u.is_admin,
            created_at=u.created_at,
            last_login_at=u.last_login_at,
            presentation_count=counts.get(u.id, 0),
        )
        for u in users
    ]


@router.patch("/users/{user_id}", response_model=AdminUserRow)
async def update_user(
    user_id: UUID,
    body: UserUpdate,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    user = (await session.execute(select(User).where(User.id == user_id))).scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Guard rails: an admin can't lock themselves out or self-demote.
    if user.id == admin.id and body.is_active is False:
        raise HTTPException(status_code=400, detail="You can't deactivate your own account")
    if user.id == admin.id and body.is_admin is False:
        raise HTTPException(status_code=400, detail="You can't revoke your own admin role")

    if body.is_active is not None:
        user.is_active = body.is_active
    if body.is_admin is not None:
        user.is_admin = body.is_admin
    session.add(user)
    await session.commit()
    await session.refresh(user)
    await log_activity(session, action="admin.user_update", user_id=admin.id,
                       username=admin.username, entity_type="user", entity_id=str(user.id),
                       detail=f"active={user.is_active} admin={user.is_admin}")

    count = (await session.execute(
        select(func.count(Presentation.id)).where(Presentation.user_id == user.id)
    )).scalar() or 0
    return AdminUserRow(
        id=user.id, username=user.username, email=user.email,
        is_active=user.is_active, is_admin=user.is_admin,
        created_at=user.created_at, last_login_at=user.last_login_at,
        presentation_count=count,
    )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: UUID,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You can't delete your own account")
    user = (await session.execute(select(User).where(User.id == user_id))).scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Cascade: remove the user's presentations, their slides, and images.
    pres_ids = [
        r[0] for r in (await session.execute(
            select(Presentation.id).where(Presentation.user_id == user_id)
        )).all()
    ]
    if pres_ids:
        await session.execute(delete(GeneratedImage).where(GeneratedImage.presentation_id.in_(pres_ids)))
        await session.execute(delete(Slide).where(Slide.presentation_id.in_(pres_ids)))
        await session.execute(delete(Presentation).where(Presentation.id.in_(pres_ids)))
    await session.execute(delete(User).where(User.id == user_id))
    await session.commit()
    await log_activity(session, action="admin.user_delete", user_id=admin.id,
                       username=admin.username, entity_type="user", entity_id=str(user_id),
                       detail=f"removed {len(pres_ids)} decks")
    return {"deleted": str(user_id), "presentations_removed": len(pres_ids)}


# ── Presentations (all users) ──────────────────────────────────────────────
@router.get("/presentations", response_model=list[AdminPresentationRow])
async def list_all_presentations(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
    limit: int = 100,
):
    rows = (await session.execute(
        select(Presentation, User.username, User.email)
        .join(User, User.id == Presentation.user_id, isouter=True)
        .order_by(Presentation.created_at.desc())
        .limit(limit)
    )).all()
    return [
        AdminPresentationRow(
            id=p.id, title=p.title or p.topic, topic=p.topic, theme=p.theme,
            status=p.status, slide_count=p.slide_count, created_at=p.created_at,
            owner_username=uname, owner_email=uemail,
        )
        for (p, uname, uemail) in rows
    ]


@router.delete("/presentations/{presentation_id}")
async def admin_delete_presentation(
    presentation_id: UUID,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    p = (await session.execute(
        select(Presentation).where(Presentation.id == presentation_id)
    )).scalars().first()
    if not p:
        raise HTTPException(status_code=404, detail="Presentation not found")
    await session.execute(delete(GeneratedImage).where(GeneratedImage.presentation_id == presentation_id))
    await session.execute(delete(Slide).where(Slide.presentation_id == presentation_id))
    await session.execute(delete(Presentation).where(Presentation.id == presentation_id))
    await session.commit()
    await log_activity(session, action="admin.deck_delete", user_id=admin.id,
                       username=admin.username, entity_type="presentation",
                       entity_id=str(presentation_id))
    return {"deleted": str(presentation_id)}


# ════════════════════════════════════════════════════════════════════════
# Activity log
# ════════════════════════════════════════════════════════════════════════
class ActivityRow(BaseModel):
    id: UUID
    user_id: Optional[UUID]
    username: Optional[str]
    action: str
    entity_type: Optional[str]
    entity_id: Optional[str]
    detail: Optional[str]
    ip_address: Optional[str]
    created_at: datetime


@router.get("/activity", response_model=list[ActivityRow])
async def get_activity(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
    limit: int = 100,
    action: Optional[str] = None,
):
    q = select(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(min(limit, 500))
    if action:
        q = q.where(ActivityLog.action == action)
    rows = (await session.execute(q)).scalars().all()
    return [ActivityRow(**r.model_dump()) for r in rows]


# ════════════════════════════════════════════════════════════════════════
# Global settings (runtime admin control)
# ════════════════════════════════════════════════════════════════════════
class SettingRow(BaseModel):
    key: str
    value: str
    description: Optional[str]
    updated_at: datetime


class SettingUpdate(BaseModel):
    value: str


@router.get("/settings", response_model=list[SettingRow])
async def list_settings(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    rows = (await session.execute(select(AppSetting).order_by(AppSetting.key))).scalars().all()
    return [SettingRow(key=r.key, value=r.value, description=r.description, updated_at=r.updated_at) for r in rows]


@router.put("/settings/{key}", response_model=SettingRow)
async def update_setting(
    key: str,
    body: SettingUpdate,
    admin: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    row = (await session.execute(select(AppSetting).where(AppSetting.key == key))).scalars().first()
    if not row:
        raise HTTPException(status_code=404, detail="Setting not found")
    row.value = body.value
    row.updated_at = datetime.utcnow()
    row.updated_by = admin.username
    session.add(row)
    await session.commit()
    await session.refresh(row)
    await log_activity(session, action="admin.setting_change", user_id=admin.id,
                       username=admin.username, entity_type="setting", entity_id=key,
                       detail=f"{key} = {body.value}")
    return SettingRow(key=row.key, value=row.value, description=row.description, updated_at=row.updated_at)


# ════════════════════════════════════════════════════════════════════════
# Generation history — every prompt & output, retrievable per user
# ════════════════════════════════════════════════════════════════════════
class GenerationRow(BaseModel):
    id: UUID
    user_id: UUID
    username: Optional[str]
    kind: str
    title: Optional[str]
    prompt: Optional[str]
    presentation_id: Optional[UUID]
    slide_id: Optional[UUID]
    model_used: Optional[str]
    created_at: datetime


class GenerationDetail(GenerationRow):
    params: Optional[str]
    result: Optional[str]


@router.get("/generations", response_model=list[GenerationRow])
async def list_generations(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
    limit: int = 150,
    kind: Optional[str] = None,
    user_id: Optional[UUID] = None,
):
    """All AI generations (deck/slide_regen/slide_image/voiceover/quiz/notes/
    image). Filter by `kind` and/or `user_id` to retrieve a user's history."""
    q = select(GenerationLog).order_by(GenerationLog.created_at.desc()).limit(min(limit, 1000))
    if kind:
        q = q.where(GenerationLog.kind == kind)
    if user_id:
        q = q.where(GenerationLog.user_id == user_id)
    rows = (await session.execute(q)).scalars().all()
    return [GenerationRow(
        id=r.id, user_id=r.user_id, username=r.username, kind=r.kind, title=r.title,
        prompt=(r.prompt[:200] if r.prompt else None),
        presentation_id=r.presentation_id, slide_id=r.slide_id,
        model_used=r.model_used, created_at=r.created_at,
    ) for r in rows]


@router.get("/generations/{gen_id}", response_model=GenerationDetail)
async def get_generation(
    gen_id: UUID,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
):
    """Full prompt + params + output of one generation."""
    r = (await session.execute(select(GenerationLog).where(GenerationLog.id == gen_id))).scalars().first()
    if not r:
        raise HTTPException(status_code=404, detail="Not found")
    return GenerationDetail(
        id=r.id, user_id=r.user_id, username=r.username, kind=r.kind, title=r.title,
        prompt=r.prompt, presentation_id=r.presentation_id, slide_id=r.slide_id,
        model_used=r.model_used, created_at=r.created_at, params=r.params, result=r.result,
    )
