import type { LcaBand } from "./candidates";

export function ExperienceTarget({
  band,
  onChange,
}: {
  band: LcaBand;
  onChange: (band: LcaBand) => void;
}) {
  return (
    <label className="field-label">
      Experience target
      <select
        value={band}
        onChange={(event) => onChange(event.target.value as LcaBand)}
      >
        <option value="jd_2_3y">2–3 years · JD</option>
        <option value="prompt_4_6y">4–6 years · Assignment</option>
      </select>
    </label>
  );
}
