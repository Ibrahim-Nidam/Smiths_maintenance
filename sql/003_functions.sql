-- 003_functions.sql : security definer RPC functions (v1)
-- Run after 002_rls.sql. Safe to run again.
-- Every function re-checks the caller's role and team on the server. Each one changes
-- slots, units, stock and history in a single transaction.

-- ---------- Internal helpers (not meant to be called from the app) ----------
create or replace function _me() returns profiles
language plpgsql stable security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where id = auth.uid() and active;
  if not found then
    raise exception 'Not signed in or account disabled' using errcode = '42501';
  end if;
  return p;
end $$;

create or replace function _require_machine_access(p_machine uuid) returns machines
language plpgsql security definer set search_path = public as $$
declare m machines; me profiles := _me();
begin
  select * into m from machines where id = p_machine;
  if not found then raise exception 'Machine not found'; end if;
  if not (me.role in ('admin','maintenance_manager') or m.team_id = me.team_id) then
    raise exception 'You do not have access to this machine' using errcode = '42501';
  end if;
  return m;
end $$;

create or replace function _log_event(
  p_machine uuid, p_type event_type, p_machine_part uuid default null, p_position int default null,
  p_old uuid default null, p_new uuid default null, p_part_number text default null,
  p_qty numeric default null, p_reason text default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_team uuid;
begin
  select coalesce(
    (select team_id from machines where id = p_machine),
    (select team_id from profiles where id = auth.uid())
  ) into v_team;
  insert into maintenance_events
    (machine_id, team_id, user_id, event_type, machine_part_id, position, old_instance_id,
     new_instance_id, part_number, quantity, reason, notes, occurred_at, created_at)
  values
    (p_machine, v_team, auth.uid(), p_type, p_machine_part, p_position, p_old,
     p_new, p_part_number, p_qty, p_reason, p_notes, clock_timestamp(), clock_timestamp())
  returning id into v_id;
  return v_id;
end $$;

-- Puts a serial into an empty position. Reuses the unit if it already exists (for example from stock).
create or replace function _install_instance(p_slot uuid, p_serial text, p_tag_rma boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s machine_slots; mp machine_parts; i part_instances;
  v_serial text := trim(coalesce(p_serial, ''));
  v_inst uuid;
begin
  select * into s from machine_slots where id = p_slot for update;
  if not found then raise exception 'Position not found'; end if;
  if s.instance_id is not null then raise exception 'Position % is not empty', s.position; end if;
  select * into mp from machine_parts where id = s.machine_part_id;
  if not mp.serialized then raise exception 'This part is not serialized'; end if;
  if v_serial = '' then raise exception 'Serial number is required'; end if;

  select * into i from part_instances where part_number = mp.part_number and serial_number = v_serial for update;
  if found then
    if i.status = 'scrapped' then raise exception 'Serial % is scrapped and cannot be installed', v_serial; end if;
    if exists (select 1 from machine_slots where instance_id = i.id) then
      raise exception 'Serial % is already installed in a machine', v_serial;
    end if;
    update part_instances
       set status = 'installed', location = 'machine',
           rma_tagged_at = case when p_tag_rma and not rma_tagged then now() else rma_tagged_at end,
           rma_tagged = rma_tagged or p_tag_rma
     where id = i.id;
    v_inst := i.id;
  else
    insert into part_instances (part_number, serial_number, status, location, rma_tagged, rma_tagged_at, created_by)
    values (mp.part_number, v_serial, 'installed', 'machine', p_tag_rma, case when p_tag_rma then now() end, auth.uid())
    returning id into v_inst;
  end if;

  update machine_slots set instance_id = v_inst, installed_at = now() where id = p_slot;
  return v_inst;
end $$;

-- ---------- Machines ----------
create or replace function create_machine(
  p_code text, p_type_id uuid, p_team_id uuid, p_location text default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me profiles := _me(); v_code text := trim(coalesce(p_code, ''));
  v_id uuid; v_mp uuid; d part_definitions; v_type text;
begin
  if me.role = 'technician' then raise exception 'Technicians cannot create machines' using errcode = '42501'; end if;
  if me.role = 'team_lead' and p_team_id is distinct from me.team_id then
    raise exception 'Team leads can only create machines for their own team' using errcode = '42501';
  end if;
  if v_code = '' then raise exception 'Machine code is required'; end if;
  if exists (select 1 from machines where code = v_code) then raise exception 'Machine code % already exists', v_code; end if;
  select name into v_type from machine_types where id = p_type_id and active;
  if not found then raise exception 'Machine type not found'; end if;

  insert into machines (code, machine_type_id, team_id, location, notes, created_by)
  values (v_code, p_type_id, p_team_id, p_location, p_notes, me.id)
  returning id into v_id;

  -- one-way copy of the type template: structure only, no serials
  for d in select * from part_definitions where machine_type_id = p_type_id and active order by sort_order, name
  loop
    insert into machine_parts (machine_id, module, name, part_number, serialized, quantity, placement_mode,
                               rma_applicable, description, source_definition_id, sort_order, created_by)
    values (v_id, d.module, d.name, d.part_number, d.serialized, d.quantity, d.placement_mode,
            d.rma_applicable, d.description, d.id, d.sort_order, me.id)
    returning id into v_mp;
    insert into machine_slots (machine_part_id, position)
      select v_mp, g from generate_series(1, d.quantity) g;
  end loop;

  perform _log_event(v_id, 'machine_created', null, null, null, null, null, null, null,
                     format('Created as %s', v_type));
  return v_id;
end $$;

create or replace function update_machine(
  p_machine_id uuid, p_status machine_status default null, p_location text default null,
  p_notes text default null, p_team_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare me profiles := _me(); m machines; v_changes text[] := '{}';
begin
  if me.role = 'technician' then raise exception 'Technicians cannot edit machines' using errcode = '42501'; end if;
  m := _require_machine_access(p_machine_id);
  if p_team_id is not null and p_team_id is distinct from m.team_id then
    if me.role not in ('admin','maintenance_manager') then
      raise exception 'Only admins and maintenance managers can move a machine to another team' using errcode = '42501';
    end if;
    v_changes := v_changes || format('team changed');
  end if;
  if p_status is not null and p_status is distinct from m.status then
    v_changes := v_changes || format('status %s to %s', m.status, p_status);
  end if;
  if p_location is not null and p_location is distinct from m.location then v_changes := v_changes || 'location changed'; end if;
  if p_notes is not null and p_notes is distinct from m.notes then v_changes := v_changes || 'notes changed'; end if;

  update machines set
    status = coalesce(p_status, status),
    location = coalesce(p_location, location),
    notes = coalesce(p_notes, notes),
    team_id = coalesce(p_team_id, team_id)
  where id = p_machine_id;

  if array_length(v_changes, 1) > 0 then
    perform _log_event(p_machine_id, 'machine_updated', null, null, null, null, null, null, null, array_to_string(v_changes, ', '));
  end if;
end $$;

-- ---------- Parts on a machine ----------
create or replace function add_part_to_machine(
  p_machine_id uuid, p_module module_kind, p_name text, p_part_number text, p_serialized boolean,
  p_quantity int, p_placement placement_mode, p_rma_applicable boolean default false,
  p_add_to_template boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me profiles := _me(); m machines; v_mp uuid;
  v_pn text := trim(coalesce(p_part_number, '')); v_name text := trim(coalesce(p_name, ''));
begin
  m := _require_machine_access(p_machine_id);
  if v_pn = '' or v_name = '' then raise exception 'Name and part number are required'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be at least 1'; end if;
  if p_add_to_template and me.role not in ('admin','maintenance_manager') then
    raise exception 'Only admins and maintenance managers can add parts to a type template' using errcode = '42501';
  end if;
  if exists (select 1 from machine_parts where machine_id = p_machine_id and module = p_module and part_number = v_pn) then
    raise exception 'Part number % already exists in this module', v_pn;
  end if;

  insert into machine_parts (machine_id, module, name, part_number, serialized, quantity, placement_mode,
                             rma_applicable, sort_order, created_by)
  values (p_machine_id, p_module, v_name, v_pn, p_serialized, p_quantity, p_placement, p_rma_applicable,
          coalesce((select max(sort_order) + 1 from machine_parts where machine_id = p_machine_id and module = p_module), 0),
          me.id)
  returning id into v_mp;
  insert into machine_slots (machine_part_id, position) select v_mp, g from generate_series(1, p_quantity) g;

  if p_add_to_template then
    insert into part_definitions (machine_type_id, module, name, part_number, serialized, quantity,
                                  placement_mode, rma_applicable, created_by)
    values (m.machine_type_id, p_module, v_name, v_pn, p_serialized, p_quantity, p_placement, p_rma_applicable, me.id)
    on conflict (machine_type_id, module, part_number) do nothing;
  end if;

  perform _log_event(p_machine_id, 'part_added_to_machine', v_mp, null, null, null, v_pn, p_quantity, null,
                     format('%s in %s module', v_name, p_module));
  return v_mp;
end $$;

-- Enter a serial in an empty position. p_rma = true tags the unit RMA on entry.
create or replace function set_slot_serial(
  p_slot_id uuid, p_serial text, p_rma boolean default false, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare s machine_slots; mp machine_parts; m machines; v_inst uuid;
begin
  select * into s from machine_slots where id = p_slot_id;
  if not found then raise exception 'Position not found'; end if;
  select * into mp from machine_parts where id = s.machine_part_id;
  m := _require_machine_access(mp.machine_id);

  v_inst := _install_instance(p_slot_id, p_serial, coalesce(p_rma, false));
  if p_notes is not null then update part_instances set notes = p_notes where id = v_inst; end if;

  perform _log_event(m.id, 'part_installed', mp.id, s.position, null, v_inst, mp.part_number, 1, null, p_notes);
  if coalesce(p_rma, false) then
    perform _log_event(m.id, 'rma_tagged', mp.id, s.position, null, v_inst, mp.part_number, null, 'Tagged RMA on entry', null);
  end if;
  return v_inst;
end $$;

-- Replace the unit in a position. p_outcome describes the removed unit: 'rma' | 'stock' | 'scrapped'.
-- p_new_serial may be empty to leave the position empty until a replacement is available.
create or replace function replace_serialized_part(
  p_slot_id uuid, p_outcome text, p_new_serial text default null, p_reason text default null, p_notes text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare s machine_slots; mp machine_parts; m machines; v_old uuid; v_new uuid;
begin
  if p_outcome not in ('rma','stock','scrapped') then
    raise exception 'Outcome must be rma, stock or scrapped';
  end if;
  select * into s from machine_slots where id = p_slot_id for update;
  if not found then raise exception 'Position not found'; end if;
  select * into mp from machine_parts where id = s.machine_part_id;
  m := _require_machine_access(mp.machine_id);
  v_old := s.instance_id;
  if v_old is null then raise exception 'Position % is empty, nothing to replace', s.position; end if;

  update part_instances set
    status = (case p_outcome when 'scrapped' then 'scrapped' else 'available' end)::instance_status,
    location = case p_outcome when 'scrapped' then 'scrapped' else 'stock' end,
    rma_tagged_at = case when p_outcome = 'rma' and not rma_tagged then now() else rma_tagged_at end,
    rma_tagged = rma_tagged or p_outcome = 'rma'
  where id = v_old;
  update machine_slots set instance_id = null, installed_at = null where id = p_slot_id;

  if p_new_serial is not null and trim(p_new_serial) <> '' then
    v_new := _install_instance(p_slot_id, p_new_serial, false);
    perform _log_event(m.id, 'part_replaced', mp.id, s.position, v_old, v_new, mp.part_number, 1, p_reason, p_notes);
  else
    perform _log_event(m.id, 'part_removed', mp.id, s.position, v_old, null, mp.part_number, 1, p_reason, p_notes);
  end if;
  if p_outcome = 'rma' then
    perform _log_event(m.id, 'rma_tagged', mp.id, s.position, v_old, null, mp.part_number, null, 'Tagged RMA on removal', null);
  end if;
end $$;

create or replace function replace_non_serialized_part(
  p_machine_part_id uuid, p_reason text default null, p_notes text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare mp machine_parts; m machines; v_stock uuid; v_ev uuid;
begin
  select * into mp from machine_parts where id = p_machine_part_id;
  if not found then raise exception 'Part not found'; end if;
  if mp.serialized then raise exception 'This part is serialized, replace it by position'; end if;
  m := _require_machine_access(mp.machine_id);

  v_ev := _log_event(m.id, 'part_replaced', mp.id, null, null, null, mp.part_number, 1, p_reason, p_notes);

  select id into v_stock from stock_items where part_number = mp.part_number for update;
  if v_stock is not null then
    update stock_items set quantity = quantity - 1 where id = v_stock and quantity >= 1;
    if found then
      insert into stock_movements (stock_item_id, delta, from_location, to_location, event_id, user_id, reason)
      values (v_stock, -1, 'stock', 'machine ' || m.code, v_ev, auth.uid(), p_reason);
    end if;
  end if;
end $$;

-- Swap two units between positions of the same flexible part.
create or replace function swap_parts(p_slot_a uuid, p_slot_b uuid, p_notes text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a machine_slots; b machine_slots; mp machine_parts; m machines; ia uuid; ib uuid; sa text; sb text;
begin
  if p_slot_a = p_slot_b then raise exception 'Choose two different positions'; end if;
  perform 1 from machine_slots where id in (p_slot_a, p_slot_b) order by id for update;
  select * into a from machine_slots where id = p_slot_a;
  select * into b from machine_slots where id = p_slot_b;
  if a.id is null or b.id is null then raise exception 'Position not found'; end if;
  if a.machine_part_id <> b.machine_part_id then raise exception 'Positions must belong to the same part'; end if;
  select * into mp from machine_parts where id = a.machine_part_id;
  if mp.placement_mode <> 'flexible' then raise exception 'This part has fixed placement and cannot be swapped'; end if;
  m := _require_machine_access(mp.machine_id);
  ia := a.instance_id; ib := b.instance_id;
  if ia is null or ib is null then raise exception 'Both positions must hold a unit to swap'; end if;

  select serial_number into sa from part_instances where id = ia;
  select serial_number into sb from part_instances where id = ib;

  update machine_slots set instance_id = null where id = p_slot_a;
  update machine_slots set instance_id = ia where id = p_slot_b;
  update machine_slots set instance_id = ib where id = p_slot_a;

  perform _log_event(m.id, 'parts_swapped', mp.id, a.position, ia, ib, mp.part_number, null, null,
    format('Position %s (%s) swapped with position %s (%s).%s', a.position, sa, b.position, sb,
           case when p_notes is not null then ' ' || p_notes else '' end));
end $$;

-- ---------- RMA tag ----------
-- Anyone who can access the unit can tag or untag it. Every change is written to history.
create or replace function set_rma_tag(p_instance_id uuid, p_tagged boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare i part_instances; v_pos int; v_mp uuid; v_machine uuid;
begin
  select * into i from part_instances where id = p_instance_id for update;
  if not found then raise exception 'Unit not found'; end if;

  select s.position, mp.id, mp.machine_id into v_pos, v_mp, v_machine
    from machine_slots s join machine_parts mp on mp.id = s.machine_part_id
   where s.instance_id = p_instance_id;
  if found then
    perform _require_machine_access(v_machine);
  else
    perform _me();
  end if;

  if i.rma_tagged = p_tagged then return; end if;

  update part_instances set rma_tagged = p_tagged, rma_tagged_at = case when p_tagged then now() end
   where id = p_instance_id;
  perform _log_event(v_machine, case when p_tagged then 'rma_tagged' else 'rma_untagged' end::event_type,
                     v_mp, v_pos, p_instance_id, null, i.part_number, null, p_note, null);
end $$;

-- ---------- Stock (shared, admin and maintenance manager only) ----------
create or replace function _require_global() returns profiles
language plpgsql stable security definer set search_path = public as $$
declare me profiles := _me();
begin
  if me.role not in ('admin','maintenance_manager') then
    raise exception 'Only admins and maintenance managers can change stock directly' using errcode = '42501';
  end if;
  return me;
end $$;

create or replace function create_stock_item(
  p_kind stock_kind, p_name text, p_part_number text default null, p_unit text default 'pcs',
  p_min numeric default 0, p_location text default null, p_initial numeric default 0
) returns uuid
language plpgsql security definer set search_path = public as $$
declare me profiles := _require_global(); v_id uuid; v_ev uuid;
begin
  if trim(coalesce(p_name, '')) = '' then raise exception 'Name is required'; end if;
  if coalesce(p_initial, 0) < 0 then raise exception 'Initial quantity cannot be negative'; end if;
  insert into stock_items (kind, name, part_number, quantity, unit, min_quantity, location, created_by)
  values (p_kind, trim(p_name), nullif(trim(coalesce(p_part_number, '')), ''), 0, coalesce(p_unit, 'pcs'),
          coalesce(p_min, 0), p_location, me.id)
  returning id into v_id;
  if coalesce(p_initial, 0) > 0 then
    update stock_items set quantity = p_initial where id = v_id;
    v_ev := _log_event(null, 'stock_adjusted', null, null, null, null, p_part_number, p_initial, 'Initial quantity', null);
    insert into stock_movements (stock_item_id, delta, to_location, event_id, user_id, reason)
    values (v_id, p_initial, 'stock', v_ev, me.id, 'Initial quantity');
  end if;
  return v_id;
end $$;

create or replace function adjust_stock(p_item_id uuid, p_delta numeric, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare me profiles := _require_global(); it stock_items; v_ev uuid;
begin
  select * into it from stock_items where id = p_item_id for update;
  if not found then raise exception 'Stock item not found'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'Change must not be zero'; end if;
  if it.quantity + p_delta < 0 then raise exception 'Stock cannot go below zero (current: %)', it.quantity; end if;
  update stock_items set quantity = quantity + p_delta where id = p_item_id;
  v_ev := _log_event(null, 'stock_adjusted', null, null, null, null, it.part_number, p_delta, p_reason, it.name);
  insert into stock_movements (stock_item_id, delta, from_location, to_location, event_id, user_id, reason)
  values (p_item_id, p_delta,
          case when p_delta < 0 then 'stock' end, case when p_delta > 0 then 'stock' end, v_ev, me.id, p_reason);
end $$;

create or replace function add_serialized_unit_to_stock(p_part_number text, p_serial text, p_notes text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me profiles := _require_global(); v_pn text := trim(coalesce(p_part_number, '')); v_sn text := trim(coalesce(p_serial, '')); v_id uuid; v_ev uuid;
begin
  if v_pn = '' or v_sn = '' then raise exception 'Part number and serial number are required'; end if;
  if exists (select 1 from part_instances where part_number = v_pn and serial_number = v_sn) then
    raise exception 'Serial % already exists for part number %', v_sn, v_pn;
  end if;
  insert into part_instances (part_number, serial_number, status, location, notes, created_by)
  values (v_pn, v_sn, 'available', 'stock', p_notes, me.id) returning id into v_id;
  v_ev := _log_event(null, 'stock_adjusted', null, null, null, v_id, v_pn, 1, 'Unit added to stock', null);
  insert into stock_movements (instance_id, delta, to_location, event_id, user_id, reason)
  values (v_id, 1, 'stock', v_ev, me.id, 'Unit added to stock');
  return v_id;
end $$;

-- ---------- Privileges ----------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
