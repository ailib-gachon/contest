'use strict';

(() => {
  const { get, node, link, table, gridPanel, reviewScope } = window.contestHub;
  const api = window.contestApi;
  const contestPicker = get('contest-picker');
  const content = get('workspace-content');
  const settings = window.libraryContestSettings;
  const videoPlayer = window.createContestVideoPlayer(get('player'));
  const criteriaFor = (event) => event.criteria.filter(({ mode }) => mode !== 'loans');
  let session;
  let loginAttempt;
  let pending = false;
  let reviewQueued = false;
  let assignments = [];
  let data;
  let activeId = '';
  let changes = false;

  function status(id, text = '', error = false) {
    get(id).textContent = text;
    get(id).dataset.error = String(error);
  }

  async function rpc(name, parameters, active = session) {
    const result = await api.request(`/rest/v1/rpc/library_contest_${name}`, {
      method: 'POST', body: parameters, token: active.token, signal: active.controller.signal
    });
    if (result.status !== 204) return result.json();
  }

  function clear(message = '') {
    loginAttempt?.abort();
    loginAttempt = undefined;
    session?.controller.abort();
    clearTimeout(session?.timer);
    session = undefined;
    data = undefined;
    pending = false;
    reviewQueued = false;
    assignments = [];
    content.inert = false;
    content.hidden = false;
    changes = false;
    activeId = '';
    contestPicker.replaceChildren();
    settings.clear();
    content.replaceChildren();
    get('workspace').hidden = true;
    get('login-panel').hidden = false;
    get('password').value = '';
    get('login-button').disabled = !api.configured;
    status('workspace-status');
    status('action-status');
    status('auth-status', api.configured ? message : 'Supabase 연결 정보를 확인해 주세요.');
    videoPlayer.close();
  }

  get('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending || session || !api.configured) return;
    pending = true;
    get('login-button').disabled = true;
    status('auth-status', '로그인 중…');
    const body = { email: get('email').value.trim(), password: get('password').value };
    get('password').value = '';
    let active;
    const attempt = new AbortController();
    loginAttempt = attempt;
    try {
      const response = await api.request('/auth/v1/token?grant_type=password', { method: 'POST', body, signal: attempt.signal });
      const result = await response.json();
      if (!result.access_token || !Number.isFinite(result.expires_in) || result.expires_in <= 0) {
        throw new Error('Invalid session');
      }
      active = { token: result.access_token, controller: attempt };
      const [items, controls] = await Promise.all([
        rpc('list', {}, active),
        rpc('settings_overview', {}, active).catch((error) => {
          if (error.status === 404) return null;
          throw error;
        })
      ]);
      if (attempt.signal.aborted) return;
      if (!items.length && !controls) {
        const message = reviewScope() ? '이 계정에는 이 공모전의 심사·운영 권한이 없습니다.' :
          '이 계정에 배정된 공모전이 없습니다.';
        status('auth-status', message, true);
        return;
      }
      active.timer = setTimeout(() => clear('로그인 시간이 만료되었습니다. 다시 로그인해 주세요.'), result.expires_in * 1000);
      session = active;
      fillContests(items);
      if (controls) settings.enable(controls, async (name, fields) => rpc(name, fields, active), refreshAll);
      get('workspace').hidden = false;
      get('login-panel').hidden = true;
      pending = false;
      const scope = reviewScope();
      if (controls && (scope ? !items.some(({ slug }) => slug === scope) : !items.length)) settings.open(scope);
      await syncReview();
    } catch (error) {
      if (!attempt.signal.aborted) status('auth-status', active ? '공통 심사 설정을 확인해 주세요.' : api.loginError(error), true);
    } finally {
      if (active && active !== session) api.revokeSession(active.token);
      if (loginAttempt === attempt) loginAttempt = undefined;
      if (!session && !attempt.signal.aborted) {
        pending = false;
        get('login-button').disabled = false;
      }
    }
  });

  function fillContests(items) {
    assignments = items;
    const selection = contestPicker.value;
    contestPicker.replaceChildren(...items.map((item) =>
      new Option(`${item.name} · ${item.role === 'operator' ? '운영자' : '심사위원'}`, item.slug)));
    if (items.some(({ slug }) => slug === selection)) contestPicker.value = selection;
  }

  function syncReview(reload = false) {
    const scope = reviewScope();
    if (!session || scope === null) return;
    contestPicker.parentElement.hidden = Boolean(scope) || !assignments.length;
    const requested = scope || contestPicker.value;
    if (pending) {
      reviewQueued = true;
      if (data?.event.slug !== requested) {
        content.hidden = true;
        status('workspace-status', '선택한 공모전으로 이동하는 중입니다…');
        status('action-status');
      }
      return;
    }
    if (data && data.event.slug !== requested && !discard()) {
      location.hash = `review/${data.event.slug}`;
      return;
    }
    if (!assignments.some(({ slug }) => slug === requested)) {
      data = undefined;
      activeId = '';
      changes = false;
      content.hidden = true;
      content.replaceChildren();
      status('action-status');
      status('workspace-status', scope ? '이 계정에는 이 공모전의 심사·운영 권한이 없습니다.' : '', Boolean(scope));
      return;
    }
    contestPicker.value = requested;
    if (!reload && data?.event.slug === requested) {
      content.hidden = false;
      status('workspace-status', `${data.event.name} · ${data.entries.length}개 작품`);
      return;
    }
    return loadContest(requested, data?.event.slug === requested ? activeId : '');
  }
  window.addEventListener('hashchange', () => {
    const scope = reviewScope();
    if (scope && !get('settings-panel').hidden) settings.open(scope);
    syncReview();
  });

  async function refreshAll() {
    const active = session;
    if (!active) return;
    const items = await rpc('list', {}, active);
    if (active !== session) return;
    fillContests(items);
    await syncReview(!changes);
    await window.contestHub.refreshCatalog();
  }

  function setBusy(busy) {
    pending = busy;
    contestPicker.disabled = busy;
    get('logout').disabled = busy;
    content.inert = busy;
    if (!busy && reviewQueued) {
      reviewQueued = false;
      queueMicrotask(() => syncReview());
    }
  }

  function discard() {
    return !changes || window.confirm('저장하지 않은 변경사항을 버리시겠습니까?');
  }

  async function loadContest(slug, nextId = '') {
    if (pending || !session) return;
    const active = session;
    setBusy(true);
    if (data?.event.slug !== slug) content.hidden = true;
    status('action-status');
    status('workspace-status', '공모전 자료를 불러오는 중입니다…');
    try {
      const payload = await rpc('workspace', { p_slug: slug }, active);
      if (active !== session) return;
      data = payload;
      activeId = payload.entries.some(({ id }) => id === nextId) ? nextId : '';
      if (payload.role === 'judge') activeId ||= payload.entries[0]?.id ?? '';
      renderWorkspace();
      const scope = reviewScope();
      content.hidden = Boolean(scope && scope !== data.event.slug);
    } catch (error) {
      if (active !== session) return;
      if ([401, 403].includes(error.status)) {
        clear('다시 로그인해 주세요.');
      } else {
        if (data) contestPicker.value = data.event.slug;
        const scope = reviewScope();
        content.hidden = Boolean(scope && scope !== data?.event.slug);
        status('workspace-status', '공모전 자료를 불러오지 못했습니다.', true);
      }
    } finally {
      if (active === session) setBusy(false);
    }
  }

  get('logout').addEventListener('click', () => {
    if (!discard() || !settings.allowDiscard()) return;
    const token = session?.token;
    clear('로그아웃했습니다.');
    if (token) api.revokeSession(token);
  });
  contestPicker.addEventListener('change', () => {
    if (discard()) loadContest(contestPicker.value);
    else contestPicker.value = data?.event.slug ?? '';
  });
  window.addEventListener('beforeunload', (event) => {
    if (changes) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  window.addEventListener('pagehide', () => clear());

  function input(label, key, value, { type = 'text', required = false, max, min, multi = false } = {}) {
    const group = node('label', label);
    const field = node(multi ? 'textarea' : 'input');
    field.name = key;
    if (multi) field.rows = 3;
    else field.type = type;
    field.required = required;
    if (min != null) field.min = min;
    if (max != null) field.max = max;
    field.value = value ?? '';
    group.append(field);
    return group;
  }

  function form(action, handler, ...fields) {
    const wrapper = node('form');
    wrapper.method = 'post';
    const submit = node('button', action, 'button');
    submit.type = 'submit';
    wrapper.append(...fields, submit);
    wrapper.addEventListener('input', () => { changes = true; });
    wrapper.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!pending && session) handler(Object.fromEntries(new FormData(wrapper)));
    });
    return wrapper;
  }

  async function save(name, values, entryId, message) {
    const active = session;
    const slug = data.event.slug;
    setBusy(true);
    status('action-status', '저장 중…');
    try {
      await rpc(name, { p_slug: slug, ...values }, active);
      if (active !== session) return;
      changes = false;
      setBusy(false);
      await loadContest(slug, entryId);
      if (active === session) status('action-status', message);
    } catch (error) {
      if (active !== session) return;
      const message = error.status === 409 || error.code === '23505' ?
        '다른 변경 사항이 있거나 작품 번호가 이미 사용 중입니다. 목록을 갱신해 주세요.' :
        '저장하지 못했습니다. 로그인과 입력값을 확인해 주세요.';
      status('action-status', message, true);
    } finally {
      if (active === session) setBusy(false);
    }
  }

  function operatorForm(event, item) {
    const hasLoans = event.criteria.some(({ mode }) => mode === 'loans');
    const fields = [
      input('작품 번호', 'code', item?.code, { required: true }),
      input('참가자 또는 팀명', 'participant', item?.participant, { required: true }),
      input('작품명', 'title', item?.title, { required: true }),
      input('심사용 Drive 링크', 'drive_url', item?.drive_url, { type: 'url', required: true }),
      input('보고서 Drive 링크 (선택)', 'report_url', item?.report_url, { type: 'url' }),
      input('영상 Drive 링크 (한 줄에 하나씩 최대 10개)', 'videos', item?.videos.join('\n'), { multi: true })
    ];
    if (hasLoans) fields.push(input('확인한 적격 도서 대출 권수', 'loan_count', item?.loan_count, { type: 'number', min: 1, required: true }));
    return [
      node('p', '심사위원에게는 작품 번호와 심사 자료가 보입니다. 링크에는 식별 정보를 가린 자료를 연결하세요.', 'lede'),
      form(item ? '변경사항 저장' : '작품 등록', (values) => {
        const videoUrls = values.videos.split('\n').map((value) => value.trim()).filter(Boolean);
        const videos = videoUrls.map(api.driveVideoLinks);
        if (videos.length > 10 || videos.some((video) => !video)) {
          status('action-status', '영상 파일의 Drive 공유 링크를 한 줄에 한 개씩 최대 10개 입력해 주세요.', true);
          return;
        }
        const id = item?.id ?? crypto.randomUUID();
        save('save_entry', {
          p_entry: { ...values, id, revision: item?.revision, videos: videos.map(({ view }) => view) }
        }, id, '작품을 저장했습니다.');
      }, ...fields)
    ];
  }

  function driveLink(url, label) {
    if (!/^https:\/\/(drive|docs)\.google\.com\/\S+$/u.test(url ?? '')) return;
    const anchor = link(url, label, 'button secondary');
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  }

  function judgeForm(event, item) {
    const score = data.scores.find(({ entry_id }) => entry_id === item.id)?.marks;
    const actions = node('div', null, 'actions');
    for (const anchor of [driveLink(item.drive_url, '심사 자료 열기 ↗'), driveLink(item.report_url, '보고서 열기 ↗')]) {
      if (anchor) actions.append(anchor);
    }
    item.videos.map(api.driveVideoLinks).filter(Boolean).forEach((video, index) => {
      const button = node('button', `시연 영상 ${index + 1}`, 'button secondary');
      button.type = 'button';
      button.addEventListener('click', () => {
        if (session) videoPlayer.open(video, `시연 영상 ${index + 1}`);
      });
      actions.append(button);
    });
    const criterionGrid = node('div', null, 'rubrics');
    const criteria = criteriaFor(event);
    criterionGrid.append(...criteria.map(({ key, label, max, description }) => {
      const card = node('div', null, 'rubric-card');
      const group = input(`${label} · ${max}점`, key, score?.[key], { type: 'number', min: 0, max, required: true });
      group.insertBefore(node('p', description), group.lastElementChild);
      card.append(group);
      const bands = window.libraryContests.find(({ id }) => id === event.slug)?.bands?.[key];
      if (bands) {
        const detail = node('details');
        const list = node('ul');
        list.append(...bands.map(([range, explanation]) => node('li', `${range}점 · ${explanation}`)));
        detail.append(node('summary', '점수 구간 기준'), list);
        card.append(detail);
      }
      return card;
    }));
    const maximum = criteria.reduce((sum, item) => sum + item.max, 0);
    const marksTotal = node('p');
    const scoreForm = form('점수 저장', (marks) =>
      save('save_score', { p_entry: item.id, p_marks: Object.fromEntries(Object.entries(marks).map(([key, value]) => [key, Number(value)])) },
        item.id, '점수를 저장했습니다.'), criterionGrid, marksTotal);
    function updateTotal() {
      const fields = [...criterionGrid.querySelectorAll('input')];
      const total = fields.every((field) => field.checkValidity()) ?
        fields.reduce((sum, field) => sum + field.valueAsNumber, 0) : '—';
      marksTotal.textContent = `심사위원 배점 합계 ${total} / ${maximum}점`;
    }
    scoreForm.addEventListener('input', updateTotal);
    updateTotal();
    return [actions, scoreForm];
  }

  function totalsFor(event, entry, marks) {
    return event.criteria.map(({ key, mode, max }) =>
      mode === 'loans' ? Math.min(max, Math.max(0, entry.loan_count - 1) * 2) : marks[key]);
  }

  function judgeDetails(event, item) {
    const scores = new Map(data.scores.filter(({ entry_id }) => entry_id === item.id)
      .map(({ judge_id, marks }) => [judge_id, marks]));
    return gridPanel('심사위원별 점수',
      table(['심사위원', ...event.criteria.map(({ label }) => label), '총점'], data.judges.map(({ id, name }) => {
        const marks = scores.get(id);
        if (!marks) return [name, ...event.criteria.map(() => '—'), '미채점'];
        const values = totalsFor(event, item, marks);
        return [name, ...values, values.reduce((a, b) => a + b, 0)];
      })));
  }

  function rankingPanel(event) {
    const roster = data.judges;
    const byEntry = new Map(data.entries.map(({ id }) => [id, new Map()]));
    for (const score of data.scores) byEntry.get(score.entry_id).set(score.judge_id, score.marks);
    const sum = (values) => values.reduce((a, b) => a + b, 0);
    const rows = data.entries.map((entry) => {
      const scores = byEntry.get(entry.id);
      const values = roster.filter(({ id }) => scores.has(id))
        .map(({ id }) => totalsFor(event, entry, scores.get(id)));
      const sums = event.criteria.map((_, index) => sum(values.map((row) => row[index])));
      return {
        entry, count: values.length, total: sum(sums), judgeTotals: values.map(sum),
        ties: event.tie_keys.map((key) => sums[event.criteria.findIndex((criterion) => criterion.key === key)])
      };
    });
    const complete = roster.length > 0 && rows.every(({ count }) => count === roster.length);
    const compare = (a, b) => b.total - a.total ||
      b.ties.map((score, i) => score - a.ties[i]).find(Boolean) || 0;
    if (complete) {
      rows.sort(compare);
      for (let i = 0; i < rows.length;) {
        let end = i + 1;
        while (end < rows.length && compare(rows[i], rows[end]) === 0) end++;
        const group = rows.slice(i, end);
        const wins = (a, b) => sum(a.judgeTotals.map((score, index) => Math.sign(score - b.judgeTotals[index])));
        group.forEach((row) => {
          row.ahead = event.pairwise ? group.filter((other) => wins(other, row) > 0).length : 0;
        });
        const conflict = event.pairwise && group.some((a) => group.some((b) =>
          Math.sign(wins(a, b)) !== Math.sign(b.ahead - a.ahead)));
        for (const row of group) row.rank = conflict ? '검토 필요' : i + 1 + row.ahead;
        rows.splice(i, group.length, ...group.sort((a, b) => a.ahead - b.ahead));
        i = end;
      }
    }
    return gridPanel(event.preliminary ? '예심 집계' : '심사 집계 및 순위',
      node('p', event.preliminary ? '이 집계는 예심용입니다. 본선 공개 투표와 특별상은 별도 운영합니다.' :
        '전 작품의 채점이 완료되면 동점 기준을 적용해 순위를 표시합니다.', 'lede'),
      table(['순위', '작품 번호', '작품명', '채점 완료', '평균 / 100'], rows.map((row) =>
        [row.rank, row.entry.code, row.entry.title, `${row.count} / ${roster.length}`,
          row.count ? (row.total / row.count).toFixed(2) : null])));
  }

  function renderWorkspace() {
    videoPlayer.close();
    changes = false;
    status('action-status');
    const { event, role, entries } = data;
    status('workspace-status', `${event.name} · ${entries.length}개 작품`);
    const item = entries.find(({ id }) => id === activeId);
    if (!item && role === 'judge') {
      content.replaceChildren(gridPanel('심사할 작품', node('p', '등록된 작품이 없습니다.')));
      return;
    }
    const picker = node('select');
    const title = node('label', '작품 선택');
    const options = entries.map((entry) => {
      const scored = role === 'judge' && data.scores.some(({ entry_id }) => entry_id === entry.id);
      return new Option([entry.code, entry.title, scored ? '채점 완료' : null].filter(Boolean).join(' · '), entry.id);
    });
    if (role === 'operator') options.unshift(new Option('새 작품 등록', ''));
    picker.replaceChildren(...options);
    picker.value = activeId;
    picker.addEventListener('change', () => {
      if (discard()) {
        activeId = picker.value;
        renderWorkspace();
      } else picker.value = activeId;
    });
    title.append(picker);
    const refresh = node('button', '목록과 점수 새로고침', 'button secondary');
    refresh.type = 'button';
    refresh.addEventListener('click', () => { if (discard()) loadContest(event.slug, activeId); });
    const grid = node('div', null, 'work-grid');
    const fields = role === 'operator' ? operatorForm(event, item) : judgeForm(event, item);
    grid.append(gridPanel('작품', title, refresh),
      gridPanel(role === 'operator' ? (item ? '작품 수정' : '새 작품 등록') : `작품 ${item.code} 채점`, ...fields));
    content.replaceChildren(grid);
    if (role === 'operator') {
      if (item) content.append(judgeDetails(event, item));
      content.append(rankingPanel(event));
    }
  }

  clear();
})();
