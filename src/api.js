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

  function base() {
    try {
      const url = JSON.parse(localStorage.getItem('mmkv.default\\debug'))?.state?.data?.url;
      if (url && /^https?:\/\//i.test(url)) return url.replace(/\/+$/, '');
    } catch {}
    return ENV.api;
  }

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

  async function call(method, path, { body, viewAs } = {}) {
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
    const res = await fetch(base() + path, { method, headers, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
    const text = await res.text();
    if (res.status === 401) throw new ApiError(401, path, 'token expiré : recharge la page MPG et relance');
    if (!res.ok) throw new ApiError(res.status, path, text);
    try { return text ? JSON.parse(text) : null; } catch { return text; }
  }

  return {
    isDev: IS_DEV,
    apiBase: base,
    me: () => call('GET', '/user'),
    championships: () => call('GET', '/championships/active'),
    // userId / shortId / email → { mpgId, … }
    resolveUser: identifier => call('GET', '/debug/user/ids?identifier=' + encodeURIComponent(identifier)),
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
