/* uses: configured · Session recover signIn signOut signUp
   · claimInvite createInvite downloadInvitePhoto joinUrl listInvites listLinks previewInvite revokeInvite unlink uploadInvitePhoto
   · flatten mergeTable nest planPush · projectSelf publishMine pullShared
   · status sync · openSignIn · syncBoot
*/

/* The whole surface the app is allowed to see, and the last thing loaded.

   With no Supabase URL or key, none of this happens: no bridge, and so no
   sign-in button, no invitations and no status line anywhere in the app. That
   was a bare `return` out of the old file-wide wrapper; it is this `if` now.

   The bridge is installed before syncBoot runs rather than after, so nothing
   syncBoot sets in motion can look for it and find it missing. */
if (configured) {
  window.KindredSync = {
    sync, signIn, signUp, recover, signOut, Session, status: () => status, openSignIn,
    createInvite, claimInvite, previewInvite, listLinks, listInvites, revokeInvite, unlink, joinUrl,
    uploadInvitePhoto, downloadInvitePhoto,
    projectSelf, publishMine, pullShared,
    flatten, nest, mergeTable, planPush,   // exported so the rules can be tested
  };

  syncBoot();
}
