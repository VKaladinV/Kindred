-- ══════════════════════════════════════════════════════════════════════
--  Fellowship — the communities you oversee, the church's events, and
--  who came to either.  Run after schema.sql, share.sql and members.sql
--  (and mfa.sql, if you use it).  Safe to re-run.
--
--  Paste the whole file into the Supabase SQL Editor and press Run.
--
--  Until it is run, nothing breaks. The app treats these three tables as
--  optional: a database without them is a database a step behind, and the
--  rest of the sync carries on exactly as before. Communities, events and
--  attendance simply stay on the device they were made on, and the first
--  sync after this file has run sends them all up.
--
--  Why a file of its own rather than more of schema.sql
--  ---------------------------------------------------
--  schema.sql writes the five original tables' row-level policies without
--  the access gate, and members.sql writes them again with it. Running
--  schema.sql a second time to pick up something new would quietly put the
--  ungated policies back, and open the database to accounts nobody let in.
--  This file never touches those five tables. It gates its own three the
--  moment it creates them, when the gate exists, and leaves them open to
--  their owner when it does not — the same as schema.sql would have.
-- ══════════════════════════════════════════════════════════════════════

-- ── communities: a gathering you oversee ─────────────────────────────
-- Leaders and people are arrays of person ids on the row, the same trade
-- groups.members makes (see schema.sql): two devices changing the same
-- community at once, the later write wins. No foreign key to people, for
-- the reason groups has none — the sync lands tables in order, and a member
-- whose person has not arrived yet is an ordinary moment, not an error.
--
-- The day it meets is not stored. It is meets_from's weekday, and for a
-- monthly one the same week of the month — worked out by the app, so a
-- rhythm changed later leaves no list of stale dates behind it. skipped is
-- the meetings marked as not having happened; extra, the ones held on a
-- day the rhythm does not land on. Both are YYYY-MM-DD, kept sorted.
create table if not exists public.communities (
  id          text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'Untitled',
  leaders     text[] not null default '{}',
  members     text[] not null default '{}',
  meets_every text not null default 'week',
  meets_from  date,
  skipped     text[] not null default '{}',
  extra       text[] not null default '{}',
  created_on  date,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ── church_events: one date in the church's life ─────────────────────
-- Shared by every community. Who came is not on this row — it is in
-- attendance, below, one row per person.
create table if not exists public.church_events (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null default '',
  held_on    date,
  created_on date,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── attendance: who came, one row per tick ───────────────────────────
-- The shape touches has, and for the same reason: the id is worked out from
-- what the row says (person, kind, community or event, date), so the same
-- tick made on two devices is one row, and two devices ticking two different
-- people at the same meeting add up rather than overwrite each other.
--
-- kind is 'meeting' (of_id is a community, held_on its date) or 'event'
-- (of_id is a church event, held_on empty). Unconstrained on purpose, the
-- way touches.kind and records.kind are — a device on newer code must be
-- able to write a kind this database has not heard of rather than have its
-- whole batch refused.
create table if not exists public.attendance (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  person_id  text not null references public.people(id) on delete cascade,
  kind       text not null default 'meeting',
  of_id      text not null default '',
  held_on    date,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ── indexes: the sync reads "everything changed since X" ─────────────
create index if not exists communities_user_updated   on public.communities   (user_id, updated_at);
create index if not exists church_events_user_updated on public.church_events (user_id, updated_at);
create index if not exists attendance_user_updated    on public.attendance    (user_id, updated_at);
create index if not exists attendance_person          on public.attendance    (person_id);

grant select, insert, update, delete
  on public.communities, public.church_events, public.attendance
  to authenticated;

alter table public.communities   enable row level security;
alter table public.church_events enable row level security;
alter table public.attendance    enable row level security;

-- ── triggers and policies ────────────────────────────────────────────
-- own_rows is schema.sql's policy, with members.sql's gate on it when
-- members.sql has been run (is_approved() exists) and without it when it
-- has not. mfa_gate is mfa.sql's policy, word for word, added only where
-- mfa.sql has already put it on people — this file never turns on a
-- second factor that the rest of the database is not asking for.
do $$
declare
  t     text;
  gate  text := case when to_regprocedure('public.is_approved()') is not null
                     then ' and public.is_approved()' else '' end;
  mfa   boolean := exists (select 1 from pg_policies
                            where schemaname = 'public' and tablename = 'people'
                              and policyname = 'mfa_gate');
begin
  foreach t in array array['communities', 'church_events', 'attendance'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I
       for each row execute function public.touch_updated_at()', t || '_touch', t);

    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I
       for all to authenticated
       using ((select auth.uid()) = user_id%s)
       with check ((select auth.uid()) = user_id%s)', t, gate, gate);

    execute format('drop policy if exists mfa_gate on public.%I', t);
    if mfa then
      execute format($fmt$
        create policy mfa_gate on public.%I
        as restrictive
        to authenticated
        using (
          array[(select auth.jwt()->>'aal')] <@ (
            select case when count(id) > 0 then array['aal2'] else array['aal1', 'aal2'] end
              from auth.mfa_factors
             where user_id = (select auth.uid()) and status = 'verified'
          )
        )
      $fmt$, t);
    end if;
  end loop;
end $$;

-- So the API sees the new tables straight away, rather than after its own
-- schema cache next happens to refresh.
notify pgrst, 'reload schema';

-- ── done ─────────────────────────────────────────────────────────────
select 'Communities ready'
       || case when to_regprocedure('public.is_approved()') is not null
               then ' — gated' else ' — no gate found (members.sql not run)' end
       as status;
