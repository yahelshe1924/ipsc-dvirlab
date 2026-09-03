-- Run this once in Supabase SQL Editor.
-- Lets the calendar correct plate counts for a split that was already completed.

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
