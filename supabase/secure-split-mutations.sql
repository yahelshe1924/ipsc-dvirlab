-- Require a signed-in, active lab member for every split mutation.
-- Registration mutations may only affect the caller's own member row.

create or replace function public.assert_active_member(
  p_member_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to change split plates.';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  if not exists (
    select 1
    from public.members m
    where lower(m.email) = v_email
      and m.active = true
      and (p_member_id is null or m.id = p_member_id)
  ) then
    raise exception 'You are not authorized to change these split plates.';
  end if;
end;
$$;

-- These functions already contain the capacity and open-split validation.
-- Add authorization at their entry points without duplicating that logic.
create or replace function public.authorize_split_registration_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.assert_active_member(old.member_id);
    return old;
  end if;

  perform public.assert_active_member(new.member_id);
  return new;
end;
$$;

drop trigger if exists authorize_split_registration_mutation
  on public.split_registrations;
create trigger authorize_split_registration_mutation
  before insert or update or delete on public.split_registrations
  for each row execute function public.authorize_split_registration_mutation();

-- RPC-level guards are needed because these SECURITY DEFINER functions can
-- otherwise be invoked through PostgREST with the public anon key.
revoke execute on function public.upsert_split_registration(uuid, uuid, integer) from anon;
revoke execute on function public.delete_split_registration(uuid, uuid) from anon;
revoke execute on function public.update_split_flow(uuid, integer) from anon;

grant execute on function public.upsert_split_registration(uuid, uuid, integer) to authenticated;
grant execute on function public.delete_split_registration(uuid, uuid) to authenticated;
grant execute on function public.update_split_flow(uuid, integer) to authenticated;

-- Flow is not tied to a member row, so authentication and active membership
-- are enforced by wrapping the existing implementation under a private name.
alter function public.update_split_flow(uuid, integer)
  rename to update_split_flow_impl;
revoke all on function public.update_split_flow_impl(uuid, integer) from public, anon, authenticated;

create function public.update_split_flow(
  p_split_id uuid,
  p_flow_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_active_member();
  perform public.update_split_flow_impl(p_split_id, p_flow_count);
end;
$$;

revoke all on function public.update_split_flow(uuid, integer) from public, anon;
grant execute on function public.update_split_flow(uuid, integer) to authenticated;
