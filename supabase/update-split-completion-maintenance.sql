-- Run this once in Supabase SQL Editor.
-- Adds explicit maintenance-plate tracking when a split is completed from the calendar.

alter table public.duty_assignments
  add column if not exists split_maintenance_plate_count integer;

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

  select id
  into v_split_id
  from public.splits
  where status = 'open'
  order by split_number asc
  limit 1
  for update;

  if v_split_id is null then
    raise exception 'No open split was found.';
  end if;

  update public.splits
  set
    status = 'completed',
    performed_date = p_performed_date,
    completed_at = now(),
    completed_by_member_id = p_user_id,
    duty_assignment_id = p_duty_assignment_id,
    actual_plate_count = p_actual_plate_count,
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

create or replace view public.calendar_feed as
select
  da.id,
  da.duty_date,
  da.member_id,
  m.full_name as member_name,
  m.email as member_email,
  m.color_index,
  da.volume_ml,
  da.notes,
  da.gcal_event_id,
  da.updated_at,
  da.split_assignee_id,
  sm.full_name as split_assignee_name,
  sm.email as split_assignee_email,
  da.split_passage_number,
  da.split_plate_count,
  da.split_maintenance_plate_count,
  da.split_completed,
  da.split_completed_at,
  ps.id as performed_split_id,
  ps.split_number as performed_split_number,
  ps.completed_by_member_id as performed_split_member_id,
  pm.full_name as performed_split_member_name,
  pm.email as performed_split_member_email,
  ps.completed_at as performed_split_completed_at
from public.duty_assignments da
left join public.members m on m.id = da.member_id
left join public.members sm on sm.id = da.split_assignee_id
left join lateral (
  select
    s.id,
    s.split_number,
    s.completed_by_member_id,
    s.completed_at
  from public.splits s
  where s.performed_date = da.duty_date
    and s.status = 'completed'
  order by s.completed_at desc nulls last, s.created_at desc
  limit 1
) ps on true
left join public.members pm on pm.id = ps.completed_by_member_id
where da.duty_date >= (now() - interval '12 months')::date;
