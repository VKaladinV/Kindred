/* uses: Store */

const LOCK_GRACE = 2 * 60 * 1000;   // away longer than this and it asks again
const PIN_MIN = 4;
const PIN_MAX = 8;
const PIN_ITER = 150000;
const LOCK_TRIES = 5;               // wrong PINs before it makes you wait
const LOCK_PAUSE = 30000;

/* PBKDF2 needs crypto.subtle, which needs a secure context: the live site,
   the installed app, localhost and a file opened straight off the disk all
   qualify. The http://192.168… address does not — the same reason it has no
   service worker. Saying so is better than offering a lock that cannot hash. */
const canLock = () => !!(window.isSecureContext && window.crypto?.subtle);

/* WebAuthn is stricter still and wants a real https origin, so a file opened
   off the disk can have a PIN but not a fingerprint. */
const bioOrigin = () =>
  canLock() && !!window.PublicKeyCredential &&
  (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname));

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

const lockRecord = () => {
  try { return JSON.parse(Store.getPref('lock', 'null')); } catch { return null; }
};
const hasPin = () => !!lockRecord();
const bioCredential = () => Store.getPref('lockBio', '');

/* sync.js is optional — the app runs unchanged without it — so never
   assume it is there. */
const syncEmail = () => {
  try { return window.KindredSync?.Session?.user?.email || null; } catch { return null; }
};

let bioReady = false;   // this device can actually verify a person
async function checkBio() {
  if (!bioOrigin()) return (bioReady = false);
  try { bioReady = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
  catch { bioReady = false; }
  return bioReady;
}

async function pinHash(pin, salt, iter = PIN_ITER) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256);
  return b64(bits);
}

async function setPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  Store.setPref('lock', JSON.stringify({
    v: 1,
    salt: b64(salt),
    hash: await pinHash(pin, salt),
    iter: PIN_ITER,
    /* How many digits, so the lock screen can let itself in as the last one
       lands. A PIN's length is not a secret worth an extra tap. */
    len: pin.length,
    email: syncEmail(),
  }));
}

async function pinMatches(pin) {
  const rec = lockRecord();
  if (!rec || !canLock()) return false;
  try { return (await pinHash(pin, unb64(rec.salt), rec.iter)) === rec.hash; }
  catch { return false; }
}

function clearLock() {
  Store.setPref('lock', 'null');
  Store.setPref('lockBio', '');
}

/* ── the fingerprint ── */

async function enrolBio() {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Fellowship', id: location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: syncEmail() || 'kindred',
        displayName: 'Fellowship',
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',   // this device's own sensor, never a key on a fob
        userVerification: 'required',
        residentKey: 'discouraged',
      },
      timeout: 60000,
      attestation: 'none',
    },
  });
  if (!cred) throw new Error('nothing registered');
  Store.setPref('lockBio', b64(cred.rawId));
}

async function askBio() {
  const id = bioCredential();
  if (!id) return false;
  const got = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: unb64(id), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  return !!got;
}

/* ── the lock screen ── */

