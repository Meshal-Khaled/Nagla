from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class RoomImage:
    photo_id: str
    data: bytes
    media_type: str = "image/jpeg"


class VisionProvider(Protocol):
    """A vision model behind an API. Returns the model's raw text (expected: strict JSON).

    `feedback` is set on the retry and explains why the previous answer was rejected.
    `schema` is the structured-output schema; providers that support it constrain the reply to it.
    """

    name: str

    async def complete(
        self,
        *,
        prompt: str,
        images: list[RoomImage],
        feedback: str | None = None,
        schema: dict | None = None,
    ) -> str: ...
