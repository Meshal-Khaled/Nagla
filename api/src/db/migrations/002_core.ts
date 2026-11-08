import { Kysely, sql } from 'kysely';

// Plain SQL keeps enums, CHECKs, generated columns and partial indexes readable.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE companies (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name_en    TEXT NOT NULL,
      name_ar    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      role          user_role NOT NULL,
      company_id    UUID REFERENCES companies(id) ON DELETE RESTRICT,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL,
      password_hash TEXT,
      google_sub    TEXT UNIQUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT users_company_matches_role
        CHECK ((role = 'customer') = (company_id IS NULL))
    );
    CREATE UNIQUE INDEX users_email_key ON users (lower(email));

    CREATE TABLE truck_sizes (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL UNIQUE,
      capacity_m3 NUMERIC(6,2) NOT NULL CHECK (capacity_m3 > 0)
    );

    CREATE TABLE company_trucks (
      company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      truck_size_id UUID NOT NULL REFERENCES truck_sizes(id) ON DELETE RESTRICT,
      price_halalas INTEGER NOT NULL CHECK (price_halalas >= 0),
      PRIMARY KEY (company_id, truck_size_id)
    );

    CREATE TABLE furniture_catalog (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      category          TEXT NOT NULL,
      variant           TEXT NOT NULL,
      name_en           TEXT NOT NULL,
      name_ar           TEXT NOT NULL,
      size_class        size_class NOT NULL,
      w_cm              NUMERIC(6,1) NOT NULL CHECK (w_cm > 0),
      d_cm              NUMERIC(6,1) NOT NULL CHECK (d_cm > 0),
      h_cm              NUMERIC(6,1) NOT NULL CHECK (h_cm > 0),
      volume_m3         NUMERIC GENERATED ALWAYS AS (w_cm * d_cm * h_cm / 1000000.0) STORED,
      weight_kg         NUMERIC(6,1) NOT NULL CHECK (weight_kg >= 0),
      fragile           BOOLEAN NOT NULL DEFAULT false,
      dismantle_minutes INTEGER NOT NULL DEFAULT 0 CHECK (dismantle_minutes >= 0),
      -- the row AI detections map to for its (category, size_class)
      is_default        BOOLEAN NOT NULL DEFAULT false,
      UNIQUE (category, size_class, variant)
    );
    CREATE UNIQUE INDEX furniture_catalog_default_key
      ON furniture_catalog (category, size_class) WHERE is_default;

    CREATE TABLE moves (
      id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      company_id             UUID REFERENCES companies(id) ON DELETE RESTRICT,
      status                 move_status NOT NULL DEFAULT 'draft',
      current_stage          move_stage,
      pickup_address         TEXT,
      pickup_lat             NUMERIC(9,6),
      pickup_lng             NUMERIC(9,6),
      pickup_floor           INTEGER,
      pickup_has_elevator    BOOLEAN,
      dropoff_address        TEXT,
      dropoff_lat            NUMERIC(9,6),
      dropoff_lng            NUMERIC(9,6),
      dropoff_floor          INTEGER,
      dropoff_has_elevator   BOOLEAN,
      date_from              DATE,
      date_to                DATE,
      preferred_time         TIME,
      notes                  TEXT,
      agent_token_hash       TEXT UNIQUE,
      agent_token_expires_at TIMESTAMPTZ,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      confirmed_at           TIMESTAMPTZ,
      CONSTRAINT moves_date_window
        CHECK (date_to IS NULL OR date_from IS NULL OR date_to >= date_from),
      CONSTRAINT moves_no_stage_in_draft
        CHECK (status <> 'draft' OR current_stage IS NULL)
    );
    CREATE INDEX moves_customer_idx ON moves (customer_id);
    CREATE INDEX moves_company_idx ON moves (company_id) WHERE status <> 'draft';
    CREATE INDEX moves_draft_created_idx ON moves (created_at) WHERE status = 'draft';

    CREATE TABLE photos (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      move_id    UUID NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
      room       TEXT NOT NULL,
      file_path  TEXT NOT NULL,
      width      INTEGER,
      height     INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX photos_move_room_idx ON photos (move_id, room);

    CREATE TABLE move_items (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      move_id            UUID NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
      catalog_id         UUID NOT NULL REFERENCES furniture_catalog(id) ON DELETE RESTRICT,
      category           TEXT NOT NULL,
      seq                INTEGER NOT NULL CHECK (seq > 0),
      label              TEXT GENERATED ALWAYS AS (category || '_' || seq) STORED,
      quantity           INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      disposition        disposition NOT NULL DEFAULT 'keep',
      source             item_source NOT NULL,
      volume_m3_snapshot NUMERIC,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (move_id, category, seq)
    );

    CREATE TABLE detections (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      photo_id   UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      item_id    UUID REFERENCES move_items(id) ON DELETE SET NULL,
      category   TEXT NOT NULL,
      size_class size_class NOT NULL,
      confidence REAL CHECK (confidence BETWEEN 0 AND 1),
      box_x      REAL CHECK (box_x BETWEEN 0 AND 1),
      box_y      REAL CHECK (box_y BETWEEN 0 AND 1),
      box_w      REAL CHECK (box_w BETWEEN 0 AND 1),
      box_h      REAL CHECK (box_h BETWEEN 0 AND 1)
    );
    CREATE INDEX detections_photo_idx ON detections (photo_id);
    CREATE INDEX detections_item_idx ON detections (item_id);

    CREATE TABLE quotes (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      move_id           UUID NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
      company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
      truck_size_id     UUID NOT NULL REFERENCES truck_sizes(id) ON DELETE RESTRICT,
      truck_capacity_m3 NUMERIC(6,2) NOT NULL,
      trips             INTEGER NOT NULL CHECK (trips > 0),
      crew_size         INTEGER NOT NULL CHECK (crew_size > 0),
      estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes >= 0),
      volume_m3         NUMERIC NOT NULL,
      price_halalas     INTEGER NOT NULL CHECK (price_halalas >= 0),
      is_locked         BOOLEAN NOT NULL DEFAULT true,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX quotes_one_locked_per_move ON quotes (move_id) WHERE is_locked;

    CREATE TABLE jobs (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      move_id     UUID NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
      type        job_type NOT NULL,
      status      job_status NOT NULL DEFAULT 'queued',
      error       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      started_at  TIMESTAMPTZ,
      finished_at TIMESTAMPTZ
    );
    CREATE INDEX jobs_queued_idx ON jobs (created_at) WHERE status = 'queued';

    CREATE TABLE move_events (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      move_id         UUID NOT NULL REFERENCES moves(id) ON DELETE CASCADE,
      stage           move_stage NOT NULL,
      actor_type      actor_type NOT NULL,
      actor_id        UUID,
      photo_path      TEXT,
      skipped         BOOLEAN NOT NULL DEFAULT false,
      idempotency_key TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (move_id, idempotency_key)
    );
    CREATE INDEX move_events_move_idx ON move_events (move_id, created_at);

    CREATE TABLE settings (
      key        TEXT PRIMARY KEY,
      value      JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DROP TABLE IF EXISTS settings, move_events, jobs, quotes, detections, move_items,
      photos, moves, furniture_catalog, company_trucks, truck_sizes, users, companies;
  `.execute(db);
}
