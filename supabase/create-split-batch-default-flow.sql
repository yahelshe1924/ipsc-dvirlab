-- Run this once in Supabase SQL Editor.
-- Creates a new passage batch through the existing reset function, then adds
-- one default flow plate to the selected starting passage and every fifth
-- passage after it. Flow counts remain editable through update_split_flow.

create or replace function public.create_split_batch_with_default_flow(
  start_number integer,
  user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
begin
  -- Preserve all existing reset behavior, including closing the previous batch
  -- and cancelling its remaining open passages.
  perform public.create_split_batch(start_number, user_id);

  select s.batch_id
  into v_batch_id
  from public.splits s
  where s.split_number = start_number
    and s.status = 'open'
  order by s.created_at desc
  limit 1;

  if v_batch_id is null then
    raise exception 'The new split batch could not be found.';
  end if;

  update public.splits s
  set flow_plate_count =
    case
      when mod(s.split_number - start_number, 5) = 0 then 1
      else 0
    end
  where s.batch_id = v_batch_id
    and s.status = 'open';
end;
$$;

revoke all on function public.create_split_batch_with_default_flow(integer, uuid)
  from public, anon;
grant execute on function public.create_split_batch_with_default_flow(integer, uuid)
  to authenticated;
