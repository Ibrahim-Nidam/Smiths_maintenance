-- 005_rma_as_tag.sql : MIGRATION for a database created with the v0.1 schema.
-- Turns RMA from a status workflow into a simple toggleable tag on the unit.
-- Not needed for a fresh install (001_schema.sql already contains this).
-- Safe to run once on your current project (no real data is lost: the dropped table was empty).

drop table if exists rma_records;
drop type if exists rma_status;

alter table part_instances
  add column if not exists rma_tagged boolean not null default false,
  add column if not exists rma_tagged_at timestamptz;
alter table part_instances
  drop column if exists rma_declared,
  drop column if exists rma_declared_at;
create index if not exists part_instances_rma_tagged_idx on part_instances (rma_tagged) where rma_tagged;

-- instance_status: available | installed | scrapped
alter table part_instances alter column status drop default;
alter type instance_status rename to instance_status_old;
create type instance_status as enum ('available','installed','scrapped');
alter table part_instances alter column status type instance_status
  using (case status::text when 'installed' then 'installed' when 'scrapped' then 'scrapped' else 'available' end)::instance_status;
alter table part_instances alter column status set default 'available';
drop type instance_status_old;

-- events may be recorded without a machine (stock actions, units in stock)
alter table maintenance_events alter column machine_id drop not null;

-- new event type used when the tag is removed
alter type event_type add value if not exists 'rma_untagged';
