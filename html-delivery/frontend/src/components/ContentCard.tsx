import { StatusBadge } from './StatusBadge';
import type { Content } from '../types';

const dateFormatter = new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' });

export function ContentCard({ content, rank }: { content: Content; rank: number }) {
  return (
    <a className="content-card" href={content.viewerUrl || `/view.html?id=${content.contentId}`}>
      <div className="content-card__index" aria-hidden="true">{String(rank).padStart(2, '0')}</div>
      <div className="content-card__body">
        <div className="content-card__badges">
          <StatusBadge tone={content.contentType === 'game' ? 'planned' : 'active'}>{content.contentType === 'game' ? '미니게임' : '웹페이지'}</StatusBadge>
          <span>v{content.latestVersion}</span>
        </div>
        <h3>{content.title}</h3>
        <p>{content.owner.name}<span aria-hidden="true"> / </span>{content.cohort?.name || '소속 미상'}</p>
      </div>
      <div className="content-card__meta">
        <strong aria-label={`추천 ${content.likes}개`}>♥ {content.likes}</strong>
        <time dateTime={content.updatedAt}>{dateFormatter.format(new Date(content.updatedAt))}</time>
        <span aria-hidden="true">↗</span>
      </div>
    </a>
  );
}
