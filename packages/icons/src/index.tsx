/**
 * Shared icon set.
 *
 * These replace the Unicode glyphs the UI used to draw with (`▾ ▸ · ↺ ⌀ ✕`). Text glyphs are a
 * poor icon system: they render at whatever weight and baseline the user's font happens to give
 * them, several have no glyph in common monospace faces, and screen readers announce them as
 * words — "white circle", "anticlockwise open circle arrow".
 *
 * Every icon here is `aria-hidden` by default and sized in `em`, so it inherits the surrounding
 * text size and colour and never needs its own colour rule. Anything conveying meaning that is
 * not otherwise in the text carries a `title`, which is what an assistive reader announces.
 *
 * Geometry follows Lucide's 24×24 grid and 2px stroke conventions.
 */

import type { SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Accessible name. Omit for decorative icons — the default is `aria-hidden`. */
  readonly title?: string;
}

function Icon({ title, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={title === undefined ? true : undefined}
      role={title === undefined ? undefined : 'img'}
      {...props}
    >
      {title !== undefined && <title>{title}</title>}
      {children}
    </svg>
  );
}

/** Collapsed disclosure. */
export const ChevronRight = (props: IconProps) => (
  <Icon {...props}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);

/** Expanded disclosure. */
export const ChevronDown = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

/** A leaf — no children to disclose. Drawn faintly so rows still align. */
export const Dot = (props: IconProps) => (
  <Icon {...props} strokeWidth={0} fill="currentColor">
    <circle cx="12" cy="12" r="2.5" />
  </Icon>
);

/** A set member: unordered, so deliberately not a number. */
export const Bullet = (props: IconProps) => (
  <Icon {...props} strokeWidth={2}>
    <circle cx="12" cy="12" r="4" />
  </Icon>
);

/** A reference that closes a loop back into an ancestor. */
export const Cycle = (props: IconProps) => (
  <Icon {...props}>
    <path d="M17 2.1l4 4-4 4" />
    <path d="M3 12.2v-2a4 4 0 0 1 4-4h12.8M7 21.9l-4-4 4-4" />
    <path d="M21 11.8v2a4 4 0 0 1-4 4H4.2" />
  </Icon>
);

/** A reference to an object reachable by another path — a join, not a loop. */
export const SharedRef = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </Icon>
);

/** Marks a position with no access expression: inside a set, a key, or a positional arg. */
export const NoPath = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.6 5.6 12.8 12.8" />
  </Icon>
);

export const ErrorIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15 9-6 6M9 9l6 6" />
  </Icon>
);

export const WarningIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </Icon>
);

export const Copy = (props: IconProps) => (
  <Icon {...props}>
    <rect width="13" height="13" x="9" y="9" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Icon>
);

export const Check = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

export const Search = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Icon>
);

export const FileUp = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v5h5M12 18v-6M9.5 14.5 12 12l2.5 2.5" />
  </Icon>
);

export const Play = (props: IconProps) => (
  <Icon {...props} strokeWidth={0} fill="currentColor">
    <path d="M7 4.5v15a1 1 0 0 0 1.5.87l13-7.5a1 1 0 0 0 0-1.74l-13-7.5A1 1 0 0 0 7 4.5Z" />
  </Icon>
);

export const Spinner = (props: IconProps) => (
  <Icon {...props} className={`animate-spin ${props.className ?? ''}`}>
    <path d="M21 12a9 9 0 1 1-6.2-8.6" />
  </Icon>
);

export const ChevronSeparator = (props: IconProps) => (
  <Icon {...props} strokeWidth={2.5}>
    <path d="m9 18 6-6-6-6" />
  </Icon>
);
