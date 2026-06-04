interface ScoreRingProps {
  score: number;
  maxScore?: number;
  size?: number;
  label?: string;
}

export default function ScoreRing({ score, maxScore = 10, size = 80, label }: ScoreRingProps) {
  const percentage = (score / maxScore) * 100;
  const circumference = 2 * Math.PI * 35;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const getColor = (pct: number) => {
    if (pct >= 80) return '#10b981';
    if (pct >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const color = getColor(percentage);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r="35" fill="none" stroke="#1f2937" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r="35"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-lg font-bold text-white">{score.toFixed(1)}</span>
      </div>
      {label && <span className="text-xs text-am-muted">{label}</span>}
    </div>
  );
}
