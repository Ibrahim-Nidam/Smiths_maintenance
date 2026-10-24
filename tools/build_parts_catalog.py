#!/usr/bin/env python3
"""Generate sql/011_parts_catalog.sql from the client parts list (xlsx).

Run from the repository root:
    python tools/build_parts_catalog.py
"""
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

XLSX = Path("docs/Unique_Parts_PN_list.xlsx")
OUT = Path("sql/011_parts_catalog.sql")
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def read_rows(path: Path):
    """Return [(part_number, designation)] from the first worksheet."""
    with zipfile.ZipFile(path) as z:
        shared = []
        try:
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                shared.append("".join(t.text or "" for t in si.iter(MAIN + "t")))
        except KeyError:
            pass

        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
        rows = []
        for row in sheet.iter(MAIN + "row"):
            values = {}
            for cell in row.findall("m:c", NS):
                ref = cell.get("r")
                col = "".join(ch for ch in ref if ch.isalpha())
                cell_type = cell.get("t")
                v = cell.find("m:v", NS)
                if v is None:
                    inline = cell.find("m:is", NS)
                    value = "".join(t.text or "" for t in inline.iter(MAIN + "t")) if inline is not None else ""
                elif cell_type == "s":
                    value = shared[int(v.text)]
                else:
                    value = v.text or ""
                values[col] = value.strip()
            rows.append(values)
    return rows


def sql_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main():
    rows = read_rows(XLSX)
    parts = []
    seen = set()
    for row in rows[1:]:  # skip the header row
        pn = (row.get("A") or "").strip()
        designation = (row.get("B") or "").strip()
        if not pn or not designation:
            continue
        if not re.match(r"^[\x20-\x7E]+$", pn) or not re.match(r"^[\x20-\x7E]+$", designation):
            raise SystemExit(f"Non-ASCII value in row: {pn!r} / {designation!r}")
        key = pn.upper()
        if key in seen:
            continue
        seen.add(key)
        parts.append((pn, designation))

    values = ",\n".join(
        "  ({}, {})".format(sql_quote(pn), sql_quote(d)) for pn, d in parts
    )

    template = """-- 011_parts_catalog.sql : searchable parts catalogue (part number + designation).
-- Imported from the client parts list: docs/Unique_Parts_PN_list.xlsx ({count} parts).
-- Each catalogue entry can also record where the part is used: machine types (several),
-- module and whether units are serialized. That information drives the stock form.
-- Run after sql/010_serialized_storage_location.sql. Safe to run again: the seed
-- skips part numbers that already exist and the classification columns are added
-- with "add column if not exists".

do $$
begin
  if to_regclass('public.profiles') is null
     or to_regprocedure('public._require_global()') is null then
    raise exception
      'Base schema is missing. Run sql/001_schema.sql through sql/010_serialized_storage_location.sql before sql/011_parts_catalog.sql';
  end if;
end $$;

-- ---------- Table ----------
create table if not exists parts_catalog (
  id uuid primary key default gen_random_uuid(),
  part_number text not null unique,
  designation text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Classification: where the part is used and how it is tracked.
-- module and serialized stay null when the part has not been classified yet;
-- machine_type_ids is empty when the part fits every machine type.
alter table parts_catalog
  add column if not exists module module_kind,
  add column if not exists serialized boolean,
  add column if not exists machine_type_ids uuid[] not null default '{{}}';

create index if not exists parts_catalog_designation_idx on parts_catalog (designation);
create index if not exists parts_catalog_active_idx on parts_catalog (active) where active;

-- ---------- Row Level Security ----------
-- Everyone signed in can read the catalogue; there are no direct write policies,
-- changes go through the RPC functions below (same model as the rest of the app).
alter table parts_catalog enable row level security;

drop policy if exists parts_catalog_select on parts_catalog;
create policy parts_catalog_select on parts_catalog for select to authenticated
  using (true);

drop trigger if exists parts_catalog_updated_at on parts_catalog;
create trigger parts_catalog_updated_at before update on parts_catalog
  for each row execute function set_updated_at();

-- ---------- Privileges ----------
-- Same model as the rest of the app: signed-in users read, anon has no access.
revoke all on parts_catalog from anon;
grant select on parts_catalog to authenticated;

-- ---------- Write functions ----------
-- Drop the earlier 3-argument version so existing calls are never ambiguous.
drop function if exists save_catalog_part(text, text, uuid);

create or replace function save_catalog_part(
  p_part_number text,
  p_designation text,
  p_part_id uuid default null,
  p_module module_kind default null,
  p_serialized boolean default null,
  p_machine_type_ids uuid[] default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me profiles := _require_global();
  v_pn text := upper(trim(coalesce(p_part_number, '')));
  v_des text := trim(coalesce(p_designation, ''));
  v_types uuid[];
  v_id uuid;
begin
  if v_pn = '' then raise exception 'Part number is required'; end if;
  if v_des = '' then raise exception 'Designation is required'; end if;

  -- Keep only machine types that exist and are active.
  select coalesce(array_agg(distinct t.id), '{{}}')
    into v_types
    from unnest(coalesce(p_machine_type_ids, '{{}}'::uuid[])) as requested(id)
    join machine_types t on t.id = requested.id and t.active;

  if p_part_id is null then
    if exists (select 1 from parts_catalog where part_number = v_pn) then
      raise exception 'Part number % already exists in the catalogue', v_pn;
    end if;
    insert into parts_catalog (part_number, designation, module, serialized, machine_type_ids)
    values (v_pn, v_des, p_module, p_serialized, v_types)
    returning id into v_id;
  else
    update parts_catalog
       set designation = v_des,
           module = p_module,
           serialized = p_serialized,
           machine_type_ids = v_types
     where id = p_part_id;
    if not found then raise exception 'Part not found in the catalogue'; end if;
    v_id := p_part_id;
  end if;
  return v_id;
end $$;

create or replace function delete_catalog_part(p_part_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me profiles := _require_global();
begin
  delete from parts_catalog where id = p_part_id;
  if not found then raise exception 'Part not found in the catalogue'; end if;
end $$;

revoke execute on function save_catalog_part(text, text, uuid, module_kind, boolean, uuid[]) from public, anon;
revoke execute on function delete_catalog_part(uuid) from public, anon;
grant execute on function save_catalog_part(text, text, uuid, module_kind, boolean, uuid[]) to authenticated;
grant execute on function delete_catalog_part(uuid) to authenticated;

-- ---------- Seed data ----------
insert into parts_catalog (part_number, designation) values
{values}
on conflict (part_number) do nothing;

-- ---------- Classification from the existing type templates ----------
-- Parts that already appear in a machine type template inherit its machine types,
-- module and serialization, so the stock form is useful right away. Entries that
-- were classified by hand are never overwritten (this is a first-run fill only).
update parts_catalog c
   set machine_type_ids = agg.type_ids,
       module = case when agg.module_count = 1 then agg.the_module end,
       serialized = case when agg.serialized_count = 1 then agg.all_serialized end
  from (
    select part_number,
           array_agg(distinct machine_type_id) as type_ids,
           count(distinct module) as module_count,
           min(module) as the_module,
           count(distinct serialized) as serialized_count,
           bool_and(serialized) as all_serialized
      from part_definitions
     where active
     group by part_number
  ) agg
 where c.part_number = agg.part_number
   and c.module is null
   and c.serialized is null
   and c.machine_type_ids = '{{}}';
"""

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(template.format(count=len(parts), values=values), encoding="utf-8")
    print(f"Wrote {OUT} with {len(parts)} parts")


if __name__ == "__main__":
    main()
