from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os
from pathlib import Path

from database import create_db_and_tables
from api.v1.auth.endpoints import router as auth_router
from api.v1.ppt.endpoints.presentation import router as presentation_router
from api.v1.ppt.endpoints.slides import router as slides_router
from api.v1.ppt.endpoints.outlines import router as outlines_router
from api.v1.ppt.endpoints.images import router as images_router
from api.v1.ppt.endpoints.export import router as export_router
from api.v1.ppt.endpoints.templates import router as templates_router
from api.v1.admin.endpoints import router as admin_router
from api.v1.studio.endpoints import router as studio_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_db_and_tables()
    app_data = Path(os.getenv("APP_DATA_DIR", "./app_data"))
    (app_data / "presentations").mkdir(parents=True, exist_ok=True)
    (app_data / "images").mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title="PPT Generator API",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS — allow frontend origin explicitly ───────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3005",
        "http://localhost:3000",
        "http://127.0.0.1:3005",
        "http://127.0.0.1:3000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Static files
app_data_dir = os.getenv("APP_DATA_DIR", "./app_data")
Path(app_data_dir).mkdir(parents=True, exist_ok=True)
app.mount("/app_data", StaticFiles(directory=app_data_dir), name="app_data")

app.include_router(auth_router,         prefix="/api/v1/auth",         tags=["Auth"])
app.include_router(presentation_router, prefix="/api/v1/presentations", tags=["Presentations"])
app.include_router(slides_router,       prefix="/api/v1/slides",        tags=["Slides"])
app.include_router(outlines_router,     prefix="/api/v1/outlines",      tags=["Outlines"])
app.include_router(images_router,       prefix="/api/v1/images",        tags=["Images"])
app.include_router(export_router,       prefix="/api/v1/export",        tags=["Export"])
app.include_router(templates_router,    prefix="/api/v1/templates",     tags=["Templates"])
app.include_router(admin_router,        prefix="/api/v1/admin",         tags=["Admin"])
app.include_router(studio_router,       prefix="/api/v1/studio",        tags=["Studio"])


@app.get("/health")
async def health():
    return {"status": "ok"}
