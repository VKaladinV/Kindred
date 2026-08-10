/* uses: $ · Store */

/* ── light or dark, chosen or guessed ────────────────────────────
   Two ways this gets decided: you tap the toggle, which is remembered and
   wins from then on regardless of what the OS goes on to do; or you never
   have, in which case it is whatever the OS says right now, live. The CSS
   side of this is entirely media-query driven until a choice exists — see
   the paired `:not([data-theme="light"])` / `[data-theme="dark"]` rules
   through the stylesheets — and the inline script in index.html's <head>
   sets the same attribute this file would, before the first paint, so the
   page never opens light for a heartbeat and then jumps dark. */

const prefersDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

const currentTheme = () => Store.getPref('theme') || (prefersDark() ? 'dark' : 'light');

const THEME_COLOR = { light: '#fcfdfb', dark: '#141712' };

/* The one meta theme-color tag, kept in step by hand — see the comment in
   index.html on why there's only one now instead of two media-gated ones. */
function paintThemeColor() {
  $('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[currentTheme()]);
}

function paintThemeIcon() {
  const btn = $('#btn-theme');
  if (!btn) return;
  const dark = currentTheme() === 'dark';
  /* A sun standing for the mode already on screen, not the one a tap would
     reach — the same convention every other icon in the app follows: what
     you see is what is true right now. */
  btn.innerHTML = dark
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M5.8 5.8l1.7 1.7M16.5 16.5l1.7 1.7M18.2 5.8l-1.7 1.7M7.5 16.5l-1.7 1.7"/></svg>';
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

/* mode is an explicit 'light' or 'dark' — from here on kept regardless of
   what the OS goes on to say, which is the whole difference between this and
   the media query it overrides. */
function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
  paintThemeColor();
  paintThemeIcon();
}

function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  Store.setPref('theme', next);
  applyTheme(next);
}

/* Called once, at boot, ahead of the first render — paintThemeColor and
   paintThemeIcon both need to be right from the start, not just from the
   first tap. The attribute itself was already set, if it needed to be, by
   the inline script in <head>; this only has to catch up the two things
   that live in this file instead of in CSS. */
function initTheme() {
  paintThemeColor();
  paintThemeIcon();
  /* Only ever changes anything while no explicit choice exists — once one
     does, dataset.theme stops moving and this fires into a repaint that
     lands on the same colours it already had, which costs nothing to get
     "wrong" and saves a check for whether it should bother. */
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    paintThemeColor();
    paintThemeIcon();
  });
}
