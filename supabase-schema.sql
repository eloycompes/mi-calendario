-- Ejecuta este script completo en Supabase > SQL Editor > New query.
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_date date not null,
  type text not null check (type in ('practice','work','personal')),
  title text not null default '',
  start_time time,
  end_time time,
  hours numeric(5,2) check (hours is null or (hours >= 0 and hours <= 24)),
  highlighted boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_events_user_date_idx
  on public.calendar_events(user_id, event_date);

alter table public.calendar_events enable row level security;

drop policy if exists "Users can view their own calendar events" on public.calendar_events;
create policy "Users can view their own calendar events"
  on public.calendar_events for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own calendar events" on public.calendar_events;
create policy "Users can create their own calendar events"
  on public.calendar_events for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own calendar events" on public.calendar_events;
create policy "Users can update their own calendar events"
  on public.calendar_events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own calendar events" on public.calendar_events;
create policy "Users can delete their own calendar events"
  on public.calendar_events for delete
  using (auth.uid() = user_id);
