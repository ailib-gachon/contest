'use strict';

const { configured, request, revokeSession, loginError } = window.contestApi;
const get = (id) => document.getElementById(id);
const loginFields = get('login-fields');
const entryFields = get('entry-fields');
const entrySelect = get('entry-select');
const entryForm = get('entry-form');
const fieldIds = {
  team_name: 'team-name', title: 'entry-title', drive_url: 'drive-url', report_url: 'report-url'
};
const entryFieldsQuery = 'id,team_name,title,drive_url,report_url,revision';
const scoreKeys = ['creativity', 'appropriateness', 'effectiveness', 'reproducibility'];
const collator = new Intl.Collator('ko');

let loginAttempt;
let session;
let entries = [];
let selected;
let busy = false;
let scoreRequest = 0;
let rankRequest = 0;

function status(id, message = '', error = false) {
  get(id).textContent = message;
  get(id).dataset.error = String(error);
}

function clearSession(message = '', focus = false) {
  loginAttempt?.abort();
  loginAttempt = undefined;
  if (session) {
    clearTimeout(session.expiry);
    session.controller.abort();
  }
  session = undefined;
  entries = [];
  get('dashboard').hidden = true;
  get('login-panel').hidden = false;
  get('signed-in-as').textContent = '';
  get('password').value = '';
  get('sign-in').textContent = '로그인';
  loginFields.disabled = !configured;
  renderSelect();
  showEntry(undefined);
  clearTable('rankings');
  status('entries-status');
  status('rankings-status');
  setBusy(false);
  status('login-status', configured ? message : '관리자 로그인 설정을 확인해 주세요.');
  if (focus) get('email').focus();
}

async function hasManagerAccess(options) {
  const response = await request('/rest/v1/contest_managers?select=user_id&limit=1', options);
  return (await response.json()).length === 1;
}

get('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!configured || loginAttempt || session) return;
  const attempt = new AbortController();
  loginAttempt = attempt;
  const email = get('email').value.trim();
  const password = get('password').value;
  get('password').value = '';
  loginFields.disabled = true;
  get('sign-in').textContent = '로그인 중…';
  status('login-status');

  let token;
  try {
    const response = await request('/auth/v1/token?grant_type=password', {
      method: 'POST', body: { email, password }, signal: attempt.signal
    });
    const { access_token, expires_in } = await response.json();
    if (typeof access_token !== 'string' || !access_token ||
        !Number.isFinite(expires_in) || expires_in <= 0) {
      throw new Error('Missing access token or expiration');
    }
    token = access_token;
    const allowed = await hasManagerAccess({ token, signal: attempt.signal });
    if (attempt.signal.aborted) return;
    if (!allowed) {
      status('login-status', '이 계정에는 공모전 관리자 권한이 없습니다.', true);
      return;
    }
    session = {
      token,
      controller: new AbortController(),
      expiry: setTimeout(() => clearSession('로그인 시간이 만료되었습니다. 다시 로그인해 주세요.', true),
        Math.min(expires_in * 1000, 2_147_483_647))
    };
    get('signed-in-as').textContent = email;
    get('login-panel').hidden = true;
    get('dashboard').hidden = false;
    showPanel('entries');
    get('entries-title').focus();
    loadEntries();
  } catch (error) {
    if (attempt.signal.aborted) return;
    const message = error.code === 'PGRST205' ?
      '관리자 설정이 아직 적용되지 않았습니다.' : '관리자 권한을 확인하지 못했습니다.';
    status('login-status', token ? message : loginError(error), true);
  } finally {
    if (token && session?.token !== token) revokeSession(token);
    if (loginAttempt === attempt) {
      loginAttempt = undefined;
      loginFields.disabled = false;
      get('sign-in').textContent = '로그인';
      if (!session) get('password').focus();
    }
  }
});

function credentials(activeSession) {
  return { token: activeSession.token, signal: activeSession.controller.signal };
}

async function reportError(error, activeSession, id, message) {
  if (activeSession !== session) return;
  if (error.status === 401) {
    clearSession('로그인 시간이 만료되었습니다. 다시 로그인해 주세요.', true);
    return;
  }
  if (error.status === 403) {
    try {
      if (!await hasManagerAccess(credentials(activeSession)) && activeSession === session) {
        clearSession('관리자 권한이 종료되었습니다.', true);
        return;
      }
    } catch {
      // Keep the original operation error if the account check fails.
    }
  }
  if (activeSession === session) status(id, message, true);
}

function setBusy(value) {
  busy = value;
  for (const id of ['entry-select', 'entry-fields', 'reload-entries', 'entries-tab', 'rankings-tab', 'sign-out']) {
    get(id).disabled = value;
  }
}

function showPanel(name) {
  for (const panel of ['entries', 'rankings']) {
    get(`${panel}-panel`).hidden = panel !== name;
    get(`${panel}-tab`).setAttribute('aria-pressed', String(panel === name));
  }
}

function renderSelect(id = '') {
  entries.sort((a, b) => collator.compare(a.team_name, b.team_name) || collator.compare(a.title, b.title));
  entrySelect.replaceChildren(new Option('새 작품 등록', ''), ...entries.map((entry) =>
    new Option(`${entry.team_name} · ${entry.title}`, entry.id)));
  entrySelect.value = id;
}

function showEntry(entry) {
  selected = entry;
  for (const [key, id] of Object.entries(fieldIds)) get(id).value = entry?.[key] ?? '';
  get('entry-legend').textContent = entry ? '작품 수정' : '새 작품 등록';
  get('save-entry').textContent = entry ? '변경사항 저장' : '작품 등록';
  get('scores-panel').hidden = !entry;
  status('save-status');
  status('scores-status');
  clearTable('scores');
  if (entry) loadScores();
}

function readForm() {
  return Object.fromEntries(Object.entries(fieldIds).map(([key, id]) => [key, get(id).value.trim()]));
}

function hasChanges() {
  return Object.entries(readForm()).some(([key, value]) => value !== (selected?.[key] ?? ''));
}

function allowDiscard() {
  return !hasChanges() || window.confirm('저장하지 않은 변경사항을 버리시겠습니까?');
}

async function loadEntries() {
  if (!session || busy) return;
  const activeSession = session;
  const options = credentials(activeSession);
  const selectedId = selected?.id;
  setBusy(true);
  status('entries-status', '작품을 불러오는 중입니다…');
  try {
    if (!await hasManagerAccess(options)) {
      if (session === activeSession) clearSession('관리자 권한이 종료되었습니다.', true);
      return;
    }
    const list = [];
    const limit = 100;
    let page;
    do {
      const query = new URLSearchParams({ select: entryFieldsQuery, order: 'id.asc', limit, offset: list.length });
      const response = await request(`/rest/v1/contest_entries?${query}`, options);
      page = await response.json();
      list.push(...page);
    } while (page.length === limit);
    if (activeSession !== session) return;
    entries = list;
    renderSelect(selectedId);
    showEntry(entries.find(({ id }) => id === selectedId));
    status('entries-status', `등록 작품 ${entries.length}건`);
  } catch (error) {
    await reportError(error, activeSession, 'entries-status', '작품을 불러오지 못했습니다.');
  } finally {
    if (activeSession === session) setBusy(false);
  }
}

function validateDriveLink(value) {
  try {
    const url = new URL(value);
    return /^https:\/\/(drive|docs)\.google\.com\/\S+$/u.test(value) && url.pathname !== '/';
  } catch {
    return false;
  }
}

entryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!session || busy || !entryForm.reportValidity()) return;
  const data = readForm();
  if (!data.team_name || !data.title) {
    status('save-status', '팀명과 작품명을 입력해 주세요.', true);
    return;
  }
  if (!validateDriveLink(data.drive_url) || (data.report_url && !validateDriveLink(data.report_url))) {
    status('save-status', 'https://drive.google.com 또는 https://docs.google.com 공유 링크를 입력해 주세요.', true);
    return;
  }
  const activeSession = session;
  const updating = selected;
  const query = new URLSearchParams({ select: entryFieldsQuery });
  if (updating) {
    query.set('id', `eq.${updating.id}`);
    query.set('revision', `eq.${updating.revision}`);
  }
  setBusy(true);
  status('save-status', '작품을 저장하는 중입니다…');
  try {
    const response = await request(`/rest/v1/contest_entries?${query}`, {
      ...credentials(activeSession), method: updating ? 'PATCH' : 'POST',
      prefer: 'return=representation', body: { ...data, report_url: data.report_url || null }
    });
    const [entry] = await response.json();
    if (activeSession !== session) return;
    if (!entry) {
      if (!await hasManagerAccess(credentials(activeSession))) {
        if (session === activeSession) clearSession('관리자 권한이 종료되었습니다.', true);
      } else if (session === activeSession) {
        status('save-status', '다른 곳에서 작품 정보가 변경되었습니다. 목록을 새로고침한 뒤 다시 수정해 주세요.', true);
      }
      return;
    }
    entries = [...entries.filter(({ id }) => id !== entry.id), entry];
    renderSelect(entry.id);
    showEntry(entry);
    status('entries-status', `등록 작품 ${entries.length}건`);
    status('save-status', updating ? '작품 변경사항을 저장했습니다.' : '작품을 등록했습니다.');
  } catch (error) {
    await reportError(error, activeSession, 'save-status', '작품을 저장하지 못했습니다. 새로고침 후 다시 시도해 주세요.');
  } finally {
    if (activeSession === session) setBusy(false);
  }
});

function clearTable(name) {
  get(`${name}-table`).hidden = true;
  get(`${name}-body`).replaceChildren();
}

function renderTable(name, rows) {
  const elements = rows.map((values) => {
    const row = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.append(value instanceof Node ? value : String(value ?? '—'));
      row.append(cell);
    }
    return row;
  });
  get(`${name}-body`).replaceChildren(...elements);
  get(`${name}-table`).hidden = elements.length === 0;
}

async function loadScores() {
  if (!session || !selected) return;
  const activeSession = session;
  const entry = selected;
  const sequence = ++scoreRequest;
  clearTable('scores');
  status('scores-status', '점수를 불러오는 중입니다…');
  try {
    const response = await request('/rest/v1/rpc/contest_manager_scores', {
      ...credentials(activeSession), method: 'POST', body: { p_entry_id: entry.id }
    });
    const scores = await response.json();
    if (activeSession !== session || selected !== entry || sequence !== scoreRequest) return;
    renderTable('scores', scores.map((score) =>
      [score.judge, ...scoreKeys.map((key) => score[key]), score.total ?? '미채점']));
    const completed = scores.filter((score) => score.total !== null).length;
    status('scores-status', scores.length ? `채점 완료 ${completed} / ${scores.length}명` : '등록된 심사위원이 없습니다.');
  } catch (error) {
    if (selected === entry && sequence === scoreRequest) {
      await reportError(error, activeSession, 'scores-status', '심사위원별 점수를 불러오지 못했습니다.');
    }
  }
}

function tieDetails(result) {
  if (!result.pairs?.length) return result.note;
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = result.note ?? '동점 작품 비교';
  const list = document.createElement('ul');
  for (const { team_name, title, wins, losses } of result.pairs) {
    const item = document.createElement('li');
    item.textContent = `${team_name} · ${title} · 이 작품 ${wins}표 / 상대 ${losses}표`;
    list.append(item);
  }
  details.append(summary, list);
  return details;
}

async function loadRankings() {
  if (!session) return;
  const activeSession = session;
  const sequence = ++rankRequest;
  clearTable('rankings');
  status('rankings-status', '순위를 불러오는 중입니다…');
  try {
    const response = await request('/rest/v1/rpc/contest_manager_rankings', credentials(activeSession));
    const rankings = await response.json();
    if (activeSession !== session || sequence !== rankRequest) return;
    renderTable('rankings', rankings.map((row) => [
      row.rank, `${row.team_name} · ${row.title}`, `${row.scored} / ${row.expected}`,
      row.average, row.total, tieDetails(row)
    ]));
    status('rankings-status', rankings.length ? '' : '등록된 작품이 없습니다.');
  } catch (error) {
    if (sequence === rankRequest) await reportError(error, activeSession, 'rankings-status', '순위를 불러오지 못했습니다.');
  }
}

entrySelect.addEventListener('change', () => {
  if (allowDiscard()) showEntry(entries.find(({ id }) => id === entrySelect.value));
  else entrySelect.value = selected?.id ?? '';
});
get('reload-entries').addEventListener('click', () => { if (allowDiscard()) loadEntries(); });
get('reload-scores').addEventListener('click', loadScores);
get('reload-rankings').addEventListener('click', loadRankings);
get('entries-tab').addEventListener('click', () => showPanel('entries'));
get('rankings-tab').addEventListener('click', () => {
  showPanel('rankings');
  loadRankings();
});
get('sign-out').addEventListener('click', () => {
  if (!allowDiscard()) return;
  const token = session?.token;
  clearSession('로그아웃했습니다.', true);
  if (token) revokeSession(token);
});
window.addEventListener('beforeunload', (event) => {
  if (session && hasChanges()) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('pagehide', () => clearSession());
clearSession();
