// Bouton « Tools » sur la page Mon MPG (home), à côté de « Filtrer » / « Réorganiser ».
// Effet arc-en-ciel ; au clic, la popup de l'extension s'ouvre juste sous le bouton (iframe ancrée).
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
          linear-gradient(rgba(30,31,42,.94),rgba(30,31,42,.94)) padding-box,
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

  // ---------- Icône (même taille / couleur que celle du bouton cloné) ----------
  function iconLike(svgRef) {
    const r = svgRef.getBoundingClientRect();
    const size = Math.round(r.width) || 14;
    const color = [...svgRef.querySelectorAll('path,circle,rect,line,polyline')]
      .map(p => [p.getAttribute('stroke'), p.getAttribute('fill')]).flat()
      .find(c => c && c !== 'none' && c !== 'transparent') || '#fff';
    const w = document.createElement('span');
    w.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" style="display:block;flex-shrink:0">` +
      `<path d="M9 3h6M10 3v5.2L4.6 17.4A2.4 2.4 0 0 0 6.7 21h10.6a2.4 2.4 0 0 0 2.1-3.6L14 8.2V3" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M7.5 15h9" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`;
    const svg = w.firstElementChild;
    const cs = getComputedStyle(svgRef);
    svg.style.marginLeft = cs.marginLeft; svg.style.marginRight = cs.marginRight;
    return svg;
  }

  // ---------- Injection : clone du bouton « Réorganiser » (même gabarit que la page) ----------
  function inject() {
    const existing = document.getElementById(ID);
    if (!isHome()) { existing?.remove(); closePopup(); return; }
    if (existing && existing.isConnected) return;
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
    const label = [...btn.querySelectorAll('div,span')].find(e => e.children.length === 0 && e.textContent.trim());
    if (label) label.textContent = 'Ligues';
    const svgRef = chip.querySelector('svg'), svgClone = btn.querySelector('svg');
    if (svgRef && svgClone) svgClone.replaceWith(iconLike(svgRef));
    // L'élément qui porte la bordure « pilule » du site reçoit l'effet arc-en-ciel
    const origEls = [chip, ...chip.querySelectorAll('*')], cloneEls = [btn, ...btn.querySelectorAll('*')];
    const idx = origEls.findIndex(e => parseFloat(getComputedStyle(e).borderTopWidth) > 0);
    const box = (idx >= 0 && cloneEls[idx]) || btn.firstElementChild || btn;
    box.classList.add('mpgauto-rainbow');

    const go = e => { e.preventDefault(); e.stopPropagation(); openPopup(btn); };
    btn.addEventListener('click', go);
    btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(e); });
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('pointerdown', e => e.stopPropagation());
    row.append(btn);
  }

  let raf = 0;
  new MutationObserver(() => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; inject(); }); })
    .observe(document.documentElement, { childList: true, subtree: true });
  inject();
})();
