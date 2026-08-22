import { Surface } from './Surface';

export function MetricCard({ label, value, note, bars }: { label: string; value: string; note: string; bars: number[] }) {
  return (
    <Surface as="article" className="metric-card">
      <div className="metric-card__head"><span>{label}</span><span aria-hidden="true">↗</span></div>
      <strong>{value}</strong>
      <div className="metric-bars" aria-hidden="true">
        {bars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
      </div>
      <p>{note}</p>
    </Surface>
  );
}
