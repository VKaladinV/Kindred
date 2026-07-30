/* Where this copy of Kindred syncs to.

   These two values are meant to be public — the anon key is designed to sit
   in browser code, and it grants nothing on its own. Row-level security in
   supabase/schema.sql is what actually protects the data: every row is
   reachable only by the signed-in account that owns it.

   The service_role / sb_secret_ key must NEVER appear in this file or
   anywhere else in this repo. It bypasses row-level security completely. */

window.KINDRED_CONFIG = {
  supabaseUrl: 'https://rqdfhwfwtivnqpnvgwzn.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxZGZod2Z3dGl2bnFwbnZnd3puIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MzAyMTEsImV4cCI6MjEwMTAwNjIxMX0.zrpDP_gInQnaYy8Yowk2uAVbh6dEPi57Wsr4d9GOqQo',
};
