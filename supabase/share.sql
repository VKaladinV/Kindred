-- ══════════════════════════════════════════════════════════════════════
--  Fellowship — linking two people.  Run after schema.sql.  Safe to re-run.
--
--  The five tables in schema.sql are untouched, and their policy stays
--  exactly what it was: your rows, nobody else's. That is deliberate and
--  it is the constraint the whole design is built around.
--
--  Here is why. The sync pulls with no user_id filter — RLS is the filter
--  (see selectSince in sync.js). So if `people` were ever widened to let a
--  linked account's rows through, a copy of the app running older code
--  would pull a stranger into its circle, and deleting them would emit a
--  tombstone carrying that stranger's user_id. The with-check would refuse
--  it, the upsert would throw, and that account would never sync again —
--  on a phone you cannot update. Nothing shared may ever live in those
--  tables. It lives here instead, in tables older code does not know exist.
-- ══════════════════════════════════════════════════════════════════════

-- ── invitations ──────────────────────────────────────────────────────
-- The secret lives in the link and nowhere else: only its SHA-256 is kept
-- here, so somebody reading this table cannot replay an invitation.
--
-- The two names are carried so each side can say who the other is without
-- anything else having to be readable yet. They are what the sender and
-- the receiver call themselves on their own profile, and nothing more.
create table if not exists public.invites (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid not null references auth.users(id) on delete cascade,
  from_name    text not null default '',
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  claimed_by   uuid references auth.users(id) on delete set null,
  claimed_name text not null default '',
  claimed_at   timestamptz,
  revoked_at   timestamptz
);
create index if not exists invites_mine on public.invites (created_by, created_at desc);

-- The number on the sender's own profile, and the number the claimer's own
-- profile carries back — so whoever opens the link can be matched by the
-- number they already have for the other, not only by a typed name. Neither
-- is searchable: this table has no receiver-side select policy at all (see
-- invites_own below), so a number only ever surfaces to the one person who
-- completes that one link, exactly the way from_name/claimed_name already do.
alter table public.invites add column if not exists from_tel    text not null default '';
alter table public.invites add column if not exists claimed_tel text not null default '';

-- ── who is linked to whom ────────────────────────────────────────────
-- One row per pair, in a fixed order, so a pair cannot exist twice and
-- cannot be linked in one direction only. Both sides consented: one made
-- the invitation, the other opened it.
create table if not exists public.links (
  a          uuid not null references auth.users(id) on delete cascade,
  b          uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b),
  constraint links_ordered check (a < b)
);
-- (a) is already the primary key's leading column; (b) is not.
create index if not exists links_b on public.links (b);

alter table public.invites enable row level security;
alter table public.links   enable row level security;

grant select, insert, update on public.invites to authenticated;
grant select, delete         on public.links   to authenticated;
-- No insert on links, ever. claim_invite() is the only thing that writes
-- there, because writing it means writing a row somebody else owns.

-- ── policies ─────────────────────────────────────────────────────────
-- auth.uid() is wrapped in a scalar subselect throughout so the planner
-- lifts it into an InitPlan and evaluates it once rather than per row.

drop policy if exists invites_own    on public.invites;
drop policy if exists invites_make   on public.invites;
drop policy if exists invites_revoke on public.invites;

-- Only the sender ever sees an invitation. The receiver has no select on
-- this table at all — they go through claim_invite(), which is the only
-- thing that can find a row by its hash. So an invitation cannot be
-- listed, counted, or probed for existence by anyone it was not sent to.
create policy invites_own on public.invites
  for select to authenticated using (created_by = (select auth.uid()));

create policy invites_make on public.invites
  for insert to authenticated with check (created_by = (select auth.uid()));

create policy invites_revoke on public.invites
  for update to authenticated
  using      (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

drop policy if exists links_read on public.links;
drop policy if exists links_end  on public.links;

create policy links_read on public.links
  for select to authenticated
  using (a = (select auth.uid()) or b = (select auth.uid()));

-- Either side can end it, and ending it is a real delete.
create policy links_end on public.links
  for delete to authenticated
  using (a = (select auth.uid()) or b = (select auth.uid()));

-- ── claiming ─────────────────────────────────────────────────────────
-- Everything RLS cannot express happens here: hashing the secret, checking
-- three conditions at once, and writing a links row the client is not
-- allowed to write.
--
-- sha256() has been in pg_catalog since PostgreSQL 11, so this needs no
-- extension and the search_path can stay tight. Do not reach for
-- pgcrypto's digest(): on Supabase it lives in the `extensions` schema
-- and would not resolve from here.
-- Adding a parameter is a new overload in Postgres, not a true replace —
-- dropping the old two-arg signature first is what keeps this a single
-- function rather than two, so a stale copy is never left callable.
drop function if exists public.claim_invite(text, text);

create or replace function public.claim_invite(token text, my_name text default '', my_tel text default '')
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  h   text := encode(sha256(token::bytea), 'hex');
  inv public.invites%rowtype;
  me  uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  -- Finding it, checking it and claiming it are one statement, so two
  -- people opening a forwarded link at the same moment cannot both win.
  update public.invites
     set claimed_by = me, claimed_at = now(), claimed_name = coalesce(my_name, ''),
         claimed_tel = coalesce(my_tel, '')
   where token_hash  = h
     and claimed_by  is null
     and revoked_at  is null
     and expires_at  > now()
     and created_by <> me
  returning * into inv;

  if not found then
    -- Already claimed by me: a second tap on the same link, or a reload.
    -- That is not a failure, it is the same answer again.
    select * into inv from public.invites where token_hash = h and claimed_by = me;
    if not found then
      -- One message for expired, revoked, taken, self-sent and never-existed
      -- alike, so this cannot be asked questions it should not answer.
      raise exception 'that link cannot be used' using errcode = 'P0001';
    end if;
  end if;

  insert into public.links (a, b)
  values (least(inv.created_by, me), greatest(inv.created_by, me))
  on conflict (a, b) do nothing;

  -- The sender's own number rides back with the claim, the same way their
  -- name already did — so the device accepting this link can match it
  -- against whoever it already has that number saved for.
  return jsonb_build_object('other', inv.created_by, 'name', inv.from_name, 'tel', inv.from_tel);
end;
$$;

revoke all on function public.claim_invite(text, text, text) from public;
grant execute on function public.claim_invite(text, text, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════
--  What you publish.  One row per account, replaced whole — there is one
--  writer and no merge problem, so un-sharing is a payload that no longer
--  contains a thing rather than a delete of it.
-- ══════════════════════════════════════════════════════════════════════

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists profiles_updated on public.profiles (updated_at);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
grant select, insert, update, delete on public.profiles to authenticated;

-- Whether the caller and `other` are linked, checked with row-level security
-- switched off for the lookup. Two things that would otherwise be a risk
-- disappear this way: a policy on profiles that consults links can never
-- become a policy on links that consults profiles, because this function is
-- the only bridge between the two and it is not itself a policy; and the
-- planner can call a `stable` function once per statement rather than
-- re-running an EXISTS for every row profiles_read is asked about.
create or replace function public.is_linked(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.links l
     where (l.a = auth.uid() and l.b = other)
        or (l.b = auth.uid() and l.a = other)
  );
$$;
revoke all on function public.is_linked(uuid) from public;
grant execute on function public.is_linked(uuid) to authenticated;

drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_make   on public.profiles;
drop policy if exists profiles_change on public.profiles;
drop policy if exists profiles_drop   on public.profiles;

-- The shape here differs from schema.sql on purpose. Every policy over there
-- is one for-all, because reading a person and writing one always needed the
-- same permission. Here they do not: reading is wider than writing, so read
-- and write are necessarily two policies rather than one.
create policy profiles_read on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_linked(user_id));

create policy profiles_make on public.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy profiles_change on public.profiles
  for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy profiles_drop on public.profiles
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── done ─────────────────────────────────────────────────────────────
select 'Fellowship linking ready' as status;
