"""Gemini vision provider (computer vision): all photos of one room in one generateContent call."""

import base64

import httpx

from ..settings import env, env_float
from .base import RoomImage

DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


class ProviderError(Exception):
    pass


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str | None = None, model: str | None = None, base_url: str | None = None,
                 transport: httpx.AsyncBaseTransport | None = None):
        self.api_key = api_key or env("GEMINI_API_KEY")
        if not self.api_key:
            raise RuntimeError("VISION_PROVIDER=gemini needs GEMINI_API_KEY (see ai/.env.example)")
        self.model = model or env("GEMINI_MODEL", "gemini-2.5-flash")
        self.base_url = (base_url or env("GEMINI_BASE_URL", DEFAULT_BASE_URL)).rstrip("/")
        self.timeout = env_float("GEMINI_TIMEOUT_S", 60)
        self.transport = transport

    def _body(self, prompt: str, images: list[RoomImage], feedback: str | None, schema: dict | None = None) -> dict:
        parts: list[dict] = [{"text": prompt}]
        for img in images:
            parts.append({"text": f"Photo id: {img.photo_id}"})
            parts.append({"inline_data": {"mime_type": img.media_type, "data": base64.b64encode(img.data).decode()}})
        if feedback:
            parts.append({"text": feedback})
        config: dict = {"temperature": 0, "responseMimeType": "application/json"}
        if schema:
            config["responseSchema"] = schema  # structured output: the reply must match the schema
        return {"contents": [{"role": "user", "parts": parts}], "generationConfig": config}

    async def complete(self, *, prompt: str, images: list[RoomImage], feedback: str | None = None, schema: dict | None = None) -> str:
        url = f"{self.base_url}/models/{self.model}:generateContent"
        async with httpx.AsyncClient(timeout=self.timeout, transport=self.transport) as client:
            try:
                r = await client.post(url, headers={"x-goog-api-key": self.api_key}, json=self._body(prompt, images, feedback, schema))
            except httpx.HTTPError as e:
                raise ProviderError(f"Gemini unreachable: {e}") from e
        if r.status_code != 200:
            raise ProviderError(f"Gemini error {r.status_code}: {r.text[:300]}")
        data = r.json()
        try:
            parts = data["candidates"][0]["content"]["parts"]
        except (KeyError, IndexError, TypeError):
            # blocked or empty answer: return text the validator rejects, so the retry path runs
            return f"no candidates: {str(data)[:300]}"
        return "".join(p.get("text", "") for p in parts if isinstance(p, dict))
