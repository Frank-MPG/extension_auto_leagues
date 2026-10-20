importScripts('/autoreload.js'); // rechargement auto après mise à jour (cf. _shared/autoreload.js)
// Service worker : génération des logos IA via Cloudflare Workers AI.
// Le token n'est PAS dans le code (l'extension est publiée sur un dépôt GitHub public, donc lisible) :
// il est saisi une fois dans la popup (icône clé) et gardé dans chrome.storage.local (cfToken).
// Jamais transmis à la page MPG ni à un autre service que api.cloudflare.com.
const secret = async () => {
  const { cfToken } = await chrome.storage.local.get('cfToken');
  if (!cfToken) { const e = new Error('token Cloudflare non renseigné'); e.noToken = true; throw e; }
  return cfToken;
};
// Renseigner l'Account ID ici pour éviter la découverte automatique (GET /accounts)
const ACCOUNT_ID = 'ed79b995d99b621e14c2da84cecf7187';
const MODEL = '@cf/black-forest-labs/flux-1-schnell';
const CF = 'https://api.cloudflare.com/client/v4';

async function cf(path, init = {}) {
  const res = await fetch(CF + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + (await secret()), 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  let j = null; try { j = await res.json(); } catch {}
  if (!res.ok || !j || j.success === false) {
    const msg = (j && j.errors && j.errors.map(e => e.message).join(', ')) || `HTTP ${res.status}`;
    const quota = res.status === 429 || /limit|quota|neuron|exceeded|capacity/i.test(msg);
    const err = new Error(quota ? `quota Cloudflare atteint (${msg})` : `Cloudflare : ${msg}`);
    err.status = res.status; err.quota = quota;
    throw err;
  }
  return j.result;
}

async function accountId() {
  if (ACCOUNT_ID) return ACCOUNT_ID;
  const { cfAccount } = await chrome.storage.session.get('cfAccount').catch(() => ({}));
  if (cfAccount) return cfAccount;
  const accounts = await cf('/accounts?per_page=5');
  const id = accounts && accounts[0] && accounts[0].id;
  if (!id) throw new Error('Cloudflare : aucun compte accessible avec ce token (renseigner ACCOUNT_ID)');
  chrome.storage.session.set({ cfAccount: id }).catch(() => {});
  return id;
}

// ---------- Prompt : logo de club de foot imaginaire ----------
const pick = a => a[Math.floor(Math.random() * a.length)];
const ANIMALS = ['goat', 'lion', 'eagle', 'wolf', 'bull', 'fox', 'shark', 'bear', 'rooster', 'falcon', 'tiger', 'panther', 'rhino', 'owl', 'dragon', 'boar'];
const STYLES = [
  'vintage football club crest, embroidered badge look',
  'modern esports-style mascot logo, bold outlines',
  'minimalist flat vector football badge',
  'retro 80s football club emblem',
  'heraldic shield crest with a football',
  'playful cartoon mascot holding a football',
];
const COLORS = [['royal blue', 'gold'], ['crimson', 'white'], ['emerald green', 'black'], ['purple', 'orange'], ['navy', 'sky blue'], ['black', 'neon yellow'], ['teal', 'coral'], ['burgundy', 'cream']];

function buildPrompt() {
  const [c1, c2] = pick(COLORS);
  return `${pick(STYLES)} of a ${pick(ANIMALS)}, football soccer team logo, ${c1} and ${c2} color palette, ` +
    'centered symmetrical composition, clean solid background, high contrast, sharp details, no text, no letters, no words';
}

async function generateLogo() {
  const prompt = buildPrompt();
  const acc = await accountId();
  const result = await cf(`/accounts/${acc}/ai/run/${MODEL}`, { method: 'POST', body: JSON.stringify({ prompt, steps: 4 }) });
  if (!result || !result.image) throw new Error('Cloudflare : pas d\'image dans la réponse');
  return { image: result.image, mime: 'image/jpeg', prompt };
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg || msg.mpgauto !== 'aiLogo') return;
  generateLogo().then(r => reply({ ok: true, ...r })).catch(e => reply({ ok: false, error: e.message, quota: !!e.quota }));
  return true;
});
