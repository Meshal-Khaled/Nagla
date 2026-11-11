"""Gemini vision provider (computer vision): all photos of one room in one generateContent call."""

import asyncio
import base64
import logging

import httpx

from ..settings import env, env_float
from .base import RoomImage

DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

log = logging.getLogger("nagla.gemini")

# Google answers 503 "high demand" / 429 "resource exhausted" when the model is busy: these pass, so wait and try again
RETRY_STATUS = {429, 500, 502, 503, 504}


class ProviderError(Exception):
    def __init__(self, message: str, busy: bool = False):
        super().__init__(message)
        self.busy = busy  # the model was busy or unreachable (try again later), not a bad request


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
        # optional: a second model for the last attempts when the main one stays busy (e.g. a lighter Gemini model)
        self.fallback_model = env("GEMINI_FALLBACK_MODEL")
        # waits before each retry, in seconds (4 attempts in all)
        self.retry_waits = [float(x) for x in env("GEMINI_RETRY_WAITS_S", "2,5,10").split(",") if x.strip()]
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

    async def _post(self, model: str, body: dict) -> httpx.Response:
        url = f"{self.base_url}/models/{model}:generateContent"
        async with httpx.AsyncClient(timeout=self.timeout, transport=self.transport) as client:
            return await client.post(url, headers={"x-goog-api-key": self.api_key}, json=body)

    async def complete(self, *, prompt: str, images: list[RoomImage], feedback: str | None = None, schema: dict | None = None) -> str:
        body = self._body(prompt, images, feedback, schema)
        attempts = len(self.retry_waits) + 1
        last = "no attempt"
        for attempt in range(attempts):
            # the fallback model (if set) takes the second half of the attempts
            model = self.fallback_model if self.fallback_model and attempt >= (attempts + 1) // 2 else self.model
            try:
                r = await self._post(model, body)
            except httpx.HTTPError as e:
                last = f"Gemini unreachable: {e}"
            else:
                if r.status_code == 200:
                    break
                if r.status_code not in RETRY_STATUS:
                    raise ProviderError(f"Gemini error {r.status_code}: {r.text[:300]}")
                last = f"Gemini busy ({r.status_code}, {model})"
            if attempt < attempts - 1:
                log.warning("%s; retrying in %ss", last, self.retry_waits[attempt])
                await asyncio.sleep(self.retry_waits[attempt])
        else:
            raise ProviderError(f"{last} after {attempts} attempts", busy=True)
        data = r.json()
        try:
            parts = data["candidates"][0]["content"]["parts"]
        except (KeyError, IndexError, TypeError):
            # blocked or empty answer: return text the validator rejects, so the retry path runs
            return f"no candidates: {str(data)[:300]}"
        return "".join(p.get("text", "") for p in parts if isinstance(p, dict))
