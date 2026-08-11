-- ══════════════════════════════════════════════════════════════════════
--  Fellowship — database schema
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

-- A person belongs to several groups now, not one. `circle` above is what
-- the single one was called; it is left in place so a device that has not
-- updated yet still reads something sensible, and is no longer written.
alter table public.people add column if not exists circles text[] not null default '{}';

-- The one person in the table who is you, and which account a card belongs to
-- once you have linked with them. Both ride the ordinary sync, so your own
-- profile reaches your other devices exactly the way everyone else does.
--
-- Deliberately no unique index on either. A constraint the client can break
-- turns into a 409 inside the batched upsert, and one 409 fails the whole
-- sync — so "only one of you" is kept in the app, where getting it wrong
-- costs a duplicate rather than a device that can never sync again.
alter table public.people add column if not exists is_self    boolean not null default false;
alter table public.people add column if not exists linked_uid uuid;

-- What someone does — asked of everyone now, not only people already in the
-- circle, so it belongs on the base table rather than a bolt-on.
alter table public.people add column if not exists occupation text not null default '';

-- Flagged as a possible future connection rather than someone you are
-- actively keeping in touch with yet — no cadence, no seasons, no history
-- until they are moved into the circle. Rides the same sync as is_self.
alter table public.people add column if not exists is_future boolean not null default false;

-- ── walking a road with someone ──────────────────────────────────────
-- Who is being discipled is not here: that is membership of an ordinary
-- group (see below), so there is nothing on the person to fall out of step
-- with it. What is here is what you have written down about the road.
--
-- kids and discipleship are text holding JSON, deliberately not jsonb.
-- The client decides what changed by comparing rows stringified (same(), in
-- js/sync/shape.js), and jsonb does not keep the key order it was given —
-- Postgres sorts them, so every person would come back differing from the
-- copy that was sent. That reads as "changed on this device" forever: this
-- device would win every merge, push on every sync, and never once accept an
-- edit made on the phone. Text stores the exact bytes, so the round trip is
-- stable and the comparison means what it says.
--
-- Neither is a child table the way records and prayers are. Those are edited
-- one row at a time from two devices at once; a checklist is one person's own
-- notes about one person, and the array-on-the-row trade groups.members
-- already makes (later write wins) is the right one at this size.
alter table public.people add column if not exists marital_status   text not null default '';
alter table public.people add column if not exists married_on       date;
alter table public.people add column if not exists divorced_on      date;
alter table public.people add column if not exists joined_church_on date;
alter table public.people add column if not exists kids             text not null default '';
alter table public.people add column if not exists discipleship     text not null default '';

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

-- The last day you ticked a prayer as prayed for, and the day you stopped
-- carrying it. Released is not answered: some things are let go, and deleting
-- them was the only way to say so before these existed.
alter table public.prayers add column if not exists prayed_on date;
alter table public.prayers add column if not exists released_on date;

-- Whether this is one of the things on your own profile that the people you
-- have linked with are allowed to see. Only ever true on a row belonging to
-- your self card, and false unless you said otherwise — marking a thing to
-- share is a decision made once, per thing, and it travels with the row so
-- your other devices agree about what you decided.
alter table public.prayers add column if not exists shared boolean not null default false;
alter table public.records add column if not exists shared boolean not null default false;

-- The date a pregnancy is due, when a season is the thing tracking it —
-- distinct from ends_on, which is set later (at birth) via "this has ended".
alter table public.records add column if not exists due_on date;

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

-- How the check-in happened: whatsapp, call, coffee, visit, or '' for the
-- ones recorded before this existed. Left unconstrained on purpose, the way
-- records.kind is — a device running older code should be able to write a
-- kind this database has never heard of rather than be refused.
alter table public.touches add column if not exists kind text not null default '';

-- ── groups: people you have put together and named ───────────────────
-- Not people.circles. That column holds the four fixed filters a person is
-- shelved under; this is a thing you made, with a name you chose.
--
-- Membership is an array on the group rather than a join table, the same shape
-- circles takes above. It costs row-level merging of the membership — two
-- devices adding a different person at the same time, and the later write
-- wins — which is the right trade here: a join table would double the tables
-- the sync walks to make a case that is rare and cheap to redo by hand.
--
-- No foreign key to people, deliberately. The sync lands tables in order and a
-- member whose person has not arrived yet is an ordinary moment, not an error;
-- the app resolves ids when it draws (membersOf) and only ever prunes one when
-- you delete that person yourself.
create table if not exists public.groups (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null default 'Untitled',
  members    text[] not null default '{}',
  created_on date,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── indexes: the sync reads "everything changed since X" ─────────────
create index if not exists people_user_updated  on public.people  (user_id, updated_at);
create index if not exists records_user_updated on public.records (user_id, updated_at);
create index if not exists prayers_user_updated on public.prayers (user_id, updated_at);
create index if not exists touches_user_updated on public.touches (user_id, updated_at);
create index if not exists groups_user_updated  on public.groups  (user_id, updated_at);
create index if not exists records_person on public.records (person_id);
create index if not exists prayers_person on public.prayers (person_id);
create index if not exists touches_person on public.touches (person_id);

-- ── updated_at triggers ──────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['people', 'records', 'prayers', 'touches', 'groups'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
       for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ── grants (Supabase sets these by default; explicit is safer) ───────
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.people, public.records, public.prayers, public.touches, public.groups
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
alter table public.groups  enable row level security;

-- auth.uid() is wrapped in a scalar subselect rather than called directly.
-- Left bare it is evaluated once per row the policy is asked about; wrapped,
-- the planner lifts it into an InitPlan and evaluates it once for the whole
-- statement. It is the same answer either way — these tables are read a few
-- thousand rows at a time by the sync, and that is where the difference is.
-- share.sql does the same throughout, for the same reason.
do $$
declare t text;
begin
  foreach t in array array['people', 'records', 'prayers', 'touches', 'groups'] loop
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I
       for all to authenticated
       using ((select auth.uid()) = user_id)
       with check ((select auth.uid()) = user_id)', t);
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

-- Wrapped the same way the table policies above are, and it matters more
-- here: storage.objects is one table for every file every account owns, so
-- listing a folder is a scan this predicate is asked about row by row.
create policy own_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy own_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy own_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy own_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ── done ─────────────────────────────────────────────────────────────
select 'Fellowship schema ready' as status;
