interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Checkbox({ checked, onChange }: CheckboxProps) {
  return (
    <>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
        className="peer sr-only"
      />
      <span className="size-4 rounded border border-neutral-300 dark:border-neutral-500 flex items-center justify-center peer-checked:bg-neutral-700 dark:peer-checked:bg-neutral-300 peer-checked:border-neutral-700 dark:peer-checked:border-neutral-300 transition-colors shrink-0">
        <svg
          aria-hidden="true"
          className="w-3.5 h-3.5 text-white dark:text-neutral-800 transition-opacity"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    </>
  );
}
