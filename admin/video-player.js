'use strict';

window.createContestVideoPlayer = (dialog) => {
  const find = (role) => dialog.querySelector(`[data-video-${role}]`);
  const slot = find('slot');
  const fileInput = find('file');
  const previewButton = find('preview');
  const message = find('status');
  let links;
  let label;
  let localUrl;
  let localVideo;

  function status(text = '', error = false) {
    message.textContent = text;
    message.dataset.error = String(error);
  }

  function stopPlayback() {
    const video = localVideo;
    localVideo = undefined;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    slot.replaceChildren();
    if (localUrl) URL.revokeObjectURL(localUrl);
    localUrl = undefined;
  }

  function reset() {
    stopPlayback();
    links = undefined;
    label = undefined;
    fileInput.value = '';
    find('drive').removeAttribute('href');
    status();
  }

  function close() {
    if (dialog.open) dialog.close();
    reset();
  }

  function showPreview() {
    if (!links || !dialog.open) return;
    stopPlayback();
    const frame = document.createElement('iframe');
    frame.title = `Google Drive ${label} 재생`;
    frame.src = links.preview;
    frame.allowFullscreen = true;
    slot.append(frame);
    previewButton.setAttribute('aria-pressed', 'true');
    status('Drive 재생 중 · 화질이 흐리면 다운로드한 원본을 확인해 주세요.');
  }

  function open(videoLinks, title) {
    const video = window.contestApi.driveVideoLinks(videoLinks?.view);
    if (!video || dialog.open) return;
    reset();
    links = video;
    label = title;
    find('title').textContent = title;
    find('drive').href = links.view;
    dialog.showModal();
    showPreview();
  }

  previewButton.addEventListener('click', showPreview);
  find('choose').addEventListener('click', () => {
    // Permit selecting the same file again after returning to Drive playback.
    fileInput.value = '';
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file || !dialog.open || !links) return;
    stopPlayback();
    previewButton.setAttribute('aria-pressed', 'false');
    localUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    localVideo = video;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.setAttribute('aria-label', `${label} 원본 영상`);
    video.addEventListener('loadedmetadata', () => {
      if (localVideo !== video) return;
      status(`${file.name} · 원본 ${video.videoWidth} × ${video.videoHeight}`);
    });
    video.addEventListener('error', () => {
      if (localVideo !== video) return;
      status('이 브라우저에서 재생할 수 없습니다. 선택한 영상 파일을 PC 동영상 플레이어로 열어 주세요.', true);
    });
    status('원본 영상을 불러오는 중입니다…');
    video.src = localUrl;
    slot.append(video);
  });
  find('close').addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('close', () => {
    if (!dialog.open) reset();
  });
  return Object.freeze({ open, close });
};
