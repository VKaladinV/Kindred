/* uses: $ $$ el plural · openGroup people queueSave · avatar · toast
   · groupById newGroup removeGroup renderGroups · leaveGroup
*/

let editingGroupId = null;

/* Who is in it, picked as faces. A list of names would have been fewer lines
   and the wrong thing to look at: what is being made is a circle of faces, and
   this is that circle with the ones you have not chosen turned down.

   The pressed state on each button is the state. Nothing is held on the side to
   fall out of step with it — the same arrangement the group chips on a person
   have, and read back the same way.

   Written for any box rather than for this dialog's one, because a community
   (js/community-dialog.js) picks its leaders, its people and who came to a
   meeting the same way. onToggle hears about each tap, for a count to keep or
   a second picker to keep in step. */
function paintFacePick(box, list, chosen, onToggle) {
  box.textContent = '';
  const picked = new Set(chosen);
  list.forEach(p => {
    const b = el('button', 'face-opt');
    b.type = 'button';
    b.dataset.id = p.id;
    b.dataset.name = p.name.toLowerCase();
    b.setAttribute('aria-pressed', String(picked.has(p.id)));
    b.append(avatar(p, 'face-opt-photo', false, 'thumb'), el('span', 'face-opt-name', p.name));
    b.onclick = () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      if (onToggle) onToggle(p.id, on);
    };
    box.append(b);
  });
}

const readFacePick = box =>
  $$('.face-opt', box).filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.id);

function paintMemberPick(chosen) {
  /* The circle, and only the circle: not you, and not somebody you have merely
     flagged to meet. The same thing every other renderer means by people. */
  const list = [...people].sort((a, b) => a.name.localeCompare(b.name));
  $('#g-empty').hidden = list.length > 0;
  paintFacePick($('#g-members'), list, chosen, paintMemberCount);
  paintMemberCount();
}

const readMemberPick = () => readFacePick($('#g-members'));

function paintMemberCount() {
  const n = readMemberPick().length;
  $('#g-count').textContent = n ? plural(n, 'person', 'people') : 'tap a face';
}

/* A group being made, or one being edited. Passing the group rather than an id
   would have been shorter; the id is what survives a sync landing a fresh array
   of groups underneath the open dialog. */
function groupDialog(id = null) {
  const g = id ? groupById(id) : null;
  editingGroupId = g ? g.id : null;

  $('#dlg-group-title').textContent = g ? 'Edit group' : 'A new group';
  $('#g-name').value = g?.name || '';
  /* The stored membership, not membersOf's — somebody who has not reached this
     device yet must not be quietly dropped from the group by the act of opening
     it to rename it. They are simply not among the faces to un-tick. */
  paintMemberPick(g?.members || []);
  $('#btn-group-delete').hidden = !g;

  $('#dlg-group').showModal();
  setTimeout(() => $('#g-name').focus(), 60);
}

function saveGroup(e) {
  e.preventDefault();
  const name = $('#g-name').value.trim();
  if (!name) return;

  const picked = readMemberPick();
  const g = editingGroupId && groupById(editingGroupId);

  if (g) {
    g.name = name;
    /* What was ticked, plus anybody the picker could not offer — a member whose
       person is still on its way here. Dropping them because they were not on
       screen to be kept would be the picker deciding something it was never
       asked about. */
    const shown = new Set(people.map(p => p.id));
    g.members = [...picked, ...g.members.filter(x => !shown.has(x))];
  } else {
    newGroup(name, picked);
  }

  queueSave();
  $('#dlg-group').close();
  renderGroups();
  toast(g ? 'Group saved' : `${name} made`);
}

function deleteGroup() {
  const g = editingGroupId && groupById(editingGroupId);
  if (!g) return;
  if (!confirm(`Remove the group ${g.name}?\n\nEveryone in it stays in your circle — only the grouping goes.`)) return;

  /* Out of the group before the group goes, or the way back out is standing on
     something that no longer exists. Unanimated: the circle it would fly back
     into is the one being removed. */
  if (openGroup === g.id) leaveGroup({ animate: false });
  removeGroup(g.id);
  $('#dlg-group').close();
  renderGroups();
  toast(`${g.name} removed`);
}
