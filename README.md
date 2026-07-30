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

### Circle
Everyone you've added, as circular badges. The thin ring around each photo tells
you how the check-in is going:

| Ring | Meaning |
|---|---|
| **Green** | recently connected |
| **Gold** | coming up soon |
| **Clay** (soft red-brown) | overdue — you asked to be reminded and the time has passed |
| **Grey** | no reminder set for this person |

A small **✜** at the top of a badge means open prayers; a mark at the bottom-left
means they're in a season right now. Anyone overdue also appears in the
*It's been a while* strip at the top.

### Opening someone
**Tap their photo** — that is the only thing that opens a person's page. Their name
underneath is just a label, so you can't open someone by accident, and adding a new
person leaves you on your circle rather than jumping into their page.

Inside:

- **Connected today** — one tap to record that you spoke. This resets their ring
  and adds a bead to their little history.
- **Right now** — the seasons they're walking through. See below.
- **Who they are** — a free-text summary that saves as you type. Meant for what's
  true *right now*: what they're carrying, what to ask about next time.
- **Prayer list** — add anything; tick it to mark it answered (you can note how it
  was answered). Answered items tuck away underneath but are never deleted.
- **Coming up** and **History** — see below.
- **edit details** — name, photo, relationship, circle, birthday, and how often
  you want to be nudged.

### Three ways to record something

Each has its own section on a person's page, and its own **+** to add to it. They
share one form — you can switch the kind at the top of it at any time.

| | What it's for | Where it shows up |
|---|---|---|
| **History** | Something already behind them — a birth, a diagnosis, a move, a loss, a win | A dated timeline, newest first |
| **A date** | Something with a date on it — surgery, a court date, an anniversary | *Dates ahead* in Today as the day approaches. Tick *happens again every year* for anniversaries and annual scans |
| **Season** | A stretch of life, not a single day — grief, treatment, a new baby, job hunting | Sits at the top of their page and in Today's *Walking through*, until you press **this has ended** |

When a season ends it isn't lost — it moves into their history as a span
(*Jun 2026 – Oct 2026*), marked as having been a season. A date that has passed
offers **move to history** in the same way.

Every record can be given a kind — joy, hard time, milestone, health, faith — which
colours its dot on the timeline. Tap any record's title to edit or delete it.

### Prayers
Every open prayer in one place, grouped by person, with how long it's been carried.
Below it, an *answered* section — worth re-reading.

### Today
What actually needs you, in order: overdue check-ins, **dates ahead** (birthdays and
your dated records together, nearest first), **walking through** (everyone in a
season), check-ins coming due soon, and three people to pray for (rotates daily).
The tick button on a row marks a connection without opening them.

---

## Reminders — the honest version

Turn them on in **Settings → Reminders**. What you get: **when you open Kindred, it
notifies you once a day** if anyone is overdue, or if a birthday or one of your
dated records falls today.

What it can't do: wake your phone up on its own while closed. A true scheduled push
notification needs a server sending it, and this app deliberately has no server —
that's the trade for your data never leaving your device. In practice, put the icon
on your home screen where you'll see it, and let the *Today* tab do the work.

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

## The files

| File | What it is |
|---|---|
| `index.html` | the page structure |
| `styles.css` | all the visual design |
| `app.js` | all the behaviour and storage |
| `serve.js` | the small local server (no dependencies) |
| `sw.js` | service worker — makes it work offline |
| `manifest.webmanifest`, `icon.svg` | what lets it install as an app |

No build step, no npm install, no frameworks. Edit a file, refresh the page.

Two easy things to change: the app name sits in `index.html` (the `<h1>`) and
`manifest.webmanifest`; the colours are the variables at the top of `styles.css`.
