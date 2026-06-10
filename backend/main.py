from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import get_settings
from core.database import init_db
from api.routes import router
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AutoMaintainer API starting up...")
    await init_db()
    logger.info("Database initialized")
    yield
    logger.info("AutoMaintainer API shutting down...")


app = FastAPI(
    title="AutoMaintainer API",
    description="Autonomous Open-Source Developer - AI Engineering Agent",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def root_health_check():
    """Expose a root-level health check for monitoring services that hit /health."""
    return {"status": "healthy", "service": "automaintainer-backend"}

app.include_router(router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)
