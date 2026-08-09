-- ══════════════════════════════════════════════════════════════════════
--  Optional MFA — enforced where it matters, not merely asked for.
--
--  Enrolling a TOTP factor and asking for its code at sign-in (see
--  js/sync/mfa.js and js/sync/ui.js) only actually protects an account if
--  the database also refuses to answer a session that skipped that step —
--  a stolen password taken straight to this API with curl, never touching
--  the app at all, would otherwise read everything exactly as before. That
--  is what this file adds: one more policy alongside each table's existing
--  one, restrictive rather than permissive, so Postgres ANDs it against
--  what is already there instead of replacing it.
--
--  It stays out of everyone else's way on purpose. count(...) = 0 is what
--  lets an account with no factor enrolled through at aal1 exactly as it
--  always could — this never asks anyone to turn MFA on, it only holds the
--  door once they have. Turning it off again (unenrolling the factor) opens
--  the same door back up on the next sync, nothing further to run.
--
--  Paste into the Supabase SQL editor and run, same as schema.sql and
--  share.sql — after both of those, since profiles is share.sql's table.
--  Safe to run more than once.
-- ══════════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array['people', 'records', 'prayers', 'touches', 'profiles'] loop
    execute format('drop policy if exists mfa_gate on public.%I', t);
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
  end loop;
end $$;

-- ── done ─────────────────────────────────────────────────────────────
select 'MFA gate ready' as status;
