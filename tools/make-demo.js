/* Builds a set of demo data for trying Kindred out.

   Run from the project root:

       node tools/make-demo.js

   It writes into tools/demo/ :

     kindred-demo.json    eleven people to load through
                          Settings → Restore from backup
     photos/*.png         pictures to hang on them, including a wide
                          group shot for testing where a photo looks

   The people carry every state the app can show — overdue and well,
   seasons running and ended, prayers open and answered, birthdays near
   and far — and all five groups, several people in two of them.

   Dates are worked out from the day you run this, so the demo is never
   stale. Photos are deliberately *not* baked into the JSON: picking one
   yourself is how you see the focus picker do its work.

   No dependencies — PNG encoding uses Node's zlib, same as make-icons.js. */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, 'demo');
const PHOTOS = path.join(OUT, 'photos');

/* ══════════════════════ dates ══════════════════════ */

const DAY = 864e5;
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const now = new Date();
const today = ymd(now);
const shift = n => ymd(new Date(now.getTime() + n * DAY));
const ago = n => shift(-n);
const ahead = n => shift(n);

/* a birthday n days away, in a year that makes them the age given */
const birthday = (inDays, age) => {
  const d = new Date(now.getTime() + inDays * DAY);
  return ymd(new Date(d.getFullYear() - age, d.getMonth(), d.getDate()));
};

/* a run of check-ins, most recent first in the list you pass */
const touches = (...daysAgo) => daysAgo.map(ago).sort();

let seq = 0;
const id = () => 'demo' + (seq++).toString(36).padStart(3, '0');

const rec = (type, date, kind, title, note = '', extra = {}) =>
  ({ id: id(), type, date, endDate: '', kind, title, note, repeatsYearly: false, ...extra });

const prayer = (text, daysOld, answered = null, answerNote = '') =>
  ({ id: id(), text, createdAt: ago(daysOld), answeredAt: answered ? ago(answered) : null, answerNote });

/* ══════════════════════ the people ══════════════════════ */

const people = [
  {
    id: id(),
    name: 'Ouma Hettie Snyman',
    relationship: 'grandmother',
    groups: ['Family'],
    birthday: birthday(9, 84),
    contact: '+27 82 445 1120',
    summary: 'Settling into Huis Andreas better than any of us expected. Ask about the '
      + 'garden club — she has been put in charge of the roses and is quietly thrilled. '
      + 'Her hearing is worse on the phone than in person.',
    cadenceDays: 7,
    touches: touches(9, 17, 24, 33, 41),
    events: [
      rec('history', ago(420), 'milestone', 'Moved into Huis Andreas',
        'Sold the house in Bethlehem after 51 years. Took the stoep chairs with her.'),
      rec('history', ago(1180), 'hard', 'Oupa Danie passed away'),
      rec('upcoming', ahead(12), 'health', 'Cataract surgery — right eye',
        'Universitas, 07:00. She needs a lift and someone there after.'),
      rec('upcoming', ahead(58), 'milestone', 'Wedding anniversary', 'Would have been 62 years.',
        { repeatsYearly: true }),
    ],
    prayers: [
      prayer('That the surgery goes smoothly and her sight comes back clearly', 14),
      prayer('That she keeps finding company there and does not go quiet again', 40),
      prayer('That the move would not break her', 430, 380,
        'She has made friends in the dining hall and asked for her sewing machine back.'),
    ],
    createdAt: ago(450),
  },
  {
    id: id(),
    name: 'Oom Kobus Snyman',
    relationship: 'uncle',
    groups: ['Family'],
    birthday: birthday(203, 71),
    contact: '+27 83 901 7734',
    summary: 'Recovering from the fall in June — walking again but not driving yet. '
      + 'Proud, so he will say he is fine. Ask Tannie Rina instead.',
    cadenceDays: 30,
    touches: touches(12, 29, 51),
    events: [
      rec('season', ago(47), 'health', 'Recovering from the fall',
        'Fractured wrist and a bad knock to his confidence. Physio twice a week.'),
      rec('history', ago(47), 'hard', 'Fell in the workshop', 'Found by a neighbour after about an hour.'),
      rec('upcoming', ahead(5), 'health', 'INR check', 'Warfarin clinic, Rosepark.'),
    ],
    prayers: [prayer('That he heals fully and gets his independence back', 45)],
    createdAt: ago(900),
  },
  {
    id: id(),
    name: 'Pieter van Wyk',
    relationship: 'small group leader',
    groups: ['Community/Discipleship', 'Friends'],
    birthday: birthday(64, 45),
    contact: 'pieter.vw@gmail.com',
    summary: 'Carrying the group well but running on empty — he has led every week '
      + 'since February without a break. Offer to take a week.',
    cadenceDays: 14,
    touches: touches(11, 26, 39, 55),
    events: [
      rec('upcoming', ahead(3), 'faith', 'Small group at ours', 'His turn to lead; bring the good coffee.'),
      rec('history', ago(160), 'faith', 'Took over the Thursday group'),
    ],
    prayers: [
      prayer('That he would get a proper rest without feeling he has dropped something', 30),
      prayer('For wisdom with the couple who have stopped coming', 21),
    ],
    createdAt: ago(300),
  },
  {
    id: id(),
    name: 'Thandi Mokoena',
    relationship: 'registrar, and a friend',
    groups: ['Work', 'Community/Discipleship'],
    birthday: birthday(121, 32),
    contact: '+27 71 220 8845',
    summary: 'First year as a registrar and finding the nights hard. Sharp, careful, '
      + 'and far more capable than she believes. Say so out loud.',
    cadenceDays: 30,
    touches: touches(3, 22, 44),
    events: [
      rec('history', ago(220), 'milestone', 'Started as a registrar'),
      rec('upcoming', ahead(34), 'milestone', 'Part 1 exam'),
    ],
    prayers: [prayer('That she would sleep, and that the exam would go well', 18)],
    createdAt: ago(230),
  },
  {
    id: id(),
    name: 'Sam Delport',
    relationship: 'oldest friend',
    groups: ['Friends'],
    birthday: birthday(2, 41),
    contact: '+27 84 771 3390',
    summary: 'Twenty-two years and we still pick up mid-sentence. Moved to Cape Town '
      + 'in March, which is the only reason this has gone quiet.',
    cadenceDays: 60,
    touches: [],
    events: [
      rec('history', ago(140), 'milestone', 'Moved to Cape Town', 'New job at the harbour.'),
    ],
    prayers: [],
    createdAt: ago(140),
  },
  {
    id: id(),
    name: 'Nomsa Dlamini',
    relationship: 'neighbour',
    groups: ['Friends'],
    birthday: birthday(88, 58),
    contact: '+27 72 664 2201',
    summary: 'Keeps an eye on the house when we travel and will not accept anything for it. '
      + 'Her asthma is worse in the cold months — check in more in winter.',
    cadenceDays: 21,
    touches: touches(25, 48),
    events: [
      rec('history', ago(75), 'hard', 'Bad asthma flare', 'Two nights in hospital.'),
    ],
    prayers: [prayer('For her breathing through the cold', 70)],
    createdAt: ago(260),
  },
  {
    id: id(),
    name: 'Marie Kruger',
    relationship: 'from church',
    groups: ['Community/Discipleship'],
    birthday: birthday(240, 67),
    contact: '+27 82 118 9903',
    summary: 'Four months into losing her mother. Past the casseroles stage, which is '
      + 'exactly when everyone stops asking. Keep asking.',
    cadenceDays: 7,
    touches: touches(8, 15, 23, 30),
    events: [
      rec('season', ago(118), 'hard', 'Grieving her mother',
        'They lived together for eleven years. The house is very quiet now.'),
      rec('history', ago(118), 'hard', 'Her mother passed away'),
      rec('season', ago(400), 'health', 'Waiting on the biopsy results',
        'Six weeks of not knowing.', { endDate: ago(358) }),
    ],
    prayers: [
      prayer('That the evenings would get easier', 100),
      prayer('That the biopsy would come back clear', 400, 358, 'It was benign. Enormous relief.'),
    ],
    createdAt: ago(410),
  },
  {
    id: id(),
    name: 'Lerato Molefe',
    relationship: 'meeting monthly',
    groups: ['Community/Discipleship', 'Work'],
    birthday: birthday(35, 26),
    contact: 'lerato.m@outlook.com',
    summary: 'Asked me to meet monthly and has not missed one yet. Deciding whether to '
      + 'stay in the department or go into private practice.',
    cadenceDays: 30,
    touches: touches(6, 35, 66),
    events: [
      rec('upcoming', ahead(19), 'faith', 'Coffee — the usual place'),
      rec('history', ago(190), 'joy', 'Asked if we could meet regularly'),
    ],
    prayers: [prayer('Clarity about the next step, and courage once she has it', 25)],
    createdAt: ago(195),
  },
  {
    id: id(),
    name: 'Willem Snyman',
    relationship: 'brother',
    groups: ['Family'],
    birthday: birthday(146, 39),
    contact: '+27 81 334 5567',
    summary: 'We speak when we speak, and that has always been fine. No reminder set '
      + 'on purpose.',
    cadenceDays: 0,
    touches: touches(20, 74),
    events: [
      rec('upcoming', ahead(146), 'joy', 'His birthday braai', '', { repeatsYearly: true }),
    ],
    prayers: [],
    createdAt: ago(500),
  },
  {
    id: id(),
    name: 'Dr Elmarie Botha',
    relationship: 'practice partner',
    groups: ['Work'],
    birthday: birthday(310, 52),
    contact: '+27 83 447 2218',
    summary: 'Carrying more than her share since February. Worth saying thank you '
      + 'properly rather than in passing.',
    cadenceDays: 14,
    touches: touches(5, 19, 31),
    events: [
      rec('upcoming', ahead(9), 'other', 'Practice meeting', 'Locum cover for December.'),
    ],
    prayers: [],
    createdAt: ago(700),
  },
  {
    id: id(),
    name: 'Anja Venter',
    relationship: 'from parkrun',
    groups: [],
    birthday: '',
    contact: '',
    summary: 'Still working out where she fits — no group yet, and she shows up under '
      + 'Everyone until there is one.',
    cadenceDays: 90,
    touches: touches(38),
    events: [],
    prayers: [],
    createdAt: ago(60),
  },
];

/* ══════════════════════ PNG encode ══════════════════════ */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

const crc32 = b => {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/* RGB, no alpha: these are photographs, every pixel is opaque */
function encodePng(rgb, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;

  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 1;                       // Sub filter, plenty for these
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= 3 ? rgb[row + i - 3] : 0;
      raw[y * (stride + 1) + 1 + i] = (rgb[row + i] - a) & 0xff;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ══════════════════════ a very small canvas ══════════════════════

   Everything is drawn at three times the final size and averaged down,
   which is the cheapest way to get edges that do not look like stairs. */

const SS = 3;

function canvas(w, h) {
  return { w, h, px: new Float64Array(w * h * 3) };
}

function put(c, x, y, rgb, a = 1) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const o = (y * c.w + x) * 3;
  c.px[o] += (rgb[0] - c.px[o]) * a;
  c.px[o + 1] += (rgb[1] - c.px[o + 1]) * a;
  c.px[o + 2] += (rgb[2] - c.px[o + 2]) * a;
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function vgrad(c, top, bottom) {
  for (let y = 0; y < c.h; y++) {
    const col = mix(top, bottom, y / c.h);
    for (let x = 0; x < c.w; x++) put(c, x, y, col);
  }
}

function rect(c, x0, y0, w, h, rgb) {
  for (let y = Math.round(y0); y < Math.round(y0 + h); y++)
    for (let x = Math.round(x0); x < Math.round(x0 + w); x++) put(c, x, y, rgb);
}

function ellipse(c, cx, cy, rx, ry, rgb) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) put(c, x, y, rgb);
    }
  }
}

/* a head-and-shoulders figure, standing on `groundY` */
function figure(c, { x, groundY, height, skin, shirt, hair, hat = false }) {
  const headR = height * 0.104;
  const headY = groundY - height * 0.865;

  // shoulders and torso
  const shoulderY = headY + headR * 2.35;
  ellipse(c, x, shoulderY + height * 0.10, height * 0.150, height * 0.115, shirt);
  rect(c, x - height * 0.150, shoulderY + height * 0.10, height * 0.300, groundY - shoulderY, shirt);
  // arms, a shade darker so they read as separate
  const dark = mix(shirt, [0, 0, 0], 0.16);
  ellipse(c, x - height * 0.150, shoulderY + height * 0.20, height * 0.045, height * 0.145, dark);
  ellipse(c, x + height * 0.150, shoulderY + height * 0.20, height * 0.045, height * 0.145, dark);
  // neck
  rect(c, x - headR * 0.42, headY + headR * 0.5, headR * 0.84, headR * 1.7, mix(skin, [0, 0, 0], 0.12));
  // hair behind, then the face over it
  ellipse(c, x, headY - headR * 0.16, headR * 1.10, headR * 1.16, hair);
  ellipse(c, x, headY + headR * 0.06, headR * 0.92, headR * 1.04, skin);
  // fringe
  ellipse(c, x, headY - headR * 0.52, headR * 0.94, headR * 0.46, hair);
  if (hat) ellipse(c, x, headY - headR * 0.72, headR * 1.45, headR * 0.30, [235, 228, 205]);
  // eyes, just enough to give the face a direction
  const eye = [58, 48, 42];
  ellipse(c, x - headR * 0.34, headY + headR * 0.06, headR * 0.10, headR * 0.13, eye);
  ellipse(c, x + headR * 0.34, headY + headR * 0.06, headR * 0.10, headR * 0.13, eye);
  ellipse(c, x, headY + headR * 0.56, headR * 0.26, headR * 0.09, mix(skin, [150, 70, 70], 0.55));
}

function write(c, name) {
  const w = c.w / SS, h = c.h / SS;
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = ((y * SS + sy) * c.w + x * SS + sx) * 3;
          r += c.px[o]; g += c.px[o + 1]; b += c.px[o + 2];
        }
      }
      const o = (y * w + x) * 3, n = SS * SS;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n);
    }
  }
  const png = encodePng(out, w, h);
  fs.writeFileSync(path.join(PHOTOS, name), png);
  console.log(`  photos/${name.padEnd(22)} ${w}x${h}  ${(png.length / 1024).toFixed(0)} KB`);
}

/* ══════════════════════ the pictures ══════════════════════ */

const SKIN = [[241, 205, 178], [198, 148, 110], [122, 84, 60], [232, 190, 158], [90, 62, 46], [216, 172, 138]];
const HAIR = [[62, 44, 34], [24, 20, 18], [150, 128, 96], [88, 62, 40], [40, 34, 30], [186, 170, 148]];
const SHIRT = [[196, 82, 58], [72, 108, 148], [232, 198, 96], [96, 138, 82], [150, 96, 160], [222, 226, 232]];

function sky(c, groundFrac) {
  vgrad(c, [176, 202, 220], [226, 232, 226]);
  rect(c, 0, c.h * groundFrac, c.w, c.h, [138, 146, 112]);
  rect(c, 0, c.h * groundFrac, c.w, c.h * 0.012, [120, 130, 96]);
}

function groupShot() {
  // deliberately wide, with small faces: the whole point of the focus picker
  const c = canvas(2400 * SS, 900 * SS);
  sky(c, 0.72);
  const ground = 900 * SS * 0.94;
  const xs = [300, 660, 1010, 1360, 1720, 2090];
  xs.forEach((x, i) => figure(c, {
    x: x * SS, groundY: ground, height: (560 + (i % 3) * 22) * SS,
    skin: SKIN[i], hair: HAIR[i], shirt: SHIRT[i], hat: i === 4,
  }));
  write(c, 'group-of-six.png');
}

function twoPeople() {
  const c = canvas(1600 * SS, 1100 * SS);
  sky(c, 0.70);
  const ground = 1100 * SS * 0.96;
  figure(c, { x: 470 * SS, groundY: ground, height: 780 * SS, skin: SKIN[0], hair: HAIR[2], shirt: SHIRT[3] });
  figure(c, { x: 1090 * SS, groundY: ground, height: 800 * SS, skin: SKIN[2], hair: HAIR[1], shirt: SHIRT[0] });
  write(c, 'two-people.png');
}

/* tall, with the face high in the frame — a centre crop would take the chest */
function portrait(name, skin, hair, shirt) {
  const c = canvas(1000 * SS, 1500 * SS);
  vgrad(c, [214, 220, 208], [178, 190, 172]);
  figure(c, { x: 500 * SS, groundY: 1500 * SS * 1.02, height: 1330 * SS, skin, hair, shirt });
  write(c, name);
}

/* ══════════════════════ build ══════════════════════ */

fs.mkdirSync(PHOTOS, { recursive: true });

const backup = {
  app: 'kindred',
  version: 3,
  exportedAt: new Date().toISOString(),
  people,
  photos: {},
};

const jsonPath = path.join(OUT, 'kindred-demo.json');
fs.writeFileSync(jsonPath, JSON.stringify(backup, null, 2));

const counts = {};
people.forEach(p => p.groups.forEach(g => { counts[g] = (counts[g] || 0) + 1; }));

console.log(`\n  kindred-demo.json        ${people.length} people`);
console.log('  ' + Object.entries(counts).map(([g, n]) => `${g} ${n}`).join(' · ')
  + ` · no group ${people.filter(p => !p.groups.length).length}\n`);

groupShot();
twoPeople();
portrait('portrait-older-woman.png', SKIN[3], HAIR[5], SHIRT[5]);
portrait('portrait-man.png', SKIN[1], HAIR[3], SHIRT[1]);
portrait('portrait-woman.png', SKIN[4], HAIR[1], SHIRT[2]);

console.log(`
  Written to tools/demo/

  1. Open Kindred → Settings → Restore from backup → kindred-demo.json
  2. Tap someone's circle, then "edit details" → Choose a photo
  3. Try group-of-six.png on anyone: zoom in and drag until one face
     fills the circle. That is the whole feature.

  To clear the demo later, remove each person from their own edit dialog,
  or clear the site data for this origin in your browser settings.
`);
