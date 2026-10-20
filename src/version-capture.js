// Monde MAIN, document_start : récupère le header `client-version` envoyé par l'app
// pour que nos appels API utilisent la même version (fallback dans api.js).
(() => {
  if (window.__mpgautoVersion) return; window.__mpgautoVersion = true;
  const set = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (String(k).toLowerCase() === 'client-version' && v) {
      try { if (localStorage.getItem('mpgauto_clientVersion') !== v) localStorage.setItem('mpgauto_clientVersion', v); } catch {}
    }
    return set.apply(this, arguments);
  };
})();
