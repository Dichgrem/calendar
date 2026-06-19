import { useI18n } from "../hooks/use-i18n";
import { CALENDAR_COLORS } from "../lib/colors";

interface ColorSwatchPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorSwatchPicker({ value, onChange }: ColorSwatchPickerProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-1.5">
      {CALENDAR_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Color ${c}`}
          className="size-6 rounded-full border-2 transition-transform hover:scale-110"
          style={{
            backgroundColor: c,
            borderColor: c.toLowerCase() === value.toLowerCase() ? "currentColor" : "transparent",
          }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="size-6 rounded-full cursor-pointer border-0 p-0"
        title={t("common.customColor")}
      />
    </div>
  );
}
