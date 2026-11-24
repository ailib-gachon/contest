'use strict';

window.contestHub = (() => {
  const get = (id) => document.getElementById(id);
  const localPreview = location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  window.libraryContestPresets = [...window.libraryContests];
  const presets = window.libraryContestPresets.filter((item) => !item.draft || localPreview);
  const contests = window.libraryContests;
  contests.splice(0, contests.length, ...presets);
  const markers = { open: '접수 중', planned: '준비 중', closed: '접수 종료' };
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const state = (item) => item.draft || !item.start || !item.end || today < item.start ?
    'planned' : today > item.end ? 'closed' : 'open';
  let filter = 'all';

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function link(href, text, className) {
    const element = node('a', text, className);
    element.href = href;
    return element;
  }

  function httpsUrl(value) {
    try {
      return new URL(value).protocol === 'https:' ? value : undefined;
    } catch {
      return undefined;
    }
  }

  function gridPanel(heading, ...content) {
    const panel = node('section', null, 'panel');
    panel.append(node('h2', heading), ...content);
    return panel;
  }

  function table(headings, rows) {
    const wrapper = node('div', null, 'table-wrap');
    const table = node('table');
    const heading = table.createTHead().insertRow();
    for (const text of headings) {
      const cell = node('th', text);
      cell.scope = 'col';
      heading.append(cell);
    }
    const body = table.createTBody();
    for (const row of rows) {
      const tr = body.insertRow();
      for (const value of row) {
        const td = tr.insertCell();
        if (value instanceof Node) td.append(value);
        else td.textContent = value ?? '—';
      }
    }
    wrapper.append(table);
    return wrapper;
  }

  function renderCards() {
    const items = contests
      .filter((item) => filter === 'all' || state(item) === filter)
      .sort((a, b) => ['open', 'planned', 'closed'].indexOf(state(a)) - ['open', 'planned', 'closed'].indexOf(state(b))
        || (b.start ?? '').localeCompare(a.start ?? ''));
    get('cards').replaceChildren(...items.map((item) => {
      const card = node('article', null, 'card');
      const top = node('div', null, 'card-top');
      top.append(node('span', `${item.year} · ${item.kind}`), node('span', markers[state(item)], `state ${state(item)}`));
      card.append(top, node('h3', item.name), node('p', item.summary), link(`#contest/${item.id}`, '안내 보기 →'));
      return card;
    }));
    get('list-status').textContent = items.length ? '' : '해당 상태의 공모전이 없습니다.';
  }

  function renderDetail(item) {
    const detail = get('detail');
    const actions = node('div', null, 'actions');
    if (item.apply && state(item) === 'open') {
      actions.append(link(item.apply, item.type === 'WIND' ? 'WIND에서 접수 ↗' : '접수 안내 열기 ↗', 'button'));
    }
    if (item.source) actions.append(link(item.source, `${item.sourceLabel ?? '공식 공고'} ↗`, 'button secondary'));
    if (item.review) actions.append(link(item.review, '심사위원 페이지', 'button secondary'), link(item.manage, '관리자 페이지', 'button secondary'));
    if (item.criteria) actions.append(link(`#review/${item.id}`, '심사·운영', 'button secondary'));
    const title = node('h1', item.name);
    title.tabIndex = -1;
    detail.replaceChildren(link('#list', '← 공모전 목록', 'back'), node('p', `${item.year} · ${markers[state(item)]}`, `state ${state(item)}`),
      title, node('p', item.summary, 'lede'), node('p', item.audience, 'lede'), actions);
    if (item.draft) detail.append(node('p', '시행안 기준입니다. 접수 기간과 온라인 접수 폼은 공식 공고에서 확정됩니다.', 'status'));
    if (!item.dates) {
      if (item.start && item.end) detail.append(node('p', `접수 ${item.start} ~ ${item.end} · ${item.type}`, 'status'));
      return title;
    }
    const panels = node('div', null, 'detail-grid');
    const requirements = node('ul');
    requirements.append(...item.submit.map((text) => node('li', text)));
    panels.append(gridPanel('일정', table(['단계', '일자'], item.dates)),
      gridPanel('참가 및 제출', node('p', `접수 채널 · ${item.type}`), requirements));
    detail.append(panels, gridPanel('심사 기준', node('p', item.reviewNote, 'lede'),
      table(['평가 항목', '배점', '평가 기준'], item.criteria.map(([, label, max, description]) => [label, `${max}점`, description]))));
    if (item.prizes?.length) detail.append(gridPanel(item.draft ? '시상 계획' : '시상',
      table(['구분', '인원', '개별 지급'], item.prizes)));
    if (item.awards?.length) {
      const awards = node('ul');
      awards.append(...item.awards.map((text) => node('li', text)));
      detail.append(gridPanel('시상', awards));
    }
    return title;
  }

  function reviewScope() {
    if (location.hash === '#review') return '';
    return location.hash.match(/^#review\/([a-z0-9][a-z0-9-]{0,59})$/)?.[1] ?? null;
  }

  function route(moveFocus) {
    const hash = location.hash.slice(1);
    const scope = reviewScope();
    const item = hash.startsWith('contest/') && contests.find(({ id }) => id === hash.slice(8));
    get('home').hidden = Boolean(item) || scope !== null;
    get('detail').hidden = !item;
    get('review').hidden = scope === null;
    if (item) {
      const heading = renderDetail(item);
      if (moveFocus) heading.focus();
    } else if (scope !== null) {
      const contest = contests.find(({ id }) => id === scope);
      const heading = get('review-title');
      heading.textContent = contest ? `${contest.name} · 심사·운영` : '심사·운영';
      heading.tabIndex = -1;
      get('legacy-review').hidden = Boolean(scope);
      get('review-overview').hidden = !scope;
      get('review-back').href = contest ? `#contest/${contest.id}` : '#list';
      get('review-back').textContent = contest ? '← 공모전 안내' : '← 공모전 목록';
      if (moveFocus) heading.focus();
    } else if (hash === 'list') {
      get('list').scrollIntoView();
    }
    if (hash !== 'list') window.scrollTo(0, 0);
  }

  get('filters').addEventListener('click', ({ target }) => {
    if (!target.dataset.filter) return;
    filter = target.dataset.filter;
    for (const button of get('filters').children) button.setAttribute('aria-pressed', String(button === target));
    renderCards();
  });
  window.addEventListener('hashchange', () => route(true));

  async function refreshCatalog() {
    if (!window.contestApi.configured) return;
    try {
      const response = await window.contestApi.request('/rest/v1/rpc/library_contest_public_catalog');
      const rows = await response.json();
      if (!Array.isArray(rows)) return;
      const byId = new Map(presets.map((item) => [item.id, item]));
      for (const entry of rows) {
        const info = entry.info;
        const strings = (values) => Array.isArray(values) ? values.filter((value) => typeof value === 'string') : [];
        const dates = strings(info.schedule).map((row) => ['진행', row]);
        if (info.start && info.end) dates.unshift(['접수', `${info.start} ~ ${info.end}`]);
        if (!dates.length) dates.push(['일정', '공식 안내에서 확인']);
        byId.set(entry.id, {
          id: entry.id, name: entry.name, year: info.year || '', kind: info.kind || '공모전',
          summary: info.summary || '', audience: info.audience || '', type: info.type || '공식 안내 참고',
          start: info.start, end: info.end, apply: httpsUrl(info.apply), source: httpsUrl(info.source),
          dates, submit: strings(info.submit), awards: strings(info.awards), reviewNote: info.reviewNote,
          criteria: entry.criteria.map(({ key, label, max, description }) => [key, label, max, description]),
          bands: window.libraryContestPresets.find(({ id }) => id === entry.id)?.bands
        });
      }
      contests.splice(0, contests.length, ...byId.values());
      renderCards();
      if (location.hash.startsWith('#contest/') || reviewScope()) route(false);
    } catch {
      // The bundled notices remain usable before the settings functions are installed.
    }
  }

  renderCards();
  route(false);
  refreshCatalog();
  return { get, node, link, table, gridPanel, refreshCatalog, reviewScope };
})();
