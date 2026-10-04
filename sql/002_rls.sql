-- 002_rls.sql : helper functions + Row Level Security policies (v1)
-- Run after 001_schema.sql. Safe to run again (policies are dropped and recreated).
--
-- Model: users never write to data tables directly. Reads are limited by role and team here;
-- all changes to machines, parts, units, stock and history go through the RPC functions in
-- 003_functions.sql, which re-check role and team on the server.

-- ---------- Helper functions ----------
create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create or replace function my_team() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from profiles where id = auth.uid() and active
$$;

-- admin and maintenance_manager see everything
create or replace function is_global() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role() in ('admin','maintenance_manager'), false)
$$;

-- ---------- Enable RLS on every table ----------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------- Policies ----------
-- profiles: own row; global roles see all; team leads see their team
drop policy if exists profiles_read_own on profiles;
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or is_global() or (my_role() = 'team_lead' and team_id = my_team()));

drop policy if exists profiles_admin_insert on profiles;
create policy profiles_admin_insert on profiles for insert to authenticated
  with check (my_role() = 'admin');

drop policy if exists profiles_admin_update on profiles;
create policy profiles_admin_update on profiles for update to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- teams: global roles manage; everyone reads their own team
drop policy if exists teams_select on teams;
create policy teams_select on teams for select to authenticated
  using (is_global() or id = my_team());

drop policy if exists teams_write_insert on teams;
create policy teams_write_insert on teams for insert to authenticated with check (is_global());
drop policy if exists teams_write_update on teams;
create policy teams_write_update on teams for update to authenticated using (is_global()) with check (is_global());
drop policy if exists teams_write_delete on teams;
create policy teams_write_delete on teams for delete to authenticated using (is_global());

-- machine types: everyone reads, admin writes
drop policy if exists machine_types_select on machine_types;
create policy machine_types_select on machine_types for select to authenticated using (true);
drop policy if exists machine_types_insert on machine_types;
create policy machine_types_insert on machine_types for insert to authenticated with check (my_role() = 'admin');
drop policy if exists machine_types_update on machine_types;
create policy machine_types_update on machine_types for update to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');

-- part definitions (type templates): everyone reads, global roles write
drop policy if exists part_definitions_select on part_definitions;
create policy part_definitions_select on part_definitions for select to authenticated using (true);
drop policy if exists part_definitions_insert on part_definitions;
create policy part_definitions_insert on part_definitions for insert to authenticated with check (is_global());
drop policy if exists part_definitions_update on part_definitions;
create policy part_definitions_update on part_definitions for update to authenticated using (is_global()) with check (is_global());

-- machines: global roles see all, others see their team's machines (read only; writes via RPC)
drop policy if exists machines_select on machines;
create policy machines_select on machines for select to authenticated
  using (is_global() or team_id = my_team());

-- machine parts and slots follow machine visibility (the subqueries are filtered by the policies above)
drop policy if exists machine_parts_select on machine_parts;
create policy machine_parts_select on machine_parts for select to authenticated
  using (machine_id in (select id from machines));

drop policy if exists machine_slots_select on machine_slots;
create policy machine_slots_select on machine_slots for select to authenticated
  using (machine_part_id in (select id from machine_parts));

-- units: visible if not installed in a machine, or installed in a machine you can see
drop policy if exists part_instances_select on part_instances;
create policy part_instances_select on part_instances for select to authenticated
  using (is_global() or location <> 'machine' or id in (select instance_id from machine_slots where instance_id is not null));

-- stock is shared company-wide: everyone reads, changes go through RPC
drop policy if exists stock_items_select on stock_items;
create policy stock_items_select on stock_items for select to authenticated using (true);
drop policy if exists stock_movements_select on stock_movements;
create policy stock_movements_select on stock_movements for select to authenticated using (true);

-- history: global roles see all, others see their team's events (read only; append via RPC)
drop policy if exists maintenance_events_select on maintenance_events;
create policy maintenance_events_select on maintenance_events for select to authenticated
  using (is_global() or team_id = my_team());

-- ---------- Privileges ----------
revoke all on all tables in schema public from anon;
