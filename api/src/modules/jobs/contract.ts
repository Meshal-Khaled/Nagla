import { z } from 'zod';

// Mirrors /contracts/detect-room.schema.json (Node ↔ FastAPI).

export const SIZE_CLASSES = ['small', 'medium', 'large'] as const;

const Unit = z.number().min(0).max(1);

export const DetectRoomResponse = z.object({
  room: z.string(),
  items: z.array(z.object({
    category: z.string(),
    size_class: z.enum(SIZE_CLASSES),
    confidence: Unit.nullable().optional(),
    sightings: z.array(z.object({
      photo_id: z.string(),
      box: z.object({ x: Unit, y: Unit, w: Unit, h: Unit }).nullable().optional(),
    })).min(1),
  })),
});

export type DetectRoomResponse = z.infer<typeof DetectRoomResponse>;

export interface DetectRoomRequest {
  move_id: string;
  room: string;
  photos: { id: string; data: Buffer }[];
  categories: string[];
  size_classes: readonly string[];
}
