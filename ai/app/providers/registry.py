from ..settings import env
from .base import VisionProvider
from .fake import FakeProvider
from .gemini import GeminiProvider

# One module per provider, each implementing VisionProvider.complete.
PROVIDERS: dict[str, type] = {
    "fake": FakeProvider,
    "gemini": GeminiProvider,
}


def get_provider(name: str | None = None) -> VisionProvider:
    name = (name or env("VISION_PROVIDER", "fake")).lower()
    if name not in PROVIDERS:
        raise RuntimeError(f"Unknown VISION_PROVIDER '{name}'. Available: {', '.join(PROVIDERS)}")
    return PROVIDERS[name]()
