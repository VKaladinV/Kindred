/* uses: $ · Session consumeAuthFragment · sync · paintStatus wireSync
   · refreshMembership takeCodeFragment wireGate
*/

async function syncBoot() {
  if (!$('#dlg-auth')) return;
  wireSync();
  wireGate();
  paintStatus();
  /* Before anything asks whether this account is allowed in, because the
     answer may be sitting in the link that opened the app. */
  takeCodeFragment();
  /* Ahead of the sign-in check below: the session this sets counts as one. */
  const confirmed = await consumeAuthFragment();
  if (confirmed === 'recovery') {
    paintStatus();
    $('#recover-error').textContent = '';
    $('#dlg-recover').showModal();
    setTimeout(() => $('#recover-password').focus(), 60);
  } else if (confirmed) {
    /* A signup confirmation or magic link — proof enough on its own, so this
       finishes the same way an ordinary sign-in does: painted, synced, and
       whatever invitation was waiting in storage for exactly this moment
       picked back up, rather than left for the user to notice went nowhere. */
    paintStatus();
    await refreshMembership();
    Kindred.toast('Signed in — syncing your circle');
    await sync({ manual: true });
    Kindred.afterAuth?.();
    return;
  }
  if (Session.signedIn) {
    /* Asked before the first sync rather than after: an account that has not
       been let in would otherwise spend that sync being refused a row at a
       time, and report it as a sync problem — which it is not. */
    await refreshMembership();
    sync();
  }
}
