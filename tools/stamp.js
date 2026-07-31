/* Writes version.json so a running copy of Kindred can tell when the live
   site has moved on beneath it.

   Installed as an Android app, Kindred is a window onto the deployed URL
   rather than a copy of the files, so a push reaches the phone by itself.
   But an app resumed from the task switcher never reloads its page, and can
   sit for days on the version it booted with. This stamp is what lets it
   notice.

   Netlify runs it on every deploy (see netlify.toml) and sets COMMIT_REF.
   Run by hand there is no deploy to name, so the clock stands in:

       node tools/stamp.js

   It must never fail. A missing version.json only means the app stops
   checking for updates; a thrown error would fail the whole deploy.

   No dependencies. */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'version.json');
const build = process.env.COMMIT_REF || String(Date.now());

try {
  fs.writeFileSync(OUT, JSON.stringify({ build }) + '\n');
  console.log(`version.json → ${build}`);
} catch (err) {
  console.warn(`Could not write version.json (${err.message}).`);
  console.warn('The site is fine — installed apps just will not notice updates on their own.');
}
