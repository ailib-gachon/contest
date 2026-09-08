'use strict';
document.documentElement.classList.add('js');
const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');
menuButton.hidden = false;
function closeMenu() {
  navigation.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
}
menuButton.addEventListener('click', () => {
  const opened = navigation.classList.toggle('is-open');
  menuButton.setAttribute('aria-expanded', String(opened));
});
navigation.addEventListener('click', event => {
  if (event.target.closest('a')) closeMenu();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigation.classList.contains('is-open')) {
    closeMenu();
    menuButton.focus();
  }
});
window.matchMedia('(min-width: 961px)').addEventListener('change', closeMenu);

// End timestamps are exclusive; all event boundaries use Korean time.
function periodState(now, start, end) {
  if (now < new Date(start)) return 'upcoming';
  if (now < new Date(end)) return 'active';
  return 'ended';
}
function contestStatus(now) {
  return { upcoming: '접수 예정', active: '접수 중', ended: '접수 마감' }[
    periodState(now, '2026-11-02T00:00:00+09:00', '2026-11-24T00:00:00+09:00')
  ];
}
function updateStatus() {
  const now = new Date();
  document.querySelectorAll('[data-contest-status]').forEach(element => {
    element.textContent = contestStatus(now);
    element.dataset.state = periodState(now, '2026-11-02T00:00:00+09:00', '2026-11-24T00:00:00+09:00');
  });
  document.querySelectorAll('.timeline li[data-start]').forEach(element => {
    const state = periodState(now, element.dataset.start, element.dataset.end);
    const badge = element.querySelector('.schedule-status');
    const labels = element.dataset.announcement
      ? { upcoming: '발표 예정', active: '발표 예정일', ended: '예정일 경과' }
      : { upcoming: '예정', active: '진행 중', ended: '기간 종료' };
    element.dataset.state = state;
    badge.textContent = labels[state];
    badge.hidden = false;
  });
}
updateStatus();
window.setInterval(updateStatus, 1000);
window.addEventListener('pageshow', updateStatus);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) updateStatus();
});

const copyButton = document.querySelector('#copy-email');
const copyStatus = document.querySelector('#copy-status');
copyButton.hidden = false;
copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText('bellheej@gachon.ac.kr');
    copyStatus.textContent = '이메일 주소를 복사했습니다.';
  } catch {
    copyStatus.textContent = '자동 복사가 지원되지 않습니다. bellheej@gachon.ac.kr 주소를 직접 선택하여 복사해 주세요.';
  }
});
