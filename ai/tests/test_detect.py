import json

import pytest
from fastapi.testclient import TestClient

from app import main
from app.schemas import DetectRoomMeta
from app.validate import InvalidModelOutput, detect_room, parse_output

CATS = ["bed_frame", "mattress", "wardrobe", "bedside_table", "couch", "moving_box", "other"]


def meta(room="bedroom_1", ids=("p1", "p2")):
    return DetectRoomMeta(move_id="m1", room=room, photo_ids=list(ids), categories=CATS)


def post(client, room, ids=("p1", "p2"), skip_photo=None):
    files = [("meta", (None, json.dumps(meta(room, ids).model_dump())))]
    files += [(f"photo_{i}", (f"{i}.jpg", b"\xff\xd8fake", "image/jpeg")) for i in ids if i != skip_photo]
    return client.post("/detect-room", files=files)


@pytest.fixture
def client():
    return TestClient(main.app)


def test_detects_bedroom_items_deterministically(client):
    a = post(client, "bedroom_1")
    b = post(client, "bedroom_1")
    assert a.status_code == 200
    assert a.json() == b.json()
    body = a.json()
    assert body["room"] == "bedroom_1"
    assert [i["category"] for i in body["items"]][:2] == ["bed_frame", "mattress"]
    # first item seen in both photos, reported once
    assert [s["photo_id"] for s in body["items"][0]["sightings"]] == ["p1", "p2"]


def test_invalid_model_output_twice_gives_422(client):
    r = post(client, "garbage_room")
    assert r.status_code == 422
    assert r.json()["error"] == "invalid_model_output"


def test_missing_photo_is_400(client):
    r = post(client, "bedroom_1", skip_photo="p2")
    assert r.status_code == 400


def test_unknown_category_maps_to_other_and_boxes_are_clamped():
    raw = json.dumps({"items": [
        {"category": "piano", "size_class": "large", "sightings": [{"photo_id": "p1", "box": {"x": -0.1, "y": 0.5, "w": 1.4, "h": 0.2}}]},
        {"category": "bed_frame", "size_class": "large", "sightings": [{"photo_id": "nope"}]},
    ]})
    out = parse_output(raw, meta())
    assert len(out.items) == 1  # sighting on an unknown photo dropped → item dropped
    assert out.items[0].category == "other"
    box = out.items[0].sightings[0].box
    assert (box.x, box.w) == (0.0, 1.0)


def test_accepts_fenced_json():
    raw = '```json\n{"items": [{"category": "bed_frame", "size_class": "large", "sightings": [{"photo_id": "p1"}]}]}\n```'
    assert parse_output(raw, meta()).items[0].category == "bed_frame"


class FlakyProvider:
    name = "flaky"

    def __init__(self, replies):
        self.replies = list(replies)
        self.feedback = []

    async def complete(self, *, prompt, images, feedback=None):
        self.feedback.append(feedback)
        return self.replies.pop(0)


@pytest.mark.anyio
async def test_retries_once_with_feedback():
    good = json.dumps({"items": [{"category": "couch", "size_class": "medium", "sightings": [{"photo_id": "p1"}]}]})
    p = FlakyProvider(["not json", good])
    out = await detect_room(p, meta(), [])
    assert out.items[0].category == "couch"
    assert p.feedback[0] is None and "rejected" in p.feedback[1]


@pytest.mark.anyio
async def test_gives_up_after_one_retry():
    p = FlakyProvider(["nope", '{"items": [{"category": 1}]}', "never asked"])
    with pytest.raises(InvalidModelOutput):
        await detect_room(p, meta(), [])
    assert len(p.replies) == 1


@pytest.fixture
def anyio_backend():
    return "asyncio"
