-- 012_login_and_accounts.sql : sign in with a full name, manage account emails.
-- Run after sql/011_parts_catalog.sql. Safe to run again.

do $$
begin
  if to_regclass('public.profiles') is null or to_regprocedure('public._require_global()') is null then
    raise exception
      'Base schema is missing. Run sql/001_schema.sql through sql/011_parts_catalog.sql before sql/012_login_and_accounts.sql';
  end if;
end $$;

-- ---------- 1. Sign in with an email address or a full name ----------
-- The sign-in form sends the value typed by the user. When it is not an email
-- address, the app asks this function for the matching sign-in address.
-- It only matches full names of existing accounts and never returns anything for
-- an email address, so addresses cannot be probed through it.
create or replace function resolve_login_email(p_identifier text)
returns text
language sql stable security definer set search_path = public, auth as $$
  select u.email
    from auth.users u
    join public.profiles p on p.id = u.id
   where position('@' in coalesce(p_identifier, '')) = 0
     and btrim(p_identifier) <> ''
     and lower(p.full_name) = lower(btrim(p_identifier))
   order by p.created_at
   limit 1
$$;

revoke execute on function resolve_login_email(text) from public;
grant execute on function resolve_login_email(text) to anon, authenticated;

-- ---------- 2. Read the sign-in address of the accounts ----------
-- Used by the Staff page to show and edit emails. Only admins and maintenance
-- managers get rows back; anyone else receives an empty result.
create or replace function list_account_emails()
returns table (user_id uuid, email text)
language sql stable security definer set search_path = public, auth as $$
  select p.id, u.email
    from public.profiles p
    join auth.users u on u.id = p.id
   where exists (
     select 1 from public.profiles c
      where c.id = auth.uid() and c.active
        and c.role in ('admin', 'maintenance_manager')
   )
   order by p.full_name
$$;

revoke execute on function list_account_emails() from public;
grant execute on function list_account_emails() to authenticated;

-- ---------- 3. Change the sign-in address of an account ----------
-- Auth users can only change their own address from the profile modal; admins and
-- maintenance managers can change anyone's, the same way they reset passwords.
create or replace function update_user_email(p_user_id uuid, p_new_email text)
returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_caller profiles;
  v_email text := lower(btrim(coalesce(p_new_email, '')));
begin
  select * into v_caller from public.profiles where id = auth.uid();
  if v_caller is null or not v_caller.active then
    raise exception 'Not signed in or account disabled' using errcode = '42501';
  end if;

  if p_user_id is distinct from v_caller.id
     and v_caller.role not in ('admin', 'maintenance_manager') then
    raise exception 'Permission denied: only admins and maintenance managers can change another account email'
      using errcode = '42501';
  end if;

  if v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
    raise exception 'Enter a valid email address';
  end if;

  if exists (select 1 from auth.users u where lower(u.email) = v_email and u.id <> p_user_id) then
    raise exception 'The email % is already used by another account', v_email;
  end if;

  update auth.users
     set email = v_email,
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('email', v_email)
   where id = p_user_id;

  if not found then
    raise exception 'User account not found in the authentication system';
  end if;
end $$;

revoke execute on function update_user_email(uuid, text) from public, anon;
grant execute on function update_user_email(uuid, text) to authenticated;
