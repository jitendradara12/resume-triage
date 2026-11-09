import type { LcaBand } from "./candidates";

const bands: { id: LcaBand; label: string }[] = [
  { id: "jd_2_3y", label: "2–3 yrs" },
  { id: "prompt_4_6y", label: "4–6 yrs" },
];

export function ExperienceTarget({
  band,
  onChange,
}: {
  band: LcaBand;
  onChange: (band: LcaBand) => void;
}) {
  return (
    <div
      className="segmented-inline"
      role="group"
      aria-label="Target experience"
    >
      <span className="segmented-label">Target experience</span>
      <div className="segmented-track">
        {bands.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={band === item.id}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
