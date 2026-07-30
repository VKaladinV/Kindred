-- ══════════════════════════════════════════════════════════════════════
--  Kindred — database schema
--
--  Paste the whole file into the Supabase SQL Editor and press Run.
--  It is safe to run more than once: everything is idempotent.
--
--  Design notes
--  ------------
--  * Primary keys are TEXT, not uuid, because the app already generates
--    its own ids offline and must keep using them when a row finally
--    syncs. A device with no signal still creates valid, stable ids.
--  * Every table carries user_id, updated_at and deleted_at.
--      user_id    → row-level security: you can only ever touch your own
--      updated_at → last-write-wins when two devices edit the same row
--      deleted_at → soft delete, so a deletion on the phone propagates
--                   to the PC instead of the row simply reappearing
--  * Records and prayers are their own tables rather than JSON blobs on
--    the person, so two devices editing the same person merge row by row
--    instead of one overwriting the other wholesale.
-- ══════════════════════════════════════════════════════════════════════

-- ── keep updated_at honest, whatever the client sends ────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── people ───────────────────────────────────────────────────────────
create table if not exists public.people (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null default 'Unnamed',
  relationship text not null default '',
  circle       text not null default 'Other',   -- "group" is a reserved word
  birthday     date,
  contact      text not null default '',
  summary      text not null default '',
  cadence_days integer not null default 0,
  created_on   date,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ── records: history · upcoming · season ─────────────────────────────
create table if not exists public.records (
  id             text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  person_id      text not null references public.people(id) on delete cascade,
  type           text not null default 'history'
                 check (type in ('history', 'upcoming', 'season')),
  starts_on      date not null,               -- happened / falls / began
  ends_on        date,                        -- seasons only; null = ongoing
  kind           text not null default 'other',
  title          text not null default '',
  note           text not null default '',
  repeats_yearly boolean not null default false,
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- ── prayers ──────────────────────────────────────────────────────────
create table if not exists public.prayers (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  person_id   text not null references public.people(id) on delete cascade,
  body        text not null default '',
  created_on  date,
  answered_on date,
  answer_note text not null default '',
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ── check-ins ────────────────────────────────────────────────────────
-- id is derived from person + date on the client, so the same check-in
-- recorded on two devices collapses to one row instead of colliding.
create table if not exists public.touches (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  person_id  text not null references public.people(id) on delete cascade,
  touched_on date not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── indexes: the sync reads "everything changed since X" ─────────────
create index if not exists people_user_updated  on public.people  (user_id, updated_at);
create index if not exists records_user_updated on public.records (user_id, updated_at);
create index if not exists prayers_user_updated on public.prayers (user_id, updated_at);
create index if not exists touches_user_updated on public.touches (user_id, updated_at);
create index if not exists records_person on public.records (person_id);
create index if not exists prayers_person on public.prayers (person_id);
create index if not exists touches_person on public.touches (person_id);

-- ── updated_at triggers ──────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['people', 'records', 'prayers', 'touches'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
       for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ── grants (Supabase sets these by default; explicit is safer) ───────
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.people, public.records, public.prayers, public.touches
  to authenticated;

-- ══════════════════════════════════════════════════════════════════════
--  Row-level security — the actual protection on your data.
--  The anon key in the app grants nothing on its own: every row is
--  reachable only by the signed-in account that owns it.
-- ══════════════════════════════════════════════════════════════════════

alter table public.people  enable row level security;
alter table public.records enable row level security;
alter table public.prayers enable row level security;
alter table public.touches enable row level security;

do $$
declare t text;
begin
  foreach t in array array['people', 'records', 'prayers', 'touches'] loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I
       for all to authenticated
       using (auth.uid() = user_id)
       with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════════
--  Photo storage — private bucket, one folder per user.
--  Path convention: <user_id>/<person_id>.jpg
-- ══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

do $$
declare c text;
begin
  foreach c in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists own_photos_%s on storage.objects', c);
  end loop;
end $$;

create policy own_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy own_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy own_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy own_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── done ─────────────────────────────────────────────────────────────
select 'Kindred schema ready' as status;
