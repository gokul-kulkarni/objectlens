// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import * as icons from './index.js';

type IconComponent = (props: { title?: string; className?: string }) => React.ReactElement;

const ALL = Object.entries(icons) as [string, IconComponent][];

describe('the icon set', () => {
  it('exports every icon the UI draws with', () => {
    expect(ALL.length).toBeGreaterThan(10);
  });

  it.each(ALL)('%s renders an svg', (_name, Component) => {
    const { container } = render(<Component />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('accessibility', () => {
  // These replaced Unicode glyphs, which screen readers announce as words — "white circle",
  // "anticlockwise open circle arrow". The whole point is that decorative marks now say nothing
  // and meaningful ones say something deliberate.

  it.each(ALL)('%s is hidden from assistive tech by default', (_name, Component) => {
    const { container } = render(<Component />);
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
    expect(svg?.querySelector('title')).toBeNull();
  });

  it.each(ALL)('%s becomes an accessible image when given a title', (_name, Component) => {
    const { container } = render(<Component title="Meaningful" />);
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-hidden')).toBeNull();
    expect(svg?.querySelector('title')?.textContent).toBe('Meaningful');
  });

  it.each(ALL)('%s is never focusable, so it adds no tab stops', (_name, Component) => {
    const { container } = render(<Component />);
    expect(container.querySelector('svg')?.getAttribute('focusable')).toBe('false');
  });
});

describe('sizing and colour', () => {
  it.each(ALL)('%s sizes in em so it tracks the surrounding text', (_name, Component) => {
    const { container } = render(<Component />);
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('width')).toBe('1em');
    expect(svg?.getAttribute('height')).toBe('1em');
  });

  it.each(ALL)('%s inherits colour rather than hardcoding one', (_name, Component) => {
    const { container } = render(<Component />);
    const svg = container.querySelector('svg');

    // Either stroked or filled with currentColor — never a literal hex, which would break the
    // moment a token changed.
    const paints = [svg?.getAttribute('stroke'), svg?.getAttribute('fill')];
    expect(paints).toContain('currentColor');
    expect(svg?.outerHTML).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it('forwards className without dropping its own', () => {
    const { container } = render(<icons.Spinner className="text-base" />);
    const className = container.querySelector('svg')?.getAttribute('class') ?? '';

    expect(className).toContain('text-base');
    expect(className).toContain('animate-spin');
  });
});
