# Kindred

A small private app for remembering the people you care about — a circle of photo
badges, and behind each one a summary, a life-events timeline, and a prayer list.

Everything is stored on your own device. Nothing is uploaded anywhere, there is no
account, and it works with no internet once it has loaded.

---

## Running it

**The easy way — double-click `index.html`.**
It opens in your browser and works. Photos get saved in ordinary browser storage —
smaller and lower quality (about 150 will fit), and it cannot be installed to a
phone home screen.

**The better way — run the little server.** In this folder:

```bash
node serve.js
```

Then open **http://localhost:4173**. This unlocks proper storage (hundreds of
photos), offline use, and installing to a phone. The server also prints a
`http://192.168.x.x:4173` address — open **that** on your phone while it's on the
same wifi, and you get the app on your phone with your PC acting as the host.

To stop it, press `Ctrl+C` in the terminal.

### Putting it on your phone's home screen

With the app open on your phone at the `192.168.x.x` address:

- **Android / Chrome** — menu → *Add to Home screen*
- **iPhone / Safari** — share button → *Add to Home Screen*

It then opens full-screen like a normal app. Note that the phone keeps its **own
separate copy** of the data — see *Backups* below for moving data between devices.

---

## How to use it

The menu sits down the left on a computer, and becomes a bar along the bottom of
the screen on a phone — within thumb reach, nothing to open.

On a phone, once **Kindred** has scrolled off the top it comes back as a thin frozen
line up there, so you still know where you are without the full title holding on to
the room it needs.

### Circle
Everyone you've added, as circular badges. The thin ring around each photo tells
you how the check-in is going:

| Ring | Meaning |
|---|---|
| **Green** | recently connected |
| **Gold** | coming up soon |
| **Clay** (soft red-brown) | overdue — you asked to be reminded and the time has passed |
| **Grey** | no reminder set for this person |

**The people who need you sit first.** The circle is ordered by how the check-in
is going rather than by name: whoever is furthest past the time you asked to be
reminded at the top, then the ones getting close, then everyone who is fine, and
last the people you asked for no nudges about. So the top of your circle is the
answer to *who should I call*, and you never have to go looking for it.

**How long since you last spoke** sits on the bottom edge of every face — `3d`,
`2w`, `5m`, `1y`, or `—` if you have not recorded a check-in yet. It always
rounds down, so it never claims more time has passed than has. Hover it for the
exact count.

A small **✜** at the top of a badge means open prayers; a mark at the bottom-left
means they're in a season right now.

### How big they are, and how they sit
**Settings → Size of the faces** decides how big everyone is. Every part of a badge
is a proportion of that one number, so the ring, the two marks and the initials all
hold their places at whatever size you land on.

**Settings → Country code** is what lets WhatsApp find someone whose number you
saved the local way, as *082 …* rather than *+27 82 …*. It starts at **27**.
Numbers you already saved with a **+** carry their own and are left alone.

On a phone it decides something else as well: how many fit across. The circle
tessellates there — rows of three, then two sitting in the gaps of the row above,
the way a honeycomb packs. So making the faces smaller fits four across, and larger
drops it to two. Names stay, shortened to one line so the rows keep level with each
other. On a computer the grid keeps its looser scatter instead.

### Groups
There are five, and a person can be in as many as fit — someone from church who
is also family, a colleague you're also tracking medically:

**Community/Discipleship · Work · Family · Friends · Medical**

Once you have more than three people, the groups appear as toggles above the
grid. They add up rather than replace each other: turn on *Family* and *Medical*
and you see everyone in either. **Everyone** clears them again. Nobody has to be
in a group at all — untagged people simply live under *Everyone*.

On a phone that row would cost three lines of the screen before you had seen a
single face, so it folds into one **Filter** button that opens the same toggles
in a panel. The button carries a number when any are on, and stays lit so you
can tell at a glance that you are looking at a part of your circle rather than
all of it.

**Medical** does one thing more: it puts **Medications** and **Conditions** on
that person's page. Each entry is a name and one line of detail — *Metformin —
500 mg, twice daily*, *Type 2 diabetes — since 2019*. Untick Medical and the
lists are hidden, not deleted; tick it again and they're still there.

### Opening someone
**Tap their photo** — that is the only thing that opens a person's page. Their name
underneath is just a label, so you can't open someone by accident, and adding a new
person leaves you on your circle rather than jumping into their page.

Inside:

- **Connected today** — asks how: **WhatsApp**, **phone call**, **coffee** or
  **visit**, or *just note it* if none of them fit. This resets their ring and adds
  a bead to their little history, carrying the mark of how it happened. Choosing
  WhatsApp or a call also takes you straight there — the note is made before you
  leave, so it survives whether or not you come back.

  One check-in a day, and the last word wins: saying *coffee* in the evening
  corrects this morning's *WhatsApp* rather than adding a second bead. Tap the
  button again any time that day to change your mind.

  Tapped it by mistake? The note that appears offers **Undo** for a few seconds,
  and an **undo** link stays beside the button for the rest of the day. Only
  today's can be taken back — an older check-in has become history rather than a
  slip you just made.

  The tick in **Today** stays one tap and records without asking, so the quick
  path stays quick.
- **Their number** — tap it to ring them, without recording anything. Sometimes
  you're calling to arrange the visit, not reporting on it. It only becomes
  tappable if what you saved actually looks like a number; a handle or an email
  address stays plain text.
- **Right now** — the seasons they're walking through. See below.
- **Who they are** — a free-text summary that saves as you type. Meant for what's
  true *right now*: what they're carrying, what to ask about next time.
- **Prayer list** — add anything; tick it on the days you pray for it, and press
  the **×** when you are ready to stop carrying it. See *Prayers* below.
- **Coming up** and **History** — see below.
- **Medications** and **Conditions** — only for people in the Medical group.
- **edit details** — name, photo, relationship, groups, birthday, and how often
  you want to be nudged.

On a phone, the **back button closes their page** and puts you back in your circle
instead of closing Kindred. Back inside a dialog closes just that dialog, so an
*edit details* opened over someone takes two presses to unwind — one for each thing
covering the circle. Only when nothing is covering it does back leave the app, which
is where it should. The tabs stay out of this deliberately: back is a way out, not a
walk back through everywhere you have been.

### Adding someone from your contacts
On an Android phone, *Someone new* offers **fill from a contact**. It opens
Android's own chooser, and only whoever you tap comes back — Kindred never sees
the rest of the address book. The button doesn't appear on the PC, because no
desktop browser has a picker to offer.

If that number already belongs to someone in your circle, it opens them rather
than starting a second copy: `+27 82 445 1120` and `082 445 1120` count as the
same phone. A shared name on its own isn't proof of the same person, so there it
only says so and leaves the choice with you.

### Photos, and what they look at
When you choose a photo you also choose what the circle centres on: drag the
picture to move it, and zoom in to single one person out of a group shot. The
circle you see in that dialog is the badge — there is no surprise afterwards.

The crop is cut from the picture at full size, so zooming onto a distant face
still has detail to work with. Kindred keeps a copy of the uncropped picture on
that device, so **adjust focus** can reopen it later exactly where you left it,
without hunting for the file again. That copy never leaves the device: it isn't
synced and isn't in your backup.

### Three ways to record something

Each has its own section on a person's page, and its own **+** to add to it. They
share one form — you can switch the kind at the top of it at any time.

| | What it's for | Where it shows up |
|---|---|---|
| **History** | Something already behind them — a birth, a diagnosis, a move, a loss, a win | A dated timeline, newest first |
| **A date** | Something with a date on it — surgery, a court date, an anniversary, a baby due | *Today* and the *Calendar* as the day approaches. Tick *happens again every year* for anniversaries and annual scans |
| **Season** | A stretch of life, not a single day — grief, treatment, job hunting | Sits at the top of their page until you press **this has ended** |

When a season ends it isn't lost — it moves into their history as a span
(*Jun 2026 – Oct 2026*), marked as having been a season. A date that has passed
offers **move to history** in the same way.

Every record can be given a kind — joy, hard time, milestone, health, faith, baby —
which colours its dot on the timeline and in the calendar. Tap any record's title
to edit or delete it.

#### A baby on the way
Choose **A date** and set its kind to **Baby on the way**. The date then becomes a
**due date**, and a second field appears underneath it: **how far along they are
now**, in weeks and days.

Fill in either one and the other works itself out. If someone tells you *twenty-four
weeks and three days*, type that and the due date appears; if they give you the date,
the weeks appear. Only the due date is kept, because a stored week count is wrong by
the next morning and a due date never is.

From then on the record reads as *32w 4d · due in 6 weeks*, and it stays in **Today**
for the whole pregnancy rather than waiting for the usual month and a half — it is
the one date worth having in sight from the day you hear about it. Kindred also
nudges you as it nears: a month out, then closing in, then every day inside the last
week. Once the baby arrives, edit the record into their **history**.

### Prayers
Every open prayer in one place, grouped by person, with how long it's been carried.

**Tick one on the days you pray for it.** The tick fills in, the line says *prayed
today*, and tomorrow it reads *last prayed 1d ago* — so you can see at a glance what
you have been faithful with and what has been sitting there untouched for a month.
One tick a day, and tapping it again takes it back. Ticking never reorders the list,
so nothing jumps away from your finger.

**The × is how you stop carrying something**, and it asks which of three things you
mean:

| | What it means |
|---|---|
| **Answered** | It happened. You can note how, and it keeps that note |
| **Let it go** | You are no longer carrying it, and it was never answered — a situation that moved on, a thing that stopped being yours to hold |
| **remove it entirely** | You typed it by mistake. The only one that loses anything, which is why it asks again |

Answered and let-go items tuck away into their own sections at the bottom, and
neither is ever deleted. The tick in either one puts a prayer straight back on the
list.

### Today
Only what is coming up: birthdays and your dated records together, in **Today**,
**This week** and **Later**. Nothing about who you owe a call — the circle answers
that by putting them first, and asking the same question in two places only ever
made both easier to stop reading.

### Calendar
The same dates as a month, so you can see the shape of one — which week is crowded,
how far off the next thing is. Each day carries a coloured dot per thing landing on
it, in the same colours the history timeline uses. Tap a day to list just that day,
and tap it again to go back to the whole month. **‹** and **›** move between months
and **Today** brings you home. Tapping anyone's photo opens their page.

---

## Reminders — the honest version

Turn them on in **Settings → Reminders**. What you get: **when you open Kindred, it
notifies you once a day** if anyone is overdue, if a birthday or one of your dated
records falls today, or if a baby is due soon — a month out, then at three weeks,
two, ten days, and every day inside the last week.

What it can't do: wake your phone up on its own while closed. A true scheduled push
notification needs a server sending it, and this app deliberately has no server —
that's the trade for your data never leaving your device. **This applies to the due
date too**: Kindred cannot count down to it at you, it can only tell you where things
stand the next time you open the app. In practice, put the icon on your home screen
where you'll see it, and let the *Today* tab do the work.

## Locking it

**Settings → Lock with a PIN** puts four to eight digits in front of your circle. It
asks when Kindred starts, and again when you come back more than a couple of minutes
after leaving. Glancing at a message and coming straight back doesn't ask again.

Where the phone has a fingerprint or face reader — or the PC has Windows Hello —
**Fingerprint or face** appears underneath it, and the lock screen offers that first
with the PIN waiting behind. It only appears once a PIN exists, because a finger that
won't read on a cold morning needs something to fall back to.

The lock belongs to the device rather than to you: it is not part of your account, is
never synced, and is not in a backup. Setting one on the phone leaves the PC as it
was, which is usually what you want — the phone is the one that gets left on tables.

Locking never costs you anything half-written. If Kindred locks while you were partway
through adding someone, the lock sits over the top of it, and everything you had typed
is still there when you come back.

### What it is, and what it isn't

A lock on the door, not a safe. Kindred has no server to check a PIN against, so the
checking happens here: the PIN is kept as a PBKDF2 hash rather than as itself, and the
fingerprint is the device telling Kindred it recognised you. Someone determined, with
your phone already unlocked and developer tools open, could still reach the browser
storage underneath.

What it stops is the person who picks up your phone. Given what is in here — diagnoses,
medications, what someone told you in confidence last week — that is the risk worth
covering.

### If you forget it

**forgotten your PIN?** on the lock screen takes the email and password of the account
this device syncs with, and lifts the lock. It has to be *this* device's account: any
Kindred account opening any phone would be no lock at all.

If this device was never signed in, there is nobody to ask, and the lock screen says so
plainly. The only way past is then to clear Kindred's data in your browser settings —
which erases the circle on that device — and restore from a backup. One more reason to
keep one.

### Where it works

The PIN needs the app over **https**, or opened straight off the disk. The
`http://192.168.…` address cannot hash one safely — the same reason it has no offline
mode — so there the setting explains itself and stays out of the way. The fingerprint
needs https proper, so a file opened off the disk can have a PIN but not a finger.

## Backups

**Settings → Save a backup** downloads a single `.json` file containing everyone,
their history, dates, seasons, prayers, and photos. Keep it somewhere safe (this
folder is in OneDrive, which is a reasonable place).

*Restore from backup* merges a file back in. It matches people **by name**, so
restoring twice won't create duplicates, and anything already on this device wins
over the file. That also makes it the way to copy your data from PC to phone:
export on one, open the app on the other, restore.

Since browser storage can be cleared by clearing browsing data, **export a backup
every so often.** It's the only copy.

---

## Putting it online (Netlify)

The site is static files, so there is no build step. Netlify just serves the folder,
as set in `netlify.toml`.

**First time:**

1. Create a **private** repo on github.com — don't tick "add a README"
2. Point this folder at it and push:

```bash
git remote add origin https://github.com/YOUR-USERNAME/kindred.git
git push -u origin main
```

3. On netlify.com: *Add new site → Import an existing project → GitHub → pick the repo*.
   Leave the build command empty and the publish directory as `.`

After that, every `git push` deploys itself, and Netlify's *Deploys* tab lets you roll
back to any earlier version if something breaks.

Once it's live, open the HTTPS URL on your phone and use *Add to Home Screen*. It then
behaves like an installed app.

**Deploying does not move your data anywhere by itself.** The site is only the code, and
a device you haven't signed in on keeps everything in its own browser storage.

Signing in is what joins them up. In **Backup & settings → Account & sync**, sign in on
the PC and again on the phone, and from then on everyone in your circle, their history
and coming-up dates, seasons, prayers, check-ins, medications and conditions, and their
photos travel between both. Netlify isn't the go-between — the devices reconcile against
Supabase directly, not through the site.

**When it syncs.** Not continuously. It catches up at these moments:

- when you open the app, if you're already signed in
- a couple of seconds after you change something
- the moment a device reconnects after being offline
- when you come back to the app, or to its browser tab, after being elsewhere
- whenever you press *Sync now*

So it isn't live the way a shared document is. A PC left open and untouched won't show
what you just added on the phone until you click back to it or press *Sync now*.

Being offline loses nothing. Rather than stamping every edit as you make it, the app
keeps a snapshot of what it last agreed with the server and compares against that, so
whatever changed in the meantime goes up on the next sync that succeeds. If the same
person was edited on both devices in between, the device that syncs last wins. Signing
out leaves that device's copy exactly where it is; it just stops syncing.

That makes backup/restore a safety net rather than the only bridge between devices — a
file you keep somewhere else, rather than the only way data crosses from PC to phone.

One thing deliberately stays behind: the uncropped original of each photo — the copy that
**adjust focus** reopens — never leaves the device it was chosen on. It isn't synced and
isn't in a backup, so on a second device the badge arrives, but re-cropping there starts
from the badge rather than the full picture.

## Turning it into an Android app (.apk)

[pwabuilder.com](https://www.pwabuilder.com) wraps the live URL as a Trusted Web
Activity and hands back a signed `.apk` to sideload, plus an `.aab` you can ignore
unless you ever want the Play Store.

The important part is what it *isn't*: the `.apk` is a window onto the Netlify site,
not a copy of the files. That shapes everything about updating it.

### Updating it

**Changing the app needs no new .apk.** Edit a file, push, and the phone has it. This
covers `index.html`, `app.js`, `styles.css`, `sync.js`, `config.js` — every ordinary
change. Nothing to rebuild, nothing to reinstall, nothing to send anyone.

Two things make that land promptly. `netlify.toml` keeps the page, the service worker
and `version.json` out of the CDN's cache, and `sw.js` goes to the network first so a
new file always beats the stored one when there's a connection.

The awkward case is an app you never really close. Resumed from the task switcher it
keeps the page it booted with and would happily stay a fortnight behind. So each deploy
writes `version.json` naming the commit it came from, and whenever you return to the
app it compares. If the site has moved on it reloads itself — unless a dialog is open
or you're typing, in which case it waits and asks again next time. Nothing half-written
is ever lost to it.

**A new .apk is only needed if the shell changes** — the app name, the icons, the
manifest, or an Android version bump years from now. Then rebuild with the *same
signing key* and a higher `versionCode`, and tap the file on the phone to install over
the top.

Reinstalling doesn't touch your data. A TWA runs in Chrome, so everything lives in
Chrome's storage for the site rather than inside the app — uninstalling the `.apk`
wouldn't clear it either. Clearing Chrome's browsing data is what would, which is the
same warning as further up the page, and the same reason to sign in and keep backups.

### Building it, once

1. Run pwabuilder.com against the live URL and package for Android → Trusted Web
   Activity. Warnings about screenshots or shortcuts are Play Store polish; ignore them.
2. **Set the package ID once and never change it.** A different ID is a different app,
   and the one already on the phone could no longer be updated in place.
3. Start at `versionCode 1`, `versionName 1.0.0`. Every rebuild after this must raise
   `versionCode` or Android refuses to install it.
4. Create a new signing key and download the zip.
5. Put the `assetlinks.json` it generates at `.well-known/assetlinks.json` here and push.
   Without it the app opens with a browser URL bar across the top. `netlify.toml`
   already serves that path with the headers it needs.
6. **Move the keystore and its password somewhere safe, outside this folder.** The zip
   holds the key *and* the password in plain text. `.gitignore` covers the usual names,
   but don't rely on that — put them in a password manager and keep an offline copy.
   Losing the key means never updating that install again.
7. If the zip contains `twa-manifest.json`, commit it. It holds the fingerprint, not the
   key, and lets a later rebuild come out identical via `npx @bubblewrap/cli build`.
   Otherwise write the package ID and fingerprint down here.

Fill in once done — package ID: `…`  ·  key kept at: `…`

On a Xiaomi, installing the file needs *Install unknown apps* enabled for whatever app
you open the `.apk` with.

## The files

| File | What it is |
|---|---|
| `index.html` | the page structure |
| `styles.css` | all the visual design |
| `app.js` | all the behaviour and storage |
| `serve.js` | the small local server for working on it (no dependencies) |
| `sw.js` | service worker — makes it work offline |
| `netlify.toml` | how Netlify serves it |
| `manifest.webmanifest`, `icon*.png` | what lets it install as an app |
| `logo-mark.png` | the logo as used inside the app (transparent) |
| `tools/logo-source.png` | the original logo artwork |
| `tools/make-icons.js` | rebuilds every icon from that artwork |
| `tools/stamp.js` | names each deploy in `version.json`, so an installed app knows to refresh |

No build step, no npm install, no frameworks. Edit a file, refresh the page.

Two easy things to change: the app name sits in `index.html` (the `<h1>`) and
`manifest.webmanifest`; the colours are the variables at the top of `styles.css`.

To change the logo, drop a new PNG at `tools/logo-source.png` and run:

```bash
node tools/make-icons.js
```

It trims the artwork, squares it up and rebuilds every size — the favicon, the app
icons Android and iOS need, a maskable variant with the padding Android requires, and
the transparent mark used in the side menu. Android and iOS both refuse SVG icons,
which is why these are PNGs.
