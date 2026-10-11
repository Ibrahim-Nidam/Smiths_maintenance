-- 010_serialized_storage_location.sql : preserve custom serialized stock locations.
-- Run after 009_machine_part_editing.sql.

alter table part_instances
  add column if not exists storage_location text;

create or replace function add_serialized_unit_to_stock(
  p_part_number text,
  p_serial text,
  p_notes text default null,
  p_location text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me profiles := _require_global();
  v_pn text := upper(trim(coalesce(p_part_number, '')));
  v_sn text := upper(trim(coalesce(p_serial, '')));
  v_storage_location text := nullif(trim(coalesce(p_location, '')), '');
  v_id uuid;
  v_ev uuid;
begin
  if v_pn = '' or v_sn = '' then
    raise exception 'Part number and serial number are required';
  end if;

  if exists (
    select 1
    from part_instances
    where part_number = v_pn and serial_number = v_sn
  ) then
    raise exception 'Serial % already exists for part number %', v_sn, v_pn;
  end if;

  insert into part_instances (
    part_number, serial_number, status, location, storage_location, notes, created_by
  )
  values (
    v_pn, v_sn, 'available', 'stock', v_storage_location, p_notes, me.id
  )
  returning id into v_id;

  v_ev := _log_event(null, 'stock_adjusted', null, null, null, v_id, v_pn, 1, 'Unit added to stock', null);

  insert into stock_movements (instance_id, delta, to_location, event_id, user_id, reason)
  values (v_id, 1, coalesce(v_storage_location, 'stock'), v_ev, me.id, 'Unit added to stock');

  return v_id;
end $$;

grant execute on function add_serialized_unit_to_stock(text, text, text, text) to authenticated;
