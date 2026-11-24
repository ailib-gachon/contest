'use strict';

window.contestJudgeScoring = (() => {
  const keys = ['creativity', 'appropriateness', 'effectiveness', 'reproducibility'];
  const profiles = Object.freeze({
    general: Object.freeze({ label: '비전공 심사위원', maxima: [30, 24, 30, 16] }),
    technical: Object.freeze({ label: '기술 심사위원', maxima: [20, 36, 20, 24] })
  });

  function profile(type) {
    const result = profiles[type];
    if (!result) throw new Error('Unknown judge type');
    return { label: result.label, maxima: Object.fromEntries(keys.map((key, i) => [key, result.maxima[i]])) };
  }

  function rubrics(base, type) {
    const { maxima } = profile(type);
    return base.map((item) => {
      const max = maxima[item.key];
      let upper = max;
      const bands = item.bands.map(([range, description], i) => {
        if (i === item.bands.length - 1) return [`${upper}점 이하`, description];
        const lower = Math.round(parseInt(range, 10) * max / item.max * 10) / 10;
        const label = lower === upper ? `${lower}점` : `${lower}~${upper}점`;
        upper = Math.round((lower - 0.1) * 10) / 10;
        return [label, description];
      });
      return { ...item, max, bands };
    });
  }

  const total = (scores) => Math.round(keys.reduce((sum, key) => sum + scores[key], 0) * 10) / 10;
  return Object.freeze({ keys, profile, rubrics, total });
})();
