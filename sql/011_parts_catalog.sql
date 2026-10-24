-- 011_parts_catalog.sql : searchable parts catalogue (part number + designation).
-- Imported from the client parts list: docs/Unique_Parts_PN_list.xlsx (85 parts).
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
  add column if not exists machine_type_ids uuid[] not null default '{}';

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
  select coalesce(array_agg(distinct t.id), '{}')
    into v_types
    from unnest(coalesce(p_machine_type_ids, '{}'::uuid[])) as requested(id)
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
  ('605865-1', 'BRACKET,SEIO,MOUNTING,ROLLER,LEFT'),
  ('604620-4', 'X-RAY TUBE,VARIAN,THIN-ANODE,TH SW'),
  ('605865-2', 'BRACKET,SEIO,MOUNTING,ROLLER,RIGHT'),
  ('604620-5', 'HIGH VOLTAGE POWER SUPPLY'),
  ('608569-1', 'KIT,HP RAIN SERVER,MUXV2,F14'),
  ('604620-6', 'PCB ASSEMBLY HVIC-3 W/FIRMWARE'),
  ('604620-7', 'PWA, SDSII/HVICII-2, CTX9400'),
  ('604620-8', 'DC POWER SUPPLY, 5 KW, INPUT: 342/4'),
  ('605557-7', 'PWRSPLY ASSY,HI VOLT,GEN 2,9400/9800'),
  ('604620-9', 'ASSY,(UPS,6000 VA,400 VAC,3-PHASE,220 V)'),
  ('604620-10', 'ASSY,EXTERNAL BAT MODULE98D,CONFIGURD'),
  ('605557-6', 'PS ASSEMBLY,HI VOLT,ECLIPSE,9800SEIO'),
  ('604620-11', 'UPS RACK 3 KVA 230VAC/ correct PN'),
  ('604620-12', 'HVAC 4-TON ROHS'),
  ('604620-13', 'COMPUTER ASSY, HOST, PROGRAMMED, X800'),
  ('604620-14', 'PWA, GLOBAL BACKPLANE 1'),
  ('604620-15', 'PWA, GLOBAL BACKPLANE 2'),
  ('604620-16', 'PWA, DAS CONTROL BOARD, PROGRAMMED'),
  ('604620-17', 'PWA, POWER DISTRIBUTION PANEL, SEIO'),
  ('604620-18', 'PWA,PDB1,DAS'),
  ('604606-3', 'ASSY, HEAT EXCHANGER CTX9800'),
  ('604620-19', 'PWA,PDB2, DAS'),
  ('604620-20', 'PWA,POWER DISTRIBUTION AUX2,SEIO'),
  ('604620-21', 'TRANSMITTER, 2.5 GBIT, DUAL CHANNEL'),
  ('604754-3RW', 'DETECTOR MODULE ASSY (DMA),CTX 9800DSI'),
  ('604620-22', 'RECEIVER, 2.5 GBIT, DUAL CHANNEL'),
  ('604754-1', 'DETECTOR MODULE ASSY (DMA),CTX 9800DSI'),
  ('604620-23', 'PWA, ENCODER ASSY, MODIFIED'),
  ('604620-24', 'KIT, ENCODER SENSOR BOARD,CTX 9800'),
  ('604620-25', 'DETECTOR MODULE ASSY (DMA),CTX 9800DSI'),
  ('P4511430', 'UPS RACK 3 KVA 230VAC/ correct PN'),
  ('604620-26', 'MODULE,ADAM 6050-CE,ETHERNET CONTROLLER'),
  ('605440-1', 'PWA, GLOBAL BACKPLANE 1'),
  ('604620-27', 'FAN, 48VDC, 312CFM'),
  ('605445-1', 'PWA, GLOBAL BACKPLANE 2'),
  ('604620-28', 'BRUSH,BLACK'),
  ('604620-29', 'BRUSH,SILVER'),
  ('606012-1', 'Shield CT window/ tunel'),
  ('604620-30', 'BRUSH,8 X 10 CA40'),
  ('608118-1', 'WINDOW, CT, LOWER, SEIO'),
  ('604620-31', 'FLTR,AIR,MERV-8,14x20x1,TRADE SIZE'),
  ('605887-2', 'ASSY, SEIO, SLIDERBED, RADIUS'),
  ('604620-32', 'FILTER,AIR,EVAPORATOR,14 X 16 X 1 IN.'),
  ('604620-33', 'PANEL, CT, WINDOW slider'),
  ('604620-34', 'Shield CT window/ tunel'),
  ('604620-35', 'PANEL, CT WINDOW, SLIDERBED'),
  ('604620-36', 'MON,FLT PNL,17 INCH W/LED BACKLIGHTING'),
  ('604620-37', 'OEM,UPS,24V IN,24V OUT,W/12V 5AH BATT'),
  ('604788-1', 'Receiver unit 2.5GBit/s'),
  ('604620-38', 'POWER SUPPLY,MONITOR,LCD, (ELO MONITORS)'),
  ('604620-39', 'PS,48VDC,10A,480W,SINGLE OUTPUT'),
  ('604620-40', 'PWR SUP DIN RAIL 24V 20A 480W'),
  ('1009243-01', 'COMPUTER ASSY, HOST, PROGRAMMED, X800'),
  ('604620-41', 'PWR SUP DIN RAIL 24V 10A 240W'),
  ('604620-42', 'BELT, CONVEYOR, ZIPPER, SEIO'),
  ('604620-43', 'ASSY, GANTRY POWER SUPPLY'),
  ('604620-44', 'WINDOW, CT, LOWER, SEIO'),
  ('608140-2', 'ASSY, MOTION CONTROL'),
  ('604620-45', 'MOTOR, BRUSHLESS SERVO, 7.8 NM'),
  ('604620-46', 'SWITCH, ETHERNET, 24 PORT GIGABIT/ Netgear'),
  ('606029-1', 'ASSY, SEIO, DRIVE PULLEY TENSION'),
  ('604620-47', 'Switch cisco 3750 24 Ethernet Ports'),
  ('500421-2', 'PWA, MOTION BOARD, CTX9800'),
  ('608623-1', 'CABLE,ENET,CAT6,18FT,GANTRY MOTION CNTRL'),
  ('608623-2', 'CABLE,ENET,CAT6,18'',SW-CNVR MTN CNTRL'),
  ('608623-3', 'CABLE ASSY,ENET,CAT6,18FT,SW TO DC PS'),
  ('608623-4', 'CABLE,ENET,CAT6,18FT,SW TO UPS PORT 1'),
  ('608624-1', 'CABLE,ENET,CAT6,4FT,SW TO HOST CMPTR TOP'),
  ('608624-2', 'CABLE,ENET,CAT6,4FT,SW TO HOST CMPTR BOT'),
  ('608625-1', 'CABLE ASSY, ETHERNET, CAT6, 20FT,SW J1'),
  ('608625-10', 'CABLE ASSY, ETHERNET, CAT6, 20FT,SW J21T'),
  ('608625-11', 'CABLE ASSY, ETHERNET, CAT6, 20FT,SW J22T'),
  ('608625-2', 'CABLE ASSY, ETHERNET, CAT6, 20FT,SW J2'),
  ('608625-3', 'CABLE ASSY, ETHERNET, CAT6, 20FT,SW J3'),
  ('608625-4', 'CABLE ASSY, ETHERNET, CAT6, 20FT.SW J8'),
  ('608625-5', 'CABLE ASSY, ETHERNET, CAT6, 20FT,SW J9'),
  ('608625-6', 'CABLE ASSY, ETHERNET, CAT6, 20FT,SW J10'),
  ('608625-7', 'CABLE ASSY, ETHERNET, CAT6, 20FT,SW J12'),
  ('608308-1', 'CABLE ASSY, POWER, PMA OUTPUT'),
  ('608625-8', 'CABLE ASSY, ETHERNET, CAT6, 20FT,SW J13'),
  ('608312-1', 'CABLE ASSY,PDB AUX4 TO GLOBAL BKPLN 2'),
  ('608625-9', 'CABLE ASSY,ENET,CAT6,20FT,RCN CPU ADPTR'),
  ('608567-1', 'CABLE ASSY, HX4 TO GB1, SDS'),
  ('608626-1', 'CABLE ASSY, UPS TO PLC POWER STRIP'),
  ('608228-1', 'ASSY,PWA,PWR DISTRIBUTION,HEAT EXCHANGER')
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
   and c.machine_type_ids = '{}';
