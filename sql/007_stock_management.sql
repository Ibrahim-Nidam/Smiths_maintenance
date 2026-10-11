-- 007_stock_management.sql : stock editing, archival and DOA tracking.

-- This is a follow-up migration. Run 001_schema.sql through 006_updates.sql
-- first in the same Supabase project.
do $$
begin
  if to_regclass('public.stock_items') is null
     or to_regclass('public.part_instances') is null then
    raise exception
      'Base schema is missing. Run sql/001_schema.sql through sql/006_updates.sql before sql/007_stock_management.sql';
  end if;

  if to_regprocedure('public._require_global()') is null
     or to_regprocedure('public._require_machine_access(uuid)') is null then
    raise exception
      'Required stock authorization functions are missing. Run sql/003_functions.sql through sql/006_updates.sql before sql/007_stock_management.sql';
  end if;
end $$;

alter table stock_items
  add column if not exists active boolean not null default true;

alter table part_instances
  add column if not exists active boolean not null default true,
  add column if not exists doa boolean not null default false,
  add column if not exists doa_at timestamptz;

create or replace function update_stock_item(
  p_item_id uuid,
  p_name text,
  p_part_number text default null,
  p_unit text default 'pcs',
  p_min numeric default 0,
  p_location text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare me profiles := _require_global();
begin
  if trim(coalesce(p_name, '')) = '' then raise exception 'Name is required'; end if;
  if coalesce(p_min, 0) < 0 then raise exception 'Minimum quantity cannot be negative'; end if;

  update stock_items
     set name = trim(p_name),
         part_number = nullif(trim(coalesce(p_part_number, '')), ''),
         unit = coalesce(nullif(trim(p_unit), ''), 'pcs'),
         min_quantity = coalesce(p_min, 0),
         location = nullif(trim(coalesce(p_location, '')), '')
   where id = p_item_id and active;

  if not found then raise exception 'Stock item not found'; end if;
end $$;

create or replace function archive_stock_item(p_item_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me profiles := _require_global();
begin
  update stock_items set active = false where id = p_item_id and active;
  if not found then raise exception 'Stock item not found'; end if;
end $$;

create or replace function set_part_doa(p_instance_id uuid, p_doa boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare i part_instances; v_machine uuid; v_mp uuid; v_position int;
begin
  select * into i from part_instances where id = p_instance_id for update;
  if not found then raise exception 'Part unit not found'; end if;

  select mp.machine_id, mp.id, s.position
    into v_machine, v_mp, v_position
    from machine_slots s
    join machine_parts mp on mp.id = s.machine_part_id
   where s.instance_id = p_instance_id;

  if v_machine is not null then
    perform _require_machine_access(v_machine);
  else
    perform _me();
  end if;

  update part_instances
     set doa = coalesce(p_doa, false),
         doa_at = case when p_doa then coalesce(doa_at, now()) else null end
   where id = p_instance_id;

  perform _log_event(
    v_machine,
    'stock_adjusted',
    v_mp,
    v_position,
    p_instance_id,
    null,
    i.part_number,
    null,
    case when p_doa then 'Marked DOA' else 'DOA mark removed' end,
    p_note
  );
end $$;

create or replace function archive_serialized_unit(p_instance_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me profiles := _require_global(); i part_instances;
begin
  select * into i from part_instances where id = p_instance_id for update;
  if not found or not i.active then raise exception 'Serialized unit not found'; end if;
  if i.status = 'installed' then raise exception 'Installed units cannot be deleted'; end if;

  update part_instances
     set active = false,
         status = 'scrapped',
         location = 'scrapped'
   where id = p_instance_id;
end $$;

grant execute on function update_stock_item to authenticated;
grant execute on function archive_stock_item to authenticated;
grant execute on function set_part_doa to authenticated;
grant execute on function archive_serialized_unit to authenticated;
