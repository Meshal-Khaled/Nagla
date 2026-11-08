import { readFileSync } from 'node:fs';
import type { Kysely } from 'kysely';
import type { DB } from '../../db/types.js';

/** Fire-and-forget notifications; callers never await them (plan Step 6.7). */
export interface Notifier {
  stageChanged(moveId: string, stage: string): void;
  moveConfirmed(moveId: string): void;
}

export interface PushMessage {
  title: string;
  body: string;
  data: Record<string, string>;
}

/** Sends to device tokens; returns the tokens the push service says are dead. */
export interface PushSender {
  send(tokens: string[], msg: PushMessage): Promise<string[]>;
}

export class LogSender implements PushSender {
  async send(tokens: string[], msg: PushMessage) {
    if (tokens.length) console.log(`[push] → ${tokens.length} device(s): ${msg.title} – ${msg.body}`);
    return [];
  }
}

export async function createFcmSender(serviceAccountPath: string): Promise<PushSender> {
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getMessaging } = await import('firebase-admin/messaging');
  const app = initializeApp({ credential: cert(JSON.parse(readFileSync(serviceAccountPath, 'utf8'))) });
  const messaging = getMessaging(app);
  return {
    async send(tokens, msg) {
      if (!tokens.length) return [];
      const res = await messaging.sendEachForMulticast({
        tokens, notification: { title: msg.title, body: msg.body }, data: msg.data,
      });
      return res.responses.flatMap((r, i) =>
        !r.success && r.error?.code === 'messaging/registration-token-not-registered' ? [tokens[i]] : []);
    },
  };
}

const nice = (s: string) => s.replace(/_/g, ' ');

export class PushNotifier implements Notifier {
  constructor(
    private readonly db: Kysely<DB>,
    private readonly sender: PushSender,
  ) {}

  stageChanged(moveId: string, stage: string) {
    void this.run(async () => {
      const move = await this.db.selectFrom('moves').select('customer_id').where('id', '=', moveId).executeTakeFirst();
      if (!move) return;
      await this.push([move.customer_id], {
        title: 'Your move', body: `Status: ${nice(stage)}`, data: { move_id: moveId, stage },
      });
    });
  }

  moveConfirmed(moveId: string) {
    void this.run(async () => {
      const move = await this.db.selectFrom('moves').select('company_id').where('id', '=', moveId).executeTakeFirst();
      if (!move?.company_id) return;
      const admins = await this.db.selectFrom('users').select('id')
        .where('company_id', '=', move.company_id).where('role', '=', 'company_admin').execute();
      await this.push(admins.map((a) => a.id), {
        title: 'New move request', body: 'A customer confirmed a move with you', data: { move_id: moveId, stage: 'confirmed' },
      });
    });
  }

  private async push(userIds: string[], msg: PushMessage) {
    if (!userIds.length) return;
    const devices = await this.db.selectFrom('device_tokens').select('token').where('user_id', 'in', userIds).execute();
    const dead = await this.sender.send(devices.map((d) => d.token), msg);
    if (dead.length) await this.db.deleteFrom('device_tokens').where('token', 'in', dead).execute();
  }

  private async run(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      console.error('[push] failed', e);
    }
  }
}
