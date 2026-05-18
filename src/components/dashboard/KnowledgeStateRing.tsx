/**
 * Knowledge State Ring — donut chart showing new/learning/review/mastered counts.
 */

interface Props {
  new_count: number;
  learning_count: number;
  review_count: number;
  mastered_count: number;
}

const COLORS = {
  new: "#8b5cf6",    // purple
  learning: "#f59e0b", // amber
  review: "#3b82f6", // blue
  mastered: "#22c55e", // green
};

function polarToXY(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToXY(cx, cy, r, endAngle);
  const end = polarToXY(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export default function KnowledgeStateRing({
  new_count,
  learning_count,
  review_count,
  mastered_count,
}: Props) {
  const total = new_count + learning_count + review_count + mastered_count;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-600 text-sm">
        No cards yet
      </div>
    );
  }

  const segments = [
    { label: "New", count: new_count, color: COLORS.new },
    { label: "Learning", count: learning_count, color: COLORS.learning },
    { label: "Review", count: review_count, color: COLORS.review },
    { label: "Mastered", count: mastered_count, color: COLORS.mastered },
  ];

  const cx = 80;
  const cy = 80;
  const r = 60;
  const strokeWidth = 18;

  let currentAngle = 0;
  const arcs = segments
    .filter((s) => s.count > 0)
    .map((seg) => {
      const sweep = (seg.count / total) * 360;
      const arc = {
        ...seg,
        d: describeArc(cx, cy, r, currentAngle, currentAngle + sweep - 1),
      };
      currentAngle += sweep;
      return arc;
    });

  const ariaLabel = `Knowledge state: ${new_count} new, ${learning_count} learning, ${review_count} review, ${mastered_count} mastered, ${total} total cards`;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <svg
          width="160"
          height="160"
          viewBox="0 0 160 160"
          role="img"
          aria-label={ariaLabel}
        >
          <title>{ariaLabel}</title>
          {/* Background ring */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#1f2937"
            strokeWidth={strokeWidth}
          />
          {arcs.map((arc) => (
            <path
              key={arc.label}
              d={arc.d}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              aria-label={`${arc.label}: ${arc.count} cards`}
            />
          ))}
          {/* Center total */}
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            fill="white"
            fontSize="20"
            fontWeight="bold"
            aria-hidden="true"
          >
            {total}
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            fill="#6b7280"
            fontSize="10"
            aria-hidden="true"
          >
            cards
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-gray-400">{seg.label}</span>
            <span className="text-white font-medium ml-auto">{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
