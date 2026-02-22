/**
 * Retention Map — heatmap grid of avg retrievability by tag/topic.
 */

interface TagRetention {
  tag: string;
  avg_ret: number;
}

interface Props {
  data: TagRetention[];
}

function retentionColor(r: number): string {
  if (r >= 0.85) return "#15803d"; // green-700
  if (r >= 0.70) return "#ca8a04"; // yellow-600
  if (r >= 0.50) return "#c2410c"; // orange-700
  return "#b91c1c"; // red-700
}

export default function RetentionMap({ data }: Props) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-gray-600">No topics studied yet.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {data.map(({ tag, avg_ret }) => (
        <div
          key={tag}
          className="px-3 py-2 rounded-lg text-xs text-white font-medium"
          style={{ backgroundColor: retentionColor(avg_ret) }}
          title={`${tag}: ${Math.round(avg_ret * 100)}% retention`}
        >
          {tag}
          <span className="ml-1 opacity-70">{Math.round(avg_ret * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
