"""Deterministic fake provider for development and tests (no network, no API key).

Items depend only on the room name and photo ids, so the same photos always give the same answer.
Rooms whose name contains "garbage" always return invalid JSON, to exercise the failure path.
"""

import json
import re

from .base import RoomImage

ROOM_ITEMS: dict[str, list[tuple[str, str]]] = {
    "bedroom": [("bed_frame", "large"), ("mattress", "large"), ("wardrobe", "medium"), ("bedside_table", "small"), ("bedside_table", "small")],
    "living": [("couch", "medium"), ("armchair", "medium"), ("coffee_table", "medium"), ("television", "large"), ("tv_stand", "medium")],
    "majlis": [("floor_cushion_set", "large"), ("majlis_back_cushion_set", "large"), ("area_rug", "large"), ("coffee_table", "small")],
    "kitchen": [("refrigerator", "medium"), ("cooker", "medium"), ("washing_machine", "medium"), ("dining_table", "small")],
    "dining": [("dining_table", "medium"), ("dining_chair", "medium"), ("dining_chair", "medium"), ("dining_chair", "medium")],
    "office": [("desk", "medium"), ("office_chair", "medium"), ("bookcase", "medium")],
}
DEFAULT_ITEMS = [("moving_box", "medium"), ("moving_box", "medium"), ("other", "medium")]


class FakeProvider:
    name = "fake"

    async def complete(self, *, prompt: str, images: list[RoomImage], feedback: str | None = None) -> str:
        room = _room_from_prompt(prompt)
        if "garbage" in room:
            return "Sorry, I can't produce JSON for this room."

        template = next((items for key, items in ROOM_ITEMS.items() if key in room), DEFAULT_ITEMS)
        ids = [img.photo_id for img in images]
        out = []
        for n, (category, size) in enumerate(template):
            first = ids[n % len(ids)]
            sightings = [{"photo_id": first, "box": _box(n)}]
            # the first item also shows up in a second photo: the model reports it once
            if n == 0 and len(ids) > 1:
                sightings.append({"photo_id": ids[1], "box": _box(n + 3)})
            out.append({"category": category, "size_class": size, "confidence": round(0.95 - n * 0.05, 2), "sightings": sightings})
        return json.dumps({"items": out})


def _room_from_prompt(prompt: str) -> str:
    m = re.search(r"^Room: (.+)$", prompt, re.MULTILINE)
    return (m.group(1) if m else "").strip().lower()


def _box(n: int) -> dict[str, float]:
    x = (n * 0.17) % 0.7
    y = (n * 0.23) % 0.6
    return {"x": round(x, 3), "y": round(y, 3), "w": 0.25, "h": 0.3}
