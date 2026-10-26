// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonAdapter } from '@objectlens/adapter-json';
import { SourceEditor } from './SourceEditor.jsx';
import { SegmentedControl } from './SegmentedControl.jsx';

function renderEditor(overrides: Partial<Parameters<typeof SourceEditor>[0]> = {}) {
  const onChangeText = vi.fn();
  const onSubmit = vi.fn();
  render(
    <SourceEditor
      idPrefix="test-"
      text=""
      label="Source"
      placeholder="Paste"
      onChangeText={onChangeText}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { onChangeText, onSubmit };
}

describe('SourceEditor', () => {
  it('has no format picker unless detections are given', () => {
    renderEditor();
    expect(screen.queryByLabelText('Format')).toBeNull();
  });

  it('scopes the picker id so two editors do not share a label', () => {
    renderEditor({
      detections: [{ adapter: jsonAdapter, confidence: 1 }],
      effectiveAdapterId: 'json',
      onChangeAdapter: vi.fn(),
    });
    expect(screen.getByLabelText('Format').id).toBe('test-format');
  });

  it('shows a title when given', () => {
    renderEditor({ title: 'Original' });
    expect(screen.getByText('Original')).toBeDefined();
  });

  it('submits on the keyboard shortcut', async () => {
    const { onSubmit } = renderEditor();
    await userEvent.click(screen.getByLabelText('Source'));
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalled();
  });

  it('reads an opened file with its name', async () => {
    const { onChangeText } = renderEditor({ accept: '.md' });
    const input = screen.getByTestId('test-file') as HTMLInputElement;
    expect(input.accept).toBe('.md');

    await userEvent.upload(input, new File(['# hi'], 'README.md', { type: 'text/markdown' }));
    await vi.waitFor(() => expect(onChangeText).toHaveBeenCalledWith('# hi', 'README.md'));
  });

  it('reads a dropped file', async () => {
    const { onChangeText } = renderEditor();
    const target = screen.getByLabelText('Source').parentElement as HTMLElement;
    const file = new File(['{"a": 1}'], 'a.json');

    fireEvent.dragOver(target);
    fireEvent.drop(target, { dataTransfer: { files: [file] } });
    await vi.waitFor(() => expect(onChangeText).toHaveBeenCalledWith('{"a": 1}', 'a.json'));
  });
});

describe('SegmentedControl', () => {
  it('marks the current option pressed and reports a change', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Mode"
        options={[
          { id: 'a', label: 'Alpha' },
          { id: 'b', label: 'Beta', description: 'second' },
        ]}
        value="a"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('group', { name: 'Mode' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Alpha' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
