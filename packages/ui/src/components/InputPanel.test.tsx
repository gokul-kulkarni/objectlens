// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Detection } from '@objectlens/core';
import { jsonAdapter } from '@objectlens/adapter-json';
import { pythonAdapter } from '@objectlens/adapter-python';
import { InputPanel } from './InputPanel.jsx';
import { EXAMPLES } from '../examples.js';

const detections: readonly Detection[] = [
  { adapter: pythonAdapter, confidence: 0.9 },
  { adapter: jsonAdapter, confidence: 0.2 },
];

function renderPanel(overrides: Partial<Parameters<typeof InputPanel>[0]> = {}) {
  const onChangeText = vi.fn();
  const onChangeAdapter = vi.fn();
  const onParse = vi.fn();

  render(
    <InputPanel
      text="{'a': 1}"
      detections={detections}
      adapterId={null}
      effectiveAdapterId="python-repr"
      status="ready"
      onChangeText={onChangeText}
      onChangeAdapter={onChangeAdapter}
      onParse={onParse}
      {...overrides}
    />,
  );

  return { onChangeText, onChangeAdapter, onParse };
}

describe('format picker', () => {
  it('names what auto-detection chose, rather than just saying "Auto"', () => {
    renderPanel();
    expect(screen.getByRole('option', { name: /Auto — Python repr\(\)/ })).toBeDefined();
  });

  it('lists every candidate with its confidence', () => {
    renderPanel();

    expect(screen.getByRole('option', { name: 'Python repr() (90%)' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'JSON (20%)' })).toBeDefined();
  });

  it('lets the user override detection, which is only a heuristic', () => {
    const { onChangeAdapter } = renderPanel();

    const select = screen.getByLabelText('Format');
    void userEvent.selectOptions(select, 'json');

    return vi.waitFor(() => expect(onChangeAdapter).toHaveBeenCalledWith('json'));
  });

  it('returns to auto-detection when Auto is chosen', async () => {
    const { onChangeAdapter } = renderPanel({ adapterId: 'json' });

    await userEvent.selectOptions(screen.getByLabelText('Format'), 'auto');

    expect(onChangeAdapter).toHaveBeenCalledWith(null);
  });
});

describe('parsing', () => {
  it('triggers a parse from the button', async () => {
    const { onParse } = renderPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Visualise' }));

    expect(onParse).toHaveBeenCalled();
  });

  it('is disabled for empty input', () => {
    renderPanel({ text: '   ' });
    expect(screen.getByRole('button', { name: 'Visualise' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows progress while parsing and blocks re-entry', () => {
    renderPanel({ status: 'parsing' });
    expect(screen.getByRole('button', { name: 'Parsing…' }).hasAttribute('disabled')).toBe(true);
  });

  it('parses on the keyboard shortcut', async () => {
    const { onParse } = renderPanel();

    await userEvent.click(screen.getByLabelText('Object source'));
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');

    expect(onParse).toHaveBeenCalled();
  });
});

describe('text entry', () => {
  it('reports typed text', async () => {
    const { onChangeText } = renderPanel({ text: '' });

    await userEvent.type(screen.getByLabelText('Object source'), 'x');

    expect(onChangeText).toHaveBeenCalledWith('x');
  });
});

describe('examples', () => {
  it('offers every bundled example, because an empty box teaches nothing', () => {
    renderPanel();

    for (const example of EXAMPLES) {
      expect(screen.getByRole('button', { name: example.name })).toBeDefined();
    }
  });

  it('loads an example on click', async () => {
    const { onChangeText } = renderPanel();
    const example = EXAMPLES[0]!;

    await userEvent.click(screen.getByRole('button', { name: example.name }));

    expect(onChangeText).toHaveBeenCalledWith(example.text);
  });
});
