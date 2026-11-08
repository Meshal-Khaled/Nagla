import json

import httpx
import pytest

from app.filtering import ClaudeFilter, apply_decisions
from app.providers.base import RoomImage
from app.providers.gemini import GeminiProvider, ProviderError
from app.schemas import DetectRoomMeta, DetectRoomResponse

CATS = ["couch", "armchair", "coffee_table", "moving_box", "other"]


def meta():
    return DetectRoomMeta(move_id="m1", room="living", photo_ids=["p1", "p2"], categories=CATS)


def result():
    return DetectRoomResponse.model_validate({"room": "living", "items": [
        {"category": "couch", "size_class": "medium", "sightings": [{"photo_id": "p1"}]},
        {"category": "couch", "size_class": "medium", "sightings": [{"photo_id": "p2"}]},
        {"category": "other", "size_class": "small", "sightings": [{"photo_id": "p1"}]},
        {"category": "armchair", "size_class": "medium", "sightings": [{"photo_id": "p2"}]},
    ]})


def test_filter_merges_drops_and_recategorises():
    raw = json.dumps({"keep": [
        {"index": 0, "category": "couch", "size_class": "large", "merge": [1]},
        {"index": 3, "category": "piano", "size_class": "huge", "merge": []},  # invalid values ignored
    ]})
    out = apply_decisions(result(), meta(), raw)
    assert [i.category for i in out.items] == ["couch", "armchair"]
    assert out.items[0].size_class == "large"
    assert [s.photo_id for s in out.items[0].sightings] == ["p1", "p2"]
    assert out.items[1].size_class == "medium"


def test_filter_ignores_bad_and_repeated_indexes():
    raw = json.dumps({"keep": [{"index": 0}, {"index": 0}, {"index": 99}, {"index": 1, "merge": [0]}]})
    out = apply_decisions(result(), meta(), raw)
    assert len(out.items) == 2  # 0 once, 1 kept, merge of an already-used index ignored


@pytest.mark.anyio
async def test_claude_filter_fails_open():
    def handler(request):
        return httpx.Response(500, json={"error": "boom"})
    f = ClaudeFilter(api_key="k", base_url="http://x/v1", transport=httpx.MockTransport(handler))
    r = result()
    assert await f.apply(r, meta()) == r


@pytest.mark.anyio
async def test_claude_filter_rejects_dropping_everything():
    def handler(request):
        return httpx.Response(200, json={"content": [{"type": "text", "text": '{"keep": []}'}]})
    f = ClaudeFilter(api_key="k", base_url="http://x/v1", transport=httpx.MockTransport(handler))
    assert len((await f.apply(result(), meta())).items) == 4


@pytest.mark.anyio
async def test_claude_filter_calls_messages_api():
    seen = {}

    def handler(request):
        seen["url"] = str(request.url)
        seen["key"] = request.headers["x-api-key"]
        return httpx.Response(200, json={"content": [{"type": "text", "text": '```json\n{"keep": [{"index": 3}]}\n```'}]})
    f = ClaudeFilter(api_key="k", model="m", base_url="http://x/v1", transport=httpx.MockTransport(handler))
    out = await f.apply(result(), meta())
    assert seen == {"url": "http://x/v1/messages", "key": "k"}
    assert [i.category for i in out.items] == ["armchair"]


@pytest.mark.anyio
async def test_gemini_sends_images_and_returns_text():
    seen = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        seen["key"] = request.headers["x-goog-api-key"]
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": '{"items": []}'}]}}]})
    g = GeminiProvider(api_key="g", model="gm", base_url="http://g/v1beta", transport=httpx.MockTransport(handler))
    text = await g.complete(prompt="P", images=[RoomImage("p1", b"\xff\xd8")], feedback="F")
    assert text == '{"items": []}'
    parts = seen["body"]["contents"][0]["parts"]
    assert parts[0] == {"text": "P"} and parts[2]["inline_data"]["mime_type"] == "image/jpeg" and parts[-1] == {"text": "F"}
    assert seen["key"] == "g"


@pytest.mark.anyio
async def test_gemini_http_error_raises_provider_error():
    g = GeminiProvider(api_key="g", base_url="http://g", transport=httpx.MockTransport(lambda r: httpx.Response(403, text="no")))
    with pytest.raises(ProviderError):
        await g.complete(prompt="P", images=[])


@pytest.fixture
def anyio_backend():
    return "asyncio"
