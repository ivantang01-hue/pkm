/**
 * pkm UI — reads local JSON under data/.
 * Expects Pokemon / PokemonIndexEntry shapes from src/types.ts
 * (displayName prefers zh-Hant; displayNameJa / displayNameZh / wikiUrl optional).
 */

/** @typedef {import('../src/types.ts').Pokemon} Pokemon */
/** @typedef {import('../src/types.ts').PokemonIndexEntry} PokemonIndexEntry */

const TYPE_LABELS = {
  normal: { zh: '一般', ja: 'ノーマル' },
  fire: { zh: '火', ja: 'ほのお' },
  water: { zh: '水', ja: 'みず' },
  electric: { zh: '電', ja: 'でんき' },
  grass: { zh: '草', ja: 'くさ' },
  ice: { zh: '冰', ja: 'こおり' },
  fighting: { zh: '格鬥', ja: 'かくとう' },
  poison: { zh: '毒', ja: 'どく' },
  ground: { zh: '地面', ja: 'じめん' },
  flying: { zh: '飛行', ja: 'ひこう' },
  psychic: { zh: '超能力', ja: 'エスパー' },
  bug: { zh: '蟲', ja: 'むし' },
  rock: { zh: '岩石', ja: 'いわ' },
  ghost: { zh: '幽靈', ja: 'ゴースト' },
  dragon: { zh: '龍', ja: 'ドラゴン' },
  dark: { zh: '惡', ja: 'あく' },
  steel: { zh: '鋼', ja: 'はがね' },
  fairy: { zh: '妖精', ja: 'フェアリー' },
};

const STAT_LABELS = [
  { key: 'hp', zh: 'HP', ja: 'HP' },
  { key: 'attack', zh: '攻擊', ja: 'こうげき' },
  { key: 'defense', zh: '防禦', ja: 'ぼうぎょ' },
  { key: 'specialAttack', zh: '特攻', ja: 'とくこう' },
  { key: 'specialDefense', zh: '特防', ja: 'とくぼう' },
  { key: 'speed', zh: '速度', ja: 'すばやさ' },
];

const LEARN_METHOD = {
  'level-up': '升級 / レベルアップ',
  machine: '招式學習器 / わざマシン',
  egg: '遺傳 / タマゴ',
  tutor: '教學 / わざ教え',
  other: '其他 / その他',
};

const DAMAGE_CLASS = {
  physical: { zh: '物理', className: 'phys' },
  special: { zh: '特殊', className: 'spec' },
  status: { zh: '變化', className: 'stat' },
};

const state = {
  index: /** @type {PokemonIndexEntry[]} */ ([]),
  filtered: /** @type {PokemonIndexEntry[]} */ ([]),
  selectedId: /** @type {number | null} */ (null),
  cache: /** @type {Map<number, Pokemon>} */ (new Map()),
};

const el = {
  search: /** @type {HTMLInputElement} */ (document.getElementById('search')),
  typeFilter: /** @type {HTMLSelectElement} */ (document.getElementById('type-filter')),
  status: /** @type {HTMLElement} */ (document.getElementById('status')),
  grid: /** @type {HTMLElement} */ (document.getElementById('grid')),
  detail: /** @type {HTMLElement} */ (document.getElementById('detail')),
  detailBody: /** @type {HTMLElement} */ (document.getElementById('detail-body')),
  detailClose: /** @type {HTMLButtonElement} */ (document.getElementById('detail-close')),
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function padId(id) {
  return `#${String(id).padStart(3, '0')}`;
}

/** Prefer zh-Hant display name from common field variants. */
function nameZh(item) {
  return (
    item.displayNameZh ||
    item.displayNameHant ||
    item.nameZh ||
    item.displayName ||
    item.name ||
    ''
  );
}

function nameJa(item) {
  return item.displayNameJa || item.nameJa || item.names?.ja || '';
}

function typeLabel(type) {
  const t = TYPE_LABELS[type];
  if (!t) return type;
  return `${t.zh} / ${t.ja}`;
}

function typeBadge(type) {
  const t = TYPE_LABELS[type];
  const label = t ? t.zh : type;
  return `<span class="type-badge type-${esc(type)}">${esc(label)}</span>`;
}

function wikiHref(item) {
  if (item.wikiUrl) return item.wikiUrl;
  const zh = nameZh(item);
  if (zh) return `https://wiki.52poke.com/wiki/${encodeURIComponent(zh)}`;
  return null;
}

function populateTypeFilter(entries) {
  const types = [...new Set(entries.flatMap((e) => e.types || []))].sort();
  for (const type of types) {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = typeLabel(type);
    el.typeFilter.appendChild(opt);
  }
}

function applyFilters() {
  const q = el.search.value.trim().toLowerCase();
  const type = el.typeFilter.value;
  state.filtered = state.index.filter((p) => {
    if (type && !(p.types || []).includes(type)) return false;
    if (!q) return true;
    const hay = [
      p.name,
      p.displayName,
      p.displayNameZh,
      p.displayNameJa,
      p.nameJa,
      nameZh(p),
      nameJa(p),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
  renderGrid();
}

function renderGrid() {
  const n = state.filtered.length;
  const total = state.index.length;
  el.status.textContent =
    total === 0
      ? '尚無資料。請先執行 npm run ingest。 / データがありません。'
      : `顯示 ${n} / ${total} 隻 ・ ${n} / ${total} 匹`;

  if (n === 0) {
    el.grid.innerHTML =
      total === 0
        ? `<p class="empty-hint">資料目錄為空。<br/>請執行 <code>npm run ingest</code> 後重新整理。</p>`
        : `<p class="empty-hint">沒有符合條件的寶可夢。<br/>条件に合うポケモンがありません。</p>`;
    return;
  }

  el.grid.innerHTML = state.filtered
    .map((p) => {
      const zh = nameZh(p);
      const ja = nameJa(p);
      const active = p.id === state.selectedId ? ' active' : '';
      return `
      <button type="button" class="card${active}" data-id="${p.id}" aria-pressed="${p.id === state.selectedId}">
        <span class="card-id">${padId(p.id)}</span>
        <img class="card-sprite" src="${esc(p.spriteUrl)}" alt="${esc(zh)}" loading="lazy" width="96" height="96" />
        <span class="card-name">${esc(zh)}</span>
        ${ja ? `<span class="card-name-ja">${esc(ja)}</span>` : ''}
        <span class="card-meta">
          ${(p.types || []).map(typeBadge).join('')}
          <span class="bst">合計 ${p.baseStatTotal ?? '—'}</span>
        </span>
      </button>`;
    })
    .join('');
}

async function loadPokemon(id) {
  if (state.cache.has(id)) return state.cache.get(id);
  const res = await fetch(`data/pokemon/${id}.json`);
  if (!res.ok) throw new Error(`無法載入 #${id}`);
  const data = await res.json();
  state.cache.set(id, data);
  return data;
}

function renderStatBars(stats) {
  const max = 255;
  return STAT_LABELS.map(({ key, zh }) => {
    const val = stats?.[key] ?? 0;
    const pct = Math.min(100, Math.round((val / max) * 100));
    return `
      <div class="stat-row">
        <span class="stat-label">${esc(zh)}</span>
        <span class="stat-val">${val}</span>
        <div class="stat-bar" title="${val}"><span style="width:${pct}%"></span></div>
      </div>`;
  }).join('');
}

function renderAbilities(abilities) {
  if (!abilities?.length) return '<p class="empty-hint">無特性資料</p>';
  return `<ul class="ability-list">${abilities
    .map((a) => {
      const zh = nameZh(a);
      const ja = nameJa(a);
      const wiki = wikiHref(a);
      return `
      <li class="ability-item">
        <div class="ability-head">
          <span class="ability-name">${esc(zh)}</span>
          ${ja ? `<span class="ability-ja">${esc(ja)}</span>` : ''}
          ${a.isHidden ? '<span class="hidden-tag">隱藏特性 / 隠れ特性</span>' : ''}
          ${wiki ? `<a class="wiki-link" href="${esc(wiki)}" target="_blank" rel="noopener noreferrer">百科</a>` : ''}
        </div>
        ${(a.shortEffectZh || a.shortEffectJa || a.shortEffect) ? `<p class="ability-effect">${esc(a.shortEffectZh || a.shortEffectJa || a.shortEffect)}</p>` : ''}
      </li>`;
    })
    .join('')}</ul>`;
}

function renderMoves(moves) {
  if (!moves?.length) return '<p class="empty-hint">無招式資料</p>';
  const rows = [...moves]
    .sort((a, b) => {
      const ma = a.learnMethod === 'level-up' ? 0 : 1;
      const mb = b.learnMethod === 'level-up' ? 0 : 1;
      if (ma !== mb) return ma - mb;
      return (a.levelLearnedAt ?? 0) - (b.levelLearnedAt ?? 0);
    })
    .map((m) => {
      const zh = nameZh(m);
      const ja = nameJa(m);
      const dc = DAMAGE_CLASS[m.damageClass] || { zh: m.damageClass || '—', className: '' };
      const method = LEARN_METHOD[m.learnMethod] || m.learnMethod || '—';
      const lvl =
        m.learnMethod === 'level-up' && m.levelLearnedAt != null
          ? `Lv.${m.levelLearnedAt}`
          : '—';
      return `
      <tr>
        <td class="move-names">
          <strong>${esc(zh)}</strong>
          ${ja ? `<span class="move-ja">${esc(ja)}</span>` : ''}
        </td>
        <td>${typeBadge(m.type)}</td>
        <td class="${dc.className}">${esc(dc.zh)}</td>
        <td>${m.power ?? '—'}</td>
        <td>${m.accuracy ?? '—'}</td>
        <td>${m.pp ?? '—'}</td>
        <td>${esc(method)}</td>
        <td>${esc(lvl)}</td>
      </tr>`;
    })
    .join('');

  return `
    <div class="moves-wrap">
      <table class="moves-table">
        <thead>
          <tr>
            <th>招式 / わざ</th>
            <th>屬性</th>
            <th>分類</th>
            <th>威力</th>
            <th>命中</th>
            <th>PP</th>
            <th>習得</th>
            <th>等級</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderDetail(p) {
  const zh = nameZh(p);
  const ja = nameJa(p);
  const wiki = wikiHref(p);
  const bst = p.baseStats
    ? Object.values(p.baseStats).reduce((s, n) => s + (n || 0), 0)
    : '—';

  el.detailBody.innerHTML = `
    <div class="detail-hero">
      <img src="${esc(p.spriteUrl)}" alt="${esc(zh)}" width="128" height="128" />
      <div>
        <div class="detail-id">${padId(p.id)} · 合計 ${bst}</div>
        <h2 class="detail-title">${esc(zh)}</h2>
        ${ja ? `<p class="detail-ja">${esc(ja)}</p>` : ''}
        <div class="card-meta" style="margin-top:0.5rem">${(p.types || []).map(typeBadge).join('')}</div>
        ${
          wiki
            ? `<a class="wiki-link" href="${esc(wiki)}" target="_blank" rel="noopener noreferrer">52poke 百科 →</a>`
            : ''
        }
      </div>
    </div>

    <h3 class="section-title">種族值 / 種族値</h3>
    <div class="stat-rows">${renderStatBars(p.baseStats)}</div>

    <h3 class="section-title">特性 / 特性</h3>
    ${renderAbilities(p.abilities)}

    <h3 class="section-title">招式 / わざ</h3>
    ${renderMoves(p.moves)}
  `;
  el.detail.hidden = false;
}

async function selectPokemon(id) {
  state.selectedId = id;
  renderGrid();
  el.detailBody.innerHTML = `<p class="status">載入中…</p>`;
  el.detail.hidden = false;
  try {
    const p = await loadPokemon(id);
    renderDetail(p);
  } catch (err) {
    el.detailBody.innerHTML = `<p class="status error">載入失敗：${esc(err.message)}</p>`;
  }
}

function bindEvents() {
  el.search.addEventListener('input', applyFilters);
  el.typeFilter.addEventListener('change', applyFilters);
  el.grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.card');
    if (!btn) return;
    selectPokemon(Number(btn.dataset.id));
  });
  el.detailClose.addEventListener('click', () => {
    el.detail.hidden = true;
    state.selectedId = null;
    renderGrid();
  });
}

async function main() {
  bindEvents();
  if (location.protocol === 'file:') {
    el.status.classList.add('error');
    el.status.textContent = '請勿直接開啟 HTML（會一直「載入中…」）。請用本機伺服器。';
    el.grid.innerHTML = `<p class="empty-hint">在 <code>pkm</code> 資料夾執行：<br/><code>npm run serve</code><br/>或<br/><code>python3 -m http.server 5173</code><br/>然後開 <code>http://localhost:5173</code><br/><br/>file:// では JSON を読めません。</p>`;
    return;
  }
  try {
    const res = await fetch('data/index.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.index = Array.isArray(data) ? data : data.pokemon || data.entries || [];
    state.index.sort((a, b) => a.id - b.id);
    populateTypeFilter(state.index);
    applyFilters();
    if (state.index.length && window.matchMedia('(min-width: 960px)').matches) {
      selectPokemon(state.index[0].id);
    }
  } catch (err) {
    el.status.classList.add('error');
    el.status.textContent =
      `無法載入 data/index.json（${err.message}）。請用本機伺服器開啟。`;
    el.grid.innerHTML = `<p class="empty-hint">請執行 <code>npm run serve</code> 或<br/><code>python3 -m http.server 5173</code> 後再開啟。<br/>ファイルプロトコルでは JSON を読めません。</p>`;
  }
}

main();
