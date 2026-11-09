import json
import re

from pydantic import ValidationError

from .prompt import build_prompt, response_schema
from .providers.base import RoomImage, VisionProvider
from .schemas import DetectDebug, DetectRoomMeta, DetectRoomResponse, ModelOutput


class InvalidModelOutput(Exception):
    pass


def _extract_json(raw: str) -> str:
    """Accept a bare JSON object or one wrapped in a ```json fence."""
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", raw, re.DOTALL)
    return m.group(1) if m else raw.strip()


def _clamp(v: float) -> float:
    return min(1.0, max(0.0, float(v)))


def cell_of(box: dict) -> int:
    """3x3 grid cell (1 top-left … 9 bottom-right) holding the box centre."""
    cx = box["x"] + box["w"] / 2
    cy = box["y"] + box["h"] / 2
    col = min(2, int(cx * 3))
    row = min(2, int(cy * 3))
    return row * 3 + col + 1


def _normalise_sighting(s: dict) -> None:
    """box_2d [ymin, xmin, ymax, xmax] 0-1000 (Gemini's native format) → box {x, y, w, h} 0-1; cell from the box."""
    b2 = s.pop("box_2d", None)
    if isinstance(b2, list) and len(b2) == 4 and all(isinstance(v, (int, float)) for v in b2):
        ymin, xmin, ymax, xmax = (_clamp(v / 1000) for v in b2)
        if xmax < xmin:
            xmin, xmax = xmax, xmin
        if ymax < ymin:
            ymin, ymax = ymax, ymin
        s["box"] = {"x": xmin, "y": ymin, "w": xmax - xmin, "h": ymax - ymin}
    box = s.get("box")
    if isinstance(box, dict):
        for k in ("x", "y", "w", "h"):
            if isinstance(box.get(k), (int, float)):
                box[k] = _clamp(box[k])
        if all(isinstance(box.get(k), float) for k in ("x", "y", "w", "h")):
            box["w"] = min(box["w"], 1 - box["x"])
            box["h"] = min(box["h"], 1 - box["y"])
            # the cell is derived from the box, so the grid shown in the app always matches the box
            s["cell"] = cell_of(box)
    if not isinstance(s.get("cell"), int) or not 1 <= s["cell"] <= 9:
        s["cell"] = None


def parse_output(raw: str, meta: DetectRoomMeta) -> DetectRoomResponse:
    """Parse and normalise: unknown categories → other, boxes clamped, unknown photo ids dropped."""
    data = json.loads(_extract_json(raw))
    if isinstance(data, dict):
        for item in data.get("items", []) or []:
            if not isinstance(item, dict):
                continue
            if isinstance(item.get("confidence"), (int, float)):
                item["confidence"] = _clamp(item["confidence"])
            for s in item.get("sightings", []) or []:
                if isinstance(s, dict):
                    _normalise_sighting(s)
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
        if item.label:
            item.label = item.label.strip()[:80] or None
        items.append(item)
    return DetectRoomResponse(room=meta.room, items=items)


async def detect_room(provider: VisionProvider, meta: DetectRoomMeta, images: list[RoomImage]) -> DetectRoomResponse:
    """One call; on invalid output, one retry with the error fed back; then give up."""
    prompt = build_prompt(meta.room, meta.photo_ids, meta.categories, meta.size_classes)
    schema = response_schema(meta.photo_ids, meta.categories, meta.size_classes)
    feedback = None
    for attempt in range(2):
        raw = await provider.complete(prompt=prompt, images=images, feedback=feedback, schema=schema)
        try:
            result = parse_output(raw, meta)
            result.debug = DetectDebug(vision_raw=raw[:60000], vision_items=len(result.items))
            return result
        except (json.JSONDecodeError, ValidationError, TypeError) as e:
            feedback = f"Your previous reply was rejected: {str(e)[:500]}. Reply with valid JSON only."
            if attempt == 1:
                raise InvalidModelOutput(feedback) from e
    raise AssertionError("unreachable")
