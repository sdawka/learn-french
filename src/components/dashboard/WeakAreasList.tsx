/**
 * Weak Areas List — bottom 10 KCs by retrievability, with "practice now" CTA.
 */

interface WeakArea {
  kc_id: number;
  retrievability: number;
  label: string;
  type: string;
  due_at: string | null;
}

interface Props {
  items: WeakArea[];
}

export default function WeakAreasList({ items }: Props) {
  if (!items || items.length === 0) {
    return (
      <p className="text-sm text-gray-600">Nothing weak — great work!</p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const pct = Math.round(item.retrievability * 100);
        const barColor =
          pct < 40 ? "bg-red-500" : pct < 65 ? "bg-amber-500" : "bg-blue-500";

        return (
          <li
            key={item.kc_id}
            className="flex items-center gap-3 py-2 border-b border-gray-800"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{item.label}</p>
              <div className="mt-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${barColor} rounded-full transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-gray-500 shrink-0 w-8 text-right">
              {pct}%
            </span>
            <a
              href={`/games/${item.type}?kc=${item.kc_id}`}
              className="text-xs text-blue-400 hover:text-blue-300 shrink-0"
            >
              Practice
            </a>
          </li>
        );
      })}
    </ul>
  );
}
