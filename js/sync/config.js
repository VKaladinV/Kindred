/* ══════════════════════════════════════════════════════════════════════
   Fellowship — sign-in and device sync.

   The app stays local-first: IndexedDB remains the working store and
   everything keeps functioning with no signal. Supabase is what the
   devices reconcile against, not something the app depends on.

   How changes are detected
   ------------------------
   After every successful sync we keep a snapshot of exactly what was
   agreed with the server. Next time round, anything that differs from
   that snapshot is a local change, and anything missing from it that was
   there before is a local deletion. That means no mutation site in the app
   has to remember to stamp a timestamp — a single forgotten call there
   would have meant silently losing an edit.

   Who wins a conflict
   -------------------
   A row changed only on the server is taken. A row changed locally is
   pushed and overwrites the server. A row changed in both places since
   the last sync resolves to whichever device syncs last, which is the
   last write in the sense that matters to a person using two devices.
   Deletions travel as `deleted_at` tombstones so a delete on the phone
   doesn't quietly reappear from the PC.

   No SDK: this talks to PostgREST, GoTrue and Storage over plain fetch,
   so there is nothing to bundle, nothing loaded from a CDN at runtime,
   and the app still works offline.

   The rest of the layer, in the order it is loaded: session · rest ·
   invites · shape · photos · publish · core · ui · boot.
   ══════════════════════════════════════════════════════════════════════ */

const CFG = window.KINDRED_CONFIG || {};

/* With no URL or key this layer does nothing at all: syncBoot returns early
   and window.KindredSync is never installed, so the app finds no sync bridge
   and keeps every trace of signing in and linking off the screen. */
const configured = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);

/* Read defensively so an unconfigured copy still loads without throwing. No
   request is ever made with them — nothing gets that far. */
const API = (CFG.supabaseUrl || '').replace(/\/+$/, '');
const ANON = CFG.supabaseAnonKey || '';
const BUCKET = 'photos';

/* `$` is not redefined here — util.js is loaded before this and its one is
   identical. Two of them at the top level of the same scope is a redeclaration
   the browser refuses outright. */
const nowIso = () => new Date().toISOString();
