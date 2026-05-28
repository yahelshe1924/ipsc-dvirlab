-- Run this once in Supabase SQL Editor.
-- Keeps the previous OPEN split's maintenance_plate_count in sync with the
-- current split's non-maintenance load (user plates + flow plates).
--
-- Rule:
--   Each maintenance plate in the previous split supports up to 5
--   non-maintenance plates in the current split.
--   Maintenance plates in the current split are for the NEXT split, so they do
--   not count against the current split's capacity.

create or replace function public.sync_previous_open_split_maintenance(
  p_current_split_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_split public.splits%rowtype;
  v_prev_split public.splits%rowtype;
  v_user_plates integer;
  v_current_load integer;
  v_required_prev_maintenance integer;
begin
  select *
  into v_current_split
  from public.splits
  where id = p_current_split_id;

  if not found then
    raise exception 'Split not found';
  end if;

  select coalesce(sum(sr.plates_count), 0)::integer
  into v_user_plates
  from public.split_registrations sr
  where sr.split_id = p_current_split_id;

  v_current_load := v_user_plates + coalesce(v_current_split.flow_plate_count, 0);
  v_required_prev_maintenance := greatest(1, ceil(v_current_load / 5.0)::integer);

  select *
  into v_prev_split
  from public.splits
  where batch_id = v_current_split.batch_id
    and split_number = v_current_split.split_number - 1
  for update;

  if found and v_prev_split.status = 'open' then
    update public.splits
    set maintenance_plate_count = v_required_prev_maintenance
    where id = v_prev_split.id;
  end if;
end;
$$;

create or replace function public.upsert_split_registration(
  p_split_id uuid,
  p_member_id uuid,
  p_plates_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_split public.splits%rowtype;
  v_prev_split public.splits%rowtype;
  v_user_plates integer;
  v_current_load integer;
  v_allowed_capacity integer;
begin
  if p_plates_count is null or p_plates_count <= 0 then
    raise exception 'plates_count must be greater than 0';
  end if;

  select *
  into v_current_split
  from public.splits
  where id = p_split_id
  for update;

  if not found then
    raise exception 'Split not found';
  end if;

  if v_current_split.status <> 'open' then
    raise exception 'This split is not open for registration.';
  end if;

  insert into public.split_registrations (split_id, member_id, plates_count)
  values (p_split_id, p_member_id, p_plates_count)
  on conflict (split_id, member_id)
  do update set plates_count = excluded.plates_count;

  select coalesce(sum(sr.plates_count), 0)::integer
  into v_user_plates
  from public.split_registrations sr
  where sr.split_id = p_split_id;

  select *
  into v_prev_split
  from public.splits
  where batch_id = v_current_split.batch_id
    and split_number = v_current_split.split_number - 1;

  v_allowed_capacity :=
    case
      when v_prev_split.id is null then 5
      else greatest(1, coalesce(v_prev_split.maintenance_plate_count, 1)) * 5
    end;

  v_current_load := v_user_plates + coalesce(v_current_split.flow_plate_count, 0);

  if v_current_load > v_allowed_capacity then
    if v_prev_split.id is null then
      raise exception 'You cannot register more than 5 non-maintenance plates for this split.';
    end if;

    if v_prev_split.status <> 'open' then
      raise exception
        'You cannot register more than % non-maintenance plates for this split.',
        v_allowed_capacity;
    end if;
  end if;

  update public.splits
  set actual_plate_count = v_user_plates
  where id = v_current_split.id;

  perform public.sync_previous_open_split_maintenance(p_split_id);
end;
$$;

create or replace function public.delete_split_registration(
  p_split_id uuid,
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_split public.splits%rowtype;
  v_user_plates integer;
begin
  select *
  into v_current_split
  from public.splits
  where id = p_split_id
  for update;

  if not found then
    raise exception 'Split not found';
  end if;

  if v_current_split.status <> 'open' then
    raise exception 'This split is not open for registration changes.';
  end if;

  delete from public.split_registrations
  where split_id = p_split_id
    and member_id = p_member_id;

  select coalesce(sum(sr.plates_count), 0)::integer
  into v_user_plates
  from public.split_registrations sr
  where sr.split_id = p_split_id;

  update public.splits
  set actual_plate_count = v_user_plates
  where id = p_split_id;

  perform public.sync_previous_open_split_maintenance(p_split_id);
end;
$$;

create or replace function public.update_split_flow(
  p_split_id uuid,
  p_flow_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_split public.splits%rowtype;
  v_prev_split public.splits%rowtype;
  v_user_plates integer;
  v_current_load integer;
  v_allowed_capacity integer;
begin
  if p_flow_count is null or p_flow_count < 0 then
    raise exception 'flow_count must be 0 or greater';
  end if;

  select *
  into v_current_split
  from public.splits
  where id = p_split_id
  for update;

  if not found then
    raise exception 'Split not found';
  end if;

  if v_current_split.status <> 'open' then
    raise exception 'This split is not open for changes.';
  end if;

  select coalesce(sum(sr.plates_count), 0)::integer
  into v_user_plates
  from public.split_registrations sr
  where sr.split_id = p_split_id;

  select *
  into v_prev_split
  from public.splits
  where batch_id = v_current_split.batch_id
    and split_number = v_current_split.split_number - 1;

  v_allowed_capacity :=
    case
      when v_prev_split.id is null then 5
      else greatest(1, coalesce(v_prev_split.maintenance_plate_count, 1)) * 5
    end;

  v_current_load := v_user_plates + p_flow_count;

  if v_current_load > v_allowed_capacity then
    if v_prev_split.id is null then
      raise exception 'You cannot register more than 5 non-maintenance plates for this split.';
    end if;

    if v_prev_split.status <> 'open' then
      raise exception
        'You cannot register more than % non-maintenance plates for this split.',
        v_allowed_capacity;
    end if;
  end if;

  update public.splits
  set
    flow_plate_count = p_flow_count,
    actual_plate_count = v_user_plates
  where id = v_current_split.id;

  perform public.sync_previous_open_split_maintenance(p_split_id);
end;
$$;
