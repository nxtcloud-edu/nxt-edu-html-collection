import type { Cohort } from '../types';

export function TypeDonut({ gameCount, webpageCount }: { gameCount: number; webpageCount: number }) {
  const total = gameCount + webpageCount;
  const gameRatio = total ? (gameCount / total) * 100 : 0;
  return (
    <div className="donut-panel" aria-label={`콘텐츠 유형 분포: 미니게임 ${gameCount}개, 웹페이지 ${webpageCount}개`}>
      <div className="donut" style={{ '--game-ratio': `${gameRatio}%` } as React.CSSProperties} aria-hidden="true"><strong>{total}</strong><span>전체</span></div>
      <div className="donut-legend"><span><i className="legend-dot legend-dot--game" />미니게임 <b>{gameCount}</b></span><span><i className="legend-dot" />웹페이지 <b>{webpageCount}</b></span></div>
    </div>
  );
}

export function CohortBars({ cohorts }: { cohorts: Cohort[] }) {
  const rows = [...cohorts].sort((a, b) => b.contentCount - a.contentCount).slice(0, 5);
  const max = Math.max(...rows.map((cohort) => cohort.contentCount), 1);
  return (
    <div className="bar-chart" aria-label="콘텐츠가 많은 수업 상위 5개">
      {rows.map((cohort) => <div className="bar-chart__row" key={cohort.cohortId}>
        <span title={cohort.name}>{cohort.name}</span>
        <i><b style={{ width: `${(cohort.contentCount / max) * 100}%` }} /></i>
        <strong>{cohort.contentCount}</strong>
      </div>)}
    </div>
  );
}
