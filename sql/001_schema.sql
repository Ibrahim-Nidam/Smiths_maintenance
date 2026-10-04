-- 001_schema.sql : enums, tables, constraints, triggers
-- Run first in the Supabase SQL editor.

-- ---------- Enums ----------
create type user_role       as enum ('admin','maintenance_manager','team_lead','technician');
create type module_kind     as enum ('input','scanner','output');
create type placement_mode  as enum ('flexible','fixed');
create type machine_status  as enum ('operational','degraded','down','decommissioned');
create type instance_status as enum ('available','installed','scrapped');
create type stock_kind      as enum ('non_serialized','consumable');
create type event_type      as enum (
  'part_installed','part_removed','part_replaced','parts_swapped',
  'part_added_to_machine','rma_tagged','rma_untagged',
  'machine_created','machine_updated','stock_adjusted','correction'
);

-- ---------- Helpers ----------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function block_changes() returns trigger language plpgsql as $$
begin raise exception '% is append-only', tg_table_name; end $$;

-- ---------- Teams and profiles ----------
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'technician',
  team_id uuid references teams(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Machine types and templates ----------
create table machine_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table part_definitions (
  id uuid primary key default gen_random_uuid(),
  machine_type_id uuid not null references machine_types(id) on delete cascade,
  module module_kind not null,
  name text not null,
  part_number text not null,
  serialized boolean not null default false,
  quantity int not null default 1 check (quantity >= 1),
  placement_mode placement_mode not null default 'flexible',
  rma_applicable boolean not null default false,
  description text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  unique (machine_type_id, module, part_number)
);

-- ---------- Machines ----------
create table machines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  machine_type_id uuid not null references machine_types(id),
  team_id uuid not null references teams(id),
  status machine_status not null default 'operational',
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
create index on machines (team_id);

create table machine_parts (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines(id) on delete cascade,
  module module_kind not null,
  name text not null,
  part_number text not null,
  serialized boolean not null default false,
  quantity int not null default 1 check (quantity >= 1),
  placement_mode placement_mode not null default 'flexible',
  rma_applicable boolean not null default false,
  description text,
  source_definition_id uuid references part_definitions(id) on delete set null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  unique (machine_id, module, part_number)
);

-- ---------- Physical units ----------
create table part_instances (
  id uuid primary key default gen_random_uuid(),
  part_number text not null,
  serial_number text not null,
  status instance_status not null default 'available',
  location text not null default 'stock' check (location in ('stock','machine','client','scrapped')),
  -- RMA is a simple tag on the unit (declared defective to the client). It can be toggled on and off;
  -- every toggle is written to maintenance_events.
  rma_tagged boolean not null default false,
  rma_tagged_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  unique (part_number, serial_number)
);

create table machine_slots (
  id uuid primary key default gen_random_uuid(),
  machine_part_id uuid not null references machine_parts(id) on delete cascade,
  position int not null check (position >= 1),
  instance_id uuid references part_instances(id),
  installed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (machine_part_id, position)
);
-- a serialized unit can sit in at most one slot
create unique index machine_slots_instance_unique on machine_slots (instance_id) where instance_id is not null;

-- ---------- Stock (shared company-wide) ----------
create table stock_items (
  id uuid primary key default gen_random_uuid(),
  kind stock_kind not null,
  name text not null,
  part_number text,
  quantity numeric not null default 0 check (quantity >= 0),
  unit text not null default 'pcs',
  min_quantity numeric not null default 0 check (min_quantity >= 0),
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
create unique index stock_items_part_number_unique on stock_items (part_number) where part_number is not null;

-- ---------- History (append-only) ----------
create table maintenance_events (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid references machines(id),           -- null for events not tied to a machine (stock, units in stock)
  team_id uuid references teams(id),                  -- team of the machine, else team of the user
  user_id uuid not null references profiles(id),
  event_type event_type not null,
  machine_part_id uuid references machine_parts(id) on delete set null,
  position int,
  old_instance_id uuid references part_instances(id),
  new_instance_id uuid references part_instances(id),
  part_number text,
  quantity numeric,
  reason text,
  notes text,
  corrects_event_id uuid references maintenance_events(id),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on maintenance_events (machine_id, occurred_at desc);
create index on maintenance_events (team_id, occurred_at desc);

create trigger maintenance_events_append_only
  before update or delete on maintenance_events
  for each row execute function block_changes();

create index on part_instances (rma_tagged) where rma_tagged;

-- ---------- Stock movements (append-only) ----------
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid references stock_items(id),
  instance_id uuid references part_instances(id),
  delta numeric not null,
  from_location text,
  to_location text,
  event_id uuid references maintenance_events(id),
  user_id uuid references profiles(id),
  reason text,
  created_at timestamptz not null default now(),
  check (stock_item_id is not null or instance_id is not null)
);

create trigger stock_movements_append_only
  before update or delete on stock_movements
  for each row execute function block_changes();

-- ---------- updated_at triggers ----------
do $$
declare t text;
begin
  foreach t in array array['teams','profiles','part_definitions','machines','machine_parts',
                           'part_instances','stock_items']
  loop
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;
