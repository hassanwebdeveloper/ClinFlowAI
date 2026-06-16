from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import close_mongodb_connection, connect_to_mongodb
from app.core.debug_log import feature_log, setup_debug_logging
from app.middleware.request_log import RequestLogMiddleware

setup_debug_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongodb()
    feature_log("app").info()
    yield
    feature_log("app").info()
    await close_mongodb_connection()


app = FastAPI(
    title="ClinFlow AI",
    description="Backend API for ClinFlow AI application",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLogMiddleware)

# API routes
app.include_router(api_router, prefix=settings.API_V1_PREFIX)

# =========================
# FRONTEND (REACT BUILD)
# =========================

# assets (JS/CSS)
app.mount(
    "/assets",
    StaticFiles(directory="static/assets"),
    name="assets"
)

# uploads
app.mount(
    "/uploads",
    StaticFiles(directory=settings.UPLOAD_DIR),
    name="uploads"
)

# landing images/videos
app.mount(
    "/landing",
    StaticFiles(directory="static/landing"),
    name="landing"
)

# landing images/videos
app.mount(
    "/Guide",
    StaticFiles(directory="static/Guide"),
    name="Guide"
)

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):

    # allow API routes to pass through
    if full_path.startswith("api/"):
        return {"message": "API route not found"}

    index_path = "static/index.html"

    if os.path.exists(index_path):
        return FileResponse(index_path)

    return {"error": "Frontend not built"}