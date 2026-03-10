-- ============================================================
-- iPSC-DvirLab · Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ──────────────────────────────────────────────
-- 1. MEMBERS
-- ──────────────────────────────────────────────
create table public.members (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  email       text not null unique,
  active      boolean not null default true,
  color_index integer not null default 0,   -- 0–7, stable colour slot
  created_at  timestamptz not null default now()
);

-- Only emails in this table may log in (checked in middleware)
alter table public.members enable row level security;

-- All authenticated lab members can read/write members
create policy "members_all" on public.members
  for all using (auth.role() = 'authenticated');

-- ──────────────────────────────────────────────
-- 2. SETTINGS  (single-row table)
-- ──────────────────────────────────────────────
create table public.settings (
  id                    integer primary key default 1 check (id = 1),
  responsible_name      text not null default '',
  responsible_email     text not null default '',
  updated_at            timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict do nothing;

alter table public.settings enable row level security;
create policy "settings_all" on public.settings
  for all using (auth.role() = 'authenticated');

-- ──────────────────────────────────────────────
-- 3. DUTY ASSIGNMENTS
-- ──────────────────────────────────────────────
create table public.duty_assignments (
  id                   uuid primary key default gen_random_uuid(),
  duty_date            date not null unique,           -- one row per day max
  member_id            uuid references public.members(id) on delete set null,
  volume_ml            integer,                        -- null = not yet reported
  notes                text not null default '',
  gcal_event_id        text,                           -- Google Calendar event id for current assignee
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index duty_assignments_date_idx on public.duty_assignments(duty_date);

alter table public.duty_assignments enable row level security;
create policy "assignments_all" on public.duty_assignments
  for all using (auth.role() = 'authenticated');

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger duty_assignments_updated_at
  before update on public.duty_assignments
  for each row execute procedure public.set_updated_at();

-- ──────────────────────────────────────────────
-- 4. ASSIGNMENT AUDIT LOG  (for notifications)
-- ──────────────────────────────────────────────
create table public.assignment_audit (
  id              uuid primary key default gen_random_uuid(),
  duty_date       date not null,
  old_member_id   uuid references public.members(id) on delete set null,
  new_member_id   uuid references public.members(id) on delete set null,
  changed_by_id   uuid references public.members(id) on delete set null,
  changed_at      timestamptz not null default now()
);

alter table public.assignment_audit enable row level security;
create policy "audit_read" on public.assignment_audit
  for select using (auth.role() = 'authenticated');
create policy "audit_insert" on public.assignment_audit
  for insert with check (auth.role() = 'authenticated');

-- ──────────────────────────────────────────────
-- 5. HELPER VIEW  (calendar feed, last 12 months + future)
-- ──────────────────────────────────────────────
create or replace view public.calendar_feed as
select
  da.id,
  da.duty_date,
  da.member_id,
  m.full_name   as member_name,
  m.email       as member_email,
  m.color_index,
  da.volume_ml,
  da.notes,
  da.gcal_event_id,
  da.updated_at
from public.duty_assignments da
left join public.members m on m.id = da.member_id
where da.duty_date >= (now() - interval '12 months')::date;

-- ──────────────────────────────────────────────
-- 6. SEED: colour-slot uniqueness helper
--    Each new member gets the lowest unused colour slot (0–7 cycling)
-- ──────────────────────────────────────────────
create or replace function public.next_color_index()
returns integer language sql as $$
  select coalesce(
    (
      select s.slot
      from generate_series(0,7) as s(slot)
      where s.slot not in (select color_index from public.members where active = true)
      order by s.slot
      limit 1
    ),
    (select (count(*) % 8)::integer from public.members)
  );
$$;
