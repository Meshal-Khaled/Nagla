import { DetectRoomResponse, type DetectRoomRequest } from './contract.js';
import type { PlanFacts } from '../plan/plan.js';

export interface AiClient {
  detectRoom(req: DetectRoomRequest): Promise<DetectRoomResponse>;
  /** the wording of the moving plan (booking step 5); throws when the planner is off or fails */
  movePlan(facts: PlanFacts): Promise<unknown>;
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

  async movePlan(facts: PlanFacts): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(new URL('/move-plan', this.baseUrl), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(facts),
        signal: AbortSignal.timeout(PLAN_TIMEOUT_MS),
      });
    } catch (e) {
      throw new AiError(`AI service unreachable: ${(e as Error).message}`);
    }
    const body = await res.json().catch(() => null) as { plan?: unknown; error?: string } | null;
    if (!res.ok || !body?.plan) throw new AiError(`AI plan error ${res.status}: ${body?.error ?? 'no plan'}`);
    return body.plan;
  }
}

// the customer waits on this screen; past this the basic plan is shown instead
const PLAN_TIMEOUT_MS = 45_000;
