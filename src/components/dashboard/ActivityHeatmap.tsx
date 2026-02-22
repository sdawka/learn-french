/**
 * Activity Heatmap — GitHub-style calendar of study activity.
 */

interface DayStat {
  date: string;
  cards_reviewed: number;
  accuracy: number;
  minutes_studied: number;
}

interface Props {
  data: DayStat[];
  streak: number;
}

function getColor(cards: number): string {
  if (cards === 0) return "#111827";
  if (cards < 10) return "#1e3a5f";
  if (cards < 25) return "#2563eb";
  if (cards < 50) return "#3b82f6";
  return "#60a5fa";
}

export default function ActivityHeatmap({ data, streak }: Props) {
  // Build a 52-week grid ending today
  const today = new Date();
  const weeks: DayStat[][] = [];
  let week: DayStat[] = [];

  const dataMap = new Map(data.map((d) => [d.date, d]));

  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    week.push(
      dataMap.get(dateStr) ?? {
        date: dateStr,
        cards_reviewed: 0,
        accuracy: 0,
        minutes_studied: 0,
      }
    );
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) weeks.push(week);

  const cellSize = 10;
  const gap = 2;
  const W = weeks.length * (cellSize + gap);
  const H = 7 * (cellSize + gap);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{streak > 0 ? `${streak} day streak` : "Start your streak today"}</span>
        <span>last 365 days</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full max-w-sm">
        {weeks.map((wk, wi) =>
          wk.map((day, di) => (
            <rect
              key={day.date}
              x={wi * (cellSize + gap)}
              y={di * (cellSize + gap)}
              width={cellSize}
              height={cellSize}
              rx={2}
              fill={getColor(day.cards_reviewed)}
            >
              <title>
                {day.date}: {day.cards_reviewed} cards,{" "}
                {Math.round(day.minutes_studied)}m
              </title>
            </rect>
          ))
        )}
      </svg>
    </div>
  );
}
