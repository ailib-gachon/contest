'use strict';

window.contestApi = (() => {
  const { projectUrl, publishableKey } = window.contestAdminConfig ?? {};
  const apiOrigin = projectUrl?.trim().replace(/\/$/, '');
  const configured = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(apiOrigin) &&
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey);

  async function request(path, { body, token, signal, method = 'GET', prefer } = {}) {
    const headers = {
      apikey: publishableKey,
      Authorization: `Bearer ${token ?? publishableKey}`
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;
    const response = await fetch(apiOrigin + path, {
      method, headers, body: JSON.stringify(body), signal,
      cache: 'no-store', credentials: 'omit', redirect: 'error'
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      const error = new Error('Supabase request failed');
      error.status = response.status;
      error.code = details?.error_code ?? (typeof details?.code === 'string' ? details.code : undefined);
      throw error;
    }
    return response;
  }

  function revokeSession(token) {
    request('/auth/v1/logout?scope=local', { method: 'POST', token }).catch(() => {});
  }

  function loginError(error) {
    if (error.status === 429) return '로그인 요청이 많습니다. 잠시 후 다시 시도해 주세요.';
    if (error.code === 'email_not_confirmed') return '이메일 인증이 완료되지 않았습니다. 공모전 담당자에게 문의해 주세요.';
    if (error.code === 'invalid_credentials' || (error.status === 400 && !error.code)) {
      return '등록된 이메일과 비밀번호를 확인해 주세요.';
    }
    if (error instanceof TypeError) return '로그인 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.';
    return '로그인을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }

  function driveVideoLinks(value) {
    if (!value) return;
    try {
      const source = new URL(value);
      if (source.origin !== 'https://drive.google.com' || source.username || source.password) return;
      const id = source.pathname === '/open' ? source.searchParams.get('id') :
        source.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/(?:view|preview|edit))?\/?$/)?.[1];
      if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return;
      const view = new URL(`/file/d/${id}/view`, source.origin);
      const preview = new URL(`/file/d/${id}/preview`, source.origin);
      const resourceKey = source.searchParams.get('resourcekey');
      if (resourceKey && /^[A-Za-z0-9_-]+$/.test(resourceKey)) {
        view.searchParams.set('resourcekey', resourceKey);
        preview.searchParams.set('resourcekey', resourceKey);
      }
      return { view: view.href, preview: preview.href };
    } catch {
      return undefined;
    }
  }

  return Object.freeze({ configured, request, revokeSession, loginError, driveVideoLinks });
})();
