# Nagla (نقلة) – Backend Plan

Home-moving logistics app. The user photographs their rooms, AI detects the furniture, local code estimates volume and price, the user confirms, and the move is tracked live like a delivery.

---

## 1. Architecture

```
Phone app ──► Node.js API ──► PostgreSQL (+ photo storage on server)
                  │
                  └──► FastAPI AI service ──► vision API
```

| Part | Role |
|---|---|
| **Node.js** | Main API: users, moves, companies, quotes, tracking, auth, stage-event endpoint. Also runs the background job worker |
| **FastAPI** | AI service only: photos in, detected items out (JSON) |
| **PostgreSQL** | One database, several table groups |
| **Server storage** | Photo files (the DB stores paths only). Private folder, served through signed URLs only. Company credentials and API keys stay here, never on the phone |
| **Phone** | Cache only. The draft is stored on the server |
| **AI** | Through an API, used for vision only |

Rule: the AI only reads photos. All sizes, volumes, prices, dates, and the crew job sheet come from our own data and code.

---

## 2. Database (one PostgreSQL DB, table groups)

| Group | Tables |
|---|---|
| Users | `users` |
| Progress line | `moves`, `move_events`, `roadmap_steps` (optional, see open items) |
| Companies | `companies`, `truck_sizes`, `company_trucks` |
| Pictures | `photos`, `detections` |
| Inventory | `move_items` |
| Catalog | `furniture_catalog` |
| Quotes | `quotes` |
| System | `jobs`, `settings` |

**Keys**
- Every table: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- Exceptions: `company_trucks` uses a composite key `(company_id, truck_size_id)`. `settings` uses `key TEXT PRIMARY KEY`
- `photos.id` is the parent. `detections.photo_id` points to it.
- `detections.item_id` points to `move_items.id` (several detections can point to one item)

**Users**
- `role` enum: `customer` / `company_admin` / `agent`
- `company_id` (nullable): set for `company_admin` and `agent`

**Moves**
- `status` enum: `draft` / `confirmed` / `cancelled`
- `current_stage` (see Step 5), `company_id`
- Pickup and dropoff: address text, `lat`, `lng`, `floor`, `has_elevator`. Stored now, not used in pricing yet (see risk 6)
- Date window, time, notes
- `agent_token_hash`, `agent_token_expires_at` (for stage updates, see Step 6)

**Trucks and prices**
- `truck_sizes`: shared list (name, `capacity_m3`)
- `company_trucks`: each company's price per truck size

**Photos**
- `move_id`, `room` (living room, bedroom 1, kitchen…), file path
- EXIF data is stripped and the image is resized on upload (EXIF can hold the home's GPS location)

**Detections (`detections`)** – what the AI saw in one photo
- `photo_id`, `category`, `size_class`, `confidence`, `item_id`
- Bounding box stored as x, y, w, h (0 to 1) to mark the spot on the photo
- Confidence and boxes are for display only. No logic depends on them

**Inventory (`move_items`)** – the real list of things to move
- `move_id`, `catalog_id`, `category`, `seq`, label, `quantity` (default 1)
- AI returns a category only. The backend assigns the number: `category` + `seq` → label `couch_1`, `couch_2`
- Labels are not renumbered after a delete or merge (gaps are fine)
- `disposition` enum: `keep` / `donate` / `sell` (default `keep`)
- `source` enum: `ai` / `manual`
- `volume_m3_snapshot` (null until confirmation, see Step 4)
- `UNIQUE (move_id, category, seq)`
- Merging duplicates = pointing several detections at one item and deleting the extra items

**Catalog (`furniture_catalog`)**
- About 200 to 300 clean rows: category, variant, names (EN/AR), size class, w/d/h in cm, `volume_m3`, `weight_kg`, `fragile`, `dismantle_minutes`
- `volume_m3 GENERATED ALWAYS AS (w_cm * d_cm * h_cm / 1000000.0) STORED` so the database computes it, never generated values
- Generated in about 6 batches with an LLM prompt, then verified against real store pages (top 20 items first)
- Matching key: `(category, size_class)`. The category list is closed: the same list is sent to the vision model, which may only return those values
- Unknown items map to an `other` row and the user picks the right item during review

**Settings (`settings`)**
- Key/value rows: `packing_factor` (1.25), crew size tiers by volume, `loading_minutes_per_m3`

**Quotes (`quotes`)**
- `move_id`, `company_id`, `truck_size_id`, `trips`, `crew_size`, `estimated_minutes`, `price`, `is_locked`
- Draft quotes are computed, not stored. Only the confirmed quote is saved (locked snapshot)

**Jobs (`jobs`)**
- `move_id`, `type` (`detection`), `status` (`queued` / `running` / `done` / `failed`), `error`, timestamps

**Move events (`move_events`)**
- `move_id`, `stage`, `actor_type` (`company_admin` / `agent` / `customer` / `system`), `actor_id`, optional photo path, `skipped` (boolean), `created_at`
- `idempotency_key` with `UNIQUE (move_id, idempotency_key)`

---

## 3. Flow

### Step 1: Upload and detection
1. User uploads room photos to Node and tags each photo with its room. Node strips EXIF, resizes, and stores the files.
2. `POST /moves/{id}/plan` creates a detection job. The app gets a job id and polls its status.
3. The worker sends **all photos of one room in one call** to FastAPI, which calls the vision API with a strict JSON format and the closed category list. The model returns one de-duplicated list per room.
4. Output per item: category, size class, rough position (per photo), confidence.
5. Responses are validated, with one retry on invalid JSON. A room that still fails marks the job `failed` with an error.
6. When all rooms are done, Node assigns labels (`couch_1`, `couch_2`) in one transaction, creates `move_items` and `detections`, saves bounding boxes, and joins each item to the catalog.

### Step 2: Review and pre-planning (draft)
- The draft is stored on the server (`moves.status = draft`). The phone only caches it.
- User merges duplicates (same item seen in two rooms or photos), deletes wrong items, fixes categories, sets quantities, and **adds items the AI missed** from the catalog.
- User sets keep / donate / sell per item, pickup and dropoff addresses (floor, elevator), the date window, time, notes, and company.
- Draft moves (with their photos and items) are deleted after about 48 hours if the user never confirms.

### Step 3: Estimate (local code, no AI)
Computed on request (`GET /moves/{id}/quotes`) and re-run after every edit. No job needed.

1. Sum the volume × quantity of `keep` items only.
2. Multiply by the packing factor (from `settings`).
3. **Per company**: pick the smallest of that company's trucks whose capacity covers the total. If none fits, use that company's largest truck and multiply by trips.
4. Price = company's price for that truck size × trips. Show offers side by side.
5. Crew size from volume tiers. Time = loading minutes per m³ × total volume + sum of dismantle minutes.

Deterministic: same inventory gives the same quote.

### Step 4: Confirm (saved in one transaction)
- Set `moves.status = confirmed`. Save item choices, addresses, date window, time, and notes.
- Copy each item's catalog `volume_m3` into `volume_m3_snapshot`, so later catalog edits don't change this move.
- Lock the quote as a **snapshot** (price, truck, trips, crew), so later company price changes don't affect this move.
- Create the first tracking event (`confirmed`) and generate the agent token (store the hash only).
- After the transaction commits: code (not AI) builds the crew job sheet from the final inventory and catalog fields: fragile items, what to dismantle (with minutes), and load order (dismantled and heavy items first, fragile items last).

### Step 5: Live tracking
Fixed stage list:

```
confirmed → accepted → crew_assigned → on_the_way → arrived_pickup
→ loading → loaded → in_transit → arrived_destination → unloading → completed
```

Off the main line (end states): `rejected` (company declines, after `confirmed`) and `cancelled` (customer or company, allowed before `on_the_way`).

Who sets which stage:

| Stage | Set by |
|---|---|
| `accepted`, `rejected`, `crew_assigned` | Company admin |
| `on_the_way` → `completed` | Agent |
| `cancelled` | Customer or company admin |

- Each change is a row in `move_events` (append-only log). `moves.current_stage` is updated in the same transaction.
- Progress bar = current stage ÷ total stages. The event log is also the timeline.
- Progress is calculated, never stored as a percentage.
- For `rejected` or `cancelled`, the app shows the status instead of the bar.

### Step 6: Updates from the field
```
Agent taps "Loaded" (optional photo)
  → POST /moves/{id}/events
  → validate → write event + stage → notify user → progress bar updates
```

The handler must:
1. Authenticate: agent token from the link (compared to the stored hash, must not be expired) or a company admin login
2. Check the idempotency key and ignore duplicates
3. If the stage equals the current stage, return 200 and do nothing (handles double taps)
4. Allow forward moves only. If the agent skips stages, write the skipped ones as events with `skipped = true`
5. Check the actor is allowed to set that stage (see the table in Step 5)
6. Write event and stage in one transaction
7. Return 200 quickly, then send the push notification in the background

The token expires when the move reaches `completed` or `cancelled`. HMAC signatures are kept for later, only if a company's own system sends updates directly.

The app refreshes the progress bar by polling every 5 to 10 seconds. Push notification via Firebase Cloud Messaging (last priority).

---

## 4. Proposed endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/moves` | Create a move (draft) |
| PATCH | `/moves/{id}` | Addresses, date window, time, notes, company |
| POST | `/moves/{id}/photos` | Upload room photos (with room tag) |
| POST | `/moves/{id}/plan` | Start the detection job |
| GET | `/jobs/{id}` | Job status |
| GET | `/moves/{id}` | Move and items |
| POST | `/moves/{id}/items` | Add a missed item from the catalog |
| PATCH | `/items/{id}` | Fix an item, set quantity, keep / donate / sell |
| DELETE | `/items/{id}` | Delete a wrong item |
| POST | `/moves/{id}/items/merge` | Merge duplicates (`keep_id`, `merge_ids`) |
| GET | `/catalog` | Catalog list for the add/fix screens |
| GET | `/moves/{id}/quotes` | Compute offers from current inventory |
| POST | `/moves/{id}/confirm` | Confirm and save the move |
| POST | `/moves/{id}/cancel` | Cancel (before `on_the_way`) |
| GET | `/moves/{id}/tracking` | Stage, events, progress |
| GET | `/moves/{id}/job-sheet` | Crew job sheet |
| POST | `/moves/{id}/events` | Stage updates from agent or company |
| GET | `/company/moves` | Company admin: incoming and active moves |

(Auth endpoints and the Node ↔ FastAPI contract are still to be defined.)

---

## 5. Decisions made

- Stack: Node.js + FastAPI + PostgreSQL, AI via API
- One database with table groups (not several databases)
- Companies own their trucks and prices; a shared `truck_sizes` table defines the capacities
- Keep / donate / sell is an enum column on each item
- Item labels are assigned by the backend; AI returns the category only
- Pre-planning is a draft stored on the server (`moves.status = draft`); confirmation locks it
- Tracking uses a fixed stage list with an event log and a stage-event endpoint
- Catalog: 200 to 300 clean rows, not 5,000
- Detections (what the AI saw) and items (what gets moved) are separate tables
- Photos are grouped by room; one vision call per room
- The estimate is computed on request, not as a job
- Truck choice is per company, from that company's own trucks
- The crew job sheet is built by code, not AI
- Agent updates use a per-move token link (hashed, expiring)
- Item volumes are snapshotted at confirmation, together with the quote

---

## 6. Open items

- [ ] Layers explanation (pending from the team)
- [ ] Authentication method and the full endpoint list (suggestion: phone OTP + JWT access/refresh tokens)
- [ ] Node ↔ FastAPI request/response contract
- [ ] How agents update stages (simplest: a web page with a token link and one button per stage; or a "simulate agent" panel for the demo)
- [ ] Whether to keep the prep checklist (`roadmap_steps`) or drop it for the first version
- [ ] Full SQL for `users`, `moves`, `quotes`, `move_items`, `detections`, `jobs`, `settings`
- [ ] Review screen for merging duplicate items
- [ ] Crew pricing: v1 assumes crew is included in the company's truck price. Confirm or add a crew rate
- [ ] Photo retention after `completed` (how many days before deletion)

---

## 7. Risks

1. **Vision quality** is the biggest risk. Duplicates across photos, hidden items, and misnamed furniture will move the quote more than the catalog or estimator will. Mitigations: one call per room, a closed category list, manual add/merge in review. Protect time for the review screen and for testing on 50 to 100 real photos with hand-written answers. If accurate boxes are needed later, run a real detector (e.g. YOLO) in FastAPI.
2. **Two backends**: agree on the Node ↔ FastAPI JSON contract on day one.
3. **Catalog accuracy**: LLM-generated sizes are plausible, not measured. Spot-check the top 20 items. Majlis seating and floor cushions are the likeliest to be wrong.
4. **Stage-update safety**: without the token check, idempotency, same-stage no-op, and stage-order checks, a double tap can corrupt the progress bar.
5. **Scope**: the agent-side app and push notifications are each a mini-project. Build the stage log and polling bar first. Notifications go last.
6. **Flat pricing**: a price per truck size ignores distance, stairs, and floors. Fine for the first version. Addresses, floor, and elevator are already stored, so add `base_price` + `price_per_km` later.
7. **Privacy**: photos show the inside of people's homes. Strip EXIF, serve through signed URLs only, delete drafts after 48 hours, and set a retention period after completion. Saudi PDPL applies.

---

## 8. Out of scope (v1)

- Payments
- Distance-based pricing
- Native agent app (web token page only)
- Company system integrations (HMAC webhooks)

---

## 9. Build order (for the coding agent)

Build in this order. Each step is done when its check passes. Do not add features beyond this document; if something is unclear, check the open items and ask.

1. **Schema + seed**: all tables, enums, constraints, generated `volume_m3`; seed `truck_sizes`, two test companies, `settings`, and the catalog. Check: migrations run on an empty DB; `volume_m3` is computed by the DB.
2. **Auth + roles**: customer, company admin, agent. Check: each role can only reach its own endpoints.
3. **Photo upload**: room tag, EXIF strip, resize, private storage, signed URLs. Check: an uploaded photo has no GPS data and is not reachable without a signed URL.
4. **Detection job**: jobs table, worker, FastAPI call per room, validation + one retry, label assignment in one transaction. Check: the same photos never produce duplicate labels; a bad AI response marks the job `failed`.
5. **Review endpoints**: add, edit, delete, merge items; update move details. Check: merge keeps all detections on the kept item.
6. **Estimate**: per-company truck choice, trips, crew, time. Check: same inventory gives the same quote; a company without a fitting truck uses trips.
7. **Confirm**: one transaction with snapshots, first event, agent token; job sheet after commit. Check: changing a catalog row or company price after confirm does not change the move.
8. **Tracking + events**: stage rules, roles, idempotency, skipped stages, cancel/reject. Check: a double tap writes one event; a backward stage is rejected.
9. **Draft cleanup**: delete draft moves and their photos after 48 hours. Check: an unconfirmed move older than 48 hours is gone, files included.
10. **Push notifications** (last).
