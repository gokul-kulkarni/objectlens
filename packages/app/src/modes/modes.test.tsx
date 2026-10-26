// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { diffGraphs } from '@objectlens/diff';
import { adapters } from '../registry.js';
import type { CompareRequest, CompareResponse, SourceInput } from '../worker/parse.worker.js';
import { PANEL_DEFAULTS, type PanelControls } from '../state/usePanelSizes.js';
import { COMPARE_EXAMPLES, MARKDOWN_EXAMPLES } from '../examples.js';

vi.mock('../markdown/mermaid.js', () => ({
  renderDiagram: async () => ({ ok: true, svg: '<svg data-testid="diagram"></svg>' }),
}));

const { CompareMode } = await import('./CompareMode.jsx');
const { MarkdownMode } = await import('./MarkdownMode.jsx');

/** Runs the real adapters and diff on the main thread, standing in for the module worker. */
class FakeWorker extends EventTarget {
  postMessage(request: CompareRequest) {
    const parse = (side: SourceInput) => adapters.parseWith(side.adapterId, { text: side.text });
    void Promise.all([parse(request.left), parse(request.right)]).then(([left, right]) => {
      const data: CompareResponse = {
        type: 'compare',
        id: request.id,
        diff: left.graph === null || right.graph === null ? null : diffGraphs(left.graph, right.graph, request.options),
        leftDiagnostics: left.diagnostics,
        rightDiagnostics: right.diagnostics,
        elapsedMs: 1,
      };
      this.dispatchEvent(new MessageEvent('message', { data }));
    });
  }
  terminate() {}
}

const panels: PanelControls = {
  sizes: PANEL_DEFAULTS,
  setPanel: vi.fn(),
  adjustPanel: vi.fn(),
  resetPanel: vi.fn(),
};

beforeAll(() => {
  vi.stubGlobal('Worker', FakeWorker);
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => vi.clearAllMocks());

async function paste(label: string, text: string) {
  await userEvent.click(screen.getByLabelText(label));
  await userEvent.paste(text);
}

describe('CompareMode', () => {
  it('compares an example end to end and navigates between changes', async () => {
    render(<CompareMode panels={panels} />);
    expect(screen.getByText('No comparison yet')).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: COMPARE_EXAMPLES[0]!.name }));
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));

    const counts = await screen.findByText(/added$/);
    expect(counts.textContent).toBe('+1 added');
    expect(screen.getByText('−1 removed')).toBeDefined();
    expect(screen.getByText('~3 changed')).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const detail = screen.getByText('Path').parentElement as HTMLElement;
    expect(within(detail).getByText('$["replicas"]')).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'Prev' }));
    expect(within(detail).getByText('$["env"]["FEATURE_X"]')).toBeDefined();
  });

  it('says so when the inputs hold the same data in different formats', async () => {
    render(<CompareMode panels={panels} />);
    await userEvent.click(screen.getByRole('button', { name: 'JSON vs YAML' }));
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));

    expect(await screen.findByText(/No differences/)).toBeDefined();
  });

  it('matches records by key and can filter to changes and expand everything', async () => {
    render(<CompareMode panels={panels} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reordered records' }));
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));

    expect(await screen.findByText('+1 added')).toBeDefined();
    await userEvent.click(screen.getByLabelText('Only changes'));
    await userEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByRole('treeitem', { name: 'id=4, added' })).toBeDefined();
    expect(screen.queryByRole('treeitem', { name: 'id=3, unchanged' })).toBeNull();

    expect(screen.getAllByRole('treeitem', { name: /^role, / }).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(screen.queryAllByRole('treeitem', { name: /^role, / })).toHaveLength(0);
  });

  it('notes when the identity key could not be used', async () => {
    render(<CompareMode panels={panels} />);
    await paste('Original source', '[{"id": 1}, {"id": 1}]');
    await paste('Modified source', '[{"id": 1}]');
    await userEvent.type(screen.getByLabelText('Match arrays by'), 'id');
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));

    expect(await screen.findByText(/not every item has a unique "id"/)).toBeDefined();
  });

  it('labels diagnostics with the side they belong to', async () => {
    render(<CompareMode panels={panels} />);
    await paste('Original source', '{"a": 1}');
    await paste('Modified source', '{"a": 2, "b": @@}');
    await userEvent.click(screen.getByRole('button', { name: 'Compare' }));

    await screen.findByText(/changed$/);
    // Once as the editor's title, once on its diagnostics.
    expect(screen.getAllByText('Modified')).toHaveLength(2);
    expect(screen.getAllByText('Original')).toHaveLength(1);
  });
});

describe('MarkdownMode', () => {
  it('renders an example with its outline and diagrams', async () => {
    render(<MarkdownMode panels={panels} />);
    expect(screen.getByText('No headings.')).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: MARKDOWN_EXAMPLES[0]!.name }));

    const outline = await screen.findByRole('navigation', { name: 'Outline' });
    expect(within(outline).getByRole('button', { name: 'Checkout service' })).toBeDefined();
    expect(await screen.findAllByTestId('diagram')).toHaveLength(2);
    expect(screen.getByRole('table')).toBeDefined();

    await userEvent.click(within(outline).getByRole('button', { name: 'Architecture' }));
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it('shows why a URL cannot be loaded', async () => {
    render(<MarkdownMode panels={panels} />);
    await userEvent.type(screen.getByLabelText('Markdown URL'), 'ftp://x.example/a.md');
    await userEvent.click(screen.getByRole('button', { name: 'Load' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Only http and https URLs can be loaded.');
  });
});
