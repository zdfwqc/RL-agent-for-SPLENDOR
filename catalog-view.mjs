// Derive candidates only from a player-visible observation, never actual decks.
export function catalogCards(cards, state, {mode='all', tier=0, bonus=-1}={}) {
  const excluded = new Set();
  if (mode === 'deck' && state) {
    if (state.deck_counts[tier-1] === 0) return [];
    for (const card of state.market.flat()) if (card) excluded.add(card.id);
    for (const player of state.players) {
      for (const card of [...player.purchased, ...(player.reserved || [])]) excluded.add(card.id);
    }
    // Public reservations stay out of decks forever, including after purchase.
    // Historical observations have text-only logs, so preserve this compatibility.
    for (const entry of state.log) {
      const id = /^预留公开牌 (C\d+)$/u.exec(entry.text)?.[1];
      if (id) excluded.add(id);
    }
  }
  return cards.filter(c => (!tier || c.tier === tier) && (bonus < 0 || c.bonus === bonus) && !excluded.has(c.id));
}
