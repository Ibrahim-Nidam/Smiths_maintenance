-- 006_updates.sql : Additional RPC functions & RLS policies
-- Run in Supabase SQL Editor

-- 1. Fix append-only trigger to allow foreign key actions and system batch machine deletion
create or replace function block_changes() returns trigger language plpgsql as $$
begin
  -- Allow foreign key triggers (depth > 1) or system machine deletion session setting
  if pg_trigger_depth() > 1 or current_setting('app.allow_history_update', true) = 'true' then
    if tg_op = 'DELETE' then
      return old;
    else
      return new;
    end if;
  end if;

  raise exception '% is append-only', tg_table_name;
end $$;

-- 2. Unit details update function (serials & technician markings)
create or replace function update_unit_details(
  p_instance_id uuid,
  p_serial_number text default null,
  p_notes text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  i part_instances;
  v_sn text;
begin
  select * into i from part_instances where id = p_instance_id for update;
  if not found then raise exception 'Unit not found'; end if;

  v_sn := trim(coalesce(p_serial_number, i.serial_number));
  if v_sn = '' then raise exception 'Serial number cannot be empty'; end if;

  if v_sn <> i.serial_number and exists (
    select 1 from part_instances where part_number = i.part_number and serial_number = v_sn and id <> p_instance_id
  ) then
    raise exception 'Serial number % already exists for part %', v_sn, i.part_number;
  end if;

  update part_instances
     set serial_number = v_sn,
         notes = coalesce(p_notes, notes)
   where id = p_instance_id;
end $$;

-- 3. Allow machine deletion without foreign key violations on history
alter table maintenance_events 
  drop constraint if exists maintenance_events_machine_id_fkey,
  add constraint maintenance_events_machine_id_fkey 
  foreign key (machine_id) references machines(id) on delete set null;

-- 4. RLS Policy for deleting part definitions (template parts)
drop policy if exists part_definitions_delete on part_definitions;
create policy part_definitions_delete on part_definitions for delete to authenticated using (is_global());

-- 5. Serialized unit addition to stock with storage location support
drop function if exists add_serialized_unit_to_stock(text, text, text);

create or replace function add_serialized_unit_to_stock(
  p_part_number text, 
  p_serial text, 
  p_notes text default null,
  p_location text default 'stock'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare 
  me profiles := _require_global(); 
  v_pn text := trim(coalesce(p_part_number, '')); 
  v_sn text := trim(coalesce(p_serial, '')); 
  v_loc text := trim(coalesce(p_location, 'stock'));
  v_id uuid; 
  v_ev uuid;
begin
  if v_pn = '' or v_sn = '' then raise exception 'Part number and serial number are required'; end if;
  if exists (select 1 from part_instances where part_number = v_pn and serial_number = v_sn) then
    raise exception 'Serial % already exists for part number %', v_sn, v_pn;
  end if;
  
  insert into part_instances (part_number, serial_number, status, location, notes, created_by)
  values (v_pn, v_sn, 'available', case when v_loc = '' then 'stock' else v_loc end, p_notes, me.id) 
  returning id into v_id;
  
  v_ev := _log_event(null, 'stock_adjusted', null, null, null, v_id, v_pn, 1, 'Unit added to stock', null);
  insert into stock_movements (instance_id, delta, to_location, event_id, user_id, reason)
  values (v_id, 1, v_loc, v_ev, me.id, 'Unit added to stock');
  
  return v_id;
end $$;

-- 6. Delete machine RPC function with automatic machine name / code tagging on units & history
create or replace function delete_machine(p_machine_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles := _require_global();
  m machines;
  v_code text;
  r record;
begin
  select * into m from machines where id = p_machine_id for update;
  if not found then raise exception 'Machine not found'; end if;
  v_code := m.code;

  -- Allow history notes update during deletion
  perform set_config('app.allow_history_update', 'true', true);

  -- 1. Return all installed serialized units to stock and tag notes with "(from deleted machine K289)"
  for r in 
    select s.instance_id, pi.part_number, pi.notes
      from machine_slots s
      join machine_parts mp on mp.id = s.machine_part_id
      join part_instances pi on pi.id = s.instance_id
     where mp.machine_id = p_machine_id and s.instance_id is not null
  loop
    update part_instances
       set status = 'available',
           location = 'stock',
           notes = case 
                     when r.notes is null or trim(r.notes) = '' 
                     then format('(from deleted machine %s)', v_code)
                     else format('%s (from deleted machine %s)', trim(r.notes), v_code)
                   end
     where id = r.instance_id;

    perform _log_event(null, 'stock_adjusted', null, null, r.instance_id, null, r.part_number, 1, 
                       format('Uninstalled (from deleted machine %s)', v_code), null);
  end loop;

  -- 2. Tag existing maintenance event notes & reasons for this machine with "(from deleted machine K289)"
  update maintenance_events
     set notes = case 
                   when notes is null or trim(notes) = '' 
                   then format('(from deleted machine %s)', v_code)
                   else format('%s (from deleted machine %s)', trim(notes), v_code)
                 end,
         reason = case
                    when reason is null or trim(reason) = ''
                    then format('(from deleted machine %s)', v_code)
                    else format('%s (from deleted machine %s)', trim(reason), v_code)
                  end
   where machine_id = p_machine_id;

  -- 3. Clear instance slots for this machine so CASCADE delete runs cleanly
  update machine_slots set instance_id = null 
   where machine_part_id in (select id from machine_parts where machine_id = p_machine_id);

  -- 4. Delete the machine
  delete from machines where id = p_machine_id;
end $$;

drop policy if exists machines_delete on machines;
create policy machines_delete on machines for delete to authenticated using (is_global());

grant execute on function update_unit_details to authenticated;
grant execute on function add_serialized_unit_to_stock to authenticated;
grant execute on function delete_machine to authenticated;

-- 7. Password reset function for Admin and Maintenance Manager
create or replace function reset_user_password(
  p_user_id uuid,
  p_new_password text default 'Smiths2026!'
) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  caller profiles;
begin
  select * into caller from public.profiles where id = auth.uid();
  if caller is null or caller.role not in ('admin', 'maintenance_manager') then
    raise exception 'Permission denied: Only Admin or Maintenance Manager can reset user passwords.';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
   where id = p_user_id;

  if not found then
    raise exception 'User account not found in authentication system.';
  end if;
end $$;

grant execute on function reset_user_password to authenticated;

-- 8. RLS Policies for profile management (Admin & Maintenance Manager delete/update)
drop policy if exists profiles_delete on profiles;
drop policy if exists profiles_admin_delete on profiles;
create policy profiles_delete on profiles for delete to authenticated 
  using (is_global());

drop policy if exists profiles_update on profiles;
drop policy if exists profiles_admin_update on profiles;
create policy profiles_update on profiles for update to authenticated 
  using (id = auth.uid() or is_global()) 
  with check (id = auth.uid() or is_global());
