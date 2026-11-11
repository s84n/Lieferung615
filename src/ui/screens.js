// Titel-, Tutorial- und Ergebnis-Screens
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function showScreen(name) {
  for (const s of ['title', 'tutorial', 'results']) $(`screen-${s}`).classList.toggle('hidden', s !== name);
}

export function renderBoard(el, list, highlightId = null, count = 10) {
  if (!list.length) {
    el.innerHTML = '<li class="empty">Noch keine Einträge – sei die/der Erste!</li>';
    return;
  }
  let rows = list.slice(0, count);
  const hiIdx = list.findIndex((e) => e.id === highlightId);
  let extra = '';
  if (highlightId && hiIdx >= count) {
    const e = list[hiIdx];
    extra = `<li class="me" style="counter-set: r ${hiIdx}"><span class="n">${esc(e.name)}</span><span class="s">${e.score.toLocaleString('de-DE')}</span></li>`;
  }
  const t = (e) => (e.title ? `<small class="t">${esc(e.title)}</small>` : '');
  el.innerHTML = rows.map((e) => `<li class="${e.id === highlightId ? 'me' : ''}"><span class="n">${esc(e.name)}${t(e)}</span><span class="s">${e.score.toLocaleString('de-DE')}</span></li>`).join('') + extra;
}

export function showResults(stats, rank) {
  $('res-score').textContent = stats.score.toLocaleString('de-DE');
  $('res-deliveries').textContent = stats.deliveries;
  $('res-combo').textContent = `×${stats.maxMult.toLocaleString('de-DE')}`;
  $('res-crashes').textContent = stats.crashes;
  $('res-rank').textContent = rank;
  $('res-urgent').textContent = stats.urgent;
  $('res-docks').textContent = stats.docks;
  const [, title, icon] = stats.title;
  $('res-title').innerHTML = `<span class="ico">${icon}</span>Rang: <b>${title}</b>`;
  $('name-entry').classList.remove('hidden');
  $('res-board-wrap').classList.add('hidden');
  const input = $('name-input');
  input.value = '';
  showScreen('results');
  setTimeout(() => input.focus(), 50);
}

export function showResultBoard(list, id) {
  $('name-entry').classList.add('hidden');
  $('res-board-wrap').classList.remove('hidden');
  renderBoard($('res-board'), list, id, 10);
  $('name-input').blur();
}

export function getName() {
  const v = $('name-input').value.trim().toUpperCase().slice(0, 12);
  return v || 'ANONYM';
}
