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


class DetectedItem(BaseModel):
    category: str
    size_class: SizeClass
    confidence: float | None = Field(default=None, ge=0, le=1)
    sightings: list[Sighting] = Field(min_length=1)


class DetectRoomResponse(BaseModel):
    room: str
    items: list[DetectedItem]


class ModelOutput(BaseModel):
    """What the vision model must return (strict JSON)."""

    items: list[DetectedItem]
