-- Run this once in Supabase SQL Editor for existing projects.
-- It adds split-duty details to the calendar_feed view used by the archive page.

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
