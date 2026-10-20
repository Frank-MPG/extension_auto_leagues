// Choix des joueurs pour un tour de mercato (logique pure, sans appel réseau).
// Reprend l'algo du bouton « J'ai de la chance » du site : par poste, tirage au hasard parmi
// les joueurs cotés > 14, puis 11-14, enchère = cote. On ajoute : complément avec les moins
// chers si besoin, diversité entre comptes d'une même ligue, et respect du budget.
const MpgSquad = (() => {
  const POSITIONS = [1, 2, 3, 4]; // G, D, M, A
  const POS_LABEL = { 1: 'G', 2: 'D', 3: 'M', 4: 'A' };

  const shuffle = (arr, rng) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const cost = p => Math.max(1, p.quotation || 0, p.price || 0);
  const tier = p => (p.quotation > 14 ? 0 : p.quotation > 10 ? 1 : 2);

  /**
   * @param available   joueurs dispo (GET /division/:id/available-players → availablePlayers)
   * @param owned       { [position]: nombre de joueurs déjà dans l'effectif }
   * @param mins        { [position]: minimum requis } (rules.modes[mode].squadComposition.byPositions)
   * @param budget      budget disponible
   * @param taken       Set d'ids déjà visés par un autre compte de la ligue (évités si possible)
   * @returns [{ id, price, position, name }]
   */
  function pick({ available, owned = {}, mins, budget, taken = new Set(), rng = Math.random }) {
    const picks = [];
    const used = new Set();
    for (const pos of POSITIONS) {
      const need = Math.max(0, (mins[pos] || 0) - (owned[pos] || 0));
      if (!need) continue;
      const ofPos = available.filter(p => p.position === pos);
      // Ordre : tranche de cote (>14, 11-14, ≤10), au hasard dans chaque tranche ; joueurs déjà pris par un autre compte en dernier
      const ordered = [0, 1, 2].flatMap(t => shuffle(ofPos.filter(p => tier(p) === t), rng));
      const candidates = [...ordered.filter(p => !taken.has(p.id)), ...ordered.filter(p => taken.has(p.id))];
      const chosen = candidates.slice(0, need);
      if (chosen.length < need) throw new Error(`pas assez de joueurs dispo au poste ${POS_LABEL[pos]} (${chosen.length}/${need})`);
      chosen.forEach(p => { used.add(p.id); picks.push(p); });
    }

    // Budget : on remplace le plus cher par le moins cher dispo du même poste jusqu'à passer sous le budget
    let total = picks.reduce((s, p) => s + cost(p), 0);
    const byCost = available.filter(p => !used.has(p.id)).sort((a, b) => cost(a) - cost(b));
    while (total > budget) {
      let swap = null;
      for (const i of picks.map((_, k) => k).sort((a, b) => cost(picks[b]) - cost(picks[a]))) {
        const cur = picks[i];
        const repl = byCost.find(p => p.position === cur.position && !used.has(p.id) && cost(p) < cost(cur));
        if (repl) { swap = { i, cur, repl }; break; }
      }
      if (!swap) throw new Error(`budget insuffisant (${total} > ${budget})`);
      used.delete(swap.cur.id); used.add(swap.repl.id);
      picks[swap.i] = swap.repl; total += cost(swap.repl) - cost(swap.cur);
    }

    return picks.map(p => ({ id: p.id, price: cost(p), position: p.position, name: `${p.firstName ? p.firstName[0] + '. ' : ''}${p.lastName || p.id}` }));
  }

  return { pick, POSITIONS, POS_LABEL };
})();
if (typeof module !== 'undefined') module.exports = MpgSquad;
