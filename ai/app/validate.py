import json
import re

from pydantic import ValidationError

from .prompt import build_prompt
from .providers.base import RoomImage, VisionProvider
from .schemas import DetectRoomMeta, DetectRoomResponse, ModelOutput


class InvalidModelOutput(Exception):
    pass


def _extract_json(raw: str) -> str:
    """Accept a bare JSON object or one wrapped in a ```json fence."""
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", raw, re.DOTALL)
    return m.group(1) if m else raw.strip()


def parse_output(raw: str, meta: DetectRoomMeta) -> DetectRoomResponse:
    """Parse and normalise: unknown categories → other, boxes clamped, unknown photo ids dropped."""
    data = json.loads(_extract_json(raw))
    if isinstance(data, dict):
        # clamp before validation so slightly-out-of-range boxes are not fatal
        for item in data.get("items", []) or []:
            for s in item.get("sightings", []) or []:
                box = s.get("box") if isinstance(s, dict) else None
                if isinstance(box, dict):
                    for k in ("x", "y", "w", "h"):
                        if isinstance(box.get(k), (int, float)):
                            box[k] = min(1.0, max(0.0, float(box[k])))
    out = ModelOutput.model_validate(data)

    allowed = set(meta.categories)
    ids = set(meta.photo_ids)
    items = []
    for item in out.items:
        item.sightings = [s for s in item.sightings if s.photo_id in ids]
        if not item.sightings:
            continue
        if item.category not in allowed:
            item.category = "other"
        items.append(item)
    return DetectRoomResponse(room=meta.room, items=items)


async def detect_room(provider: VisionProvider, meta: DetectRoomMeta, images: list[RoomImage]) -> DetectRoomResponse:
    """One call; on invalid output, one retry with the error fed back; then give up."""
    prompt = build_prompt(meta.room, meta.photo_ids, meta.categories, meta.size_classes)
    feedback = None
    for attempt in range(2):
        raw = await provider.complete(prompt=prompt, images=images, feedback=feedback)
        try:
            return parse_output(raw, meta)
        except (json.JSONDecodeError, ValidationError, TypeError) as e:
            feedback = f"Your previous reply was rejected: {str(e)[:500]}. Reply with valid JSON only."
            if attempt == 1:
                raise InvalidModelOutput(feedback) from e
    raise AssertionError("unreachable")
