'use strict';

window.contestJudgeScoring = (() => {
  const keys = ['creativity', 'appropriateness', 'effectiveness', 'reproducibility'];
  const inputMaxima = [25, 30, 25, 20];
  const profiles = Object.freeze({
    general: Object.freeze({ label: '비전공 심사위원', maxima: [30, 24, 30, 16] }),
    technical: Object.freeze({ label: '기술 심사위원', maxima: [20, 36, 20, 24] })
  });

  function profile(type) {
    const result = profiles[type];
    if (!result) throw new Error('Unknown judge type');
    return {
      label: result.label,
      maxima: Object.fromEntries(keys.map((key, i) => [key, inputMaxima[i]])),
      weightedMaxima: Object.fromEntries(keys.map((key, i) => [key, result.maxima[i]])),
      weights: Object.fromEntries(keys.map((key, i) => [key, result.maxima[i] / inputMaxima[i]]))
    };
  }

  function rubrics(base) {
    return base;
  }

  const total = (scores) => Math.round(keys.reduce((sum, key) => sum + scores[key], 0) * 10000) / 10000;
  return Object.freeze({ keys, profile, rubrics, total });
})();
