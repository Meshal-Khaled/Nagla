"""Pydantic models mirroring /contracts/detect-room.schema.json."""

from typing import Literal

from pydantic import BaseModel, Field

SizeClass = Literal["small", "medium", "large"]
Unit = Field(ge=0, le=1)


class DetectRoomMeta(BaseModel):
    move_id: str
    room: str
    photo_ids: list[str] = Field(min_length=1)
    categories: list[str] = Field(min_length=1)
    size_classes: list[SizeClass] = ["small", "medium", "large"]


class Box(BaseModel):
    x: float = Unit
    y: float = Unit
    w: float = Unit
    h: float = Unit


class Sighting(BaseModel):
    photo_id: str
    box: Box | None = None
    # 3x3 grid cell of the photo holding the object's centre: 1 = top-left … 9 = bottom-right
    cell: int | None = Field(default=None, ge=1, le=9)


class DetectedItem(BaseModel):
    category: str
    size_class: SizeClass
    confidence: float | None = Field(default=None, ge=0, le=1)
    label: str | None = None
    sightings: list[Sighting] = Field(min_length=1)


class DetectDebug(BaseModel):
    """What the models actually answered, kept so a scan can be debugged later."""

    vision_raw: str
    vision_items: int
    filter_raw: str | None = None
    filter_error: str | None = None


class DetectRoomResponse(BaseModel):
    room: str
    items: list[DetectedItem]
    debug: DetectDebug | None = None


class ModelOutput(BaseModel):
    """What the vision model must return (strict JSON)."""

    items: list[DetectedItem]
