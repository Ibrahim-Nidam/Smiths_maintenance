-- 004_seed.sql : initial data
insert into machine_types (name) values ('Morpho'), ('Eclipse') on conflict do nothing;
insert into teams (name) values ('Team A'), ('Team B') on conflict do nothing;
