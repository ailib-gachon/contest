'use strict';

window.contestScoreComments = (() => {
  const limit = 500;
  let sequence = 0;

  function field(value = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'score-comment-field';
    const id = `score-comment-${++sequence}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = '심사평 (500자 이내)';
    const input = document.createElement('textarea');
    input.id = id;
    input.name = 'review_comment';
    input.rows = 5;
    input.required = true;
    // HTML counts UTF-16 units; the actual limit below counts Unicode characters.
    input.maxLength = limit * 2;
    input.placeholder = '작품의 장점과 보완할 점을 작성해 주세요.';
    const help = document.createElement('p');
    help.id = `${id}-help`;
    help.className = 'score-comment-help';
    help.textContent = '공백과 줄바꿈을 포함하여 500자까지 입력해 주세요. 작성자 본인과 관리자만 확인할 수 있습니다.';
    const count = document.createElement('p');
    count.id = `${id}-count`;
    count.className = 'score-comment-count';
    input.setAttribute('aria-describedby', `${help.id} ${count.id}`);
    function update() {
      const length = Array.from(input.value).length;
      count.textContent = `${length} / ${limit}자`;
      count.dataset.error = String(length > limit);
      input.setCustomValidity(length > limit ? '심사평은 500자 이내로 작성해 주세요.' :
        input.value.trim() ? '' : '심사평을 입력해 주세요.');
    }
    function setValue(text = '') {
      input.value = text;
      update();
    }
    input.addEventListener('input', update);
    wrapper.append(label, input, help, count);
    setValue(value);
    return Object.freeze({ element: wrapper, input, setValue, value: () => input.value.trim() });
  }

  function text(value) {
    const paragraph = document.createElement('p');
    paragraph.className = 'score-comment-text';
    paragraph.textContent = value || '미작성';
    return paragraph;
  }

  return Object.freeze({ field, text });
})();
