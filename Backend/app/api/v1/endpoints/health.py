from fastapi import APIRouter

from app.core.database import get_database, get_redis
from app.core.debug_log import feature_log

router = APIRouter()
_log = feature_log("health")

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
    
    if mongodb_status != "connected" or redis_status != "connected":
        _log.warning(
            mongodb=mongodb_status,
            redis=redis_status,
        )
    else:
        _log.debug(mongodb=mongodb_status, redis=redis_status)

    return {
        "mongodb_status": mongodb_status,
        "redis_status": redis_status,
    }