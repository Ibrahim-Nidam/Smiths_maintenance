-- 009_machine_part_editing.sql : edit/remove machine part definitions.
-- Run after 008_multi_template_parts.sql.

create or replace function update_machine_part(
  p_machine_part_id uuid,
  p_name text,
  p_part_number text,
  p_quantity int,
  p_placement placement_mode,
  p_rma_applicable boolean,
  p_template_type_ids uuid[] default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles := _me();
  mp machine_parts;
  m machines;
  v_name text := trim(coalesce(p_name, ''));
  v_pn text := upper(trim(coalesce(p_part_number, '')));
  v_old_pn text;
  v_type_ids uuid[];
  v_pos int;
begin
  select * into mp from machine_parts where id = p_machine_part_id for update;
  if not found then raise exception 'Machine part not found'; end if;
  m := _require_machine_access(mp.machine_id);
  if me.role not in ('admin','maintenance_manager','team_lead') then
    raise exception 'You do not have permission to edit machine parts' using errcode = '42501';
  end if;
  if coalesce(array_length(p_template_type_ids, 1), 0) > 0
     and me.role not in ('admin','maintenance_manager') then
    raise exception 'Only admins and maintenance managers can update other templates' using errcode = '42501';
  end if;
  if v_name = '' or v_pn = '' then raise exception 'Name and part number are required'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be at least 1'; end if;
  if exists (
    select 1 from machine_parts
    where machine_id = mp.machine_id and module = mp.module and part_number = v_pn and id <> mp.id
  ) then raise exception 'Part number % already exists in this module', v_pn; end if;
  if p_quantity < mp.quantity and exists (
    select 1 from machine_slots where machine_part_id = mp.id and position > p_quantity and instance_id is not null
  ) then raise exception 'Cannot reduce quantity while positions above the new quantity are occupied'; end if;

  v_old_pn := mp.part_number;
  v_type_ids := case
    when me.role in ('admin','maintenance_manager')
      then array_append(coalesce(p_template_type_ids, '{}'::uuid[]), m.machine_type_id)
    else '{}'::uuid[]
  end;

  update machine_parts
     set name = v_name,
         part_number = v_pn,
         quantity = p_quantity,
         placement_mode = p_placement,
         rma_applicable = coalesce(p_rma_applicable, false)
   where id = mp.id;

  if p_quantity < mp.quantity then
    delete from machine_slots where machine_part_id = mp.id and position > p_quantity;
  elsif p_quantity > mp.quantity then
    insert into machine_slots (machine_part_id, position)
    select mp.id, generate_series(mp.quantity + 1, p_quantity);
  end if;

  update part_definitions
     set name = v_name,
         part_number = v_pn,
         quantity = p_quantity,
         placement_mode = p_placement,
         rma_applicable = coalesce(p_rma_applicable, false)
   where machine_type_id = any(v_type_ids)
     and module = mp.module
     and part_number = v_old_pn;
end $$;

create or replace function delete_machine_part(
  p_machine_part_id uuid,
  p_template_type_ids uuid[] default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles := _me();
  mp machine_parts;
  m machines;
  v_type_ids uuid[];
begin
  select * into mp from machine_parts where id = p_machine_part_id for update;
  if not found then raise exception 'Machine part not found'; end if;
  m := _require_machine_access(mp.machine_id);
  if me.role not in ('admin','maintenance_manager','team_lead') then
    raise exception 'You do not have permission to remove machine parts' using errcode = '42501';
  end if;
  if coalesce(array_length(p_template_type_ids, 1), 0) > 0
     and me.role not in ('admin','maintenance_manager') then
    raise exception 'Only admins and maintenance managers can remove parts from other templates' using errcode = '42501';
  end if;
  if exists (select 1 from machine_slots where machine_part_id = mp.id and instance_id is not null) then
    raise exception 'Cannot remove a part while serialized units are installed';
  end if;

  if me.role in ('admin','maintenance_manager') then
    v_type_ids := array_append(coalesce(p_template_type_ids, '{}'::uuid[]), m.machine_type_id);
    delete from part_definitions
     where machine_type_id = any(v_type_ids)
       and module = mp.module
       and part_number = mp.part_number;
  end if;
  delete from machine_parts where id = mp.id;
end $$;

grant execute on function update_machine_part(uuid, text, text, int, placement_mode, boolean, uuid[]) to authenticated;
grant execute on function delete_machine_part(uuid, uuid[]) to authenticated;
