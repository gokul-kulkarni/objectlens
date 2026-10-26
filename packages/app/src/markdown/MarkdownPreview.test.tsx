// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const renderDiagram = vi.fn();
vi.mock('./mermaid.js', () => ({ renderDiagram: (source: string) => renderDiagram(source) }));

const { MarkdownPreview } = await import('./MarkdownPreview.jsx');
const { MermaidDiagram } = await import('./MermaidDiagram.jsx');
const { renderMarkdown } = await import('./render.js');

beforeEach(() => renderDiagram.mockReset());

describe('MarkdownPreview', () => {
  it('renders HTML segments and diagrams in document order', async () => {
    renderDiagram.mockResolvedValue({ ok: true, svg: '<svg data-testid="svg"></svg>' });
    const { segments } = renderMarkdown('# Title\n\n```mermaid\ngraph TD; A-->B\n```\n\nAfter');
    render(<MarkdownPreview segments={segments} onNavigate={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Title' })).toBeDefined();
    expect(await screen.findByTestId('svg')).toBeDefined();
    expect(renderDiagram).toHaveBeenCalledWith('graph TD; A-->B');
    expect(screen.getByText('After')).toBeDefined();
  });

  it('handles in-page anchors itself, so the URL hash is left to the mode switcher', async () => {
    const onNavigate = vi.fn();
    const { segments } = renderMarkdown('[Jump](#setup)\n\n## Setup');
    render(<MarkdownPreview segments={segments} onNavigate={onNavigate} />);

    await userEvent.click(screen.getByRole('link', { name: 'Jump' }));
    expect(onNavigate).toHaveBeenCalledWith('user-content-setup');
    expect(window.location.hash).toBe('');
  });

  it('leaves external links to the browser', async () => {
    const onNavigate = vi.fn();
    const { segments } = renderMarkdown('[Out](https://example.com)');
    render(<MarkdownPreview segments={segments} onNavigate={onNavigate} />);

    const link = screen.getByRole('link', { name: 'Out' });
    link.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(link);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe('MermaidDiagram', () => {
  it('shows progress, then the diagram', async () => {
    renderDiagram.mockResolvedValue({ ok: true, svg: '<svg data-testid="svg"></svg>' });
    render(<MermaidDiagram source="graph TD; A" />);

    expect(screen.getByText('Rendering diagram…')).toBeDefined();
    expect(await screen.findByTestId('svg')).toBeDefined();
  });

  it('shows the error beside the source when the diagram does not parse', async () => {
    renderDiagram.mockResolvedValue({ ok: false, error: 'Parse error on line 1' });
    render(<MermaidDiagram source="graph ??" />);

    expect((await screen.findByRole('alert')).textContent).toContain('Parse error on line 1');
    expect(screen.getByText('graph ??')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Copy SVG' }).hasAttribute('disabled')).toBe(true);
  });

  it('toggles between the diagram and its source', async () => {
    renderDiagram.mockResolvedValue({ ok: true, svg: '<svg data-testid="svg"></svg>' });
    render(<MermaidDiagram source="graph TD; A" />);
    await screen.findByTestId('svg');

    await userEvent.click(screen.getByRole('button', { name: 'Source' }));
    expect(screen.queryByTestId('svg')).toBeNull();
    expect(screen.getByText('graph TD; A')).toBeDefined();

    await userEvent.click(screen.getByRole('button', { name: 'Diagram' }));
    expect(screen.getByTestId('svg')).toBeDefined();
  });

  it('copies and downloads the SVG', async () => {
    renderDiagram.mockResolvedValue({ ok: true, svg: '<svg data-testid="svg"></svg>' });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const createObjectURL = vi.fn(() => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<MermaidDiagram source="graph TD; A" />);
    await screen.findByTestId('svg');

    await userEvent.click(screen.getByRole('button', { name: 'Copy SVG' }));
    expect(writeText).toHaveBeenCalledWith('<svg data-testid="svg"></svg>');

    await userEvent.click(screen.getByRole('button', { name: 'Download SVG' }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
  });
});
