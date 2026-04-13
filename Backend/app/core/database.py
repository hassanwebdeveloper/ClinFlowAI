from motor.motor_asyncio import AsyncIOMotorClient
import redis
from pymongo.errors import OperationFailure

from app.core.config import settings

# MongoDB Connection
mongodb_client: AsyncIOMotorClient = None

PATIENTS_CLINIC_UI_INDEX = "clinic_id_1_ui_id_1"


async def connect_to_mongodb():
    global mongodb_client
    try:
        mongodb_client = AsyncIOMotorClient(settings.MONGODB_URL)
        db = mongodb_client[settings.MONGODB_DB_NAME]
        await db["doctors"].create_index("email", unique=True)
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
        print("Connected to MongoDB.")
    except Exception as e:
        print(f"Could not connect to MongoDB: {e}")
        raise e

async def close_mongodb_connection():
    global mongodb_client
    if mongodb_client:
        mongodb_client.close()
        print("MongoDB connection closed.")

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