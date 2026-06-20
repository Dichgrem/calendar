interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Checkbox({ checked, onChange }: CheckboxProps) {
  return (
    <label className="size-4 inline-flex items-center justify-center cursor-pointer shrink-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="sr-only"
      />
      <span
        className={`size-4 rounded border flex items-center justify-center transition-colors ${
          checked
            ? "bg-neutral-700 dark:bg-neutral-300 border-neutral-700 dark:border-neutral-300"
            : "border-neutral-300 dark:border-neutral-500"
        }`}
      >
        {checked && (
          <svg
            aria-hidden="true"
            className="w-3.5 h-3.5 text-white dark:text-neutral-800"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
    </label>
  );
}
