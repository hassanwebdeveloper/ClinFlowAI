from fastapi import APIRouter

from app.api.v1.endpoints import auth, clinics, health, lab_files, patients

api_router = APIRouter()

api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(clinics.router, prefix="/clinics", tags=["clinics"])
api_router.include_router(lab_files.router, prefix="/lab-files", tags=["lab-files"])
api_router.include_router(patients.router, prefix="/patients", tags=["patients"]) 