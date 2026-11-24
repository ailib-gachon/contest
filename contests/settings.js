'use strict';

window.libraryContestSettings = (() => {
  const { get, node, table } = window.contestHub;
  const picker = get('settings-picker');
  const panel = get('settings-panel');
  const toggle = get('settings-toggle');
  const content = get('settings-content');
  let current;
  let selected = '';
  let dirty = false;
  let saving = false;

  const lines = (value) => value.split('\n').map((line) => line.trim()).filter(Boolean);
  const fields = [
    ['year', '연도', 'text'], ['kind', '공모 유형', 'text'], ['summary', '공모 주제·소개', 'textarea'],
    ['audience', '참가 대상', 'text'], ['type', '접수 방법', 'text'],
    ['start', '접수 시작일', 'date'], ['end', '접수 마지막 날', 'date'],
    ['apply', '접수 링크', 'url'], ['source', '공식 공고 링크', 'url'],
    ['schedule', '추가 일정 (한 줄에 하나씩)', 'textarea'],
    ['submit', '제출물·유의사항 (한 줄에 하나씩)', 'textarea'],
    ['awards', '시상 (한 줄에 하나씩)', 'textarea'], ['reviewNote', '심사 안내', 'textarea']
  ];

  function status(text = '', error = false) {
    const target = get('settings-status');
    target.textContent = text;
    target.dataset.error = String(error);
  }

  function field(name, label, value, type = 'text') {
    const wrapper = node('label', label);
    const control = node(type === 'textarea' ? 'textarea' : 'input');
    if (type === 'textarea') control.rows = 2;
    else control.type = type;
    control.name = name;
    control.value = value ?? '';
    wrapper.append(control);
    return wrapper;
  }

  function checkbox(name, label, value) {
    const wrapper = node('label');
    const box = node('input');
    box.type = 'checkbox';
    box.name = name;
    box.checked = Boolean(value);
    wrapper.className = 'settings-checkbox';
    wrapper.append(box, ' ', label);
    return wrapper;
  }

  function button(label, type = 'button') {
    const control = node('button', label, type === 'submit' ? 'button' : 'button secondary');
    control.type = type;
    return control;
  }

  function defaultInfo(preset) {
    if (!preset) return {};
    return {
      ...preset,
      schedule: preset.dates?.slice(preset.start ? 1 : 0).map((row) => row.join(' · ')),
      awards: preset.prizes?.map((row) => row.join(' · '))
    };
  }

  function rubricEditor(event, settingsForm) {
    const box = node('fieldset', null, 'settings-rubric');
    const roster = node('div');
    const add = button('평가 항목 추가');
    let serial = 1;

    function addRow(criterion, priority) {
      const row = node('div', null, 'settings-criterion');
      row.dataset.key = criterion?.key ?? `criterion_${serial++}`;
      row.append(field('label', '평가 항목', criterion?.label), field('max', '배점', criterion?.max, 'number'),
        field('description', '평가 기준', criterion?.description), field('priority', '동점 우선순위', priority, 'number'),
        checkbox('loans', '대출 권수 점수', criterion?.mode === 'loans'));
      for (const input of row.querySelectorAll('input[name="label"], input[name="max"]')) input.required = true;
      const score = row.querySelector('[name="max"]');
      score.min = 1;
      score.max = 100;
      const order = row.querySelector('[name="priority"]');
      order.min = 1;
      order.max = 20;
      const remove = button('항목 삭제');
      remove.addEventListener('click', () => {
        if (roster.children.length === 1) return;
        row.remove();
        dirty = true;
        add.disabled = roster.children.length >= 20;
      });
      row.append(remove);
      roster.append(row);
      add.disabled = roster.children.length >= 20;
    }

    const used = new Set(event?.criteria.map(({ key }) => key) ?? []);
    if (event) {
      for (const criterion of event.criteria) addRow(criterion, event.tie_keys.indexOf(criterion.key) + 1 || '');
    } else addRow();
    add.addEventListener('click', () => {
      while (used.has(`criterion_${serial}`)) serial++;
      addRow();
      dirty = true;
    });
    box.append(node('legend', '심사 기준'), node('p', '배점 합계는 100점입니다. 동점 비교 대상에만 우선순위 숫자를 입력하세요.', 'lede'), roster, add);
    settingsForm.append(box);
    return () => {
      const criteria = [];
      const priorities = [];
      for (const row of roster.children) {
        const read = (name) => row.querySelector(`[name="${name}"]`).value.trim();
        const item = {
          key: row.dataset.key, label: read('label'), max: Number(read('max')), description: read('description')
        };
        if (row.querySelector('[name="loans"]').checked) item.mode = 'loans';
        criteria.push(item);
        if (read('priority')) priorities.push([Number(read('priority')), item.key]);
      }
      if (criteria.some(({ label }) => !label) || criteria.reduce((sum, { max }) => sum + max, 0) !== 100) {
        throw new Error('평가 항목명과 배점 합계 100점을 확인해 주세요.');
      }
      if (new Set(priorities.map(([order]) => order)).size !== priorities.length) {
        throw new Error('동점 우선순위 숫자는 항목마다 다르게 입력해 주세요.');
      }
      return { criteria, tie_keys: priorities.sort((a, b) => a[0] - b[0]).map(([, key]) => key) };
    };
  }

  async function save(name, data, next, message, form) {
    if (saving || !current) return;
    saving = true;
    const active = current;
    const buttons = [...panel.querySelectorAll('button')];
    buttons.forEach((control) => { control.disabled = true; });
    form.inert = true;
    picker.disabled = true;
    status('Supabase에 저장 중입니다…');
    let saved = false;
    try {
      await active.rpc(name, data);
      if (active !== current) return;
      saved = true;
      dirty = false;
      const overview = await active.rpc('settings_overview', {});
      if (active !== current) return;
      if (!overview) { clear(); return; }
      active.overview = overview;
      selected = next;
      render();
      status(message);
      await active.refresh();
    } catch (error) {
      if (active !== current) return;
      const text = error.status === 409 ? '채점이 시작되어 배점·동점 기준 또는 위원 역할을 변경할 수 없습니다.' :
        error.status === 412 ? '다른 화면에서 설정을 변경했습니다. 다시 로그인해 최신 설정을 불러와 주세요.' :
        error.code === 'P0002' ? '공모전 또는 등록된 계정 이메일을 찾을 수 없습니다.' :
        error.code === '23505' ? '같은 코드의 공모전이 이미 있습니다.' :
        '저장하지 못했습니다. 입력값과 설정 권한을 확인해 주세요.';
      status(saved ? '저장되었습니다. 반영 내용을 보려면 다시 로그인해 주세요.' : text, !saved);
    } finally {
      if (active === current) {
        form.inert = false;
        picker.disabled = false;
        buttons.forEach((control) => { control.disabled = false; });
        saving = false;
      }
    }
  }

  function assignment(event) {
    const section = node('section', null, 'settings-assignment');
    const form = node('form');
    form.method = 'post';
    const roleField = node('label', '역할');
    const roles = node('select');
    roles.name = 'role';
    roles.append(new Option('심사위원', 'judge'), new Option('운영자', 'operator'));
    roleField.append(roles);
    form.append(field('email', 'Supabase에 등록된 이메일', '', 'email'),
      field('name', '표시 이름', ''), roleField, button('역할 배정', 'submit'));
    for (const input of form.querySelectorAll('input')) input.required = true;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (dirty && !window.confirm('저장하지 않은 공모전 설정을 버리시겠습니까?')) return;
      const values = new FormData(form);
      save('assign_member', {
        p_slug: event.slug, p_email: values.get('email'), p_name: values.get('name'), p_role: values.get('role')
      }, event.slug, '공모전 역할을 배정했습니다.', form);
    });
    const members = current.overview.members.filter(({ slug }) => slug === event.slug);
    section.append(node('h3', '운영자·심사위원 배정'), form,
      members.length ? table(['표시 이름', '이메일', '역할'], members.map(({ name, email, role }) =>
        [name, email, role === 'operator' ? '운영자' : '심사위원'])) : node('p', '배정된 계정이 없습니다.', 'status'));
    return section;
  }

  function render() {
    const event = current.overview.events.find(({ slug }) => slug === selected);
    picker.replaceChildren(new Option('새 공모전 추가', ''), ...current.overview.events.map(({ name, slug }) => new Option(name, slug)));
    picker.value = selected;
    const preset = window.libraryContestPresets.find(({ id }) => id === selected);
    const info = event?.public_info ?? defaultInfo(preset);
    const form = node('form');
    form.method = 'post';
    const basic = node('div', null, 'settings-fields');
    const slug = field('slug', '공모전 코드 (영문 소문자·숫자·하이픈)', selected);
    slug.lastElementChild.required = true;
    slug.lastElementChild.readOnly = Boolean(event);
    slug.lastElementChild.pattern = String.raw`[a-z0-9][a-z0-9\x2d]{0,59}`;
    const name = field('name', '공모전 이름', event?.name);
    name.lastElementChild.required = true;
    basic.append(slug, name, ...fields.map(([key, label, type]) =>
      field(key, label, Array.isArray(info[key]) ? info[key].join('\n') : info[key], type)));
    form.append(basic);
    const rubric = rubricEditor(event, form);
    form.append(checkbox('pairwise', '모든 지정 항목 동점 시 위원별 총점 비교', event?.pairwise),
      checkbox('preliminary', '예심용 집계', event?.preliminary),
      checkbox('published', '통합 페이지에 공모전 안내 공개', event?.published),
      button('공모전 설정 저장', 'submit'));
    form.addEventListener('input', () => { dirty = true; });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let rule;
      try { rule = rubric(); } catch (error) { status(error.message, true); return; }
      const values = new FormData(form);
      const eventSlug = values.get('slug').trim();
      const publicInfo = Object.fromEntries(fields.map(([key]) => [key,
        ['submit', 'awards', 'schedule'].includes(key) ? lines(values.get(key)) : values.get(key).trim()]));
      const pEvent = { slug: eventSlug, name: values.get('name'), ...rule, public_info: publicInfo, revision: event?.settings_revision };
      for (const key of ['pairwise', 'preliminary', 'published']) pEvent[key] = values.has(key);
      save('save_settings', { p_event: pEvent, p_new: !event }, eventSlug, '공모전 설정을 저장했습니다.', form);
    });
    content.replaceChildren(form);
    if (event) content.append(assignment(event));
  }

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  function open(slug = window.contestHub.reviewScope()) {
    if (slug && slug !== selected && !dirty && !saving && current?.overview.events.some((event) => event.slug === slug)) {
      selected = slug;
      render();
    }
    setOpen(true);
  }

  picker.addEventListener('change', () => {
    if (dirty && !window.confirm('저장하지 않은 공모전 설정을 버리시겠습니까?')) {
      picker.value = selected;
      return;
    }
    selected = picker.value;
    dirty = false;
    status();
    render();
  });
  toggle.addEventListener('click', () => {
    if (panel.hidden) open();
    else setOpen(false);
  });
  window.addEventListener('beforeunload', (event) => {
    if (dirty) { event.preventDefault(); event.returnValue = ''; }
  });

  function enable(overview, rpc, refresh) {
    current = { overview, rpc, refresh };
    selected = overview.events[0]?.slug ?? '';
    toggle.hidden = false;
    render();
  }
  function clear() {
    current = undefined;
    selected = '';
    dirty = false;
    saving = false;
    toggle.hidden = true;
    setOpen(false);
    picker.disabled = false;
    picker.replaceChildren();
    content.replaceChildren();
    status();
  }
  return {
    enable, clear, open,
    allowDiscard: () => !saving && (!dirty || window.confirm('저장하지 않은 공모전 설정을 버리시겠습니까?'))
  };
})();
