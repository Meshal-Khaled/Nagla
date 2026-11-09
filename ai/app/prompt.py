GRID_HELP = "1 = top-left, 2 = top-centre, 3 = top-right, 4 = middle-left, 5 = centre, 6 = middle-right, 7 = bottom-left, 8 = bottom-centre, 9 = bottom-right"


def build_prompt(room: str, photo_ids: list[str], categories: list[str], size_classes: list[str]) -> str:
    """Strict instructions for one call per room (all of the room's photos together)."""
    return f"""You are given {len(photo_ids)} photo(s) of ONE room in a home that is about to be moved.
Room: {room}
Photo ids, in the order the images are attached: {", ".join(photo_ids)}

List every object a moving crew would carry out of this room: furniture, appliances, electronics,
large decor (rugs, mirrors, framed art, lamps, plants) and boxes or suitcases.

Do NOT list:
- small loose things that go inside a box: bottles, cups, tissue boxes, pens, papers, books, remotes, cables, food, toys;
- anything fixed to the building: sockets, floor boxes, switches, doors, windows, blinds, curtains, built-in cabinets,
  wall-mounted split air conditioners, ceiling lights;
- people and pets.

Rules:
- Report every separate physical object (four chairs = four items). Objects partly hidden or cut off by the photo
  edge still count when you can tell what they are.
- The photos may overlap. Report each physical object ONCE, with one sighting per photo it appears in.
- "label": a short English description of the object (at most 6 words), e.g. "white folding table on wheels".
- "category" MUST be one of the allowed values. Use "other" only when nothing fits.
- "size_class" MUST be one of: {", ".join(size_classes)}.
- "box_2d": the object's bounding box in that photo as [ymin, xmin, ymax, xmax], integers 0-1000.
- "cell": each photo is split into a 3x3 grid; give the cell holding the centre of the object
  ({GRID_HELP}).
- "confidence" is 0-1.
- Do not estimate sizes, volumes or prices.

Reply with JSON only, in this shape:
{{"items": [{{"label": "...", "category": "...", "size_class": "...", "confidence": 0.9,
  "sightings": [{{"photo_id": "...", "box_2d": [100, 50, 600, 700], "cell": 5}}]}}]}}
"""


def response_schema(photo_ids: list[str], categories: list[str], size_classes: list[str]) -> dict:
    """Structured output (Gemini responseSchema, OpenAPI subset): the model can only answer in this shape."""
    return {
        "type": "OBJECT",
        "properties": {
            "items": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "label": {"type": "STRING"},
                        "category": {"type": "STRING", "enum": list(categories)},
                        "size_class": {"type": "STRING", "enum": list(size_classes)},
                        "confidence": {"type": "NUMBER"},
                        "sightings": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {
                                    "photo_id": {"type": "STRING", "enum": list(photo_ids)},
                                    "box_2d": {"type": "ARRAY", "items": {"type": "INTEGER"}, "minItems": 4, "maxItems": 4},
                                    "cell": {"type": "INTEGER"},
                                },
                                "required": ["photo_id", "box_2d", "cell"],
                                "propertyOrdering": ["photo_id", "box_2d", "cell"],
                            },
                        },
                    },
                    "required": ["label", "category", "size_class", "confidence", "sightings"],
                    "propertyOrdering": ["label", "category", "size_class", "confidence", "sightings"],
                },
            }
        },
        "required": ["items"],
    }
