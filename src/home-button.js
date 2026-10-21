// Bouton « Tools » sur la page Mon MPG (home), à côté de « Filtrer » / « Réorganiser ».
// Effet arc-en-ciel ; au clic, la popup de l'extension s'ouvre juste sous le bouton (iframe ancrée).
// Suit le thème clair / sombre du site : fond, texte et icône sont relus sur le bouton « Réorganiser »
// d'origine et resynchronisés quand le thème change.
(() => {
  if (window.top !== window) return;
  const ID = 'mpgauto-home-btn';
  const EXT_ORIGIN = chrome.runtime.getURL('').replace(/\/$/, '');
  const POPUP_W = 440, GAP = 8, MARGIN = 12;
  const isHome = () => location.pathname === '/' || location.pathname === '';
  const leafWithText = (root, txt) => [...root.querySelectorAll('div,span')].find(e => e.children.length === 0 && e.textContent.trim() === txt);

  // ---------- Style arc-en-ciel ----------
  function injectStyle() {
    if (document.getElementById('mpgauto-style')) return;
    const st = document.createElement('style');
    st.id = 'mpgauto-style';
    st.textContent = `
      #${ID} .mpgauto-rainbow{
        position:relative;
        border-color:transparent!important;
        background:
          linear-gradient(var(--mpgauto-bg,#1e1f2a),var(--mpgauto-bg,#1e1f2a)) padding-box,
          linear-gradient(90deg,#ff3b6b,#ff9f1c,#ffe14d,#3ee08f,#22c4ff,#7c6cff,#ff4fd8,#ff3b6b) 0 0/300% 100% border-box!important;
        animation:mpgauto-rainbow 3s linear infinite;
        box-shadow:0 0 0 0 rgba(124,108,255,0);
        transition:box-shadow .2s,transform .12s;
      }
      #${ID}:hover .mpgauto-rainbow,#${ID}.open .mpgauto-rainbow{box-shadow:0 0 14px 1px rgba(124,108,255,.45),0 0 4px rgba(255,79,216,.35)}
      #${ID}:active .mpgauto-rainbow{transform:scale(.97)}
      #${ID}:focus-visible{outline:none}
      #${ID}:focus-visible .mpgauto-rainbow{box-shadow:0 0 0 3px rgba(124,108,255,.45)}
      @keyframes mpgauto-rainbow{to{background-position:0 0,300% 0}}
      @media (prefers-reduced-motion:reduce){#${ID} .mpgauto-rainbow{animation:none}}`;
    (document.head || document.documentElement).append(st);
  }

  // ---------- Popup ancrée sous le bouton ----------
  // Hauteur = hauteur naturelle de l'onglet « Créer » (mesurée et envoyée par la popup), bornée par la fenêtre
  let overlay, frame, anchorEl, contentH = 600;
  function place() {
    if (!frame || !anchorEl || !anchorEl.isConnected) return;
    const r = anchorEl.getBoundingClientRect();
    const h = Math.max(300, Math.min(contentH, innerHeight - 2 * MARGIN));
    let left, top, origin;
    if (innerHeight - r.bottom - GAP - MARGIN >= h) {
      // Assez de place dessous : juste sous le bouton
      left = Math.max(MARGIN, Math.min(r.left, innerWidth - POPUP_W - MARGIN));
      top = r.bottom + GAP; origin = 'top left';
    } else if (r.top - GAP - MARGIN >= h) {
      // Sinon au-dessus
      left = Math.max(MARGIN, Math.min(r.left, innerWidth - POPUP_W - MARGIN));
      top = r.top - GAP - h; origin = 'bottom left';
    } else {
      // Sinon à côté du bouton (à droite, ou à gauche s'il manque de place), calée dans la fenêtre
      const right = r.right + GAP;
      left = right + POPUP_W + MARGIN <= innerWidth ? right : Math.max(MARGIN, r.left - GAP - POPUP_W);
      top = Math.max(MARGIN, Math.min(r.top - 60, innerHeight - h - MARGIN));
      origin = left >= r.right ? 'top left' : 'top right';
    }
    Object.assign(frame.style, { left: left + 'px', top: top + 'px', height: h + 'px', transformOrigin: origin });
  }
  function closePopup() {
    overlay?.remove(); overlay = frame = null;
    document.getElementById(ID)?.classList.remove('open');
    removeEventListener('scroll', place, true); removeEventListener('resize', place);
  }
  function openPopup(anchor) {
    if (overlay) return closePopup();
    anchorEl = anchor;
    anchor.classList.add('open');
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646';
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) closePopup(); });
    overlay.addEventListener('wheel', e => { if (e.target === overlay) closePopup(); }, { passive: true });
    frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('popup/popup.html?embedded=1');
    frame.style.cssText = `position:fixed;width:${POPUP_W}px;border:1px solid #2a2f38;border-radius:12px;background:#111318;` +
      'box-shadow:0 18px 50px rgba(0,0,0,.55),0 2px 8px rgba(0,0,0,.3);opacity:0;transform:scale(.97);transition:opacity .14s,transform .14s';
    overlay.append(frame);
    document.documentElement.append(overlay);
    place();
    requestAnimationFrame(() => { if (frame) { frame.style.opacity = '1'; frame.style.transform = 'none'; } });
    addEventListener('scroll', place, true); addEventListener('resize', place);
  }
  window.addEventListener('message', e => {
    if (e.origin !== EXT_ORIGIN || !e.data) return;
    if (e.data.mpgauto === 'closePopup') closePopup();
    if (e.data.mpgauto === 'popupHeight' && e.data.h > 0) { contentH = Math.ceil(e.data.h) + 2; place(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopup(); });

  // ---------- Icône (même taille que celle du bouton cloné ; couleur = currentColor, cf. syncTheme) ----------
  function iconLike(svgRef) {
    const r = svgRef.getBoundingClientRect();
    const size = Math.round(r.width) || 14;
    const w = document.createElement('span');
    w.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="display:block;flex-shrink:0">` +
      `<path d="M9 3h6M10 3v5.2L4.6 17.4A2.4 2.4 0 0 0 6.7 21h10.6a2.4 2.4 0 0 0 2.1-3.6L14 8.2V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M7.5 15h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
    const svg = w.firstElementChild;
    const cs = getComputedStyle(svgRef);
    svg.style.marginLeft = cs.marginLeft; svg.style.marginRight = cs.marginRight;
    return svg;
  }

  // ---------- Thème : couleurs relues sur le bouton d'origine ----------
  // orig = éléments du bouton « Réorganiser » (pilule, libellé, icône) ; mine = leurs équivalents dans notre clone
  let orig = null, mine = null, lastTheme = '';
  const parseColor = c => {
    const m = /rgba?\(([^)]+)\)/.exec(c || '');
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  // Fond réellement visible sous un élément : on empile les fonds (semi-)transparents jusqu'au premier opaque
  function effectiveBg(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parseColor(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    let out = dark ? { r: 17, g: 19, b: 24 } : { r: 255, g: 255, b: 255 }; // rien d'opaque : fond du navigateur
    for (const c of layers.reverse()) out = { r: c.r * c.a + out.r * (1 - c.a), g: c.g * c.a + out.g * (1 - c.a), b: c.b * c.a + out.b * (1 - c.a) };
    return `rgb(${Math.round(out.r)},${Math.round(out.g)},${Math.round(out.b)})`;
  }
  function iconColor(svg) {
    if (!svg) return '';
    const attr = [...svg.querySelectorAll('path,circle,rect,line,polyline')]
      .map(p => [p.getAttribute('stroke'), p.getAttribute('fill')]).flat()
      .find(c => c && c !== 'none' && c !== 'transparent' && c !== 'currentColor');
    return attr || getComputedStyle(svg).color;
  }
  function syncTheme() {
    if (!orig || !mine || !orig.chip.isConnected || !mine.btn.isConnected) return;
    const bg = effectiveBg(orig.box);
    const text = orig.label ? getComputedStyle(orig.label).color : '';
    const icon = iconColor(orig.svg) || text;
    const theme = [bg, text, icon].join('|');
    if (theme === lastTheme) return;
    lastTheme = theme;
    mine.box.style.setProperty('--mpgauto-bg', bg);
    if (mine.label && text) mine.label.style.color = text;
    if (mine.svg && icon) mine.svg.style.color = icon;
  }

  // ---------- Injection : clone du bouton « Réorganiser » (même gabarit que la page) ----------
  function inject() {
    const existing = document.getElementById(ID);
    if (!isHome()) { existing?.remove(); closePopup(); return; }
    if (existing && existing.isConnected && orig && orig.chip.isConnected) { syncTheme(); return; }
    existing?.remove(); // le site a re-rendu la rangée (ex. changement de thème) : on reclone
    const a = leafWithText(document.body, 'Filtrer'), b = leafWithText(document.body, 'Réorganiser');
    if (!a || !b) return;
    // Rangée = 1er ancêtre commun de « Filtrer » et « Réorganiser » ; modèle = son enfant qui contient « Réorganiser »
    const ancestors = new Set(); for (let x = a; x; x = x.parentElement) ancestors.add(x);
    let row = b; while (row && !ancestors.has(row)) row = row.parentElement;
    if (!row || row === document.body) return;
    const chip = [...row.children].find(c => c.contains(b));
    if (!chip) return;

    injectStyle();
    const btn = chip.cloneNode(true);
    btn.id = ID;
    btn.removeAttribute('data-testid');
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.tabIndex = 0;
    btn.title = 'Créer des ligues, faire les mercatos';
    btn.style.cursor = 'pointer';
    const leaf = e => e.children.length === 0 && e.textContent.trim();
    const label = [...btn.querySelectorAll('div,span')].find(leaf);
    if (label) label.textContent = 'Tools';
    const svgRef = chip.querySelector('svg'), svgClone = btn.querySelector('svg');
    const svgMine = svgRef && svgClone ? iconLike(svgRef) : null;
    if (svgMine) svgClone.replaceWith(svgMine);
    // L'élément qui porte la bordure « pilule » du site reçoit l'effet arc-en-ciel
    const origEls = [chip, ...chip.querySelectorAll('*')], cloneEls = [btn, ...btn.querySelectorAll('*')];
    const idx = origEls.findIndex(e => parseFloat(getComputedStyle(e).borderTopWidth) > 0);
    const box = (idx >= 0 && cloneEls[idx]) || btn.firstElementChild || btn;
    box.classList.add('mpgauto-rainbow');
    orig = { chip, box: (idx >= 0 && origEls[idx]) || chip.firstElementChild || chip, label: [...chip.querySelectorAll('div,span')].find(leaf), svg: svgRef };
    mine = { btn, box, label, svg: svgMine };
    lastTheme = '';

    const go = e => { e.preventDefault(); e.stopPropagation(); openPopup(btn); };
    btn.addEventListener('click', go);
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(e); });
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    row.append(btn);
    syncTheme();
  }

  // DOM modifié → (ré)injection ; classes / styles modifiés (changement de thème) → resynchro des couleurs
  let raf = 0, full = false;
  const schedule = needInject => {
    full = full || needInject;
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; const f = full; full = false; f ? inject() : syncTheme(); });
  };
  new MutationObserver(muts => schedule(muts.some(m => m.type === 'childList')))
    .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { lastTheme = ''; schedule(false); });
  inject();
})();
