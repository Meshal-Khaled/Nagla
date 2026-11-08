"""Second pass over the vision result ("AI filtering", Claude): text only, no photos.

Claude only refers to items by index. It can drop non-movable items, fix a category or size class
(within the closed lists) and merge duplicates. It cannot invent items or sightings, so the boxes and
photo ids always come from the vision model. Any failure keeps the vision result unchanged (fail-open).
"""

import json
import logging
from typing import Protocol

import httpx

from .schemas import DetectedItem, DetectRoomMeta, DetectRoomResponse
from .settings import env, env_float
from .validate import _extract_json

log = logging.getLogger("nagla.filter")


class ResultFilter(Protocol):
    name: str

    async def apply(self, result: DetectRoomResponse, meta: DetectRoomMeta) -> DetectRoomResponse: ...


class NoFilter:
    name = "none"

    async def apply(self, result: DetectRoomResponse, meta: DetectRoomMeta) -> DetectRoomResponse:
        return result


def build_filter_prompt(result: DetectRoomResponse, meta: DetectRoomMeta) -> str:
    listing = [
        {"index": i, "category": it.category, "size_class": it.size_class, "confidence": it.confidence,
         "photos": sorted({s.photo_id for s in it.sightings})}
        for i, it in enumerate(result.items)
    ]
    return f"""A vision model listed the objects it saw in photos of ONE room ("{meta.room}") of a home being moved.
Clean the list for a moving company:
- Drop anything that is not moved (walls, windows, doors, built-in cabinets, ceiling lights, people, pets).
- If two entries are clearly the same physical object, keep one and list the others in "merge".
- You may correct "category" (MUST be one of: {", ".join(meta.categories)}) and "size_class" (one of: {", ".join(meta.size_classes)}).
- Keep real separate objects separate (4 dining chairs stay 4 entries). When unsure, keep the entry unchanged.

Items:
{json.dumps(listing, ensure_ascii=False)}

Reply with JSON only:
{{"keep": [{{"index": 0, "category": "...", "size_class": "...", "merge": []}}]}}
"""


def apply_decisions(result: DetectRoomResponse, meta: DetectRoomMeta, raw: str) -> DetectRoomResponse:
    """Apply Claude's index-based decisions. Raises ValueError/JSONDecodeError on a malformed reply."""
    data = json.loads(_extract_json(raw))
    keep = data.get("keep") if isinstance(data, dict) else None
    if not isinstance(keep, list):
        raise ValueError("reply has no 'keep' list")

    n = len(result.items)
    used: set[int] = set()
    out: list[DetectedItem] = []
    for d in keep:
        if not isinstance(d, dict) or not isinstance(d.get("index"), int):
            continue
        i = d["index"]
        if not 0 <= i < n or i in used:
            continue
        used.add(i)
        item = result.items[i].model_copy(deep=True)
        if d.get("category") in meta.categories:
            item.category = d["category"]
        if d.get("size_class") in meta.size_classes:
            item.size_class = d["size_class"]
        for j in d.get("merge") or []:
            if isinstance(j, int) and 0 <= j < n and j not in used:
                used.add(j)
                seen = {s.photo_id for s in item.sightings}
                item.sightings += [s for s in result.items[j].sightings if s.photo_id not in seen]
        out.append(item)

    if n and not out:
        raise ValueError("filter dropped every item")  # far more likely a bad reply than an empty room
    return DetectRoomResponse(room=result.room, items=out)


class ClaudeFilter:
    """Anthropic Messages API (works with the Claude-dev proxy via CLAUDE_BASE_URL)."""

    name = "claude"

    def __init__(self, api_key: str | None = None, model: str | None = None, base_url: str | None = None,
                 transport: httpx.AsyncBaseTransport | None = None):
        self.api_key = api_key or env("CLAUDE_API_KEY")
        if not self.api_key:
            raise RuntimeError("AI_FILTER=claude needs CLAUDE_API_KEY (see ai/.env.example)")
        self.model = model or env("CLAUDE_MODEL", "claude-haiku-4-5")
        self.base_url = (base_url or env("CLAUDE_BASE_URL", "https://api.anthropic.com/v1")).rstrip("/")
        self.timeout = env_float("CLAUDE_TIMEOUT_S", 90)
        self.transport = transport

    async def _ask(self, prompt: str) -> str:
        async with httpx.AsyncClient(timeout=self.timeout, transport=self.transport) as client:
            r = await client.post(
                f"{self.base_url}/messages",
                headers={"x-api-key": self.api_key, "anthropic-version": "2023-06-01"},
                json={"model": self.model, "max_tokens": 4096, "temperature": 0,
                      "messages": [{"role": "user", "content": prompt}]},
            )
        r.raise_for_status()
        return "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")

    async def apply(self, result: DetectRoomResponse, meta: DetectRoomMeta) -> DetectRoomResponse:
        if not result.items:
            return result
        try:
            return apply_decisions(result, meta, await self._ask(build_filter_prompt(result, meta)))
        except Exception as e:  # noqa: BLE001 - fail-open: the vision result is still valid
            log.warning("claude filter skipped for room %s: %r", meta.room, e)
            return result


FILTERS: dict[str, type] = {"none": NoFilter, "claude": ClaudeFilter}


def get_filter(name: str | None = None) -> ResultFilter:
    name = (name or env("AI_FILTER", "none")).lower()
    if name not in FILTERS:
        raise RuntimeError(f"Unknown AI_FILTER '{name}'. Available: {', '.join(FILTERS)}")
    return FILTERS[name]()
