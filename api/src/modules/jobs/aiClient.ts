import { DetectRoomResponse, type DetectRoomRequest } from './contract.js';

export interface AiClient {
  detectRoom(req: DetectRoomRequest): Promise<DetectRoomResponse>;
}

export class AiError extends Error {}

// vision (up to 2 attempts) + the optional Claude filter pass
const TIMEOUT_MS = 300_000;

/** Calls the FastAPI service: one request per room with all of that room's photos. */
export class HttpAiClient implements AiClient {
  constructor(private readonly baseUrl: string) {}

  async detectRoom(req: DetectRoomRequest): Promise<DetectRoomResponse> {
    const form = new FormData();
    form.set('meta', JSON.stringify({
      move_id: req.move_id,
      room: req.room,
      photo_ids: req.photos.map((p) => p.id),
      categories: req.categories,
      size_classes: req.size_classes,
    }));
    for (const p of req.photos) {
      form.set(`photo_${p.id}`, new Blob([new Uint8Array(p.data)], { type: 'image/jpeg' }), `${p.id}.jpg`);
    }

    let res: Response;
    try {
      res = await fetch(new URL('/detect-room', this.baseUrl), {
        method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new AiError(`AI service unreachable: ${(e as Error).message}`);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const detail = (body as { detail?: unknown } | null)?.detail;
      throw new AiError(`AI service error ${res.status} for room ${req.room}: ${JSON.stringify(detail ?? body)}`);
    }
    const parsed = DetectRoomResponse.safeParse(body);
    if (!parsed.success) throw new AiError(`AI response for room ${req.room} does not match the contract`);
    return parsed.data;
  }
}
