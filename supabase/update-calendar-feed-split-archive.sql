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
  da.split_completed,
  da.split_completed_at
from public.duty_assignments da
left join public.members m on m.id = da.member_id
left join public.members sm on sm.id = da.split_assignee_id
where da.duty_date >= (now() - interval '12 months')::date;
