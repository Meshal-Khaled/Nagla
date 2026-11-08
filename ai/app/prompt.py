def build_prompt(room: str, photo_ids: list[str], categories: list[str], size_classes: list[str]) -> str:
    """Strict instructions for one call per room (all of the room's photos together)."""
    return f"""You are given {len(photo_ids)} photo(s) of ONE room in a home that is about to be moved.
Room: {room}
Photo ids, in the order the images are attached: {", ".join(photo_ids)}

List every piece of furniture, appliance or moving box that would need to be moved.
Rules:
- The photos may overlap. Report each physical object ONCE, with one sighting per photo it appears in.
- "category" MUST be one of: {", ".join(categories)}. Use "other" when nothing fits.
- "size_class" MUST be one of: {", ".join(size_classes)}.
- "box" is the object's bounding box in that photo, normalised 0-1 (x, y = top-left corner).
- "confidence" is 0-1.
- Do not estimate sizes, volumes or prices.

Reply with JSON only, no prose, exactly in this shape:
{{"items": [{{"category": "...", "size_class": "...", "confidence": 0.9,
  "sightings": [{{"photo_id": "...", "box": {{"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4}}}}]}}]}}
"""
