-- Run this once in Supabase SQL Editor before deploying flow-ready-notify.

alter table public.members
  add column if not exists flow_team boolean not null default false;

alter table public.splits
  add column if not exists flow_notification_sent_at timestamptz;

comment on column public.members.flow_team is
  'Receives an email when a completed split contains one or more flow plates.';

comment on column public.splits.flow_notification_sent_at is
  'Timestamp of the successful flow-ready notification for this split.';
