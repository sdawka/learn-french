/**
 * Forgetting Curve — predicted average retention over next 7 days.
 */

interface DataPoint {
  day: number;
  avg_retrievability: number;
}

interface Props {
  data: DataPoint[];
}

export default function ForgettingCurve({ data }: Props) {
  if (!data || data.length === 0) return null;

  const W = 320;
  const H = 120;
  const pad = { t: 10, r: 16, b: 28, l: 40 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const minR = 0.5;
  const maxR = 1.0;

  const toX = (day: number) => pad.l + (day / 7) * innerW;
  const toY = (r: number) =>
    pad.t + innerH - ((r - minR) / (maxR - minR)) * innerH;

  const points = data.map((d) => `${toX(d.day)},${toY(d.avg_retrievability)}`).join(" ");
  const today = data[0]?.avg_retrievability ?? 1;

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        Current retention: <span className="text-white font-medium">{Math.round(today * 100)}%</span>
      </p>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-sm"
      >
        {/* Grid lines */}
        {[0.6, 0.7, 0.8, 0.9, 1.0].map((r) => (
          <g key={r}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={toY(r)}
              y2={toY(r)}
              stroke="#1f2937"
              strokeDasharray="3 3"
            />
            <text
              x={pad.l - 6}
              y={toY(r) + 4}
              textAnchor="end"
              fill="#6b7280"
              fontSize="9"
            >
              {Math.round(r * 100)}
            </text>
          </g>
        ))}

        {/* 90% target line */}
        <line
          x1={pad.l}
          x2={W - pad.r}
          y1={toY(0.9)}
          y2={toY(0.9)}
          stroke="#3b82f6"
          strokeDasharray="4 2"
          strokeOpacity={0.5}
        />

        {/* Area fill */}
        <polyline
          points={`${toX(0)},${H - pad.b} ${points} ${toX(7)},${H - pad.b}`}
          fill="#3b82f6"
          fillOpacity={0.1}
          stroke="none"
        />

        {/* Curve */}
        <polyline
          points={points}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* Day labels */}
        {[0, 1, 3, 7].map((day) => (
          <text
            key={day}
            x={toX(day)}
            y={H - 6}
            textAnchor="middle"
            fill="#6b7280"
            fontSize="9"
          >
            {day === 0 ? "now" : `+${day}d`}
          </text>
        ))}
      </svg>
    </div>
  );
}
