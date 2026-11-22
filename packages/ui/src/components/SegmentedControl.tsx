/**
 * A row of mutually exclusive buttons — the mode switcher and the view switcher.
 *
 * Buttons with `aria-pressed` rather than tabs: each choice swaps the whole working area, and a
 * toggle group is the simpler contract for assistive tech when there is no tab panel to label.
 */

export interface SegmentOption<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly description?: string;
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group. */
  readonly label: string;
  readonly options: readonly SegmentOption<T>[];
  readonly value: T;
  readonly onChange: (id: T) => void;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex shrink-0 overflow-hidden rounded border border-line-strong text-xs">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          title={option.description}
          aria-pressed={option.id === value}
          className={`cursor-pointer px-2 py-0.5 transition-colors duration-150 ${
            option.id === value
              ? 'bg-brand text-brand-ink'
              : 'text-[color:var(--color-ink-muted)] hover:bg-surface-raised'
          }`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
