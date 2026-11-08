"""AI service: room photos in, detected items out (JSON). Vision only: no sizes, prices or dates."""

import json

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.datastructures import UploadFile

from .filtering import get_filter
from .providers.base import RoomImage
from .providers.gemini import ProviderError
from .providers.registry import get_provider
from .schemas import DetectRoomMeta, DetectRoomResponse
from .validate import InvalidModelOutput, detect_room

MAX_PHOTOS = 30
MAX_PHOTO_BYTES = 15 * 1024 * 1024

app = FastAPI(title="Nagla AI", version="0.1.0")
provider = get_provider()
result_filter = get_filter()


def bad_request(detail: str) -> JSONResponse:
    return JSONResponse(status_code=400, content={"error": "bad_request", "detail": detail})


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "provider": provider.name, "filter": result_filter.name}


@app.post("/detect-room", response_model=DetectRoomResponse)
async def detect_room_endpoint(request: Request):
    form = await request.form(max_files=MAX_PHOTOS, max_part_size=MAX_PHOTO_BYTES)
    raw_meta = form.get("meta")
    if not isinstance(raw_meta, str):
        return bad_request("missing `meta` JSON field")
    try:
        meta = DetectRoomMeta.model_validate(json.loads(raw_meta))
    except (json.JSONDecodeError, ValidationError) as e:
        return bad_request(f"invalid meta: {e}")
    if "other" not in meta.categories:
        meta.categories.append("other")

    images: list[RoomImage] = []
    for photo_id in meta.photo_ids:
        part = form.get(f"photo_{photo_id}")
        if not isinstance(part, UploadFile):
            return bad_request(f"missing photo_{photo_id}")
        images.append(RoomImage(photo_id=photo_id, data=await part.read(), media_type=part.content_type or "image/jpeg"))

    try:
        result = await detect_room(provider, meta, images)
    except InvalidModelOutput as e:
        return JSONResponse(status_code=422, content={"error": "invalid_model_output", "detail": str(e)})
    except ProviderError as e:
        return JSONResponse(status_code=502, content={"error": "provider_error", "detail": str(e)})
    return await result_filter.apply(result, meta)
