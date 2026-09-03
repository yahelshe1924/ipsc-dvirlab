-- Run this once in Supabase SQL Editor.
-- Prevents flow plates from also being counted as user/actual plates when a
-- split is completed or when its completed counts are edited later.

create or replace function public.complete_next_split(
  p_duty_assignment_id uuid,
  p_user_id uuid,
  p_performed_date date,
  p_actual_plate_count integer,
  p_maintenance_plate_count integer default 1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_split_id uuid;
  v_flow_plate_count integer;
  v_actual_plate_count integer;
  v_total_plate_count integer;
begin
  if p_actual_plate_count is null or p_actual_plate_count < 0 then
    raise exception 'Actual plate count must be zero or greater.';
  end if;

  if p_maintenance_plate_count is null or p_maintenance_plate_count < 0 then
    raise exception 'Maintenance plate count must be zero or greater.';
  end if;

  v_total_plate_count := p_actual_plate_count + p_maintenance_plate_count;

  if v_total_plate_count <= 0 then
    raise exception 'Total plate count must be greater than zero.';
  end if;

  select id, coalesce(flow_plate_count, 0)
  into v_split_id, v_flow_plate_count
  from public.splits
  where status = 'open'
  order by split_number asc
  limit 1
  for update;

  if v_split_id is null then
    raise exception 'No open split was found.';
  end if;

  v_actual_plate_count := p_actual_plate_count - v_flow_plate_count;

  if v_actual_plate_count < 0 then
    raise exception
      'Total plate count cannot be smaller than maintenance plates plus flow plates.';
  end if;

  update public.splits
  set
    status = 'completed',
    performed_date = p_performed_date,
    completed_at = now(),
    completed_by_member_id = p_user_id,
    duty_assignment_id = p_duty_assignment_id,
    actual_plate_count = v_actual_plate_count,
    maintenance_plate_count = p_maintenance_plate_count
  where id = v_split_id;

  update public.duty_assignments
  set
    split_completed = true,
    split_completed_at = now(),
    split_plate_count = v_total_plate_count,
    split_maintenance_plate_count = p_maintenance_plate_count
  where id = p_duty_assignment_id;
end;
$$;

create or replace function public.update_completed_split_counts(
  p_duty_assignment_id uuid,
  p_total_plate_count integer,
  p_maintenance_plate_count integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flow_plate_count integer;
  v_actual_plate_count integer;
begin
  if p_total_plate_count is null or p_total_plate_count <= 0 then
    raise exception 'Total plate count must be greater than zero.';
  end if;

  if p_maintenance_plate_count is null or p_maintenance_plate_count < 0 then
    raise exception 'Maintenance plate count must be zero or greater.';
  end if;

  if p_maintenance_plate_count > p_total_plate_count then
    raise exception 'Maintenance plate count cannot be greater than total plate count.';
  end if;

  select coalesce(flow_plate_count, 0)
  into v_flow_plate_count
  from public.splits
  where duty_assignment_id = p_duty_assignment_id
    and status = 'completed'
  for update;

  if not found then
    raise exception 'Completed split not found for this duty assignment.';
  end if;

  v_actual_plate_count :=
    p_total_plate_count - p_maintenance_plate_count - v_flow_plate_count;

  if v_actual_plate_count < 0 then
    raise exception
      'Total plate count cannot be smaller than maintenance plates plus flow plates.';
  end if;

  update public.splits
  set
    actual_plate_count = v_actual_plate_count,
    maintenance_plate_count = p_maintenance_plate_count
  where duty_assignment_id = p_duty_assignment_id
    and status = 'completed';

  update public.duty_assignments
  set
    split_plate_count = p_total_plate_count,
    split_maintenance_plate_count = p_maintenance_plate_count,
    split_completed = true
  where id = p_duty_assignment_id;
end;
$$;
