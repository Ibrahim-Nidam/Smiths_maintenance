-- 008_multi_template_parts.sql : add a new part to selected machine type templates.
-- Run after 007_stock_management.sql.

drop function if exists add_part_to_machine(
  uuid, module_kind, text, text, boolean, integer, placement_mode, boolean, boolean
);

create or replace function add_part_to_machine(
  p_machine_id uuid,
  p_module module_kind,
  p_name text,
  p_part_number text,
  p_serialized boolean,
  p_quantity int,
  p_placement placement_mode,
  p_rma_applicable boolean default false,
  p_add_to_template boolean default false,
  p_template_type_ids uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me profiles := _me();
  m machines;
  v_mp uuid;
  v_pn text := trim(coalesce(p_part_number, ''));
  v_name text := trim(coalesce(p_name, ''));
  v_type_id uuid;
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

    foreach v_type_id in array coalesce(p_template_type_ids, '{}'::uuid[])
    loop
      if v_type_id is distinct from m.machine_type_id
         and exists (select 1 from machine_types where id = v_type_id and active) then
        insert into part_definitions (machine_type_id, module, name, part_number, serialized, quantity,
                                      placement_mode, rma_applicable, created_by)
        values (v_type_id, p_module, v_name, v_pn, p_serialized, p_quantity, p_placement, p_rma_applicable, me.id)
        on conflict (machine_type_id, module, part_number) do nothing;
      end if;
    end loop;
  end if;

  perform _log_event(p_machine_id, 'part_added_to_machine', v_mp, null, null, null, v_pn, p_quantity, null,
                     format('%s in %s module', v_name, p_module));
  return v_mp;
end $$;

grant execute on function add_part_to_machine(
  uuid, module_kind, text, text, boolean, integer, placement_mode, boolean, boolean, uuid[]
) to authenticated;
