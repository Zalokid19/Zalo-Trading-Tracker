interface Props {
  score: number; // 0–100
}

export default function Gauge({ score }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const angle = (clamped / 100) * 180; // 0 to 180 degrees
  const radius = 80;
  const cx = 100;
  const cy = 100;

  const needleRad = ((180 - angle) * Math.PI) / 180;
  const needleX = cx + radius * 0.85 * Math.cos(needleRad);
  const needleY = cy - radius * 0.85 * Math.sin(needleRad);

  let label = "Weak";
  let labelColor = "#ff3b5c";
  if (clamped >= 70) {
    label = "Strong";
    labelColor = "#00e6a0";
  } else if (clamped >= 40) {
    label = "Moderate";
    labelColor = "#ffb020";
  }

  return (
    <div className="flex flex-col items-center">
      <svg width="200" height="120" viewBox="0 0 200 120">
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#26263a"
          strokeWidth="16"
        />
        <path
          d="M 20 100 A 80 80 0 0 1 66 27"
          fill="none"
          stroke="#ff3b5c"
          strokeWidth="16"
        />
        <path
          d="M 66 27 A 80 80 0 0 1 134 27"
          fill="none"
          stroke="#ffb020"
          strokeWidth="16"
        />
        <path
          d="M 134 27 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#00e6a0"
          strokeWidth="16"
        />
        <line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="6" fill="white" />
      </svg>
      <p className="text-3xl font-extrabold -mt-2">{Math.round(clamped)}</p>
      <p className="text-sm font-semibold" style={{ color: labelColor }}>
        {label} Setup
      </p>
    </div>
  );
}