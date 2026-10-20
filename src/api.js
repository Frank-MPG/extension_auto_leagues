// Client minimal pour l'API MPG, avec le token de la session MPG ouverte.
// Prod (mpg.football → api.mpg.football) ou dev (dev.mpg.football → dev.api.mpg.football),
// selon l'onglet ; une API URL custom (extension « API URL », store debug de l'app) est prioritaire.
// `viewAs` = même mécanisme que le bouton « Custom user » (header `view-as` posé par la page /debug).
const MpgApi = (() => {
  const IS_DEV = location.hostname === 'dev.mpg.football';
  // Valeurs de l'app (appEnv.API_URL / PACKAGE_NAME du bundle)
  const ENV = IS_DEV
    ? { api: 'https://dev.api.mpg.football', pkg: 'com.monpetitgazon.monpetitgazondev' }
    : { api: 'https://api.mpg.football', pkg: 'com.monpetitgazon.monpetitgazonapp' };
  const TOKEN_KEY = `${ENV.pkg}.secureStorage\\accessToken`;
  const FALLBACK_VERSION = '13.7.0';

  // Store zustand « debug » de l'app (écrit par la page /debug et les extensions « API URL » / « Custom user »),
  // relu à chaque appel : state.data.url (API URL custom), state.data.identifiers.mpgId (custom user → view-as).
  function debugData() {
    try {
      let o = JSON.parse(localStorage.getItem('mmkv.default\\debug'));
      if (typeof o === 'string') o = JSON.parse(o); // valeur doublement encodée
      return o?.state?.data || {};
    } catch { return {}; }
  }
  // Même normalisation que l'app (https:// ajouté si absent)
  function customUrl() {
    let url = String(debugData().url || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url.replace(/\/+$/, '');
  }
  // Custom user : comme l'app, tous les appels partent avec `view-as: <mpgId>` (sauf view-as explicite)
  function customUser() {
    const ids = debugData().identifiers;
    const id = ids && (ids.mpgId || '');
    if (!id) return null;
    let username = '';
    try { // pseudo capturé par l'extension « Custom user »
      const v = JSON.parse(localStorage.getItem('mpgcu_viewedUser'));
      if (v && v.id === id) username = v.username || '';
    } catch {}
    return { id, identifier: ids.identifier || id, username };
  }
  const base = () => customUrl() || ENV.api;

  class ApiError extends Error {
    constructor(status, path, body) {
      super(`${status} sur ${path}${body ? ' : ' + String(body).slice(0, 200) : ''}`);
      this.status = status;
    }
  }

  function token() {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) throw new Error(`Pas de token MPG : connecte-toi sur ${location.hostname} puis recharge la page.`);
    return t;
  }

  // viewAs : compte à incarner (sinon le custom user s'il y en a un) ; noViewAs : appel avec le vrai compte (endpoints /debug)
  async function call(method, path, { body, viewAs, noViewAs } = {}) {
    if (!viewAs && !noViewAs) viewAs = customUser()?.id;
    let version = FALLBACK_VERSION;
    try { version = localStorage.getItem('mpgauto_clientVersion') || FALLBACK_VERSION; } catch {}
    const headers = {
      Accept: 'application/json, text/plain, */*',
      Authorization: 'Bearer ' + token(),
      platform: 'web',
      application: 'mpg',
      'client-version': version,
      'client-language': 'fr-FR',
    };
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (viewAs) headers['view-as'] = viewAs;
    const custom = customUrl();
    // Comme l'app avec une URL custom : évite la page d'avertissement ngrok
    if (custom) headers['ngrok-skip-browser-warning'] = 'true';
    const url = (custom || ENV.api) + path;
    let res;
    try { res = await fetch(url, { method, headers, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) }); }
    catch (e) { throw new ApiError(0, path, `${custom ? 'API custom ' + custom : ENV.api} injoignable (${e.message})`); }
    const text = await res.text();
    if (res.status === 401) throw new ApiError(401, path, 'token expiré : recharge la page MPG et relance');
    if (!res.ok) throw new ApiError(res.status, path, text);
    if (/^\s*</.test(text)) throw new ApiError(res.status, path, `réponse HTML au lieu de JSON (${custom ? 'API custom ' + custom : ENV.api})`);
    try { return text ? JSON.parse(text) : null; } catch { return text; }
  }

  return {
    isDev: IS_DEV,
    apiBase: base,
    customApiUrl: customUrl,
    customUser,
    me: () => call('GET', '/user'),
    championships: () => call('GET', '/championships/active'),
    // userId / shortId / email → { mpgId, … }
    resolveUser: identifier => call('GET', '/debug/user/ids?identifier=' + encodeURIComponent(identifier), { noViewAs: true }),
    // Profil public par userId ou par pseudo (getPublicUser / getUserByUsername du site) → { id, username, … }
    publicUser: idOrUsername => call('GET', '/user/' + encodeURIComponent(idOrUsername)),
    createLeague: (name, championshipId, imageUrl) => call('POST', '/league', {
      body: { name, imageUrl, gameSettings: { championshipId, rating: 'mpg', mode: 1 }, description: '' },
    }),
    // Upload d'image (logo perso) : renvoie { url } à passer en imageUrl
    uploadTemp: (blob, filename = 'logo.jpg') => { const fd = new FormData(); fd.append('file', blob, filename); return call('POST', '/upload-temp', { body: fd }); },
    setExpress: leagueId => call('PATCH', `/league/${leagueId}`, { body: { gameSettings: { isOneWay: true } } }),
    invite: (leagueId, usersIds) => call('PATCH', `/league/${leagueId}/invite-users-to-join`, { body: { usersIds } }),
    notifications: (viewAs, timestamp = 0) => call('GET', '/user-notifications?timestamp=' + timestamp, { viewAs }),
    acceptNotification: (notifId, viewAs) => call('PATCH', `/user-notification/${notifId}/action/accept`, { viewAs }),
    leagueUsers: leagueId => call('GET', `/league/${leagueId}/users`),
    launch: (leagueId, usersIds, mercatoStartDate, autoCloseMercato = true) =>
      call('PATCH', `/league/${leagueId}/validate-mono-division`, { body: { mercatoStartDate, autoCloseMercato, usersIds } }),

    // ---------- Visibilité sur Mon MPG ----------
    userLeagues: () => call('GET', '/user/leagues'),
    userTournaments: () => call('GET', '/user/tournaments'),
    // Ordre + masquage de Mon MPG en un appel (ce qu'utilise « Réorganiser » sur le site)
    organize: (orderedContestsIds, hiddenContestsIds) => call('PATCH', '/user-contests/organize', { body: { orderedContestsIds, hiddenContestsIds } }),
    setHidden: (kind, id, hidden) => call('PATCH', `/${kind === 'tournament' ? 'tournament' : 'league'}/${id}/${hidden ? 'hide' : 'un-hide'}`),

    // ---------- Mercato ----------
    dashboard: () => call('GET', '/dashboard'),
    rules: () => call('GET', '/rules'),
    division: divisionId => call('GET', `/division/${divisionId}`),
    divisionUsers: divisionId => call('GET', `/division/${divisionId}/users`),
    availablePlayers: divisionId => call('GET', `/division/${divisionId}/available-players`),
    championshipPool: championshipId => call('GET', `/championship-players-pool/${championshipId}/details`),
    lockerRoom: viewAs => call('GET', '/locker-room/extended?showHiddenJerseys=false', { viewAs }),
    createTeam: (divisionId, team, viewAs) => call('POST', `/team/division/${divisionId}`, { body: team, viewAs }),
    team: (teamId, viewAs) => call('GET', `/team/${teamId}`, { viewAs }),
    bid: (teamId, turn, bids, viewAs) => call('POST', `/team/${teamId}/mercato-bids`, { body: { turn, bids }, viewAs }),
    // « Clôturer mes enchères » : l'équipe termine son mercato (le mercato se ferme quand toutes l'ont fait)
    endMercato: (teamId, viewAs) => call('PATCH', `/team/${teamId}/end-mercato`, { viewAs }),
  };
})();
