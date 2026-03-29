from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import close_mongodb_connection, connect_to_mongodb


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await connect_to_mongodb()
    yield
    await close_mongodb_connection()


app = FastAPI(
    title="ClinFlow AI",
    description="Backend API for ClinFlow AI application",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router, prefix=settings.API_V1_PREFIX)

# Mount the frontend dist directory (Vite build output)
app.mount("/assets", StaticFiles(directory="../Frontend/dist/assets"), name="assets")

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    # Serve the frontend dist/index.html for all non-API routes
    if not full_path.startswith("api/"):
        frontend_path = "../Frontend/dist/index.html"
        if os.path.exists(frontend_path):
            return FileResponse(frontend_path)
    
    # If the path starts with api/, let it be handled by the API routes
    return {"message": "Welcome to ClinFlow AI API"} 