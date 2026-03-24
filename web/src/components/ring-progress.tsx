interface RingProgressProps {
  size?: number;
  thickness?: number;
  sections: { value: number; color: string }[];
  label?: React.ReactNode;
}

export function RingProgress({ size = 160, thickness = 16, sections, label }: RingProgressProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let cumulativeOffset = 0;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          className="text-muted/30"
        />
        {/* Section arcs */}
        {sections.map((section, i) => {
          const dashLength = (section.value / 100) * circumference;
          const offset = circumference - cumulativeOffset * circumference / 100;
          cumulativeOffset += section.value;
          return (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={section.color}
              strokeWidth={thickness}
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={circumference * (1 - (cumulativeOffset - section.value) / 100)}
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
              style={{ transform: 'rotate(0deg)', transformOrigin: 'center' }}
            />
          );
        })}
      </svg>
      {label && (
        <div className="absolute inset-0 flex items-center justify-center">
          {label}
        </div>
      )}
    </div>
  );
}
