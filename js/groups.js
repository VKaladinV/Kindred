/* uses: $ el hashCode plural today uid · groups openGroup people queueSave
   · byNeed · GROUP_FACES packFaces · paintFaces · quiet
   · dropOpenGroup enterGroup
*/

/* ── people you have put together ────────────────────────────────
   A group is a name and a list of ids, and nothing else. It owns no people —
   removing somebody from a group and removing them from your life are two
   different acts, and keeping the membership as ids rather than as persons is
   what makes them impossible to confuse.

   The four names in GROUPS are not this. Those are filters: fixed shelves that
   every person is on as many of as fit, and they narrow the circle. A group is
   a thing you made. They share a word and nothing else. */

const groupById = id => groups.find(g => g.id === id) || null;

/* The members who are actually here, in the order the circle already sorts by
   — so the faces a badge has room to draw are the ones needing you most, and
   the ones it cannot draw are the ones you were least likely to be looking for.

   filter(Boolean) is doing real work: a member id whose person has not reached
   this device yet is not a mistake and is not thrown away, only skipped for as
   long as it takes to arrive. See normaliseGroup. */
const membersOf = g => g.members
  .map(id => people.find(p => p.id === id))
  .filter(Boolean)
  .sort(byNeed);

/* Groups by name, always. There is no ordering that a group could be said to
   want — no cadence to be overdue against, and by decision no ring or size to
   carry one — so the only honest sort is the one you can predict. */
const groupsByName = () => [...groups].sort((a, b) => a.name.localeCompare(b.name));

function newGroup(name, members) {
  const g = { id: uid(), name, members, createdAt: today() };
  groups.push(g);
  return g;
}

function removeGroup(id) {
  groups = groups.filter(g => g.id !== id);
  /* Only the grouping goes. Every person in it is still in the circle, still
     has their page and their prayers and their history — which is the whole
     reason a group holds ids rather than people. */
  queueSave();
}

/* ── the group's own face ────────────────────────────────────────
   futureBadge's shape, with the photo swapped for a disc of faces. Same
   reasoning it gives for not reusing badge(): the ring, the since-caption and
   the season mark all model one ongoing relationship, and a group is not one.

   .no-ring switches the ring off rather than leaving the default ash one
   implying a state, and setting no --scale leaves --frame at full size — so
   both halves of "every group the same size, no ring" fall out of classes the
   stylesheet already has. */
function groupBadge(g) {
  const members = membersOf(g);
  const shown = members.slice(0, GROUP_FACES);

  const b = el('div', 'badge no-ring is-group');
  b.dataset.group = g.id;

  const frame = el('button', 'badge-frame');
  frame.type = 'button';
  frame.setAttribute('aria-label', `Open ${g.name} — ${plural(members.length, 'person', 'people')}`);
  frame.style.setProperty('--tilt', ((hashCode(g.id) % 7) - 3) + 'deg');
  frame.onclick = () => enterGroup(g.id);
  frame.append(packFaces(shown));

  const hidden = members.length - shown.length;
  if (hidden) {
    const more = el('div', 'badge-more', '+' + hidden);
    more.title = plural(hidden, 'more person', 'more people');
    frame.append(more);
  }

  b.append(frame, el('div', 'badge-name', g.name));
  b.append(el('div', 'badge-meta', members.length
    ? plural(members.length, 'person', 'people')
    : 'nobody yet'));
  return b;
}

/* ── the view ────────────────────────────────────────────────────
   One grid, two things in it. Out, it is the groups. In, it is the ordinary
   dashboard for one of them — real badges, real rings, the phone's own
   tessellation — because that is what zooming into a group is supposed to
   reveal, and paintFaces is the same function the circle uses to draw it. */
function renderGroups() {
  const grid = $('#grid-groups');
  /* Removed on another device while you were standing in it. Noticed here
     because here is where it is next asked about — the same place and the same
     reason renderSheet notices a person who has gone. */
  if (openGroup && !groupById(openGroup)) dropOpenGroup();
  const g = openGroup && groupById(openGroup);

  grid.classList.toggle('no-entry', quiet);
  grid.textContent = '';
  grid.classList.toggle('is-inside', !!g);

  if (g) {
    const members = membersOf(g);
    paintFaces(grid, members);
    if (!members.length) grid.append(el('p', 'quiet-note', 'Nobody in this group yet.'));
  } else {
    /* No .is-hex: every group circle is drawn at the same size, so the plain
       CSS grid packs them on its own — the same reason the future connections
       need no tessellation either. */
    grid.classList.remove('is-hex');
    groupsByName().forEach(x => grid.append(groupBadge(x)));
  }

  grid.hidden = !g && !groups.length;
  $('#blank-groups').hidden = !!g || groups.length > 0;
  paintGroupBar();
}

/* The line above the grid, which asks a different question depending on which
   side of the zoom you are on: out, whether to make another; in, which group
   you are standing in and how to get back out of it. */
function paintGroupBar() {
  const g = openGroup && groupById(openGroup);
  $('#groups-out').hidden = !!g;
  $('#groups-in').hidden = !g;
  if (g) {
    $('#group-title').textContent = g.name;
    $('#group-sub').textContent = plural(membersOf(g).length, 'person', 'people');
  }
}
