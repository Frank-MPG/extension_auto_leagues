const $ = id => document.getElementById(id);
// Sites gérés : prod et dev (l'API correspondante est choisie par le content script, cf. src/api.js)
const SITE_ORIGINS = ['https://mpg.football', 'https://dev.mpg.football'];
// Ouverte en repli dans un panneau de la page (iframe) : on ferme via le parent
const EMBEDDED = new URLSearchParams(location.search).has('embedded');
const PARENT_ORIGIN = [...(location.ancestorOrigins || [])].find(o => SITE_ORIGINS.includes(o)) || SITE_ORIGINS[0];
function closePopup() {
  if (EMBEDDED) parent.postMessage({ mpgauto: 'closePopup' }, PARENT_ORIGIN);
  else window.close();
}
// Ouverte depuis le bouton de Mon MPG : la fenêtre prend la hauteur naturelle de l'onglet « Créer »
// (sans scroll) et la garde sur les autres onglets, dont les listes remplissent l'espace.
let reportHeight = () => {};
if (EMBEDDED) {
  document.documentElement.classList.add('embedded');
  let last = 0, raf = 0;
  const measure = () => {
    const root = document.documentElement;
    root.classList.add('measuring');               // force l'onglet Créer, hauteur naturelle
    const h = Math.ceil(document.body.getBoundingClientRect().height); // hauteur du contenu (pas du viewport)
    root.classList.remove('measuring');
    if (h && h !== last) { last = h; parent.postMessage({ mpgauto: 'popupHeight', h }, PARENT_ORIGIN); }
  };
  reportHeight = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
  addEventListener('load', reportHeight);
  new ResizeObserver(reportHeight).observe(document.getElementById('pane-create') || document.body);
}

const IMG = 'https://s3.eu-west-1.amazonaws.com/image.mpg/';
// Liste de secours (remplacée par /championships/active dès qu'un onglet MPG répond)
const FALLBACK_CHAMPS = [
  { id: 1, short: 'L1', logo: IMG + 'trophy-L1-coloredBackground-160x160.png' },
  { id: 2, short: 'PL', logo: IMG + 'trophy-PL-coloredBackground-160x160.png' },
  { id: 3, short: 'Liga', logo: IMG + 'trophy-ES-coloredBackground-160x160.png' },
  { id: 4, short: 'L2', logo: IMG + 'trophy-L2-coloredBackground-160x160.png' },
  { id: 5, short: 'Serie A', logo: IMG + 'trophy-IT-coloredBackground-160x160.png' },
  { id: 6, short: 'LDC', logo: IMG + 'trophy-LDC-coloredBackground-160x160.png' },
  { id: 7, short: 'LS', logo: IMG + 'trophy-LS-coloredBackground-160x160.png' },
];
const DEFAULTS = {
  prefix: 'Test',
  nextNum: 2,
  users: ['frank-01', 'frank-02', 'frank-03', 'frank-04', 'frank-05'],
  normal: null, // null = tous les championnats
  express: [1], // 1 = Ligue 1
  champsCache: null,
  tab: 'create',
  includeMe: true,
  mFilter: '',
};
// Réglages propres à chaque environnement (dev : clé suffixée « _dev »), avec leurs valeurs par défaut
const ENV_KEYS = ['users', 'nextNum', 'champsCache'];
const DEV_DEFAULTS = {
  users: ['user_12345001', 'user_12345002', 'user_12345003', 'user_12345004', 'user_12345005'],
};
let IS_DEV = false; // fixé à l'init d'après l'onglet MPG actif
const envKey = k => (IS_DEV && ENV_KEYS.includes(k) ? k + '_dev' : k);
const store = obj => chrome.storage.local.set(Object.fromEntries(Object.entries(obj).map(([k, v]) => [envKey(k), v])));
async function loadState() {
  const keys = Object.keys(DEFAULTS);
  const r = await chrome.storage.local.get(keys.map(envKey));
  const defaults = IS_DEV ? { ...DEFAULTS, ...DEV_DEFAULTS } : DEFAULTS;
  return Object.fromEntries(keys.map(k => [k, r[envKey(k)] !== undefined ? r[envKey(k)] : defaults[k]]));
}
const pad = n => String(n).padStart(2, '0');
const plural = (n, s, p = s + 's') => `${n} ${n > 1 ? p : s}`;
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c != null) e.append(c);
  return e;
};
function showError(id, text) { const a = $(id); a.hidden = !text; a.textContent = text || ''; }

let state = { ...DEFAULTS };
let champs = FALLBACK_CHAMPS;
let normal = new Set(), express = new Set(), users = [];
let mpgTab = null;

async function activeMpgTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab && SITE_ORIGINS.some(o => (tab.url || '').startsWith(o + '/')) ? tab : null;
}
async function send(msg) {
  if (!mpgTab) throw new Error('Ouvre un onglet mpg.football ou dev.mpg.football d\'abord.');
  try { return await chrome.tabs.sendMessage(mpgTab.id, msg); }
  catch { throw new Error('Recharge l\'onglet MPG (extension installée ou mise à jour).'); }
}
function setConn(ok, text) {
  $('conn').className = 'sub ' + (ok ? 'ok' : 'ko');
  $('connText').textContent = text;
}

// =====================================================================
// Onglets
// =====================================================================
let mercatoLoaded = false, visLoaded = false;
function showTab(name) {
  document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + name));
  chrome.storage.local.set({ tab: name });
  reportHeight();
  if (name === 'mercato' && !mercatoLoaded) loadMercato();
  if (name === 'vis' && !visLoaded) loadVis();
}
document.querySelectorAll('.seg button').forEach(b => { b.onclick = () => showTab(b.dataset.tab); });

// =====================================================================
// Créer
// =====================================================================
const saveSel = () => chrome.storage.local.set({ normal: [...normal], express: [...express] });

function renderChamps() {
  const box = $('champs'); box.textContent = '';
  for (const c of champs) {
    const on = normal.has(c.id);
    const logo = el('button', { type: 'button', className: 'logo', title: `${on ? 'Retirer' : 'Ajouter'} la ligue ${c.short}` });
    const ph = () => el('div', { className: 'ph', textContent: c.short });
    if (c.logo) {
      const img = el('img', { src: c.logo, alt: c.short });
      img.onerror = () => img.replaceWith(ph());
      logo.append(img);
    } else logo.append(ph());
    logo.onclick = () => { on ? normal.delete(c.id) : normal.add(c.id); saveSel(); renderChamps(); renderSummary(); };

    const check = el('span', { className: 'check' });
    check.innerHTML = '<svg viewBox="0 0 12 12" width="8" height="8"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    const xp = el('button', {
      type: 'button', className: 'xp' + (express.has(c.id) ? ' on' : ''),
      textContent: '⚡Express', title: `Créer aussi « ${c.short} Express » (matchs aller uniquement)`,
    });
    xp.onclick = () => { express.has(c.id) ? express.delete(c.id) : express.add(c.id); saveSel(); renderChamps(); renderSummary(); };

    box.append(el('div', { className: 'tile' + (on ? ' on' : '') }, check, logo, el('div', { className: 'name', textContent: c.short }), xp));
  }
}

// Joueurs : { ident (saisie : pseudo, email ou userId), id?, username?, status?: 'pending' | 'unverified' }
// On affiche le pseudo ; l'id sert aux invitations. Ancien format (chaînes) migré à la lecture.
const normUser = u => (typeof u === 'string' ? { ident: u } : { ident: u.ident || u.id, id: u.id, username: u.username });
const userLabel = u => u.username || u.ident;
const sameUser = (a, b) => (a.id && b.id && a.id === b.id) || a.ident.toLowerCase() === b.ident.toLowerCase()
  || (!!a.username && a.username.toLowerCase() === b.ident.toLowerCase());

function renderUsers() {
  const box = $('userChips');
  box.querySelectorAll('.uchip').forEach(n => n.remove());
  const input = $('userInput');
  users.forEach((u, i) => {
    const label = userLabel(u);
    const x = el('button', { type: 'button', textContent: '×', title: `Retirer ${label}`, ariaLabel: `Retirer ${label}` });
    x.onclick = e => { e.stopPropagation(); users.splice(i, 1); saveUsers(); };
    const chip = el('span', { className: 'uchip' + (u.status ? ' ' + u.status : '') });
    if (u.status === 'pending') chip.append(el('i', { className: 'uspin' }));
    chip.append(el('span', { className: 'uname', textContent: label }), x);
    chip.title = u.status === 'pending' ? `${u.ident} : recherche…`
      : u.status === 'unverified' ? `${u.ident} : non vérifié (onglet MPG non connecté), résolu au lancement`
      : [u.username, u.id, u.ident !== u.id && u.ident !== u.username ? `saisi : ${u.ident}` : ''].filter(Boolean).join('\n');
    box.insertBefore(chip, input);
  });
  const n = users.length + 1;
  $('playersCount').textContent = `${plural(n, 'joueur')} par ligue`;
  renderSummary();
}
const storedUsers = () => users.map(({ ident, id, username }) => (id ? { ident, id, username: username || '' } : { ident }));
function saveUsers() { store({ users: storedUsers() }); renderUsers(); }

// Résout (via l'onglet MPG) les joueurs sans id ; retire les introuvables et le signale.
let resolving = 0;
async function resolveUsers(targets) {
  targets = targets.filter(u => !u.id);
  if (!targets.length) return;
  targets.forEach(u => { u.status = 'pending'; });
  renderUsers();
  resolving++; renderSummary();
  try {
    const r = await send({ mpgauto: 'resolveUsers', idents: targets.map(u => u.ident) });
    if (!r || !r.ok) throw new Error((r && r.error) || 'Pas de réponse de l\'onglet MPG.');
    const missing = [];
    r.list.forEach((res, i) => {
      const u = targets[i];
      if (!users.includes(u)) return; // retiré entre-temps
      if (res.ok) {
        Object.assign(u, { id: res.id, username: res.username || '' }); delete u.status;
        if (users.some(o => o !== u && o.id === u.id)) users.splice(users.indexOf(u), 1); // déjà dans la liste
      } else if (res.auth) u.status = 'unverified';
      else { missing.push(u.ident); users.splice(users.indexOf(u), 1); }
    });
    if (missing.length) showError('msg', `Joueur introuvable : ${missing.join(', ')}`);
  } catch {
    targets.forEach(u => { if (u.status === 'pending') u.status = 'unverified'; });
  } finally {
    resolving--;
    saveUsers();
  }
}

function addUsers(text) {
  const add = [];
  for (const ident of text.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)) {
    const u = { ident };
    if (!users.some(o => sameUser(o, u)) && !add.some(o => sameUser(o, u))) add.push(u);
  }
  if (!add.length) return;
  showError('msg', '');
  users.push(...add); saveUsers();
  resolveUsers(add);
}
$('userChips').onclick = () => $('userInput').focus();
$('userInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); addUsers(e.target.value); e.target.value = ''; }
  else if (e.key === 'Backspace' && !e.target.value && users.length) { users.pop(); saveUsers(); }
});
$('userInput').addEventListener('paste', e => { e.preventDefault(); addUsers(e.clipboardData.getData('text')); });
$('userInput').addEventListener('blur', e => { if (e.target.value.trim()) { addUsers(e.target.value); e.target.value = ''; } });

function wantedNames() {
  const names = [];
  for (const c of champs) {
    if (normal.has(c.id)) names.push(c.short);
    if (express.has(c.id)) names.push(c.short + ' Express');
  }
  return names;
}
function renderSummary() {
  const prefix = $('prefix').value.trim() || 'Test', num = pad(+$('num').value || 1);
  const names = wantedNames();
  $('namePreview').textContent = `${prefix} ${num} - ${names[0] || 'L1'}`;
  $('namePreview').title = names.map(n => `${prefix} ${num} - ${n}`).join('\n');
  const players = users.length + 1, even = players >= 2 && players % 2 === 0;
  $('summary').innerHTML = '';
  $('summary').append(el('span', {}, el('b', { textContent: plural(names.length, 'ligue') }), ` · ${plural(players, 'joueur')}`));
  const warn = !names.length ? 'Aucun championnat' : !even ? 'Nombre de joueurs impair' : '';
  if (warn) $('summary').append(el('span', { className: 'warn', textContent: warn }));
  $('go').disabled = !names.length || !even || resolving > 0;
}
for (const id of ['prefix', 'num']) $(id).addEventListener('input', () => { renderSummary(); store({ prefix: $('prefix').value.trim() || 'Test', nextNum: Math.max(1, +$('num').value || 1) }); });
$('numDown').onclick = () => { $('num').value = Math.max(1, (+$('num').value || 1) - 1); $('num').dispatchEvent(new Event('input')); };
$('numUp').onclick = () => { $('num').value = (+$('num').value || 0) + 1; $('num').dispatchEvent(new Event('input')); };
$('all').onclick = () => { normal = new Set(champs.map(c => c.id)); saveSel(); renderChamps(); renderSummary(); };
$('none').onclick = () => { normal.clear(); express.clear(); saveSel(); renderChamps(); renderSummary(); };

$('go').onclick = async () => {
  showError('msg', '');
  const ids = new Set(champs.map(c => c.id));
  const config = {
    prefix: $('prefix').value.trim() || 'Test',
    num: Math.max(1, parseInt($('num').value, 10) || 1),
    users: storedUsers(), // { ident, id, username } ; sans id = résolu au lancement
    normal: [...normal].filter(id => ids.has(id)),
    express: [...express].filter(id => ids.has(id)),
  };
  if (!config.users.length) return showError('msg', 'Ajoute au moins un joueur.');
  await store({ prefix: config.prefix, users: config.users, nextNum: config.num });
  $('go').disabled = true;
  try {
    const r = await send({ mpgauto: 'run', config });
    if (!r || !r.ok) throw new Error((r && r.error) || 'Pas de réponse de l\'onglet MPG.');
    closePopup(); // la progression s'affiche dans la page
  } catch (e) { showError('msg', e.message); renderSummary(); }
};

// =====================================================================
// Mercato
// =====================================================================
let mLeagues = [];
let mChecked = new Set();
const fmtIn = s => { const m = Math.round(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)}`; };
const shortOf = id => (champs.find(c => c.id === id) || {}).short || '';
const selectable = l => !l.opensIn;
const visibleLeagues = () => {
  const q = $('filter').value.trim().toLowerCase();
  return mLeagues.filter(l => !q || l.name.toLowerCase().includes(q));
};

function renderMercato() {
  const box = $('leagues'); box.textContent = '';
  const vis = visibleLeagues();
  if (!mLeagues.length) box.append(el('div', { className: 'empty', textContent: 'Aucune ligue en mercato' }));
  else if (!vis.length) box.append(el('div', { className: 'empty', textContent: 'Aucune ligue ne correspond au filtre' }));
  for (const l of vis) {
    const input = el('input', { type: 'checkbox', checked: mChecked.has(l.leagueId), disabled: !selectable(l) });
    input.onchange = () => { input.checked ? mChecked.add(l.leagueId) : mChecked.delete(l.leagueId); updateMercatoButtons(); };
    const sub = el('div', { className: 'row-sub' });
    const short = shortOf(l.championshipId);
    if (short) sub.append(el('span', { className: 'tag', textContent: short }));
    if (l.opensIn) sub.append(el('span', { textContent: `Ouvre dans ${fmtIn(l.opensIn)}` }));
    else {
      const pct = l.total ? Math.round(100 * l.validated / l.total) : 0;
      const bar = el('span', { className: 'progress' + (pct >= 100 ? ' done' : '') }, el('i'));
      bar.firstChild.style.width = pct + '%';
      sub.append(el('span', { textContent: `Tour ${l.turn}` }), bar, el('span', { textContent: `${l.validated}/${l.total}` }));
      sub.title = `Tour ${l.turn} : ${l.validated} équipe(s) sur ${l.total} ont validé`;
    }
    const row = el('label', { className: 'row' + (selectable(l) ? '' : ' off') },
      el('span', { className: 'cb' }, input, el('span')),
      el('div', { className: 'row-main' }, el('div', { className: 'row-name', textContent: l.name, title: l.name }), sub));
    box.append(row);
  }
  updateMercatoButtons();
}

function updateMercatoButtons() {
  const ok = new Set(mLeagues.filter(selectable).map(l => l.leagueId));
  mChecked = new Set([...mChecked].filter(id => ok.has(id)));
  const n = mChecked.size;
  $('mgo').disabled = $('mfinish').disabled = !n;
  $('mcount').innerHTML = '';
  $('mcount').append(el('b', { textContent: plural(mLeagues.length, 'ligue') }), ' en mercato', n ? ` · ${n} cochée${n > 1 ? 's' : ''}` : '');
}

async function loadMercato() {
  mercatoLoaded = true;
  showError('mmsg', '');
  $('mreload').classList.add('spin');
  $('leagues').replaceChildren(el('div', { className: 'empty', textContent: 'Chargement…' }));
  try {
    const r = await send({ mpgauto: 'mercatoLeagues' });
    if (!r || !r.ok) throw new Error((r && r.error) || 'Pas de réponse de l\'onglet MPG.');
    mLeagues = r.list;
    renderMercato();
  } catch (e) {
    $('leagues').replaceChildren(el('div', { className: 'empty', textContent: 'Impossible de charger les ligues' }));
    showError('mmsg', e.message);
  } finally { $('mreload').classList.remove('spin'); }
}

$('includeMe').onchange = () => chrome.storage.local.set({ includeMe: $('includeMe').checked });
$('filter').addEventListener('input', () => { chrome.storage.local.set({ mFilter: $('filter').value }); renderMercato(); });
$('mall').onclick = () => { visibleLeagues().filter(selectable).forEach(l => mChecked.add(l.leagueId)); renderMercato(); };
$('mnone').onclick = () => { mChecked.clear(); renderMercato(); };
$('mreload').onclick = () => loadMercato();

async function startMercato(finish) {
  showError('mmsg', '');
  const leagues = mLeagues.filter(l => mChecked.has(l.leagueId))
    .map(({ leagueId, divisionId, name, championshipId }) => ({ leagueId, divisionId, name, championshipId }));
  if (!leagues.length) return;
  $('mgo').disabled = $('mfinish').disabled = true;
  try {
    const r = await send({ mpgauto: 'mercato', config: { leagues, includeMe: $('includeMe').checked, finish } });
    if (!r || !r.ok) throw new Error((r && r.error) || 'Pas de réponse de l\'onglet MPG.');
    closePopup();
  } catch (e) { showError('mmsg', e.message); updateMercatoButtons(); }
}
$('mgo').onclick = () => startMercato(false);
$('mfinish').onclick = () => startMercato(true);


// =====================================================================
// Ligues : organiser Mon MPG (ordre + affichées / masquées)
// Tout est en brouillon ; « Enregistrer » envoie un seul PATCH /user-contests/organize.
// =====================================================================
const vById = new Map();        // id → { id, kind, name, status, championshipId, createdAt, hidden (brouillon), srvHidden }
let vOrder = [], vSrvOrder = []; // ids affichés hors épinglés, dans l'ordre (brouillon / serveur)
let vPinned = new Set();
let vView = 'shown';            // shown | hidden | all
const vFilters = new Set();     // league, tournament, prep, mercato, live, done
const BUCKET = {
  league: { 1: 'prep', 2: 'prep', 3: 'mercato', 4: 'live', 5: 'done' },
  tournament: { 1: 'prep', 2: 'live', 3: 'done', '-1': 'done' },
};
const BUCKET_LABEL = { prep: 'En préparation', mercato: 'Mercato', live: 'En cours', done: 'Terminée' };
const BUCKET_RANK = { mercato: 0, prep: 1, live: 2, done: 3 };
const DOT = { prep: 's1', mercato: 's3', live: 's4', done: 's5' };
const bucketOf = it => (BUCKET[it.kind] || {})[it.status] || 'live';
const EYE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A16.8 16.8 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const GRIP = '<svg viewBox="0 0 10 16" width="9" height="14"><g fill="currentColor"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></g></svg>';
const PIN = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M9 3h6l-1 6 4 4H6l4-4-1-6ZM12 13v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const vFiltered = () => !!$('vfilter').value.trim() || vFilters.size > 0;
const dragEnabled = () => vView === 'shown' && !vFiltered();
function vMatches(it, ignoreView) {
  const q = $('vfilter').value.trim().toLowerCase();
  if (q && !it.name.toLowerCase().includes(q)) return false;
  if (!ignoreView && vView === 'shown' && it.hidden) return false;
  if (!ignoreView && vView === 'hidden' && !it.hidden) return false;
  const kinds = ['league', 'tournament'].filter(k => vFilters.has(k));
  if (kinds.length && !kinds.includes(it.kind)) return false;
  const buckets = ['prep', 'mercato', 'live', 'done'].filter(b => vFilters.has(b));
  if (buckets.length && !buckets.includes(bucketOf(it))) return false;
  return true;
}
const byRecent = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));
// Liste dans l'ordre d'affichage : épinglées, ordre de Mon MPG, puis masquées (plus récentes d'abord)
function vOrdered() {
  const shownPinned = [...vPinned].map(id => vById.get(id)).filter(it => it && !it.hidden);
  const shown = vOrder.map(id => vById.get(id)).filter(Boolean);
  const hidden = [...vById.values()].filter(it => it.hidden).sort(byRecent);
  return [...shownPinned, ...shown, ...hidden];
}
const vVisible = () => vOrdered().filter(it => vMatches(it));
function vDirtyCount() {
  let n = 0;
  for (const it of vById.values()) if (it.hidden !== it.srvHidden) n++;
  const orderChanged = vOrder.length !== vSrvOrder.length || vOrder.some((id, i) => id !== vSrvOrder[i]);
  return { hiddenChanges: n, orderChanged };
}

function setDraftHidden(items, hidden) {
  for (const it of items) {
    if (it.hidden === hidden) continue;
    it.hidden = hidden;
    if (vPinned.has(it.id)) continue;
    if (hidden) vOrder = vOrder.filter(id => id !== it.id);
    else if (!vOrder.includes(it.id)) vOrder.unshift(it.id); // ré-affichée : en haut de Mon MPG
  }
}

function renderVis() {
  const all = [...vById.values()];
  const base = all.filter(it => vMatches(it, true));
  $('nShown').textContent = base.filter(i => !i.hidden).length;
  $('nHidden').textContent = base.filter(i => i.hidden).length;
  $('nAll').textContent = base.length;
  document.querySelectorAll('#vseg button').forEach(b => b.classList.toggle('on', b.dataset.v === vView));

  const chips = $('vchips'); chips.textContent = '';
  const defs = [['league', 'Ligues', i => i.kind === 'league'], ['tournament', 'Tournois', i => i.kind === 'tournament'],
    ...['prep', 'mercato', 'live', 'done'].map(b => [b, BUCKET_LABEL[b].replace('Terminée', 'Terminées'), i => bucketOf(i) === b])];
  for (const [key, label, pred] of defs) {
    const n = all.filter(pred).length;
    if (!n) continue;
    const c = el('button', { type: 'button', className: 'fchip' + (vFilters.has(key) ? ' on' : '') }, label, el('span', { className: 'n', textContent: ' ' + n }));
    c.onclick = () => { vFilters.has(key) ? vFilters.delete(key) : vFilters.add(key); chrome.storage.local.set({ vFilters: [...vFilters] }); renderVis(); };
    chips.append(c);
  }

  const box = $('vlist');
  const keepScroll = box.scrollTop;
  box.textContent = '';
  const list = vVisible();
  const canDrag = dragEnabled();
  if (!all.length) box.append(el('div', { className: 'empty', textContent: 'Aucune compétition' }));
  else if (!list.length) box.append(el('div', { className: 'empty', textContent: vView === 'hidden' ? 'Aucune compétition masquée ici' : 'Aucune compétition ne correspond' }));
  for (const it of list) {
    const b = bucketOf(it), pinned = vPinned.has(it.id);
    const sub = el('div', { className: 'row-sub' });
    const short = shortOf(it.championshipId);
    if (short) sub.append(el('span', { className: 'tag', textContent: short }));
    sub.append(el('span', { className: 'st-dot ' + DOT[b] }), el('span', { textContent: `${it.kind === 'tournament' ? 'Tournoi' : 'Ligue'} · ${BUCKET_LABEL[b]}` }));
    const eye = el('button', { type: 'button', className: 'eye' + (it.hidden ? ' off' : ''), title: it.hidden ? 'Masquée : cliquer pour l\'afficher' : 'Affichée : cliquer pour la masquer' });
    eye.innerHTML = it.hidden ? EYE_OFF : EYE;
    eye.onclick = () => { setDraftHidden([it], !it.hidden); renderVis(); };
    const changed = it.hidden !== it.srvHidden;
    const row = el('div', { className: 'row vrow' + (it.hidden ? ' hid' : '') + (changed ? ' changed' : '') });
    row.dataset.id = it.id;
    if (vView !== 'hidden' && !it.hidden) {
      const h = el('button', { type: 'button', className: 'handle' + (pinned ? ' locked' : '') });
      if (pinned) { h.innerHTML = PIN; h.title = 'Épinglée par MPG : toujours en tête'; h.tabIndex = -1; }
      else if (canDrag) { h.innerHTML = GRIP; h.title = 'Glisser pour déplacer (ou flèches ↑ ↓)'; row.dataset.drag = '1'; bindDrag(h, row); }
      else { h.innerHTML = GRIP; h.disabled = true; h.style.opacity = .3; h.style.cursor = 'default'; h.title = 'Retire la recherche et les filtres pour réordonner'; }
      row.append(h);
    }
    row.append(el('div', { className: 'row-main' }, el('div', { className: 'row-name', textContent: it.name, title: it.name }), sub), eye);
    box.append(row);
  }
  box.scrollTop = keepScroll;

  $('vcount').innerHTML = '';
  $('vcount').append(el('b', { textContent: plural(list.length, 'compétition') }));
  $('vhint').textContent = vView === 'shown'
    ? (canDrag ? 'Glisse les lignes pour réordonner Mon MPG, ou utilise « Trier ».' : 'Réordonnement désactivé tant qu\'une recherche ou un filtre est actif.')
    : '';
  const toHide = list.filter(i => !i.hidden).length, toShow = list.filter(i => i.hidden).length;
  $('vhideAll').disabled = !toHide; $('vshowAll').disabled = !toShow;
  $('vhideAll').textContent = toHide ? `Masquer (${toHide})` : 'Masquer';
  $('vshowAll').textContent = toShow ? `Afficher (${toShow})` : 'Afficher';

  const { hiddenChanges, orderChanged } = vDirtyCount();
  const parts = [];
  if (orderChanged) parts.push('ordre modifié');
  if (hiddenChanges) parts.push(plural(hiddenChanges, 'visibilité modifiée', 'visibilités modifiées'));
  $('vsave').hidden = !parts.length;
  $('vdirty').textContent = parts.length ? parts[0][0].toUpperCase() + parts.join(' · ').slice(1) : '';
}

// ---------- Glisser-déposer (pointeur) ----------
function bindDrag(handle, row) {
  handle.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const i = vOrder.indexOf(row.dataset.id), j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (i < 0 || j < 0 || j >= vOrder.length) return;
    [vOrder[i], vOrder[j]] = [vOrder[j], vOrder[i]];
    renderVis();
    $('vlist').querySelector(`.row[data-id="${CSS.escape(row.dataset.id)}"] .handle`)?.focus();
  });
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    const list = $('vlist');
    const rows = [...list.querySelectorAll('.row.vrow[data-drag]')];
    const from = rows.indexOf(row);
    if (from < 0) return;
    const h = row.getBoundingClientRect().height;
    const startY = e.clientY, startScroll = list.scrollTop;
    let to = from, lastY = e.clientY, raf = 0;
    try { handle.setPointerCapture(e.pointerId); } catch {}
    list.classList.add('sorting');
    row.classList.add('dragging');
    rows.forEach(r => { if (r !== row) r.classList.add('slide'); });
    const update = () => {
      const dy = lastY - startY + (list.scrollTop - startScroll);
      row.style.transform = `translateY(${dy}px)`;
      to = Math.max(0, Math.min(rows.length - 1, from + Math.round(dy / h)));
      rows.forEach((r, i) => {
        if (r === row) return;
        let s = 0;
        if (from < to && i > from && i <= to) s = -h;
        else if (to < from && i >= to && i < from) s = h;
        r.style.transform = s ? `translateY(${s}px)` : '';
      });
    };
    const autoScroll = () => {
      const lr = list.getBoundingClientRect(), edge = 28;
      if (lastY < lr.top + edge) list.scrollTop -= Math.ceil((lr.top + edge - lastY) / 3);
      else if (lastY > lr.bottom - edge) list.scrollTop += Math.ceil((lastY - (lr.bottom - edge)) / 3);
      update();
      raf = requestAnimationFrame(autoScroll);
    };
    raf = requestAnimationFrame(autoScroll);
    const move = ev => { lastY = ev.clientY; };
    const up = () => {
      cancelAnimationFrame(raf);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      list.classList.remove('sorting');
      if (to !== from) {
        const id = row.dataset.id;
        const ids = rows.map(r => r.dataset.id); // = vOrder (pas de filtre actif)
        ids.splice(from, 1); ids.splice(to, 0, id);
        vOrder = ids;
      }
      renderVis();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
}

// ---------- Tris rapides ----------
function sortOrder(kind) {
  const items = vOrder.map(id => vById.get(id));
  const pos = new Map(vOrder.map((id, i) => [id, i]));
  const cmp = {
    status: (a, b) => BUCKET_RANK[bucketOf(a)] - BUCKET_RANK[bucketOf(b)] || byRecent(a, b),
    recent: byRecent,
    name: (a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true }),
    champ: (a, b) => (a.championshipId || 99) - (b.championshipId || 99) || byRecent(a, b),
    kind: (a, b) => (a.kind === b.kind ? pos.get(a.id) - pos.get(b.id) : a.kind === 'league' ? -1 : 1),
  }[kind];
  vOrder = items.sort(cmp).map(it => it.id);
  renderVis();
}
$('vsortBtn').onclick = e => {
  e.stopPropagation();
  const m = $('vsortMenu'); m.hidden = !m.hidden; $('vsortBtn').setAttribute('aria-expanded', String(!m.hidden));
};
$('vsortMenu').querySelectorAll('button').forEach(b => { b.onclick = () => { $('vsortMenu').hidden = true; sortOrder(b.dataset.sort); }; });
document.addEventListener('click', e => { if (!e.target.closest('.menu-wrap')) $('vsortMenu').hidden = true; });

// ---------- Chargement / enregistrement ----------
async function loadVis() {
  visLoaded = true;
  showError('vmsg', '');
  $('vreload').classList.add('spin');
  $('vlist').replaceChildren(el('div', { className: 'empty', textContent: 'Chargement…' }));
  try {
    const r = await send({ mpgauto: 'competitions' });
    if (!r || !r.ok) throw new Error((r && r.error) || 'Pas de réponse de l\'onglet MPG.');
    vById.clear();
    for (const it of r.list) vById.set(it.id, { ...it, srvHidden: it.hidden });
    vPinned = new Set((r.pinned || []).filter(id => vById.has(id)));
    const seen = new Set();
    vSrvOrder = (r.order || []).filter(id => vById.has(id) && !vPinned.has(id) && !vById.get(id).hidden && !seen.has(id) && seen.add(id));
    // Compétitions affichées absentes de l'ordre renvoyé : à la fin, plus récentes d'abord
    [...vById.values()].filter(it => !it.hidden && !vPinned.has(it.id) && !seen.has(it.id)).sort(byRecent).forEach(it => vSrvOrder.push(it.id));
    vOrder = [...vSrvOrder];
    renderVis();
  } catch (e) {
    $('vlist').replaceChildren(el('div', { className: 'empty', textContent: 'Impossible de charger les compétitions' }));
    showError('vmsg', e.message);
  } finally { $('vreload').classList.remove('spin'); }
}

$('vcommit').onclick = async () => {
  showError('vmsg', '');
  $('vcommit').disabled = true; $('vcommit').textContent = 'Enregistrement…';
  try {
    const hiddenIds = [...vById.values()].filter(it => it.hidden).map(it => it.id);
    const r = await send({ mpgauto: 'organize', orderedContestsIds: vOrder, hiddenContestsIds: hiddenIds });
    if (!r || !r.ok) throw new Error((r && r.error) || 'Échec de l\'enregistrement');
    for (const it of vById.values()) it.srvHidden = it.hidden;
    vSrvOrder = [...vOrder];
    renderVis();
    $('vcommit').textContent = 'Enregistré ✓';
    setTimeout(async () => { try { await send({ mpgauto: 'reloadPage' }); } catch {} }, 500); // Mon MPG se met à jour
  } catch (e) { showError('vmsg', e.message); }
  finally { setTimeout(() => { $('vcommit').disabled = false; $('vcommit').textContent = 'Enregistrer'; }, 900); }
};
$('vcancel').onclick = () => {
  for (const it of vById.values()) it.hidden = it.srvHidden;
  vOrder = [...vSrvOrder];
  renderVis();
};

document.querySelectorAll('#vseg button').forEach(b => { b.onclick = () => { vView = b.dataset.v; chrome.storage.local.set({ vView }); renderVis(); }; });
$('vfilter').addEventListener('input', renderVis);
$('vreload').onclick = () => {
  const { hiddenChanges, orderChanged } = vDirtyCount();
  if ((hiddenChanges || orderChanged) && !confirm('Abandonner les modifications non enregistrées ?')) return;
  loadVis();
};
$('vhideAll').onclick = () => { setDraftHidden(vVisible(), true); renderVis(); };
$('vshowAll').onclick = () => { setDraftHidden(vVisible(), false); renderVis(); };
chrome.storage.local.get(['vView', 'vFilters']).then(r => {
  if (['shown', 'hidden', 'all'].includes(r.vView)) vView = r.vView;
  (r.vFilters || []).forEach(f => vFilters.add(f));
});

// =====================================================================
// Init
// =====================================================================
(async () => {
  mpgTab = await activeMpgTab();
  const origin = mpgTab ? new URL(mpgTab.url).origin : EMBEDDED ? PARENT_ORIGIN : SITE_ORIGINS[0];
  IS_DEV = origin === 'https://dev.mpg.football';
  const host = new URL(origin).hostname;
  document.documentElement.classList.toggle('env-dev', IS_DEV);
  $('envBadge').hidden = !IS_DEV;
  state = await loadState();
  if (state.champsCache && state.champsCache.length) champs = state.champsCache;
  $('prefix').value = state.prefix;
  $('num').value = state.nextNum;
  users = (state.users || []).map(normUser);
  normal = new Set(state.normal || champs.map(c => c.id));
  express = new Set(state.express);
  $('includeMe').checked = state.includeMe !== false;
  $('filter').value = state.mFilter || '';
  renderChamps(); renderUsers(); reportHeight();
  showTab(['mercato', 'vis'].includes(state.tab) ? state.tab : 'create');
  if (!mpgTab) { setConn(false, 'Ouvre un onglet mpg.football ou dev.mpg.football'); return; }
  try {
    const r = await chrome.tabs.sendMessage(mpgTab.id, { mpgauto: 'championships' });
    if (r && r.ok && r.list.length) {
      setConn(true, `Connecté à ${host}`);
      const known = new Set(champs.map(c => c.id));
      champs = r.list;
      if (!state.normal) normal = new Set(champs.map(c => c.id));
      else champs.forEach(c => { if (!known.has(c.id)) normal.add(c.id); });
      store({ champsCache: champs });
      renderChamps(); renderSummary(); reportHeight();
      if (mLeagues.length) renderMercato();
      if (vById.size) renderVis();
      resolveUsers(users); // pseudos des joueurs enregistrés sans (ex. anciens userId)
    } else setConn(false, (r && r.error) || 'Session MPG introuvable');
  } catch { setConn(false, 'Recharge l\'onglet MPG'); }
})();

// =====================================================================
// Token Cloudflare (logos IA) : saisi ici, gardé dans chrome.storage.local
// =====================================================================
(() => {
  const btn = $('aiKeyBtn'), pop = $('aiKeyPop');
  const refresh = async () => {
    const { cfToken } = await chrome.storage.local.get('cfToken');
    $('aiKeyState').textContent = cfToken
      ? 'Token enregistré : 1 ligue sur 3 reçoit un logo généré par IA.'
      : 'Aucun token : les ligues reçoivent un logo proposé par MPG.';
    $('aiKeyDel').hidden = !cfToken;
    btn.style.color = cfToken ? 'var(--success)' : '';
  };
  const toggle = (open) => {
    pop.hidden = !open; btn.setAttribute('aria-expanded', String(open));
    if (open) { $('aiKey').value = ''; refresh(); $('aiKey').focus(); }
  };
  btn.onclick = (e) => { e.stopPropagation(); toggle(pop.hidden); };
  pop.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => toggle(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { e.stopPropagation(); toggle(false); } }, true);
  $('aiKeySave').onclick = async () => {
    const v = $('aiKey').value.trim();
    if (!v) return $('aiKey').focus();
    await chrome.storage.local.set({ cfToken: v, aiBlockedUntil: 0 });
    toggle(false); refresh();
  };
  $('aiKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('aiKeySave').onclick(); });
  $('aiKeyDel').onclick = async () => { await chrome.storage.local.remove('cfToken'); $('aiKey').value = ''; refresh(); };
  refresh();
})();
