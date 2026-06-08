from motor.motor_asyncio import AsyncIOMotorClient
import redis
from pymongo.errors import OperationFailure

from app.core.config import settings
from app.core.debug_log import feature_log
from app.schemas.doctor import DEFAULT_LICENSE_TYPE

_db_log = feature_log("database")

# MongoDB Connection
mongodb_client: AsyncIOMotorClient = None

PATIENTS_CLINIC_UI_INDEX = "clinic_id_1_ui_id_1"


async def connect_to_mongodb():
    global mongodb_client
    try:
        mongodb_client = AsyncIOMotorClient(settings.MONGODB_URL)
        db = mongodb_client[settings.MONGODB_DB_NAME]
        doctors = db["doctors"]
        await doctors.create_index("email", unique=True)
        backfill = await doctors.update_many(
            {"license_type": {"$exists": False}},
            {"$set": {"license_type": DEFAULT_LICENSE_TYPE}},
        )
        if backfill.modified_count:
            _db_log.info(modified_count=backfill.modified_count)
        await db["access_requests"].create_index("token_hash", unique=True)
        await db["access_requests"].create_index([("email", 1), ("status", 1)])
        await db["clinics"].create_index("doctor_id")

        patients = db["patients"]
        # Legacy index enforced uniqueness per doctor; we need uniqueness per clinic only.
        for legacy_name in ("doctor_id_1_ui_id_1", PATIENTS_CLINIC_UI_INDEX):
            try:
                await patients.drop_index(legacy_name)
            except OperationFailure:
                pass
        await patients.create_index(
            [("clinic_id", 1), ("ui_id", 1)],
            unique=True,
            name=PATIENTS_CLINIC_UI_INDEX,
            partialFilterExpression={"clinic_id": {"$type": "string"}},
        )

        api_usage = db["api_usage_events"]
        await api_usage.create_index([("doctor_id", 1), ("created_at", -1)])
        await api_usage.create_index([("service_type", 1), ("created_at", -1)])
        await api_usage.create_index([("feature", 1), ("created_at", -1)])

        _db_log.info(db_name=settings.MONGODB_DB_NAME)
    except Exception as e:
        _db_log.error(error=str(e), exc_info=True)
        raise e

async def close_mongodb_connection():
    global mongodb_client
    if mongodb_client:
        mongodb_client.close()
        _db_log.info()

def get_database():
    return mongodb_client[settings.MONGODB_DB_NAME]

# Redis Connection
redis_client = redis.Redis(
    host=settings.REDIS_HOST,
    port=settings.REDIS_PORT,
    db=settings.REDIS_DB,
    decode_responses=True
)

def get_redis():
    return redis_client 