// Lokale Bestenliste (localStorage, robust gegen Fehler)
const KEY = 'lieferung615.highscores.v1';

export function loadScores() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveScore(entry) {
  const list = loadScores();
  entry.id = Date.now() + Math.random();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, 100);
  try { localStorage.setItem(KEY, JSON.stringify(trimmed)); } catch { /* ignorieren */ }
  return { list: trimmed, rank: trimmed.findIndex((e) => e.id === entry.id) + 1, id: entry.id };
}

export function rankFor(score) {
  return loadScores().filter((e) => e.score > score).length + 1;
}

export function bestScore() {
  const l = loadScores();
  return l.length ? l[0].score : 0;
}
