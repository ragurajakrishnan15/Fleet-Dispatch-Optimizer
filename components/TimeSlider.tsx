"use client";

export const formatHour = (h: number) => {
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${h < 12 ? "am" : "pm"}`;
};

export default function TimeSlider({ value, onChange, label = "Hour of day" }: { value: number; onChange: (h: number) => void; label?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor="time-slider" className="text-sm text-muted">
          {label}
        </label>
        <span className="font-semibold tabular-nums">
          {formatHour(value)} <span className="text-muted font-normal">({String(value).padStart(2, "0")}:00)</span>
        </span>
      </div>
      <input
        id="time-slider"
        type="range"
        min={0}
        max={23}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        aria-valuetext={formatHour(value)}
      />
      <div className="flex justify-between text-[11px] text-muted tabular-nums" aria-hidden>
        {[0, 6, 12, 18, 23].map((h) => (
          <span key={h}>{formatHour(h)}</span>
        ))}
      </div>
    </div>
  );
}
