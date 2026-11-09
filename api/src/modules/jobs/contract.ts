import { z } from 'zod';

// Mirrors /contracts/detect-room.schema.json (Node â†” FastAPI).

export const SIZE_CLASSES = ['small', 'medium', 'large'] as const;

const Unit = z.number().min(0).max(1);

export const DetectRoomResponse = z.object({
  room: z.string(),
  items: z.array(z.object({
    category: z.string(),
    size_class: z.enum(SIZE_CLASSES),
    confidence: Unit.nullable().optional(),
    label: z.string().max(200).nullable().optional(),
    sightings: z.array(z.object({
      photo_id: z.string(),
      box: z.object({ x: Unit, y: Unit, w: Unit, h: Unit }).nullable().optional(),
      // 3x3 grid cell of the photo holding the object: 1 = top-left … 9 = bottom-right
      cell: z.number().int().min(1).max(9).nullable().optional(),
    })).min(1),
  })),
  // the models' raw answers, kept for debugging
  debug: z.object({
    vision_raw: z.string(),
    vision_items: z.number().int(),
    filter_raw: z.string().nullable().optional(),
    filter_error: z.string().nullable().optional(),
  }).nullable().optional(),
});

export type DetectRoomResponse = z.infer<typeof DetectRoomResponse>;

export interface DetectRoomRequest {
  move_id: string;
  room: string;
  photos: { id: string; data: Buffer }[];
  categories: string[];
  size_classes: readonly string[];
}
