import { Kysely, sql } from 'kysely';

// Technician (agent user) journey: a move is assigned to one technician, who works it from the app,
// chats with the client and rates them. Customers rate the technician back.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    -- short human number for screens ("Move #2841"); ids stay UUIDs
    ALTER TABLE moves ADD COLUMN move_no BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 2800) UNIQUE;
    ALTER TABLE moves ADD COLUMN assigned_agent_id UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE moves ADD COLUMN assigned_at TIMESTAMPTZ;
    CREATE INDEX moves_assigned_agent_idx ON moves (assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;

    CREATE TABLE move_messages (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      move_id     UUID NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
      sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_role user_role NOT NULL,
      body        TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX move_messages_move_idx ON move_messages (move_id, created_at);

    -- one rating per side per move: the customer rates the technician, the technician rates the customer
    CREATE TABLE move_ratings (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      move_id    UUID NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
      rater_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rater_role user_role NOT NULL CHECK (rater_role IN ('customer', 'agent')),
      ratee_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stars      SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
      comment    TEXT CHECK (comment IS NULL OR length(comment) <= 1000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (move_id, rater_role)
    );
    CREATE INDEX move_ratings_ratee_idx ON move_ratings (ratee_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS move_ratings, move_messages;
    ALTER TABLE moves DROP COLUMN IF EXISTS assigned_at, DROP COLUMN IF EXISTS assigned_agent_id, DROP COLUMN IF EXISTS move_no;
  `.execute(db);
}
