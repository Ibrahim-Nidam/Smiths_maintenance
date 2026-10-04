# Maintenance Management App: Specification v0.1

Status: draft for review before development starts.
Stack: HTML + JavaScript, Tailwind CSS, Supabase (PostgreSQL, Auth, RLS), GitHub Pages.

---

## 1. Purpose

A web app for maintenance teams to manage machines (Morpho and Eclipse types), their modules and parts, serial numbers, RMA cases, stock, and a full maintenance history, with access controlled by user role and team.

### Goals
- Know exactly what is installed in every machine, including which serial number sits in which position.
- Record every change (part replaced, swapped, sent to RMA) as a permanent history entry.
- Track stock: serialized parts, non-serialized parts, consumables.
- Restrict what each user sees by role and team.

### Non-goals for v1
- Dashboards, KPIs and reports (MTBF, MTTR, availability).
- QR/barcode scanning, photo attachments, push notifications.
- Offline/PWA mode.
- Preventive-maintenance scheduling.

These are listed in section 15 as later phases.

---

## 2. Roles and permissions

| Role | Scope | Can do |
|---|---|---|
| Admin | Everything | Manage users, teams, machine types, templates, machines, parts, stock, view all history |
| Chef maintenance | All teams | Manage machines, parts, stock; view all history and all teams' activity; promote parts to type templates |
| Chef d'équipe | Own team | View own team's technicians, machines and history; perform all technician actions; manage own team's stock usage |
| Technicien | Assigned machines | View machines, add parts to a machine, install/replace/swap parts, enter serials, report damage, mark RMA, view stock, view machine history |

### Permission matrix

| Action | Admin | Chef maint. | Chef équipe | Technicien |
|---|---|---|---|---|
| Manage users and roles | Yes | No | No | No |
| Manage teams | Yes | Yes | No | No |
| Create machine | Yes | Yes | Yes (own team) | No (configurable) |
| Edit machine details | Yes | Yes | Own team | No |
| Add part to a machine | Yes | Yes | Yes | Yes |
| Add part to type template | Yes | Yes | No | No |
| Install / replace / swap part | Yes | Yes | Yes | Yes |
| Tag RMA | Yes | Yes | Yes | Yes |
| Close / return RMA | Yes | Yes | Yes | No |
| View all history | Yes | Yes | Own team | Own machines |
| Edit stock quantities directly | Yes | Yes | No | No |
| Consume stock (via maintenance) | Yes | Yes | Yes | Yes |
| Delete any history entry | Never | Never | Never | Never |

Corrections are made with a reversal/correction event, never by deleting or editing history.

---

## 3. Teams

- A company has one or more teams.
- Each user belongs to exactly one team (admin and chef maintenance are not restricted by team).
- Each machine is assigned to one team (`machines.team_id`). Multi-team access can be added later with a join table.
- Every history event stores the `team_id` of the user who performed it, so team filtering never needs joins.

---

## 4. Domain model

### 4.1 Machine types
Two initial types: **Morpho** and **Eclipse**. Each has its own part configuration. The type list must be data, not code, so a third type can be added later.

### 4.2 Modules
Every machine has exactly three modules: **Input**, **Scanner**, **Output**. Modules are fixed (enum); the parts inside them are configurable.

### 4.3 Part definition vs physical instance
- **Part definition** ("what is this part?"): name, part number, serialized yes/no, quantity per machine, placement mode, RMA applicable.
- **Physical instance** ("which exact unit?"): one row per serialized unit with its serial number, status and location.

### 4.4 Part behaviours

| Case | Example | Serialized | Quantity | Placement |
|---|---|---|---|---|
| Unique, no serial | Encoder | No | 1 | n/a |
| Multiple, serialized, interchangeable | DMA ×21 | Yes | 21 | Flexible (positions 1..21, can swap) |
| Sibling parts, fixed position | Part A pos 1, Part B pos 2 | Yes or No | 1 each | Fixed (cannot move) |

Rules:
- `serialized = false`: no serial numbers; replacement is recorded as removed/installed by part number only.
- `serialized = true`: each position holds exactly one serial number (or is empty).
- `placement_mode = flexible`: serials may be swapped between positions of the same part. Swaps are recorded.
- `placement_mode = fixed`: a unit installed at a position can only be replaced, never moved to another position.
- `rma_applicable = true`: removal of a damaged unit can create an RMA record.

### 4.5 Template vs actual machine
- **Type template** = the part definitions of a machine type (structure only, no serials).
- **Actual machine** = a per-machine copy of that structure plus its installed serials.
- Copying is one-way and happens at creation. Later changes to one machine never change another machine. Template updates never retroactively change existing machines.

---

## 5. Data model (PostgreSQL / Supabase)

Conventions: all tables have `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`; mutable tables also have `updated_at` and `created_by`.

### Enums
```
user_role:        admin | chef_maintenance | chef_equipe | technicien
module_kind:      input | scanner | output
placement_mode:   flexible | fixed
machine_status:   operational | degraded | down | decommissioned
instance_status:  available | installed | rma_pending | rma_sent | rma_returned | scrapped
stock_kind:       non_serialized | consumable
event_type:       part_installed | part_removed | part_replaced | parts_swapped
                  | part_added_to_machine | rma_tagged | rma_updated
                  | machine_created | machine_updated | stock_adjusted | correction
rma_status:       tagged | reported_to_client | awaiting_replacement | replaced | closed
```

### Tables

**profiles**: extends `auth.users`
`id (= auth.users.id), full_name, role user_role, team_id → teams, active bool`

**teams**
`name unique, description`

**machine_types**
`name unique (Morpho, Eclipse), active`

**part_definitions**: type template
`machine_type_id → machine_types, module module_kind, name, part_number, serialized bool, quantity int ≥ 1, placement_mode, rma_applicable bool, description, sort_order, active`
Unique: `(machine_type_id, module, part_number)`.

**machines**
`code unique (e.g. K289), machine_type_id, team_id, status machine_status, location, notes`

**machine_parts**: per-machine copy of definitions
`machine_id, module, name, part_number, serialized, quantity, placement_mode, rma_applicable, description, source_definition_id → part_definitions (nullable), sort_order`
Unique: `(machine_id, module, part_number)`.

**machine_slots**: one row per position
`machine_part_id, position int (1..quantity), instance_id → part_instances (nullable), installed_at`
Unique: `(machine_part_id, position)`.
For non-serialized parts, `instance_id` stays null and slots only mark that the part exists.

**part_instances**: serialized physical units
`part_number, serial_number, status instance_status, location (stock | machine | client | scrapped), notes`
Unique: `(part_number, serial_number)`.
The current machine/position is derived from `machine_slots.instance_id`.

**stock_items**: non-serialized parts and consumables
`kind stock_kind, name, part_number (nullable for consumables), quantity numeric, unit, min_quantity, location`

**maintenance_events**: append-only
`machine_id, team_id, user_id, event_type, machine_part_id, position, old_instance_id, new_instance_id, part_number, quantity, reason, notes, corrects_event_id → maintenance_events, occurred_at`

**rma_records**
`instance_id, machine_id, machine_part_id, position, event_id → maintenance_events, status rma_status, reason, reported_to_client_at, client_reference, replacement_instance_id, closed_at, created_by`

**stock_movements**: append-only
`stock_item_id or instance_id, delta numeric, from_location, to_location, event_id, user_id, reason`

### Integrity rules
- `maintenance_events`, `stock_movements`: no UPDATE or DELETE policy for any role.
- A serialized unit can be in at most one slot (unique index on `machine_slots.instance_id` where not null).
- Stock quantity can never go negative (check constraint).
- All multi-step actions (replace, swap, RMA) run inside a single database function (RPC) so the slot, instance, stock, event and RMA rows change atomically.

---

## 6. Key workflows

### 6.1 Create a machine
1. User enters machine code (e.g. K289), picks type (Morpho or Eclipse), team, optional location/notes.
2. System checks whether the type has template parts.
   - **Yes:** copies each `part_definitions` row into `machine_parts` and creates empty `machine_slots` (positions 1..quantity).
   - **No:** creates the machine with the three empty modules.
3. Event `machine_created` is logged.
4. For serialized parts, the user is taken to a **fill serials** screen (see 6.3).

RPC: `create_machine(code, type_id, team_id, ...)`.

### 6.2 Add a part to a machine ("on the go")
Inside a module, `+ Add part`:

| Field | Values |
|---|---|
| Name | text |
| Part number | text |
| Serialized | yes / no |
| Quantity | 1 (unique) or N (multiple) |
| Placement | flexible / fixed |
| RMA applicable | yes / no |
| Also add to type template | checkbox (admin / chef maintenance only) |

If serialized, the user continues to enter serials per position (6.3). Event `part_added_to_machine` is logged.

### 6.3 Enter serials for a multi-part
For each position 1..N:
- Serial number (required if serialized).
- Optional note (repair/remarks).
- Checkbox **Already RMA**: creates the instance with status `rma_pending` and an `rma_records` row. An RMA unit is not installed in a slot, so it is flagged at that position as "RMA, awaiting replacement".
- Duplicate serials (same part number) are rejected.
- Positions may be left empty and filled later.

### 6.4 Replace a non-serialized part (encoder)
1. User opens the machine, picks the part, clicks **Replace**.
2. Enters reason/notes.
3. System decrements stock for that part number (if the stock item exists), logs `part_replaced`. No serial handling.

### 6.5 Replace a serialized part (DMA)
1. User picks the position (e.g. DMA position 8).
2. Chooses outcome for the removed unit: **Damaged → RMA**, **Working → return to stock**, or **Scrapped**.
3. Enters the new serial (from stock or typed in), or leaves the position empty if no replacement is available yet.
4. Atomic RPC:
   - old instance: status `rma_pending` (or `available` / `scrapped`), slot cleared
   - new instance: status `installed`, linked to the slot
   - `maintenance_events` rows logged (`part_removed`, `part_installed`)
   - `rma_records` row created when RMA
5. The removed serial remains in the system forever.

### 6.6 Swap two serialized parts (flexible only)
1. Pick two positions of the same part with `placement_mode = flexible`.
2. System exchanges the `instance_id` values and logs one `parts_swapped` event listing both positions and both serials.
3. Fixed-placement parts do not offer this action.

### 6.7 RMA lifecycle
`tagged → reported_to_client → awaiting_replacement → replaced → closed`
- Each status change adds an `rma_updated` event.
- When the client's replacement arrives, it enters stock as a new serialized instance and `replacement_instance_id` is set.
- The RMA list can be filtered by status, machine, part number and serial.

### 6.8 Stock movement
Every change to stock (maintenance use, manual adjustment, new arrivals) writes a `stock_movements` row linked to the event that caused it.

### 6.9 Corrections
A wrong entry is fixed with a `correction` event that references `corrects_event_id` and applies the compensating change. Original rows are never edited.

---

## 7. Stock

Three views on the Stock page:

| Tab | Content | Tracked by |
|---|---|---|
| Serialized | Each unit: part number, serial, status (available / installed / RMA…), current machine and position | Instance |
| Non-serialized | Part number, name, quantity, minimum level | Quantity |
| Consumables | Cable, screws, grease, cleaning material, … | Quantity + unit |

Features: search, status filter, low-stock highlight (quantity < minimum), movement history per item.

---

## 8. Pages and navigation

| Page | Roles | Content |
|---|---|---|
| Login | All | Email + password (Supabase Auth) |
| Dashboard | All | Simple counts: machines by status, open RMAs, low stock, recent activity |
| Machines list | All (filtered by scope) | Table with filters by type, team, status; search by code |
| Machine detail | All (filtered by scope) | Header (code, type, status), three module sections with parts and positions, actions |
| Machine history | All (filtered by scope) | Chronological event list, filters by date, part, technician, event type |
| Stock | All | Three tabs (7) |
| RMA | All | List and detail of RMA records |
| Teams | Admin, chef maint. | Team CRUD, member assignment |
| Users | Admin | Create/disable users, role and team assignment |
| Settings | Admin, chef maint. | Machine types, type templates (part definitions) |

### Machine detail layout
```
K289 · Morpho · Team A · Status: Operational

INPUT MODULE
  Encoder          ENC-001        [Replace]
  DMA ×21          DMA-001
    1 → SN001   2 → SN002   ...   8 → RMA pending   ...   21 → SN021
SCANNER MODULE
  ...
OUTPUT MODULE
  ...
[+ Add part]   [History]   [Edit machine]
```

---

## 9. History

Each machine has a history page. One entry shows:
- Date/time, technician, team
- Event type
- Module, part, part number, position
- Removed serial → installed serial
- Reason and notes
- RMA reference if applicable

Rules: append-only, filterable, exportable to CSV (admin / chef maintenance), global history view for admin and chef maintenance, team-scoped for chef d'équipe.

---

## 10. Search

A global search bar matching machine code, part number, serial number, and RMA reference. Results show where the item currently is (machine + position, stock, RMA).

---

## 11. Authentication and security

- Supabase Auth, email + password. Accounts created by admin (no public signup).
- Anon key is embedded in the frontend (by design); **all protection is Row Level Security**.
- RLS policy outline:

| Table | Admin / Chef maint. | Chef d'équipe | Technicien |
|---|---|---|---|
| machines, machine_parts, machine_slots | all | `team_id = my team` | `team_id = my team` (read), limited update via RPC |
| maintenance_events | all (select, insert) | select where `team_id = my team`, insert | select for own team's machines, insert |
| part_instances | all | read/write via RPC | read/write via RPC |
| stock_items | all | read | read |
| rma_records | all | own team | own team (insert), no close |
| profiles, teams | all | read own team | read self |

- Write operations go through `security definer` RPC functions that re-check role and team server-side.
- Never rely on hidden buttons in the UI for security.
- Passwords handled only by Supabase; no custom auth.

---

## 12. Technical architecture

```
Browser (GitHub Pages: HTML + JS + Tailwind)
        │  supabase-js (anon key + user JWT)
        ▼
Supabase: Auth · PostgreSQL (tables, RLS, RPC functions)
```

### Suggested repository layout
```
/index.html              login
/app.html                shell (nav, router)
/css/app.css             Tailwind build output or CDN config
/js/supabase.js          client init
/js/auth.js              session, role guard
/js/router.js            hash router
/js/api/machines.js      machine queries and RPC calls
/js/api/parts.js
/js/api/stock.js
/js/api/rma.js
/js/api/history.js
/js/pages/*.js           one module per page
/js/components/*.js      table, modal, toast, part-grid
/sql/001_schema.sql
/sql/002_rls.sql
/sql/003_functions.sql
/sql/004_seed.sql
```

Notes:
- Hash-based routing (`#/machines/K289`) because GitHub Pages has no server rewrites.
- No secrets in the repo other than the public anon key and project URL.
- Use Supabase migrations (or the numbered SQL files above) so the schema is reproducible.

---

## 13. Non-functional requirements

- Works on desktop and tablet; technician pages usable on phone.
- Page load under 2 s on normal connection; machine page with 21+ positions renders without lag.
- All timestamps stored UTC, shown in local time.
- UI language: decide before build (French, English, or both).
- Backups: enable Supabase daily backups (paid plan) or a scheduled export; document restore steps.
- Free-tier limits (database size, 7-day pause on inactivity) must be checked before production use.

---

## 14. Delivery plan

| Phase | Deliverable |
|---|---|
| 0 | Finalize this spec, answer open questions (section 16) |
| 1 | Supabase project, SQL schema, enums, RLS, RPC functions, seed (types, modules, roles) |
| 2 | Auth, role guard, app shell, users and teams pages |
| 3 | Machine type templates, create machine, machine detail view |
| 4 | Add part, enter serials, placements |
| 5 | Replace, swap, RMA workflow; machine history page |
| 6 | Stock page (3 tabs), stock movements, low-stock alerts |
| 7 | Search, RMA page, CSV export, polish, test with real users |

Each phase should end in something testable with real data.

---

## 15. Later phases

Reports and dashboards (availability, MTBF/MTTR), preventive-maintenance schedules, notifications, photo attachments on events, QR/barcode scanning for machine codes and serials, PWA with offline sync, multi-team access to one machine, multi-company support.

---

## 16. Open questions

1. Can technicians create machines, or only chef d'équipe and above?
2. Should a part added by a technician to one machine be visible to chefs for promotion into the type template, or must it be approved first?
3. Should stock be per team or shared across the company?
4. When a serialized unit is removed as damaged and no replacement is available, should the position stay "empty / RMA pending" and block the machine's status, or only warn?
5. Is a serial unique per part number only, or unique across all parts?
6. Which RMA steps does your client actually require (reference number, dates, documents)?
7. UI language: French, English, or switchable?
8. Does the existing CTX 9800 tracker data (12 machines) need to be migrated into this app?
9. Expected number of users and machines, to confirm the free Supabase tier is enough.

---

## 17. Acceptance criteria for v1

- A user can log in and sees only what their role and team allow.
- An admin can create users, teams, and machine types.
- Creating K289 as Morpho copies the existing Morpho structure (names and part numbers, no serials); the first machine of a type starts with empty modules.
- Parts can be added to any module with serialized, quantity and placement settings.
- A 21-unit serialized part shows positions 1..21 with the serial in each.
- Replacing a damaged DMA keeps the old serial in history and creates an RMA record.
- Swapping two flexible positions is logged; fixed positions cannot be swapped.
- Every action appears in the machine history with who, when and what; history cannot be edited or deleted.
- Stock page shows serialized, non-serialized and consumables.
- A technician cannot read another team's data even by calling the API directly.
