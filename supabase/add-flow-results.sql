begin;

create table public.flow_results (
  id uuid primary key default gen_random_uuid(),
  performed_date date not null,
  passage_number integer not null check (passage_number >= 0),
  split_id uuid references public.splits(id) on delete set null,
  ssea5_percent numeric not null check (ssea5_percent between 0 and 100),
  tra1_60_percent numeric not null check (tra1_60_percent between 0 and 100),
  oct4_percent numeric not null check (oct4_percent between 0 and 100)
);

create index flow_results_date_idx on public.flow_results (performed_date desc, id);
create index flow_results_split_idx on public.flow_results (split_id);

alter table public.flow_results enable row level security;
revoke all on public.flow_results from anon, authenticated;
grant select, insert on public.flow_results to authenticated;

create policy "Active members can read flow results"
  on public.flow_results for select to authenticated
  using (exists (
    select 1 from public.members
    where active and lower(email) = lower(auth.jwt() ->> 'email')
  ));

create policy "Active members can add flow results"
  on public.flow_results for insert to authenticated
  with check (
    exists (
      select 1 from public.members
      where active and lower(email) = lower(auth.jwt() ->> 'email')
    )
    and (
      split_id is null or exists (
        select 1 from public.splits s
        where s.id = flow_results.split_id
          and s.split_number = flow_results.passage_number
          and s.status = 'completed'
          and s.flow_plate_count > 0
      )
    )
  );

commit;
