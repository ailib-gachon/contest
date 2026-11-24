'use strict';

window.createJudgeNoticePanel = (panel) => {
  let context;
  let saved;
  let form;
  let revision;
  let loading = false;
  let saving = false;

  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function values() {
    return {
      title: form.elements.title.value,
      body: form.elements.body.value,
      link_url: form.elements.link_url.value,
      published: form.elements.published.checked
    };
  }

  function hasChanges() {
    return Boolean(form && saved && Object.entries(values()).some(([key, value]) => value !== saved[key]));
  }

  function canLeave() {
    return !saving && (!hasChanges() || window.confirm('저장하지 않은 심사위원 안내를 버리시겠습니까?'));
  }

  function clear() {
    context = undefined;
    saved = undefined;
    form = undefined;
    revision = null;
    loading = false;
    saving = false;
    panel.replaceChildren();
    panel.hidden = true;
  }

  function safeLink(value) {
    if (!value) return '';
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch {
      return '';
    }
  }

  function showNotice(message) {
    panel.replaceChildren();
    panel.hidden = !message;
    if (!message) return;
    const heading = node('h3', message.title);
    const body = node('p', message.body, 'judge-notice-body');
    panel.append(node('p', '작품 참고 안내', 'judge-notice-label'), heading, body);
    const url = safeLink(message.link_url);
    if (url) {
      const link = node('a', '관련 안내 열기 ↗', 'judge-notice-link');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      panel.append(link);
    }
  }

  function showEditor(message) {
    revision = message?.revision ?? null;
    saved = {
      title: message?.title ?? '', body: message?.body ?? '',
      link_url: message?.link_url ?? '', published: message?.published ?? false
    };
    panel.hidden = false;
    panel.replaceChildren(node('h3', '이 작품의 참고 안내'));
    const help = node('p', '선택한 작품의 홈페이지 변경 주소나 참고사항을 작성하세요. 표시를 켜고 저장하면 심사위원이 이 작품을 선택했을 때 보입니다.', 'judge-notice-help');
    form = node('form', null, 'judge-notice-form');
    form.method = 'post';
    const fieldset = node('fieldset');
    for (const [name, label, multiline, limit] of [
      ['title', '안내 제목', false, 160], ['body', '안내 내용', true, 8000], ['link_url', '관련 링크 (선택)', false, 2000]
    ]) {
      const group = node('label', label);
      const input = node(multiline ? 'textarea' : 'input');
      input.name = name;
      input.maxLength = limit;
      if (multiline) input.rows = 5;
      else input.type = name === 'link_url' ? 'url' : 'text';
      input.value = saved[name];
      group.append(input);
      fieldset.append(group);
    }
    const published = node('label', null, 'judge-notice-checkbox');
    const checkbox = node('input');
    checkbox.name = 'published';
    checkbox.type = 'checkbox';
    checkbox.checked = saved.published;
    published.append(checkbox, ' 심사위원에게 표시');
    const actions = node('div', null, 'judge-notice-actions');
    const save = node('button', '안내 저장', 'button');
    save.type = 'submit';
    const refresh = node('button', '안내 새로고침', 'button');
    refresh.type = 'button';
    refresh.addEventListener('click', () => {
      if (!canLeave()) return;
      const active = context;
      clear();
      load(active.slug, active.entryId, active.options, true);
    });
    actions.append(save, refresh);
    fieldset.append(published, actions);
    form.append(fieldset);
    const result = node('p', '', 'judge-notice-status');
    result.setAttribute('role', 'status');
    panel.append(help, form, result);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!context || loading || saving) return;
      const active = context;
      const current = values();
      const trimmed = {
        ...current, title: current.title.trim(), body: current.body.trim(), link_url: current.link_url.trim()
      };
      if (trimmed.published && (!trimmed.title || !trimmed.body)) {
        result.textContent = '표시할 안내 제목과 내용을 입력해 주세요.';
        result.dataset.error = 'true';
        return;
      }
      if (trimmed.link_url && !safeLink(trimmed.link_url)) {
        result.textContent = '관련 링크는 https://로 시작하는 주소를 입력해 주세요.';
        result.dataset.error = 'true';
        return;
      }
      saving = true;
      fieldset.disabled = true;
      result.textContent = '안내를 저장하는 중입니다…';
      result.dataset.error = 'false';
      try {
        const response = await window.contestApi.request('/rest/v1/rpc/contest_save_judge_notice', {
          ...active.options, method: 'POST',
          body: { p_slug: active.slug, p_entry_id: active.entryId, p_message: trimmed, p_revision: revision }
        });
        const message = await response.json();
        if (context !== active) return;
        showEditor(message);
        const feedback = panel.querySelector('[role="status"]');
        feedback.textContent = message.published ? '심사위원 안내를 게시했습니다.' : '심사위원 안내를 숨김 상태로 저장했습니다.';
      } catch (error) {
        if (context !== active) return;
        result.textContent = error.status === 409 ?
          '다른 화면에서 안내를 변경했습니다. 안내를 새로고침한 뒤 다시 수정해 주세요.' :
          '안내를 저장하지 못했습니다. 입력값과 관리자 권한을 확인해 주세요.';
        result.dataset.error = 'true';
      } finally {
        if (context === active) {
          saving = false;
          fieldset.disabled = false;
        }
      }
    });
  }

  async function load(slug, entryId, options, editor = false) {
    if (context?.slug === slug && context.entryId === entryId && editor && (saving || hasChanges())) {
      panel.hidden = false;
      return;
    }
    clear();
    const active = { slug, entryId, options, editor };
    context = active;
    loading = true;
    if (editor) {
      panel.hidden = false;
      panel.append(node('p', '심사위원 안내를 불러오는 중입니다…', 'judge-notice-status'));
    }
    try {
      const response = await window.contestApi.request('/rest/v1/rpc/contest_judge_notice', {
        ...options, method: 'POST', body: { p_slug: slug, p_entry_id: entryId }
      });
      const message = await response.json();
      if (context !== active) return;
      if (editor) showEditor(message);
      else showNotice(message);
    } catch (error) {
      if (context !== active || options.signal?.aborted) return;
      panel.replaceChildren(node('h3', '심사위원 안내'));
      const message = editor && error.status === 404 ?
        'Supabase에서 judge-notices.sql을 먼저 적용해 주세요.' : '심사위원 안내를 불러오지 못했습니다.';
      const status = node('p', message, 'judge-notice-status');
      status.setAttribute('role', 'status');
      status.dataset.error = 'true';
      panel.append(status);
      panel.hidden = false;
    } finally {
      if (context === active) loading = false;
    }
  }

  window.addEventListener('beforeunload', (event) => {
    if (hasChanges() || saving) { event.preventDefault(); event.returnValue = ''; }
  });
  clear();
  return Object.freeze({ load, clear, canLeave });
};
