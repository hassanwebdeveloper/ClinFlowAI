from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.debug_log import feature_log
from app.core.security import decode_access_token

security = HTTPBearer()
_auth_log = feature_log("auth")


async def get_current_doctor_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    payload = decode_access_token(credentials.credentials)
    if not payload:
        _auth_log.warning(reason="decode_failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
    sub = payload.get("sub")
    if not sub or not isinstance(sub, str):
        _auth_log.warning(reason="missing_subject")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
    return sub
