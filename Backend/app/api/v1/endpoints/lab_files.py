import mimetypes
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket

from app.api.deps import get_current_doctor_id
from app.core.database import get_database

router = APIRouter()

BUCKET_NAME = "lab_files"


def get_db() -> AsyncIOMotorDatabase:
    return get_database()


def _parse_oid(raw: str) -> ObjectId:
    try:
        return ObjectId(raw)
    except InvalidId as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found") from e


@router.get("/{file_id}")
async def get_lab_file(
    file_id: str,
    doctor_id: str = Depends(get_current_doctor_id),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name=BUCKET_NAME)
    oid = _parse_oid(file_id)
    try:
        gridout = await bucket.open_download_stream(oid)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found") from e

    meta = getattr(gridout, "metadata", None) or {}
    if meta.get("doctor_id") != doctor_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    filename = meta.get("original_filename") or getattr(gridout, "filename", None) or f"lab-{file_id}"
    content_type = meta.get("content_type") or mimetypes.guess_type(str(filename))[0] or "application/octet-stream"

    async def iter_chunks():
        while True:
            chunk = await gridout.readchunk()
            if not chunk:
                break
            yield chunk

    headers = {
        "Content-Disposition": f'inline; filename="{filename}"',
        "Cache-Control": "private, max-age=3600",
        "Last-Modified": datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT"),
    }
    return StreamingResponse(iter_chunks(), media_type=content_type, headers=headers)

