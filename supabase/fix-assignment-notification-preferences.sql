-- Run this once in Supabase SQL Editor for existing projects.
-- It makes notification preferences explicit and fixes existing NULL values.

alter table public.members
  add column if not exists medium_replacement_calendar_enabled boolean,
  add column if not exists email_on_assignment boolean,
  add column if not exists email_on_removal boolean,
  add column if not exists email_on_self_assignment boolean;

update public.members
set
  medium_replacement_calendar_enabled = coalesce(medium_replacement_calendar_enabled, true),
  email_on_assignment = coalesce(email_on_assignment, true),
  email_on_removal = coalesce(email_on_removal, true),
  email_on_self_assignment = coalesce(email_on_self_assignment, false);

alter table public.members
  alter column medium_replacement_calendar_enabled set default true,
  alter column medium_replacement_calendar_enabled set not null,
  alter column email_on_assignment set default true,
  alter column email_on_assignment set not null,
  alter column email_on_removal set default true,
  alter column email_on_removal set not null,
  alter column email_on_self_assignment set default false,
  alter column email_on_self_assignment set not null;
