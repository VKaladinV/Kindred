-- ══════════════════════════════════════════════════════════════════════
--  Fellowship — is the gate actually shut?
--
--  Paste the whole file into the Supabase SQL editor and press Run, after
--  members.sql. It takes a second and needs no second account: Postgres can
--  be told to answer as somebody else, which tests the policies harder than
--  a real sign-up does, because it can ask the same question as three
--  different people in a row.
--
--  IT CHANGES NOTHING, AND CANNOT.
--  ------------------------------
--  The test does have to make a change partway through — it takes your own
--  account out of the members table, so that "can this account still read
--  its circle?" is asked of somebody the gate should be refusing. Leaving
--  that behind would lock you out of your own app.
--
--  So it cannot be left behind: the whole thing runs inside a DO block that
--  ends by raising an exception on purpose. An exception rolls the
--  transaction back, every time, whatever else happened. There is no path
--  through this file that commits anything.
--
--  WHICH MEANS THE RESULT ARRIVES AS AN ERROR. That red box is the report.
--  Read it — it is the only output there is.
-- ══════════════════════════════════════════════════════════════════════

do $$
declare
  me        uuid;
  report    text := '';
  baseline  int;
  seen      int;
  ok        boolean;
  refused   boolean;
  r         record;
begin
  ------------------------------------------------------------------
  -- who am I testing as
  ------------------------------------------------------------------
  select a.user_id into me from public.admins a limit 1;
  if me is null then
    raise exception 'No admin found. members.sql did not seed one — nothing else here can be tested.';
  end if;

  report := report || E'\n──────── WHO IS IN ────────\n';
  for r in
    select m.email,
           m.status,
           (ad.user_id is not null) as is_admin
      from public.members m
      left join public.admins ad on ad.user_id = m.user_id
     order by m.joined_at
  loop
    report := report || format(E'  %s  %s%s\n',
      rpad(coalesce(nullif(r.email, ''), '(no email)'), 34),
      rpad(r.status, 10),
      case when r.is_admin then '· admin' else '' end);
  end loop;

  ------------------------------------------------------------------
  -- is the gate on the policies at all
  ------------------------------------------------------------------
  report := report || E'\n──────── IS is_approved() ON EVERY POLICY ────────\n';
  for r in
    select p.tablename,
           p.policyname,
           (coalesce(p.qual::text, '') || coalesce(p.with_check::text, '')) like '%is_approved%' as gated
      from pg_policies p
     where p.schemaname = 'public'
       and p.tablename in ('people','records','prayers','touches','groups','profiles','invites','links',
                           'communities','church_events','attendance')
     order by p.tablename, p.policyname
  loop
    -- links_end and profiles_drop are deliberately ungated: either side can
    -- always walk away, and anybody can always take back what they published.
    report := report || format(E'  %s %s.%s\n',
      case when r.gated then 'gated  '
           when r.policyname in ('links_end', 'profiles_drop') then 'open ok'
           else '!! OPEN' end,
      rpad(r.tablename, 13), r.policyname);
  end loop;

  ------------------------------------------------------------------
  -- 1 · how much this account can see with the gate open to it
  ------------------------------------------------------------------
  select count(*) into baseline from public.people where user_id = me;

  report := report || E'\n──────── THE SAME QUESTION, ASKED THREE WAYS ────────\n';
  report := report || format(E'  your circle really holds        %s people\n', baseline);
  if baseline = 0 then
    report := report || E'  !! nothing has ever synced from this account, so the three answers below\n'
                     || E'     are all 0 and prove nothing. Sync once from the app, then re-run this.\n';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', me::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into seen from public.people;
  select public.is_approved() into ok;
  report := report || format(E'  as you, let in                  %s people, is_approved = %s\n', seen, ok);
  if seen <> baseline then
    report := report || E'  !! YOUR OWN ACCOUNT CANNOT READ ITS OWN CIRCLE. The app is not syncing.\n';
  end if;

  ------------------------------------------------------------------
  -- 2 · the same account, no longer let in
  ------------------------------------------------------------------
  reset role;
  delete from public.members where user_id = me;

  set local role authenticated;
  select count(*) into seen from public.people;
  select public.is_approved() into ok;
  report := report || format(E'  as you, NOT let in              %s people, is_approved = %s%s\n',
    seen, ok, case when seen = 0 and not ok then '   ← the gate is shut' else '   ← !! THE GATE IS OPEN' end);

  -- and writing is refused too, not merely reading
  refused := false;
  begin
    insert into public.people (id, user_id, name) values ('gate-test-row', me, 'Should never exist');
    refused := false;
  exception when others then
    refused := true;
  end;
  report := report || format(E'  writing while not let in        %s\n',
    case when refused then 'refused   ← correct' else '!! ALLOWED' end);

  -- publishing a profile, and linking, are shut in the same breath
  refused := false;
  begin
    insert into public.invites (created_by, token_hash) values (me, 'gate-test-hash');
    refused := false;
  exception when others then
    refused := true;
  end;
  report := report || format(E'  inviting while not let in       %s\n',
    case when refused then 'refused   ← correct' else '!! ALLOWED' end);

  ------------------------------------------------------------------
  -- 3 · blocked is not the same as never having been let in
  ------------------------------------------------------------------
  reset role;
  insert into public.members (user_id, status) values (me, 'blocked');

  set local role authenticated;
  select count(*) into seen from public.people;
  report := report || format(E'  as you, blocked                 %s people%s\n',
    seen, case when seen = 0 then '   ← the gate is shut' else '   ← !! THE GATE IS OPEN' end);

  ------------------------------------------------------------------
  -- 4 · you cannot lock yourself out, and the database is what says so
  ------------------------------------------------------------------
  reset role;
  update public.members set status = 'approved' where user_id = me;

  set local role authenticated;
  update public.members set status = 'blocked' where user_id = me;
  get diagnostics seen = row_count;
  report := report || format(E'\n──────── CAN YOU LOCK YOURSELF OUT ────────\n  blocking your own account       %s\n',
    case when seen = 0 then 'refused   ← correct' else '!! IT WORKED — you can lock yourself out' end);

  ------------------------------------------------------------------
  -- 5 · a code answers one question and no more
  ------------------------------------------------------------------
  reset role;
  report := report || E'\n──────── CODES ────────\n';
  report := report || format(E'  outstanding right now           %s\n',
    (select count(*) from public.access_codes
      where claimed_by is null and revoked_at is null and expires_at > now()));
  report := report || format(E'  a made-up code is good?         %s\n',
    public.code_is_good('definitely-not-a-real-code'));

  report := report || E'\n(Everything above has been rolled back. Nothing changed.)\n';
  raise exception E'GATE TEST — this red box is the report, not a failure:\n%', report;
end $$;
