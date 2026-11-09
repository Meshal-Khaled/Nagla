import { Kysely, sql } from 'kysely';

// Vision v2: structured output with a 3x3 grid cell and a short label per sighting, and the raw model
// answers kept per room so a scan can be debugged (what did Gemini see, what did the filter change).
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE detections ADD COLUMN cell SMALLINT CHECK (cell BETWEEN 1 AND 9);
    ALTER TABLE detections ADD COLUMN label TEXT CHECK (label IS NULL OR length(label) <= 80);

    CREATE TABLE ai_runs (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      move_id      UUID NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
      room         TEXT NOT NULL,
      photo_ids    UUID[] NOT NULL,
      vision_raw   TEXT NOT NULL,
      vision_items INTEGER NOT NULL,
      filter_raw   TEXT,
      filter_error TEXT,
      kept_items   INTEGER NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX ai_runs_move_idx ON ai_runs (move_id, created_at);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS ai_runs;
    ALTER TABLE detections DROP COLUMN IF EXISTS label;
    ALTER TABLE detections DROP COLUMN IF EXISTS cell;
  `.execute(db);
}
