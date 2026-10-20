// Orchestration : création des ligues → invitations → acceptation (view-as) → lancement.
// Déclenché par le popup ; tourne dans l'onglet MPG et affiche sa progression dans un panneau.
(() => {
  if (window.top !== window) return;
  // Logos proposés par le site à la création d'une ligue (leagueLogoList du bundle MPG)
  const S3 = 'https://s3.eu-west-1.amazonaws.com/image.mpg/';
  const PRESET_LOGOS = [
    'Ligue_1-750x750.jpeg', 'Ligue_2-750x750.jpeg', 'Ligue_3-750x750.jpeg', 'Ligue_4-750x750.jpeg', 'Ligue_5-750x750.jpeg',
    'Doue%CC%81_320x320.png', 'Akliouche_320x320.png', 'Chevalier_320x320.png', 'Zizou_320x320.png', 'Henry_320x320.png',
    'image_ligue_1.png', 'image_ligue_2.png', 'image_ligue_3.png', 'image_ligue_4.png', 'image_ligue_5.png',
  ].map(f => S3 + f);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pad = n => String(n).padStart(2, '0');
  let running = false;

  // ---------- Panneau de progression (shadow DOM, isolé du style de la page) ----------
  let panel, list, title, sub, root;
  const ICONS = {
    ok: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M3.5 8.3 6.6 11.2 12.5 4.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    err: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    warn: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M8 4v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="12" r="1.2" fill="currentColor"/></svg>',
    info: '<svg viewBox="0 0 16 16" width="12" height="12"><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
  };
  function ensurePanel() {
    if (panel && panel.isConnected) return;
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host{all:initial}
      *{box-sizing:border-box}
      .p{width:392px;max-height:min(560px,70vh);display:flex;flex-direction:column;overflow:hidden;
         background:#111318;color:#eceef2;border:1px solid #2a2f38;border-radius:14px;
         box-shadow:0 24px 60px rgba(0,0,0,.55),0 2px 8px rgba(0,0,0,.3);
         font:12.5px/1.45 -apple-system,BlinkMacSystemFont,"Inter","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
      .h{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 14px;border-bottom:1px solid #2a2f38;background:#181b21}
      .st{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;flex-shrink:0;background:rgba(88,101,242,.16);color:#8f99ff}
      .st.done{background:rgba(52,211,153,.14);color:#34d399}.st.warn{background:rgba(251,191,36,.14);color:#fbbf24}.st.err{background:rgba(248,113,113,.14);color:#f87171}
      .st svg{width:15px;height:15px}
      .spin{width:14px;height:14px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:r .7s linear infinite}
      @keyframes r{to{transform:rotate(360deg)}}
      .tt{flex:1;min-width:0}
      .t{font-weight:650;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .s{color:#8b93a1;font-size:11.5px}
      .b{width:26px;height:26px;display:grid;place-items:center;border:0;border-radius:7px;background:none;color:#8b93a1;cursor:pointer}
      .b:hover{background:#272c35;color:#eceef2}.b:disabled{opacity:.35;cursor:default;background:none}
      ul{list-style:none;margin:0;padding:6px 0 10px;overflow:auto}
      ul::-webkit-scrollbar{width:8px}ul::-webkit-scrollbar-thumb{background:#363c47;border-radius:8px;border:2px solid #111318}
      .p.min ul{display:none}.p.min .h{border-bottom:0}
      li{display:flex;gap:8px;align-items:flex-start;padding:3px 14px}
      li .i{width:16px;height:18px;display:grid;place-items:center;flex-shrink:0;color:#5d6472}
      li.ok .i{color:#34d399}li.err .i{color:#f87171}li.warn .i{color:#fbbf24}
      li.err .x{color:#fca5a5}li.warn .x{color:#fde68a}
      li .x{min-width:0;overflow-wrap:anywhere}
      li.step{margin-top:8px;padding-top:8px;border-top:1px solid #20242c;font-size:10.5px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:#8b93a1}
      li.step:first-child{margin-top:0;border-top:0;padding-top:4px}
      a{color:#8f99ff;text-decoration:none;font-weight:600}a:hover{text-decoration:underline}
      @media (prefers-reduced-motion:reduce){.spin{animation:none}}
    </style>
    <div class="p" id="p">
      <div class="h">
        <div class="st" id="st"><div class="spin"></div></div>
        <div class="tt"><div class="t" id="t">Tools</div><div class="s" id="s">En cours…</div></div>
        <button class="b" id="m" title="Réduire"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 8h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
        <button class="b" id="x" title="Fermer"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      </div>
      <ul id="l"></ul>
    </div>`;
    list = root.getElementById('l'); title = root.getElementById('t'); sub = root.getElementById('s');
    root.getElementById('x').onclick = () => { if (!running) host.remove(); };
    root.getElementById('m').onclick = () => root.getElementById('p').classList.toggle('min');
    document.documentElement.append(host);
    panel = host;
  }
  function setRunning(v) {
    running = v;
    ensurePanel();
    root.getElementById('x').disabled = v;
    const st = root.getElementById('st');
    if (v) { st.className = 'st'; st.innerHTML = '<div class="spin"></div>'; sub.textContent = 'En cours…'; root.getElementById('p').classList.remove('min'); return; }
    const errs = list.querySelectorAll('li.err').length, warns = list.querySelectorAll('li.warn').length;
    const kind = /arrêté/.test(title.textContent) ? 'err' : errs ? 'warn' : 'done';
    title.textContent = title.textContent.replace(/\s+–\s+(terminé|arrêté).*$/, ''); // le statut est dans le sous-titre
    st.className = 'st ' + kind;
    st.innerHTML = ICONS[kind === 'done' ? 'ok' : kind === 'err' ? 'err' : 'warn'];
    sub.textContent = kind === 'err' ? 'Arrêté' : errs ? `Terminé avec ${errs} erreur${errs > 1 ? 's' : ''}` : warns ? `Terminé · ${warns} avertissement${warns > 1 ? 's' : ''}` : 'Terminé';
  }
  function log(text, cls = '') {
    ensurePanel();
    const li = document.createElement('li');
    li.className = cls;
    if (cls === 'step') li.textContent = text;
    else {
      const i = document.createElement('span'); i.className = 'i'; i.innerHTML = ICONS[cls] || ICONS.info;
      const x = document.createElement('span'); x.className = 'x';
      if (text instanceof Node) x.append(text); else x.textContent = String(text).replace(/^[✓✗]\s*/, '');
      li.append(i, x);
    }
    list.append(li); li.scrollIntoView({ block: 'end' });
    console.log('[mpg-auto]', li.textContent);
  }
  const step = t => log(t, 'step');

  // Prochain créneau de 30 min (hh:00 / hh:30) strictement après maintenant, heure locale.
  // Ex. 21:38 → 22:00 ; 21:48 → 22:00 ; 21:10 → 21:30 ; 21:30 → 22:00.
  function nextMercatoSlot(after = new Date()) {
    const d = new Date(after);
    d.setSeconds(0, 0);
    d.setMinutes(Math.floor(d.getMinutes() / 30) * 30 + 30); // déborde proprement sur l'heure / le lendemain
    return d;
  }

  // Lance la ligue au prochain créneau ; si l'API refuse la date (trop proche), retente au créneau suivant.
  async function launchAtNextSlot(leagueId, usersIds) {
    let start = nextMercatoSlot();
    for (let attempt = 0; ; attempt++) {
      try {
        await MpgApi.launch(leagueId, usersIds, start.toISOString(), true);
        return start;
      } catch (e) {
        if (attempt >= 1 || e.status !== 400) throw e;
        start = nextMercatoSlot(start);
      }
    }
  }
  const fmtTime = d => d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });


  // ---------- Logo de ligue : 1 fois sur 3 image IA (Cloudflare), sinon logo proposé au hasard ----------
  // Si le quota Cloudflare du jour est épuisé, on n'insiste plus jusqu'à la remise à zéro (00:00 UTC)
  // et on prend un logo proposé à la place.
  const AI_EVERY = 3;
  const randomPreset = () => PRESET_LOGOS[Math.floor(Math.random() * PRESET_LOGOS.length)];
  const nextUtcMidnight = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return d.getTime(); };
  async function chooseLogo() {
    // Compteur mémorisé d'une exécution à l'autre : vraiment 1 sur 3, même en créant 1 seule ligue
    const { logoCount = 0, aiBlockedUntil = 0 } = await chrome.storage.local.get(['logoCount', 'aiBlockedUntil']);
    await chrome.storage.local.set({ logoCount: (logoCount + 1) % AI_EVERY });
    if (logoCount % AI_EVERY !== 0) return { url: randomPreset(), label: 'logo proposé' };
    if (Date.now() < aiBlockedUntil) return { url: randomPreset(), label: 'logo proposé (crédits IA épuisés)' };
    const { cfToken } = await chrome.storage.local.get('cfToken');
    if (!cfToken) return { url: randomPreset(), label: 'logo proposé (token IA non renseigné)' };
    try {
      const r = await chrome.runtime.sendMessage({ mpgauto: 'aiLogo' });
      if (!r || !r.ok) { const e = new Error((r && r.error) || 'pas de réponse du service worker'); e.quota = !!(r && r.quota); throw e; }
      const bin = atob(r.image), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const up = await MpgApi.uploadTemp(new Blob([bytes], { type: r.mime || 'image/jpeg' }), 'logo-ia.jpg');
      if (!up || !up.url) throw new Error('upload du logo : réponse inattendue');
      return { url: /^https?:/.test(up.url) ? up.url : 'https://' + up.url, label: 'logo IA' };
    } catch (e) {
      if (e.quota) {
        await chrome.storage.local.set({ aiBlockedUntil: nextUtcMidnight() });
        return { url: randomPreset(), label: 'logo proposé', warning: 'Crédits IA Cloudflare épuisés pour aujourd\'hui : logos proposés jusqu\'à 2 h (00:00 UTC)' };
      }
      return { url: randomPreset(), label: 'logo proposé', warning: `Logo IA indisponible (${e.message}) : logo proposé utilisé à la place` };
    }
  }

  // ---------- Joueurs : pseudo, email ou userId → { id, username } ----------
  const nameOf = u => (u && (u.username || u.alias || u.teamName)) || '';
  const looksLikeId = s => /^(mpg_)?user_[\w-]+$/i.test(s);
  async function resolveIdent(raw) {
    const ident = String(raw).trim();
    let id, username;
    const byProfile = async () => { // pseudo (ou userId) via le profil public
      try { const u = await MpgApi.publicUser(ident); if (u && (u.id || u.userId)) { id = u.id || u.userId; username = nameOf(u); } }
      catch (e) { if (e.status === 401) throw e; }
    };
    const byDebug = async () => { // userId / shortId / email via /debug
      try { const r = await MpgApi.resolveUser(ident); if (r && r.mpgId) id = r.mpgId; }
      catch (e) { if (e.status === 401) throw e; }
    };
    if (ident.includes('@') || looksLikeId(ident)) { await byDebug(); if (!id) await byProfile(); }
    else { await byProfile(); if (!id) await byDebug(); }
    if (!id) throw new Error('introuvable');
    if (!username) { try { username = nameOf(await MpgApi.publicUser(id)); } catch {} }
    return { ident, id, username };
  }

  async function findInvitations(viewAs, leagueIds) {
    const found = {};
    for (let attempt = 0; attempt < 6 && Object.keys(found).length < leagueIds.length; attempt++) {
      if (attempt) await sleep(1500);
      let ts = 0;
      for (let page = 0; page < 10; page++) {
        const notifs = await MpgApi.notifications(viewAs, ts);
        if (!Array.isArray(notifs) || !notifs.length) break;
        for (const n of notifs) {
          const a = n.actionDetails || {};
          if (a.type === 'leagueInvitation' && leagueIds.includes(a.leagueId) && /pending/.test(n.templateName || 'pending')) found[a.leagueId] = n.id;
        }
        if (Object.keys(found).length === leagueIds.length) break;
        const last = notifs[notifs.length - 1].timestamp;
        if (!last || last === ts) break;
        ts = last;
      }
    }
    return found;
  }

  async function run(cfg) {
    setRunning(true);
    ensurePanel();
    list.textContent = '';
    const num = pad(cfg.num);
    title.textContent = `${cfg.prefix} ${num} – en cours…`;
    const leagues = []; // { id, name, members: [userId] }
    let errors = 0;
    try {
      // 1. Contexte
      step('1. Compte principal & joueurs');
      const me = await MpgApi.me();
      if (MpgApi.isDev || MpgApi.customApiUrl()) log(`API${MpgApi.customApiUrl() ? ' custom' : ''} : ${MpgApi.apiBase()}`);
      const cu = MpgApi.customUser();
      log(`Compte principal : ${me.username || ''} (${me.id})${cu ? ' – custom user' : ''}`);
      const users = [];
      // Entrées du popup : { ident, id?, username? } (id déjà résolu) ou chaîne (ancien format)
      for (const u of cfg.users) {
        const ident = typeof u === 'string' ? u : (u.ident || u.id);
        try {
          const r = typeof u === 'object' && u.id ? u : await resolveIdent(ident);
          const label = r.username || ident;
          if (r.id === me.id) { log(`${label} : c'est le compte principal, ignoré`, 'warn'); continue; }
          if (users.some(x => x.id === r.id)) { log(`${label} : en double, ignoré`, 'warn'); continue; }
          users.push({ ident: label, id: r.id });
          log(`${label} → ${r.id}`);
        } catch (e) { errors++; log(`${ident} : ${e.message}`, 'err'); }
      }
      if (!users.length) throw new Error('Aucun joueur à inviter.');

      // 2. Création
      step('2. Création des ligues');
      const champs = (await MpgApi.championships()).championships || {};
      const entries = Object.entries(champs).sort((a, b) => +a[0] - +b[0]);
      const wanted = [];
      for (const [cid, c] of entries) {
        const short = c.shortBrand || c.brand || 'C' + cid;
        if (cfg.normal.includes(+cid)) wanted.push({ cid: +cid, name: `${cfg.prefix} ${num} - ${short}` });
        if (cfg.express.includes(+cid)) wanted.push({ cid: +cid, name: `${cfg.prefix} ${num} - ${short} Express`, express: true });
      }
      const missing = [...cfg.normal, ...cfg.express].filter(id => !champs[id]);
      if (missing.length) log(`Championnat(s) inactif(s) ignoré(s) : ${[...new Set(missing)].join(', ')}`, 'warn');
      if (!wanted.length) throw new Error('Aucun championnat sélectionné.');
      for (const w of wanted) {
        try {
          const logo = await chooseLogo();
          const l = await MpgApi.createLeague(w.name, w.cid, logo.url);
          if (w.express) await MpgApi.setExpress(l.id);
          leagues.push({ id: l.id, name: w.name, members: [] });
          log(`✓ ${w.name}${w.express ? ' (express)' : ''} – ${logo.label}`, 'ok');
          if (logo.warning) log(logo.warning, 'warn');
        } catch (e) { errors++; log(`✗ ${w.name} : ${e.message}`, 'err'); }
      }
      if (!leagues.length) throw new Error('Aucune ligue créée.');
      // Le compteur avance dès qu'au moins une ligue existe, pour ne jamais réutiliser un numéro.
      await chrome.storage.local.set({ [MpgApi.isDev ? 'nextNum_dev' : 'nextNum']: cfg.num + 1 });

      // 3. Invitations
      step('3. Invitations');
      const ids = users.map(u => u.id);
      for (const l of leagues) {
        try { await MpgApi.invite(l.id, ids); log(`✓ ${l.name} : ${ids.length} invités`, 'ok'); }
        catch (e) { errors++; log(`✗ ${l.name} : ${e.message}`, 'err'); }
      }

      // 4. Acceptation, compte par compte (header view-as = « Custom user »)
      step('4. Acceptation des invitations');
      const leagueIds = leagues.map(l => l.id);
      for (const u of users) {
        try {
          const invits = await findInvitations(u.id, leagueIds);
          let ok = 0;
          for (const l of leagues) {
            const nid = invits[l.id];
            if (!nid) { errors++; log(`✗ ${u.ident} : invitation introuvable pour ${l.name}`, 'err'); continue; }
            try { await MpgApi.acceptNotification(nid, u.id); l.members.push(u.id); ok++; }
            catch (e) { errors++; log(`✗ ${u.ident} / ${l.name} : ${e.message}`, 'err'); }
          }
          log(`✓ ${u.ident} : ${ok}/${leagues.length} acceptées`, ok === leagues.length ? 'ok' : 'warn');
        } catch (e) { errors++; log(`✗ ${u.ident} : ${e.message}`, 'err'); }
      }

      // 5. Lancement (retour au compte principal : plus de view-as)
      step('5. Lancement des ligues');
      log(`Ouverture du mercato visée : ${fmtTime(nextMercatoSlot())}`);
      for (const l of leagues) {
        const usersIds = [me.id, ...l.members];
        if (usersIds.length < 2 || usersIds.length % 2) {
          errors++; log(`✗ ${l.name} : ${usersIds.length} joueurs (il faut un nombre pair ≥ 2), non lancée`, 'err'); continue;
        }
        try {
          const start = await launchAtNextSlot(l.id, usersIds);
          const a = document.createElement('a');
          a.href = `/league/${l.id}`; a.textContent = l.name;
          const span = document.createElement('span'); span.append(a, ` lancée (${usersIds.length} joueurs, mercato ${fmtTime(start)})`);
          log(span, 'ok');
        } catch (e) { errors++; log(`✗ ${l.name} : ${e.message}`, 'err'); }
      }
      title.textContent = `${cfg.prefix} ${num} – terminé${errors ? ` (${errors} erreur${errors > 1 ? 's' : ''})` : ''}`;
      log(errors ? 'Terminé avec des erreurs (voir ci-dessus).' : 'Tout est bon.', errors ? 'warn' : 'ok');
    } catch (e) {
      title.textContent = `${cfg.prefix} ${num} – arrêté`;
      log('Arrêt : ' + e.message, 'err');
    } finally {
      setRunning(false);
    }
  }

  // =====================================================================
  // Mercato : pour chaque ligue cochée, chaque compte (view-as) crée son équipe si besoin
  // puis envoie ses enchères pour le tour en cours.
  // =====================================================================

  // Ligues du compte principal actuellement en mercato (pour les cases à cocher du popup)
  async function mercatoLeagues() {
    const d = await MpgApi.dashboard();
    return (d.orderedTiles || [])
      .filter(t => t.type === 'league' && t.divisionId && (t.divisionStatus === 3 || (t.divisionStatus === undefined && t.status === 3)))
      .map(t => {
        const st = t.mercatoState || {};
        const statuses = Object.values(st.teamsStatuses || {});
        const total = t.divisionTotalUsers || t.totalUsers || statuses.length;
        const validated = typeof st.usersLeft === 'number' ? Math.max(0, total - st.usersLeft) : statuses.filter(s => s === 2).length;
        return {
          leagueId: t.leagueId, divisionId: t.divisionId, name: t.name, championshipId: t.championshipId,
          turn: st.turn || 1, total, validated,
          opensIn: t.mercatoStartIn > 0 ? t.mercatoStartIn : 0,
          createdAt: t.createdAt || '',
        };
      });
  }

  const abbreviationOf = name => {
    const s = String(name).replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'MPG';
    return (s[0] + s.slice(-2)).slice(0, 3).padEnd(3, 'X');
  };

  async function createTeamFor(divisionId, user, viewAs) {
    let jerseyId;
    try {
      const lr = await MpgApi.lockerRoom(viewAs);
      jerseyId = lr?.lockerRoom?.jerseys?.[0]?.id
        || Object.values(lr?.jerseysPool || {}).find(j => j.productCode === 'free' || j.tag === 'free')?.id;
    } catch {}
    const name = String(user.username || user.id).slice(0, 30);
    const body = {
      name,
      abbreviation: abbreviationOf(name),
      presidentName: `Président ${name}`.slice(0, 30),
      stadiumName: `Stade ${name}`.slice(0, 30),
    };
    if (jerseyId) body.gear = { home: { jerseyId } };
    const team = await MpgApi.createTeam(divisionId, body, viewAs);
    if (!team || !team.id) throw new Error('création d\'équipe : réponse inattendue');
    return team.id;
  }

  const sumMins = mins => Object.values(mins).reduce((s, n) => s + n, 0);
  const isComplete = (owned, mins) => Object.entries(mins).every(([p, n]) => (owned[p] || 0) >= n);

  // Prépare le contexte d'une ligue (règles, comptes, joueurs dispo, postes)
  async function leagueContext(lg, rules, poolCache) {
    const div = await MpgApi.division(lg.divisionId);
    const mode = (div.gameSettings && div.gameSettings.mode) || 1;
    const byPos = rules?.modes?.[mode]?.squadComposition?.byPositions || { 1: { min: 2 }, 2: { min: 6 }, 3: { min: 6 }, 4: { min: 4 } };
    const mins = Object.fromEntries(Object.entries(byPos).map(([p, v]) => [p, v.min || 0]));
    const cid = (div.gameSettings && div.gameSettings.championshipId) || lg.championshipId;
    return { div, mins, cid };
  }

  async function positionsFor(ids, posById, cid, poolCache) {
    if (ids.every(id => posById.has(id))) return;
    if (!poolCache[cid]) poolCache[cid] = (await MpgApi.championshipPool(cid)).players || [];
    poolCache[cid].forEach(p => { if (!posById.has(p.id)) posById.set(p.id, p.position); });
  }

  /**
   * Joue le tour en cours d'une ligue pour chaque compte géré.
   * finish = true : une équipe déjà complète clôture son mercato (PATCH end-mercato) au lieu d'être ignorée.
   * Retourne { acted, pendingOthers } ; pendingOthers = équipes non gérées qui doivent encore jouer.
   */
  async function playTurn(lg, ctx, me, cfg, counters, poolCache) {
    const { div, mins, cid } = ctx;
    const st = div.mercatoState || {};
    const turn = st.turn || 1;
    const users = (await MpgApi.divisionUsers(lg.divisionId)).users || [];
    const available = (await MpgApi.availablePlayers(lg.divisionId)).availablePlayers || [];
    const posById = new Map(available.map(p => [p.id, p.position]));
    const taken = new Set();
    let acted = 0, pendingOthers = 0;
    log(`Tour ${turn} · ${users.length} comptes · ${available.length} joueurs dispo`);

    for (const u of users) {
      const isMe = u.id === me.id;
      const viewAs = isMe ? undefined : u.id;
      const label = u.username || u.id;
      let teamId = div.usersTeams && div.usersTeams[u.id];
      const status = typeof teamId === 'string' && st.teamsStatuses ? st.teamsStatuses[teamId] : undefined;
      if (isMe && !cfg.includeMe) { if (status !== 2 && status !== 3) pendingOthers++; continue; }
      if (status === 3) continue; // mercato déjà clôturé pour cette équipe
      if (status === 2) { if (!cfg.finish) { counters.skipped++; log(`${label} : tour ${turn} déjà validé`, 'warn'); } continue; }
      try {
        if (typeof teamId !== 'string') {
          teamId = await createTeamFor(lg.divisionId, u, viewAs);
          log(`${label} : équipe créée`);
        }
        const team = await MpgApi.team(teamId, viewAs);
        const squadIds = Object.keys(team.squad || {});
        await positionsFor(squadIds, posById, cid, poolCache);
        const owned = {};
        for (const id of squadIds) {
          const pos = (team.squad[id] && team.squad[id].position) || posById.get(id);
          if (pos) owned[pos] = (owned[pos] || 0) + 1;
        }
        const budget = typeof team.availableBudget === 'number' ? team.availableBudget : team.budget;

        if (isComplete(owned, mins) && squadIds.length >= sumMins(mins)) {
          if (cfg.finish) {
            await MpgApi.endMercato(teamId, viewAs);
            acted++; counters.closed++;
            log(`✓ ${label} : effectif complet (${squadIds.length}), mercato clôturé (${budget} M restants)`, 'ok');
          } else {
            // Valide le tour sans enchère (sinon le tour attendrait cette équipe indéfiniment)
            await MpgApi.bid(teamId, turn, [], viewAs);
            acted++; counters.bids++;
            log(`✓ ${label} : effectif complet (${squadIds.length}), tour validé sans enchère`, 'ok');
          }
          continue;
        }
        const bids = MpgSquad.pick({ available, owned, mins, budget, taken });
        bids.forEach(b => taken.add(b.id));
        await MpgApi.bid(teamId, turn, bids.map(({ id, price }) => ({ id, price })), viewAs);
        acted++; counters.bids++;
        log(`✓ ${label} : ${bids.length} enchère${bids.length > 1 ? 's' : ''}, ${bids.reduce((s, b) => s + b.price, 0)} M / ${budget} M`, 'ok');
      } catch (e) { counters.errors++; log(`✗ ${label} : ${e.message}`, 'err'); }
    }
    return { acted, pendingOthers, turn };
  }

  // Attend la résolution du tour (passage au tour suivant ou fin du mercato)
  async function waitNextTurn(lg, turn, timeoutMs = 30000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      await sleep(1500);
      const div = await MpgApi.division(lg.divisionId);
      if (div.status !== 3 || (div.mercatoState && div.mercatoState.mercatoClosed)) return { div, ended: true };
      if ((div.mercatoState && div.mercatoState.turn) !== turn) return { div, ended: false };
    }
    return null;
  }

  async function runMercato(cfg) {
    setRunning(true);
    ensurePanel();
    list.textContent = '';
    const what = cfg.finish ? 'Fin du mercato' : 'Mercato (1 tour)';
    title.textContent = `${what} – ${cfg.leagues.length} ligue${cfg.leagues.length > 1 ? 's' : ''}…`;
    const counters = { errors: 0, bids: 0, closed: 0, skipped: 0, finished: 0 };
    const poolCache = {};
    const MAX_TURNS = 20;
    try {
      const me = await MpgApi.me();
      const rules = await MpgApi.rules();
      for (const lg of cfg.leagues) {
        step(lg.name);
        try {
          let ctx = await leagueContext(lg, rules, poolCache);
          if (ctx.div.status !== 3) { counters.skipped++; log('Pas (ou plus) en mercato, ignorée', 'warn'); continue; }
          const startDate = ctx.div.gameSettings && ctx.div.gameSettings.mercatoStartDate;
          if (startDate && new Date(startDate) > new Date()) { counters.skipped++; log(`Mercato pas encore ouvert (ouverture ${fmtTime(new Date(startDate))})`, 'warn'); continue; }

          for (let i = 0; i < (cfg.finish ? MAX_TURNS : 1); i++) {
            const errorsBefore = counters.errors;
            const r = await playTurn(lg, ctx, me, cfg, counters, poolCache);
            if (!cfg.finish) break;
            if (counters.errors > errorsBefore) { log('Arrêt sur cette ligue (erreur ci-dessus)', 'err'); break; }
            if (r.pendingOthers) { log(`En attente de ${r.pendingOthers} compte(s) non géré(s) (ton compte ?) : arrêt`, 'warn'); break; }
            const next = await waitNextTurn(lg, r.turn);
            if (!next) { counters.errors++; log(`Le tour ${r.turn} ne se résout pas (timeout) : arrêt`, 'err'); break; }
            if (next.ended) {
              counters.finished++;
              const a = document.createElement('a'); a.href = `/league/${lg.leagueId}`; a.textContent = 'Mercato terminé';
              const span = document.createElement('span'); span.append(a, ` après ${r.turn} tour${r.turn > 1 ? 's' : ''}`);
              log(span, 'ok');
              break;
            }
            ctx = { ...ctx, div: next.div };
            if (i === MAX_TURNS - 1) log(`Toujours pas terminé après ${MAX_TURNS} tours : arrêt`, 'warn');
          }
        } catch (e) { counters.errors++; log(`✗ ${e.message}`, 'err'); }
      }
      const { errors, bids, closed, skipped, finished } = counters;
      title.textContent = `${what} – terminé${errors ? ` (${errors} erreur${errors > 1 ? 's' : ''})` : ''}`;
      const parts = cfg.finish
        ? [`${finished}/${cfg.leagues.length} mercato${finished > 1 ? 's' : ''} terminé${finished > 1 ? 's' : ''}`, `${bids} tours joués`, `${closed} clôtures`]
        : [`${bids} tour${bids > 1 ? 's' : ''} validé${bids > 1 ? 's' : ''}`];
      if (skipped) parts.push(`${skipped} ignoré${skipped > 1 ? 's' : ''}`);
      if (errors) parts.push(`${errors} erreur${errors > 1 ? 's' : ''}`);
      log(parts.join(', ') + '.', errors ? 'warn' : 'ok');
    } catch (e) {
      title.textContent = `${what} – arrêté`;
      log('Arrêt : ' + e.message, 'err');
    } finally {
      setRunning(false);
    }
  }

  // ---------- Visibilité des compétitions (onglet « Ligues » du popup) ----------
  async function competitions() {
    const [leagues, tournaments, dash] = await Promise.all([
      MpgApi.userLeagues(), MpgApi.userTournaments().catch(() => []), MpgApi.dashboard().catch(() => null),
    ]);
    const norm = (c, kind) => ({
      id: c.id, kind, name: c.name || c.id, status: c.status,
      championshipId: c.championshipId || (c.gameSettings && c.gameSettings.championshipId) || null,
      hidden: !!c.isHidden, createdAt: c.createdAt || '',
    });
    const list = [...(leagues || []).map(c => norm(c, 'league')), ...(tournaments || []).map(c => norm(c, 'tournament'))];
    // Ordre actuel de Mon MPG (les tuiles épinglées restent en tête, hors réorganisation)
    const tiles = (dash && dash.orderedTiles) || [];
    const tileId = t => (t.type === 'league' ? t.leagueId : t.id) || t.id || t.leagueId;
    const pinned = tiles.filter(t => t.isPinned).map(tileId);
    const order = tiles.filter(t => !t.isPinned).map(tileId);
    return { list, order, pinned, customOrder: dash ? !dash.defaultOrder : false };
  }

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg && msg.mpgauto === 'competitions') {
      competitions().then(r => reply({ ok: true, ...r })).catch(e => reply({ ok: false, error: e.message }));
      return true;
    }
    if (msg && msg.mpgauto === 'organize') {
      MpgApi.organize(msg.orderedContestsIds, msg.hiddenContestsIds).then(() => reply({ ok: true })).catch(e => reply({ ok: false, error: e.message }));
      return true;
    }
    if (msg && msg.mpgauto === 'setHidden') {
      MpgApi.setHidden(msg.kind, msg.id, msg.hidden).then(() => reply({ ok: true })).catch(e => reply({ ok: false, error: e.message }));
      return true;
    }
    // Résolution des joueurs saisis dans le popup (pseudo / email / userId → id + pseudo)
    if (msg && msg.mpgauto === 'resolveUsers') {
      Promise.all((msg.idents || []).map(ident => resolveIdent(ident)
        .then(r => ({ ok: true, ...r }))
        .catch(e => ({ ok: false, ident, error: e.message, auth: e.status === 401 }))))
        .then(list => reply({ ok: true, list })).catch(e => reply({ ok: false, error: e.message }));
      return true;
    }
    if (msg && msg.mpgauto === 'reloadPage') { reply({ ok: true }); location.reload(); return; }
    if (msg && msg.mpgauto === 'mercatoLeagues') {
      mercatoLeagues().then(list => reply({ ok: true, list })).catch(e => reply({ ok: false, error: e.message }));
      return true;
    }
    if (msg && msg.mpgauto === 'mercato') {
      if (running) { reply({ ok: false, error: 'Déjà en cours dans cet onglet' }); return; }
      reply({ ok: true });
      runMercato(msg.config);
      return;
    }
    // Liste des championnats actifs pour le popup (le token n'est lisible que depuis la page)
    if (msg && msg.mpgauto === 'championships') {
      // + compte connecté (custom user le cas échéant), affiché en 1er joueur dans le popup
      Promise.all([MpgApi.championships(), MpgApi.me().catch(() => null)]).then(([r, me]) => reply({
        ok: true,
        api: MpgApi.apiBase(), customApi: MpgApi.customApiUrl(), customUser: MpgApi.customUser(),
        me: me && me.id ? { id: me.id, username: me.username || '', custom: !!MpgApi.customUser() } : null,
        list: Object.entries(r.championships || {}).sort((a, b) => +a[0] - +b[0]).map(([id, c]) => ({
          id: +id, short: c.shortBrand || c.brand || 'C' + id, brand: c.brand || '',
          logo: (c.assets && c.assets.logos && c.assets.logos.coloredBackground) || c.logoUrl || '',
        })),
      })).catch(e => reply({ ok: false, error: e.message, api: MpgApi.apiBase() }));
      return true;
    }
    if (!msg || msg.mpgauto !== 'run') return;
    if (running) { reply({ ok: false, error: 'Déjà en cours dans cet onglet' }); return; }
    reply({ ok: true });
    run(msg.config);
  });
})();
