from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite+aiosqlite:///./app_data/ppt_generator.db"
)

# Render / Neon provide postgresql:// or postgres://. We must convert them to postgresql+asyncpg://
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)

# asyncpg does not support sslmode=require. We must convert it to ssl=true
if "sslmode=require" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("sslmode=require", "ssl=true")
elif "sslmode=" in DATABASE_URL:
    # fallback for any other sslmode options
    DATABASE_URL = DATABASE_URL.replace("sslmode=prefer", "ssl=true")

_is_mysql = DATABASE_URL.startswith("mysql")
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    # pool_pre_ping is NOT used with aiomysql — its async adapter's ping()
    # signature differs from what SQLAlchemy expects, causing a TypeError.
    pool_recycle=1800 if _is_mysql else -1,
)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def create_db_and_tables():
    # Import all models so SQLModel knows about them
    from models.sql.user import User
    from models.sql.presentation import Presentation, Slide, GeneratedImage
    from models.sql.platform import ActivityLog, AppSetting, GenerationLog
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session():
    async with AsyncSessionLocal() as session:
        yield session
