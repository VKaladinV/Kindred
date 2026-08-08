/* uses: $ · Session consumeAuthFragment · sync · paintStatus wireSync */

async function syncBoot() {
  if (!$('#dlg-auth')) return;
  wireSync();
  paintStatus();
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
    Kindred.toast('Signed in — syncing your circle');
    await sync({ manual: true });
    Kindred.afterAuth?.();
    return;
  }
  if (Session.signedIn) sync();
}
