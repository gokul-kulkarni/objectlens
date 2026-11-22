// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jsonAdapter } from '@objectlens/adapter-json';
import { pythonAdapter } from '@objectlens/adapter-python';
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

describe('prettify', () => {
  const json = {
    detections: [{ adapter: jsonAdapter, confidence: 1 }],
    effectiveAdapterId: 'json',
    onChangeAdapter: vi.fn(),
  };

  it('rewrites the text through the active adapter', async () => {
    const { onChangeText } = renderEditor({ ...json, text: '{"a":1}' });

    await userEvent.click(screen.getByRole('button', { name: 'Prettify' }));

    expect(onChangeText).toHaveBeenCalledWith('{\n  "a": 1\n}');
  });

  it('is absent when the active adapter cannot format', () => {
    renderEditor({
      detections: [{ adapter: pythonAdapter, confidence: 1 }],
      effectiveAdapterId: 'python-repr',
      onChangeAdapter: vi.fn(),
      text: "{'a': 1}",
    });
    expect(screen.queryByRole('button', { name: 'Prettify' })).toBeNull();
  });

  it('is absent for empty input', () => {
    renderEditor({ ...json, text: '  ' });
    expect(screen.queryByRole('button', { name: 'Prettify' })).toBeNull();
  });

  it('keeps the text and explains when it cannot format', async () => {
    const { onChangeText } = renderEditor({ ...json, text: '{"a": @}' });

    await userEvent.click(screen.getByRole('button', { name: 'Prettify' }));

    expect(onChangeText).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Line 1');
  });

  it('drops the explanation once the text changes', async () => {
    const props = { ...json, idPrefix: '', label: 'Source', placeholder: '', onChangeText: vi.fn() };
    const { rerender } = render(<SourceEditor {...props} text='{"a": @}' />);

    await userEvent.click(screen.getByRole('button', { name: 'Prettify' }));
    rerender(<SourceEditor {...props} text='{"a": 1}' />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('survives an adapter that throws', async () => {
    const adapter = {
      ...jsonAdapter,
      format: () => {
        throw new Error('boom');
      },
    };
    renderEditor({ ...json, detections: [{ adapter, confidence: 1 }], text: '{}' });

    await userEvent.click(screen.getByRole('button', { name: 'Prettify' }));

    expect(screen.getByRole('alert').textContent).toContain('boom');
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
