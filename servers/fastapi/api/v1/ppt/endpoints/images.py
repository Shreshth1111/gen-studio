from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from uuid import UUID, uuid4
from pathlib import Path
import os
import shutil

from database import get_session
from models.sql.user import User
from api.v1.auth.endpoints import get_current_user
from services.image_generation import image_service

router = APIRouter()


class GenerateImageRequest(BaseModel):
    prompt: str
    width: int = 768
    height: int = 512
    presentation_id: str = ""
    slide_id: str = ""


@router.post("/generate")
async def generate_image(
    data: GenerateImageRequest,
    current_user: User = Depends(get_current_user),
):
    image_id = str(uuid4())
    img_path = await image_service.generate(
        prompt=data.prompt,
        image_id=image_id,
        width=data.width,
        height=data.height,
    )
    if not img_path:
        raise HTTPException(500, "Image generation failed")

    return {
        "id": image_id,
        "url": f"/app_data/images/{image_id}.png",
        "prompt": data.prompt,
    }


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    image_id = str(uuid4())
    output_dir = Path(os.getenv("APP_DATA_DIR", "./app_data")) / "images"
    output_dir.mkdir(parents=True, exist_ok=True)
    img_path = output_dir / f"{image_id}.png"

    with open(img_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    return {
        "id": image_id,
        "url": f"/app_data/images/{image_id}.png",
    }
