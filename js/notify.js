/* uses: $ plural today · Store · babiesDue datesAhead dueList gestationWords
   · switchView
*/

function paintNotifState() {
  const btn = $('#btn-notif');
  const txt = $('#notif-state');
  if (!('Notification' in window)) {
    txt.textContent = 'This browser cannot show notifications. The Today tab still keeps count.';
    btn.hidden = true;
    return;
  }
  const perm = Notification.permission;
  btn.hidden = perm !== 'default';
  txt.textContent = perm === 'granted'
    ? 'On — when you open Fellowship, it will nudge you once a day about anyone overdue, any date landing today, and a baby due soon.'
    : perm === 'denied'
      ? 'Blocked in your browser settings. The Today tab still keeps count.'
      : 'Get a nudge when someone is overdue. Fires when you open the app.';
}

async function enableNotifications() {
  try {
    const perm = await Notification.requestPermission();
    paintNotifState();
    if (perm === 'granted') { Store.setPref('notified', ''); nudgeIfDue(); }
  } catch { paintNotifState(); }
}

/* A pregnancy is worth saying something about more than once, but not every
   day for nine months. These are the distances that mean something: a month
   out, then closing, then daily once it is near enough to happen any morning.

   The honest limit is the same as the rest of the reminders — this fires when
   you open Fellowship, not while your phone is in your pocket. */
const BABY_MARKS = [28, 21, 14, 10];

const babiesSpeakingToday = () =>
  babiesDue(28).filter(({ inDays }) => inDays <= 7 || BABY_MARKS.includes(inDays));

function nudgeIfDue() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (Store.getPref('notified') === today()) return;

  const due = dueList();
  const landing = datesAhead(0).filter(x => x.inDays === 0);
  const babies = babiesSpeakingToday();
  if (!due.length && !landing.length && !babies.length) return;

  const lines = [];
  if (landing.length) lines.push(landing.map(x => `${x.p.name} — ${x.label}`).join(' · '));
  babies.forEach(({ p, inDays, gestation }) => lines.push(
    `${p.name}'s baby — ${gestation ? gestationWords(gestation) + ', ' : ''}`
    + (inDays < 0 ? `${-inDays} days past the due date` : inDays === 0 ? 'due today' : `due in ${plural(inDays, 'day', 'days')}`)));
  if (due.length) {
    const names = due.slice(0, 3).map(x => x.p.name.split(' ')[0]).join(', ');
    lines.push('Overdue: ' + names + (due.length > 3 ? ` and ${due.length - 3} more` : ''));
  }

  try {
    const n = new Notification(landing.length || babies.length ? 'Something today' : 'Someone is on your mind', {
      body: lines.join(' — '),
      icon: 'icon-192.png',
      tag: 'kindred-daily',
    });
    n.onclick = () => { window.focus(); switchView('today'); };
    Store.setPref('notified', today());
  } catch { /* some browsers require a service worker */ }
}

/* ═══════════════════════════ THE LOCK ════════════════════
   A PIN in front of the circle, and this device's fingerprint or face
   in front of the PIN where there is one.

   What it is, honestly: a lock on the door, not encryption of what is
   behind it. There is no server to check anything against, so the PIN is
   hashed and compared here, and the fingerprint is the device telling us
   it verified the person standing in front of it. Someone determined,
   with the phone already unlocked and developer tools open, can still
   reach the browser's storage. What this stops is the person who picks
   up your phone — which is the risk that actually exists for a circle
   holding diagnoses, prayers and life histories.

   All of it stays on the device: the lock is not part of your account,
   is never synced, and is not in a backup. Locking the phone does not
   lock the PC. */

