// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonAdapter } from '@objectlens/adapter-json';
import { yamlAdapter } from '@objectlens/adapter-yaml';
import { COMPARE_EXAMPLES } from '../examples.js';
import { CompareInputs, type CompareInputsProps } from './CompareInputs.jsx';

function renderInputs(overrides: Partial<CompareInputsProps> = {}) {
  const handlers = {
    onChangeText: vi.fn(),
    onChangeAdapter: vi.fn(),
    onChangeArrayKey: vi.fn(),
    onSwap: vi.fn(),
    onLoad: vi.fn(),
    onCompare: vi.fn(),
  };
  render(
    <CompareInputs
      left={{ text: '{"a": 1}', adapterId: null }}
      right={{ text: 'a: 2', adapterId: null }}
      leftDetections={[{ adapter: jsonAdapter, confidence: 1 }]}
      rightDetections={[{ adapter: yamlAdapter, confidence: 0.8 }]}
      leftAdapter="json"
      rightAdapter="yaml"
      arrayKey=""
      canCompare
      comparing={false}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('CompareInputs', () => {
  it('gives each side its own detected format', () => {
    renderInputs();
    expect(screen.getByRole('option', { name: 'Auto — JSON' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Auto — YAML' })).toBeDefined();
  });

  it('reports edits and format picks for the right side', async () => {
    const { onChangeText, onChangeAdapter } = renderInputs({ right: { text: '', adapterId: null } });

    await userEvent.type(screen.getByLabelText('Modified source'), 'x');
    expect(onChangeText).toHaveBeenCalledWith('right', 'x', undefined);

    const [, rightFormat] = screen.getAllByLabelText('Format');
    await userEvent.selectOptions(rightFormat as HTMLElement, 'yaml');
    expect(onChangeAdapter).toHaveBeenCalledWith('right', 'yaml');
  });

  it('compares from the button, the shortcut, and Enter in the key field', async () => {
    const { onCompare, onChangeArrayKey } = renderInputs();

    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));
    await userEvent.click(screen.getByLabelText('Original source'));
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}');
    await userEvent.type(screen.getByLabelText('Match arrays by'), 'i{Enter}');

    expect(onChangeArrayKey).toHaveBeenCalledWith('i');
    expect(onCompare).toHaveBeenCalledTimes(3);
  });

  it('cannot compare without two detectable inputs, or while comparing', () => {
    renderInputs({ canCompare: false });
    expect(screen.getByRole('button', { name: 'Compare' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows progress while comparing', () => {
    renderInputs({ comparing: true });
    expect(screen.getByRole('button', { name: 'Comparing…' }).hasAttribute('disabled')).toBe(true);
  });

  it('swaps and loads examples', async () => {
    const { onSwap, onLoad } = renderInputs();
    await userEvent.click(screen.getByRole('button', { name: 'Swap' }));
    expect(onSwap).toHaveBeenCalled();

    const example = COMPARE_EXAMPLES.find((candidate) => candidate.arrayKey !== undefined)!;
    await userEvent.click(screen.getByRole('button', { name: example.name }));
    expect(onLoad).toHaveBeenCalledWith(example.left, example.right, example.arrayKey);
  });
});
