/* Fellowship — the two things nothing else checks.
   Run it before a deploy:  node tools/check.js

   These are ordinary scripts sharing one global scope, on purpose (see the
   README). That buys a page that opens by double-click and costs two rules
   no tool in this repo was enforcing:

   1. Every top-level name has to be unique across all of js/. Two files
      declaring the same `const` at the top level is not a shadowed variable,
      it is a SyntaxError that stops the whole page loading — a blank white
      app, with the reason only in a console nobody has open on a phone.

   2. A file has to be listed in index.html and in sw.js's SHELL. Missing from
      index.html it never loads at all; missing from SHELL the app works but
      has to reach the network for that one file before it can start, which is
      the one thing the service worker exists to avoid.

   No dependencies, and it reads rather than writes — it can be run at any
   time, on anything, without consequence. */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const problems = [];
const fail = msg => problems.push(msg);

/* ── what is on disk ─────────────────────────────────────────── */

const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);

const scripts = walk('js').filter(f => f.endsWith('.js'));
const styles = walk('css').filter(f => f.endsWith('.css'));

/* ── are they all listed ─────────────────────────────────────── */

const html = read('index.html');
const sw = read('sw.js');

/* The SHELL array only — a path mentioned anywhere else in sw.js is not the
   same promise as one that is fetched and cached at install. */
const shellBlock = (sw.match(/const SHELL = \[([\s\S]*?)\];/) || [, ''])[1];

for (const f of [...scripts, ...styles]) {
  if (!html.includes(f)) fail(`${f} is not in index.html — it never loads`);
  if (!shellBlock.includes(f)) fail(`${f} is not in sw.js's SHELL — it is fetched from the network before the app can start offline`);
}

/* And the other way round: a line left behind for a file that has gone is a
   404 on every install, and a silent one. */
const listed = [...shellBlock.matchAll(/'([^']+)'/g)].map(m => m[1])
  .filter(p => p.startsWith('js/') || p.startsWith('css/'));
for (const f of listed) {
  if (!fs.existsSync(path.join(root, f))) fail(`sw.js's SHELL lists ${f}, which is not there`);
}

/* ── one scope, one name each ────────────────────────────────── */

/* Top level means column zero. Every file in this repo indents anything
   inside a block, so a declaration flush with the left margin is a global —
   which makes this a reliable read of the shared scope without a parser, and
   a conservative one: an indented declaration is never wrongly reported. */
const DECL = /^(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/;

const owner = new Map();
for (const f of scripts) {
  const lines = read(f).split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = DECL.exec(line);
    if (!m) return;
    const name = m[1];
    if (owner.has(name)) {
      const [other, otherLine] = owner.get(name);
      fail(`${name} is declared twice: ${other}:${otherLine} and ${f}:${i + 1} — the page will not load`);
    } else {
      owner.set(name, [f, i + 1]);
    }
  });
}

/* ── say so ──────────────────────────────────────────────────── */

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:\n`);
  problems.forEach(p => console.error('  · ' + p));
  console.error('');
  process.exit(1);
}

console.log(`${scripts.length} scripts, ${styles.length} stylesheets, ${owner.size} names — all listed, none clashing.`);
