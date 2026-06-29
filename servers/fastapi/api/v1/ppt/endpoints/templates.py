from fastapi import APIRouter
from lib.themes import THEMES
from lib.layouts import LAYOUTS

router = APIRouter()


@router.get("/layouts")
async def get_layouts():
    return list(LAYOUTS.values())


@router.get("/themes")
async def get_themes():
    return [{"key": k, **v} for k, v in THEMES.items()]
