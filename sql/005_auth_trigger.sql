-- 005_auth_trigger.sql : Auto-create profile on auth.users insert
-- Run in Supabase SQL Editor

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role, team_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'technician'),
    case 
      when new.raw_user_meta_data->>'team_id' is not null and new.raw_user_meta_data->>'team_id' != '' 
      then (new.raw_user_meta_data->>'team_id')::uuid 
      else null 
    end
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    role = excluded.role,
    team_id = excluded.team_id;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
