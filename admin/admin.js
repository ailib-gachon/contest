'use strict';

const rubrics = [
  {
    key: 'creativity', label: '창의성·독창성', max: 25,
    description: '문제 정의와 AI 활용 접근의 참신성·독창성',
    bands: [
      ['22~25점', '문제 정의와 활용 접근이 매우 참신하고 독창적이며 기존 사례에서 보기 어려운 관점이 확인됨.'],
      ['18~21점', '접근이 참신하나 일부 일반적인 활용 방식이 포함됨.'],
      ['13~17점', '활용은 무난하나 독창성이 다소 부족함.'],
      ['12점 이하', '기존에 널리 알려진 사례와 유사하고 독창성이 낮음.']
    ]
  },
  {
    key: 'appropriateness', label: 'AI 활용의 적절성', max: 30,
    description: '프롬프트 설계·도구 선택·워크플로우 등 생성형 AI 활용 방식의 타당성과 숙련도',
    bands: [
      ['27~30점', '프롬프트 설계·도구 선택·워크플로우가 목적에 최적화되어 있고, 결과물의 검증·보완 과정까지 확인되어 활용 숙련도가 매우 높음.'],
      ['21~26점', '활용 방식이 적절하나 일부 비효율적이거나 검증 과정이 충분히 드러나지 않음.'],
      ['15~20점', '활용이 단순하거나 목적과의 연계가 약함.'],
      ['14점 이하', 'AI 활용의 적절성·숙련도가 드러나지 않음.']
    ]
  },
  {
    key: 'effectiveness', label: '문제해결 효과성', max: 25,
    description: '실제 문제 해결·업무 개선 정도 및 성과의 유용성',
    bands: [
      ['22~25점', '실제 문제를 효과적으로 해결하고 활용 전·후의 성과가 구체적으로 제시되어 유용성이 명확함.'],
      ['18~21점', '문제 해결에 기여했으나 성과가 다소 제한적이거나 정성적 서술에 머무름.'],
      ['13~17점', '문제 해결 효과가 개략적이거나 성과가 불분명함.'],
      ['12점 이하', '문제 해결·업무 개선 효과가 미흡함.']
    ]
  },
  {
    key: 'reproducibility', label: '재현성·확산성', max: 20,
    description: '타 구성원이 참고·재현·확산할 수 있는 정도',
    bands: [
      ['17~20점', '활용 방법과 프롬프트가 명확히 정리되어 타 구성원이 별도의 설명 없이도 참고·재현할 수 있으며 다른 영역으로의 확산 가능성이 높음.'],
      ['13~16점', '재현이 가능하나 일부 정보가 부족하여 추가 확인이 필요함.'],
      ['9~12점', '특정 상황에 한정되어 재현·확산이 제한적임.'],
      ['8점 이하', '활용 과정이 구체적으로 제시되지 않아 재현·확산 가능성이 낮음.']
    ]
  }
];

const byId = (id) => document.getElementById(id);
const loginForm = byId('login-form');
const loginFields = byId('login-fields');
const loginStatus = byId('login-status');
const emailInput = byId('email');
const passwordInput = byId('password');
const picker = byId('entry-picker');
const entryPanel = byId('entry-panel');
const scoreForm = byId('score-form');
const scoreFields = byId('score-fields');
const scoreStatus = byId('score-status');
const filesStatus = byId('files-status');
const reload = byId('reload');
const signOut = byId('sign-out');
const saveButton = byId('save-score');
const { configured, request, revokeSession, loginError } = window.contestApi;
const setupMessage = '심사위원 로그인이 아직 설정되지 않았습니다. 공모전 담당자에게 문의해 주세요.';

let loginRequest;
let session;
let entries = [];
let currentEntry;
let loading = false;
let saving = false;

function status(element, message = '', error = false) {
  element.textContent = message;
  element.dataset.error = String(error);
}

async function isJudge(token, signal) {
  const response = await request('/rest/v1/contest_judges?select=user_id&limit=1', { token, signal });
  return (await response.json()).length === 1;
}

function clearSession(message = '', focus = false) {
  loginRequest?.abort();
  loginRequest = undefined;
  if (session) {
    clearTimeout(session.expiry);
    session.controller.abort();
  }
  session = undefined;
  entries = [];
  loading = false;
  saving = false;
  picker.replaceChildren();
  picker.disabled = true;
  reload.disabled = false;
  signOut.disabled = false;
  scoreFields.disabled = false;
  saveButton.textContent = '점수 저장';
  showEntry(undefined);
  status(filesStatus);
  byId('signed-in-as').textContent = '';
  byId('submissions').hidden = true;
  byId('login-panel').hidden = false;
  passwordInput.value = '';
  loginFields.disabled = !configured;
  byId('sign-in').textContent = '로그인';
  status(loginStatus, configured ? message : setupMessage);
  if (focus) emailInput.focus();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!configured || loginRequest || session) return;

  const controller = new AbortController();
  loginRequest = controller;
  const credentials = { email: emailInput.value.trim(), password: passwordInput.value };
  loginFields.disabled = true;
  passwordInput.value = '';
  byId('sign-in').textContent = '로그인 중…';
  status(loginStatus);

  let token;
  try {
    const response = await request('/auth/v1/token?grant_type=password', {
      method: 'POST', body: credentials, signal: controller.signal
    });
    const { access_token, expires_in } = await response.json();
    if (typeof access_token !== 'string' || !access_token ||
        !Number.isFinite(expires_in) || expires_in <= 0) {
      throw new Error('Missing access token or expiration');
    }
    token = access_token;
    const allowed = await isJudge(token, controller.signal);
    if (controller.signal.aborted) return;
    if (!allowed) {
      status(loginStatus, '심사 권한이 없습니다. 공모전 담당자에게 문의해 주세요.', true);
      return;
    }

    session = {
      token,
      controller: new AbortController(),
      expiry: setTimeout(() => clearSession('로그인 시간이 만료되었습니다. 다시 로그인해 주세요.', true),
        Math.min(expires_in * 1000, 2_147_483_647))
    };
    byId('signed-in-as').textContent = credentials.email;
    byId('login-panel').hidden = true;
    byId('submissions').hidden = false;
    byId('submissions-title').focus();
    loadEntries();
  } catch (error) {
    if (!controller.signal.aborted) {
      const message = error.code === 'PGRST205' ?
        '심사 설정이 아직 적용되지 않았습니다. 공모전 담당자에게 문의해 주세요.' :
        '심사 권한을 확인하지 못했습니다. 공모전 담당자에게 문의해 주세요.';
      status(loginStatus, token ? message : loginError(error), true);
    }
  } finally {
    if (token && session?.token !== token) revokeSession(token);
    if (loginRequest === controller) {
      loginRequest = undefined;
      loginFields.disabled = false;
      byId('sign-in').textContent = '로그인';
      if (!session) passwordInput.focus();
    }
  }
});

function addRubric({ key, label, max, description, bands }) {
  const article = document.createElement('article');
  article.className = 'rubric';
  const row = document.createElement('div');
  row.className = 'rubric-top';
  const title = document.createElement('label');
  title.htmlFor = key;
  title.textContent = `${label} (${max}점)`;
  const input = document.createElement('input');
  input.id = key;
  input.type = 'number';
  input.inputMode = 'numeric';
  input.min = '0';
  input.max = String(max);
  input.step = '1';
  input.required = true;
  input.setAttribute('aria-describedby', `${key}-description`);
  row.append(title, input);

  const intro = document.createElement('p');
  intro.id = `${key}-description`;
  intro.textContent = description;
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = '점수 구간별 기준';
  const list = document.createElement('ul');
  for (const [range, text] of bands) {
    const item = document.createElement('li');
    const rangeLabel = document.createElement('strong');
    rangeLabel.textContent = range;
    item.append(rangeLabel, ` · ${text}`);
    list.append(item);
  }
  details.append(summary, list);
  article.append(row, intro, details);
  byId('rubrics').append(article);
}

function setDriveLink(element, value) {
  element.removeAttribute('href');
  element.hidden = true;
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && ['drive.google.com', 'docs.google.com'].includes(url.host) &&
        !url.username && !url.password) {
      element.href = url.href;
      element.hidden = false;
    }
  } catch {
    // Leave invalid entries without a clickable link.
  }
}

function showEntry(entry) {
  currentEntry = entry;
  entryPanel.hidden = !entry;
  byId('entry-title').textContent = entry?.title ?? '';
  byId('entry-team').textContent = entry?.team_name ?? '';
  setDriveLink(byId('drive-link'), entry?.drive_url);
  setDriveLink(byId('report-link'), entry?.report_url);
  for (const { key } of rubrics) byId(key).value = entry?.score?.[key] ?? '';
  updateTotal();
  status(scoreStatus, entry?.score ? '저장한 점수를 불러왔습니다.' : '');
}

function updateTotal() {
  const scores = rubrics.map(({ key, max }) => {
    const score = byId(key).valueAsNumber;
    return Number.isInteger(score) && score >= 0 && score <= max ? score : NaN;
  });
  byId('score-total').value = scores.every(Number.isFinite) ?
    scores.reduce((total, score) => total + score, 0) : '—';
}

function hasUnsavedScore() {
  return Boolean(currentEntry && rubrics.some(({ key }) =>
    byId(key).value !== String(currentEntry.score?.[key] ?? '')));
}

function confirmDiscard() {
  return !hasUnsavedScore() || window.confirm('저장하지 않은 점수를 버리시겠습니까?');
}

function fillPicker() {
  const placeholder = new Option('팀을 선택해 주세요', '', !currentEntry, !currentEntry);
  placeholder.disabled = true;
  picker.replaceChildren(placeholder, ...entries.map((entry) =>
    new Option(`${entry.team_name} · ${entry.score ? '저장 완료' : '미채점'}`, entry.id,
      false, entry === currentEntry)));
}

async function handleReviewError(error, activeSession, element, message) {
  if (session !== activeSession) return;
  if (error.status === 401) {
    clearSession('로그인 시간이 만료되었습니다. 다시 로그인해 주세요.', true);
    return;
  }
  if (error.status === 403) {
    try {
      if (!await isJudge(activeSession.token, activeSession.controller.signal) && session === activeSession) {
        clearSession('심사 권한이 종료되었습니다.', true);
        return;
      }
    } catch {
      // Keep the original error if the account check fails.
    }
  }
  if (session === activeSession) status(element, message, true);
}

async function loadEntries() {
  if (!session || loading || saving) return;
  const activeSession = session;
  const { token, controller: { signal } } = activeSession;
  loading = true;
  picker.disabled = true;
  reload.disabled = true;
  scoreFields.disabled = true;
  status(filesStatus, '제출작을 불러오는 중입니다…');
  const selection = currentEntry?.id;
  const results = [];
  const limit = 100;
  try {
    if (!await isJudge(token, signal)) {
      if (session === activeSession) clearSession('심사 권한이 종료되었습니다.', true);
      return;
    }
    let page;
    do {
      const fields = 'id,team_name,title,drive_url,report_url,contest_scores(creativity,appropriateness,effectiveness,reproducibility,total)';
      const params = new URLSearchParams({
        select: fields, order: 'team_name.asc,title.asc,id.asc', limit, offset: results.length
      });
      const response = await request(`/rest/v1/contest_entries?${params}`, { token, signal });
      page = await response.json();
      results.push(...page);
    } while (page.length === limit);
    if (session !== activeSession) return;

    entries = results.map(({ contest_scores, ...entry }) => ({ ...entry, score: contest_scores[0] }));
    const scored = entries.filter((entry) => entry.score).length;
    showEntry(entries.find((entry) => entry.id === selection) ?? entries[0]);
    fillPicker();
    status(filesStatus, entries.length ? `채점 완료 ${scored} / ${entries.length}팀` : '등록된 제출작이 없습니다.');
  } catch (error) {
    await handleReviewError(error, activeSession, filesStatus,
      '제출작을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
  } finally {
    if (session === activeSession) {
      loading = false;
      picker.disabled = entries.length === 0;
      reload.disabled = false;
      scoreFields.disabled = false;
    }
  }
}

scoreForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!session || !currentEntry || saving || loading || !scoreForm.reportValidity()) return;
  const activeSession = session;
  const entry = currentEntry;
  const scores = Object.fromEntries(rubrics.map(({ key }) => [key, byId(key).valueAsNumber]));
  const body = { p_entry_id: entry.id };
  for (const [key, value] of Object.entries(scores)) body[`p_${key}`] = value;

  saving = true;
  scoreFields.disabled = true;
  picker.disabled = true;
  reload.disabled = true;
  signOut.disabled = true;
  saveButton.textContent = '저장 중…';
  status(scoreStatus);
  try {
    const response = await request('/rest/v1/rpc/save_contest_score', {
      token: activeSession.token, signal: activeSession.controller.signal, method: 'POST', body
    });
    const total = await response.json();
    if (session !== activeSession) return;
    entry.score = { ...scores, total };
    byId('score-total').value = total;
    fillPicker();
    status(filesStatus, `채점 완료 ${entries.filter((item) => item.score).length} / ${entries.length}팀`);
    status(scoreStatus, `${entry.team_name} 점수를 저장했습니다.`);
  } catch (error) {
    await handleReviewError(error, activeSession, scoreStatus,
      '점수를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  } finally {
    if (session === activeSession) {
      saving = false;
      scoreFields.disabled = false;
      picker.disabled = false;
      reload.disabled = false;
      signOut.disabled = false;
      saveButton.textContent = '점수 저장';
    }
  }
});

picker.addEventListener('change', () => {
  if (!confirmDiscard()) {
    picker.value = currentEntry.id;
    return;
  }
  showEntry(entries.find((entry) => entry.id === picker.value));
});
scoreForm.addEventListener('input', () => {
  updateTotal();
  status(scoreStatus, '변경한 점수가 있습니다.');
});
reload.addEventListener('click', () => {
  if (confirmDiscard()) loadEntries();
});
signOut.addEventListener('click', () => {
  if (!confirmDiscard()) return;
  const token = session?.token;
  clearSession('로그아웃했습니다.', true);
  if (token) revokeSession(token);
});
window.addEventListener('beforeunload', (event) => {
  if (hasUnsavedScore()) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('pagehide', () => clearSession());

rubrics.forEach(addRubric);
clearSession();
