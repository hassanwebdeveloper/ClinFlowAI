from fastapi import APIRouter, Depends
from app.core.database import get_database, get_redis

router = APIRouter()

@router.get("")
async def health_check():
    return {
        "status": "healthy",
        "message": "Service is running"
    }

@router.get("/db")
async def db_health():
    db = get_database()
    redis = get_redis()
    
    try:
        # Check MongoDB connection
        await db.command("ping")
        mongodb_status = "connected"
    except Exception:
        mongodb_status = "disconnected"
        
    try:
        # Check Redis connection
        redis.ping()
        redis_status = "connected"
    except Exception:
        redis_status = "disconnected"
    
    return {
        "mongodb_status": mongodb_status,
        "redis_status": redis_status
    } 