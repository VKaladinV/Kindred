-- ══════════════════════════════════════════════════════════════════════
--  Fellowship — who is allowed to use it.  Run after schema.sql and
--  share.sql.  Safe to re-run.
--
--  What this is, and what it is not
--  -------------------------------
--  Fellowship is local-first. Somebody holding a copy of these files can
--  always open index.html and keep a circle of their own on their own
--  device, and taking that away would make it a different app. So the
--  gate is not on the app — it is on the account:
--
--    * an account nobody has let in reads nothing from this database and
--      writes nothing to it, whatever the client tries;
--    * it cannot link with anybody, or publish a profile;
--    * the app, seeing that, covers itself and says it is waiting.
--
--  Getting in needs a code you handed out. The code is a secret in a
--  link, and only its SHA-256 ever reaches this table — the same shape
--  public.invites already takes in share.sql, for the same reason: a
--  database that cannot be read to replay an invitation.
--
--  Order matters in this file
--  --------------------------
--  Every account that exists right now is seeded as approved BEFORE the
--  policies start asking. Running the second half without the first would
--  lock you out of your own circle until you noticed. That is why the
--  seeding is above the gate rather than at the end where it reads better.
-- ══════════════════════════════════════════════════════════════════════

-- ── who is in ────────────────────────────────────────────────────────
-- One row per account. `pending` is an account that exists but has never
-- redeemed a code — somebody who talked to the auth server directly, or
-- whose code was revoked before they used it. It can do nothing at all,
-- and its only purpose is to be visible to you rather than invisible.
create table if not exists public.members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null default '',
  name       text not null default '',
  status     text not null default 'pending'
             check (status in ('pending', 'approved', 'blocked')),
  joined_at  timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
create index if not exists members_status on public.members (status, joined_at);

-- ── who decides ──────────────────────────────────────────────────────
-- A table of its own rather than a column on members, and this is the one
-- piece of shape here that is not obvious. The policy on members has to ask
-- "is the caller an admin", and if the answer lived on members then
-- answering it would mean reading members, which would run that same policy
-- again: Postgres calls that infinite recursion in a policy and refuses the
-- query outright. Every account's own row becomes unreadable, and the app
-- can no longer tell anybody why it is not syncing.
--
-- So the answer lives somewhere the policy can reach without going in a
-- circle. No row-level security on this table and no privileges granted on
-- it at all: PostgREST cannot see it, no client can query it, and the only
-- things that read it are the two security definer functions below, which
-- run as its owner.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
revoke all on public.admins from anon, authenticated;

-- ── the codes you hand out ───────────────────────────────────────────
-- `label` is who you made it for, and is only ever read by you: it is how
-- a list of codes is a list of people rather than a list of hashes.
create table if not exists public.access_codes (
  token_hash text primary key,
  label      text not null default '',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  revoked_at timestamptz
);
create index if not exists access_codes_made on public.access_codes (created_by, created_at desc);

-- ── the two questions everything below asks ──────────────────────────
-- security definer, so both read as the owner rather than as the caller —
-- the same trick public.is_linked() already turns in share.sql, and for the
-- same reason: one bridge between two tables, and it is not itself a policy.
-- `stable` so the planner runs it once per statement rather than once per
-- row it is asked about.
--
-- is_approved() reads members, and is only ever asked by policies on other
-- tables — never by a policy on members, which is what keeps it from going
-- in a circle. is_admin() reads admins, which has no policies at all.
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.members
     where user_id = auth.uid() and status = 'approved'
  );
$$;
revoke all on function public.is_approved() from public;
grant execute on function public.is_approved() to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
     and exists (select 1 from public.members
                  where user_id = auth.uid() and status = 'approved');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- What the app asks about itself, in one request. It could read its own row
-- out of members directly — the policy below allows exactly that — but
-- admin-ness is deliberately not a column there any more, so it would take
-- two questions to learn two things about one account.
create or replace function public.my_membership()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'user_id',  auth.uid(),
    'status',   coalesce((select status from public.members where user_id = auth.uid()), 'pending'),
    'email',    coalesce((select email  from public.members where user_id = auth.uid()), ''),
    'is_admin', public.is_admin()
  )
  where auth.uid() is not null;
$$;
revoke all on function public.my_membership() from public;
grant execute on function public.my_membership() to authenticated;

-- ── an account arriving ──────────────────────────────────────────────
-- Written the moment an account is made, so somebody who signed up without
-- a code is a row you can see and decide about rather than a person who
-- has to write and tell you they are stuck.
--
-- Wrapped, because creating a trigger on auth.users needs a privilege this
-- file cannot promise it has. Without it nothing here breaks: a member row
-- is made by redeem_code() below anyway, and the only thing lost is the
-- visibility of an account that never redeemed anything.
create or replace function public.on_new_account()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.members (user_id, email, status)
  values (new.id, coalesce(new.email, ''), 'pending')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

do $$
begin
  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.on_new_account();
exception when insufficient_privilege or undefined_table then
  raise notice 'Could not put a trigger on auth.users — new accounts will appear in members only when they redeem a code. Everything else in this file is unaffected.';
end $$;

-- ══════════════════════════════════════════════════════════════════════
--  Seeding — this must run before the gate below, and it does.
--  Everyone who already has an account is let in, because they are you
--  and whoever you have already been syncing with. The oldest account is
--  made the admin: that is the one that made this project.
-- ══════════════════════════════════════════════════════════════════════

insert into public.members (user_id, email, status, joined_at, decided_at)
select u.id, coalesce(u.email, ''), 'approved', u.created_at, now()
  from auth.users u
on conflict (user_id) do nothing;

insert into public.admins (user_id)
select id from auth.users order by created_at asc limit 1
on conflict (user_id) do nothing;

-- If that picked the wrong account — a test account made before yours —
-- name yourself outright instead, once, and re-run nothing else:
--
--   delete from public.admins;
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'you@example.com';
--   update public.members set status = 'approved'
--    where user_id in (select user_id from public.admins);

-- ══════════════════════════════════════════════════════════════════════
--  Redeeming a code
-- ══════════════════════════════════════════════════════════════════════

-- Enough to ask "is this code any good?" before there is an account to ask
-- it with, which is the one moment redeem_code() cannot serve. It answers
-- one thing, true or false, and says nothing about who made it or who it
-- was meant for — so holding a bad code teaches you nothing, and holding a
-- good one still gets you nowhere without redeeming it. Same lookup rules
-- as public.preview_invite() in share.sql, and granted to anon for the
-- same reason: it runs before sign-in.
create or replace function public.code_is_good(code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.access_codes c
     where c.token_hash = encode(sha256(code::bytea), 'hex')
       and c.claimed_by is null
       and c.revoked_at is null
       and c.expires_at > now()
  );
$$;
revoke all on function public.code_is_good(text) from public;
grant execute on function public.code_is_good(text) to anon, authenticated;

-- The moment somebody gets in. Finding the code, checking it and claiming
-- it are one statement, so two people opening the same forwarded link
-- cannot both win it.
--
-- Redeeming twice is not a failure — a reload, a second tap, the app
-- picking a stored code back up after an email confirmation. It returns
-- the same answer again.
--
-- A blocked account cannot let itself back in with an old code. Blocking
-- is a decision, and a piece of paper somebody kept does not overturn it.
create or replace function public.redeem_code(code text, my_email text default '', my_name text default '')
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  h    text := encode(sha256(code::bytea), 'hex');
  me   uuid := auth.uid();
  c    public.access_codes%rowtype;
  mine public.members%rowtype;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select * into mine from public.members where user_id = me;
  if found and mine.status = 'blocked' then
    raise exception 'that code cannot be used' using errcode = 'P0001';
  end if;
  if found and mine.status = 'approved' then
    return public.my_membership();
  end if;

  update public.access_codes
     set claimed_by = me, claimed_at = now()
   where token_hash = h
     and claimed_by is null
     and revoked_at is null
     and expires_at > now()
  returning * into c;

  if not found then
    -- Already claimed by me: the same link opened twice. Anything else —
    -- expired, revoked, taken by somebody else, never existed — gets one
    -- message, so this cannot be asked questions it should not answer.
    select * into c from public.access_codes where token_hash = h and claimed_by = me;
    if not found then
      raise exception 'that code cannot be used' using errcode = 'P0001';
    end if;
  end if;

  insert into public.members (user_id, email, name, status, decided_at)
  values (me, coalesce(my_email, ''), coalesce(my_name, ''), 'approved', now())
  on conflict (user_id) do update
     set status = 'approved',
         decided_at = now(),
         email = case when public.members.email = '' then excluded.email else public.members.email end,
         name  = case when public.members.name  = '' then excluded.name  else public.members.name  end;

  return public.my_membership();
end;
$$;
revoke all on function public.redeem_code(text, text, text) from public;
grant execute on function public.redeem_code(text, text, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════
--  Who may read and change these two tables
-- ══════════════════════════════════════════════════════════════════════

alter table public.members      enable row level security;
alter table public.access_codes enable row level security;

grant select, update on public.members      to authenticated;
grant select, insert, update on public.access_codes to authenticated;
-- No insert on members, ever. redeem_code() and the auth trigger are the
-- only things that write a row there, and both are security definer —
-- which is what stops an account approving itself by writing its own row.

drop policy if exists members_read   on public.members;
drop policy if exists members_decide on public.members;

-- Your own row, so the app can tell you what it is waiting for; and
-- everybody's, if you are the one deciding.
create policy members_read on public.members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- Never your own. Blocking yourself, or taking your own admin away, is a
-- door that locks from the outside — and the only way back would be the
-- SQL editor. The app hides those buttons too; this is what makes it true
-- rather than merely tidy.
create policy members_decide on public.members
  for update to authenticated
  using      (public.is_admin() and user_id <> (select auth.uid()))
  with check (public.is_admin() and user_id <> (select auth.uid()));

drop policy if exists codes_own on public.access_codes;

create policy codes_own on public.access_codes
  for all to authenticated
  using      (public.is_admin() and created_by = (select auth.uid()))
  with check (public.is_admin() and created_by = (select auth.uid()));
-- Nobody but an admin can see or make a code. Redeeming one goes through
-- redeem_code() instead, which is the only thing that can find a row by
-- its hash — so a code cannot be listed, counted or probed for by the
-- person holding it.

-- ══════════════════════════════════════════════════════════════════════
--  The gate itself.
--
--  Every policy written in schema.sql and share.sql, restated with one
--  more thing to be true. The shape of each is otherwise exactly what it
--  was — see those files for why each is the way it is.
-- ══════════════════════════════════════════════════════════════════════

-- The three from communities.sql are in the list too, so running this file
-- again after that one keeps them gated. Skipped where communities.sql has
-- not been run yet: there is nothing there to gate.
do $$
declare t text;
begin
  foreach t in array array['people', 'records', 'prayers', 'touches', 'groups',
                           'communities', 'church_events', 'attendance'] loop
    if to_regclass(format('public.%I', t)) is null then continue; end if;
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I
       for all to authenticated
       using ((select auth.uid()) = user_id and public.is_approved())
       with check ((select auth.uid()) = user_id and public.is_approved())', t);
  end loop;
end $$;

drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_make   on public.profiles;
drop policy if exists profiles_change on public.profiles;
drop policy if exists profiles_drop   on public.profiles;

create policy profiles_read on public.profiles
  for select to authenticated
  using (public.is_approved()
    and (user_id = (select auth.uid()) or public.is_linked(user_id)));

create policy profiles_make on public.profiles
  for insert to authenticated
  with check (public.is_approved() and user_id = (select auth.uid()));

create policy profiles_change on public.profiles
  for update to authenticated
  using      (public.is_approved() and user_id = (select auth.uid()))
  with check (public.is_approved() and user_id = (select auth.uid()));

create policy profiles_drop on public.profiles
  for delete to authenticated
  using (user_id = (select auth.uid()));
-- Deleting your own profile is deliberately not gated. Somebody being shut
-- out should still be able to take back what they had published.

drop policy if exists invites_own    on public.invites;
drop policy if exists invites_make   on public.invites;
drop policy if exists invites_revoke on public.invites;

create policy invites_own on public.invites
  for select to authenticated
  using (created_by = (select auth.uid()) and public.is_approved());

create policy invites_make on public.invites
  for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_approved());

create policy invites_revoke on public.invites
  for update to authenticated
  using      (created_by = (select auth.uid()) and public.is_approved())
  with check (created_by = (select auth.uid()) and public.is_approved());

drop policy if exists links_read on public.links;
drop policy if exists links_end  on public.links;

create policy links_read on public.links
  for select to authenticated
  using (public.is_approved()
    and (a = (select auth.uid()) or b = (select auth.uid())));

create policy links_end on public.links
  for delete to authenticated
  using (a = (select auth.uid()) or b = (select auth.uid()));
-- Ending a link is not gated either, for the same reason deleting your own
-- profile is not: either side can always walk away.

-- ── claiming an invitation ───────────────────────────────────────────
-- claim_invite() is security definer, so row-level security is not what
-- stands in front of it — it has to ask for itself. This is the same
-- function share.sql defines, with three lines added at the top and
-- nothing else touched; this file is loaded after that one, so this is the
-- copy that stands.
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

  if not public.is_approved() then
    raise exception 'this account has not been let in yet' using errcode = 'P0001';
  end if;

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
    select * into inv from public.invites where token_hash = h and claimed_by = me;
    if not found then
      raise exception 'that link cannot be used' using errcode = 'P0001';
    end if;
  end if;

  insert into public.links (a, b)
  values (least(inv.created_by, me), greatest(inv.created_by, me))
  on conflict (a, b) do nothing;

  return jsonb_build_object(
    'id', inv.id, 'other', inv.created_by, 'name', inv.from_name, 'tel', inv.from_tel,
    'invitee_name', inv.invitee_name, 'invitee_contact', inv.invitee_contact,
    'invitee_birthday', inv.invitee_birthday, 'invitee_occupation', inv.invitee_occupation
  );
end;
$$;

revoke all on function public.claim_invite(text, text, text) from public;
grant execute on function public.claim_invite(text, text, text) to authenticated;

-- ── done — and this is what to read before you close the tab ─────────
-- One row per account. Yours should say approved, and true under admin.
select m.email,
       m.status,
       (a.user_id is not null) as is_admin,
       m.joined_at
  from public.members m
  left join public.admins a on a.user_id = m.user_id
 order by m.joined_at;
