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

// Explicit Korean time prevents a visitor's timezone from changing the cutoff.
function contestStatus(now) {
  const start = new Date('2026-11-02T00:00:00+09:00');
  const end = new Date('2026-11-24T00:00:00+09:00');
  if (now < start) return '접수 예정';
  if (now < end) return '접수 중';
  return '접수 마감';
}
function updateStatus() {
  document.querySelectorAll('[data-contest-status]').forEach(element => {
    element.textContent = contestStatus(new Date());
  });
}
updateStatus();
window.setInterval(updateStatus, 60000);

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
