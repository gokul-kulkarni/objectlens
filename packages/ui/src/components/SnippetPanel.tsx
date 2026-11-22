/**
 * The zero-install on-ramp.
 *
 * Everything else on this page works on text you already have. This is for the case the text
 * cannot cover: `repr()` has no way to say "these two entries are the same object", so a pasted
 * dump can never show sharing, and a cycle arrives as a bare `...` pointing at nothing. Walking
 * the live object recovers both — and `pip install` is a real barrier when you want to look at
 * *one* object on a machine you do not control.
 *
 * Collapsed by default: it is the answer to a question most visitors do not have yet, and an
 * inspector's input pane is not the place for a wall of Python.
 */

import { useCallback, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy } from '@objectlens/icons';
import snippet from '../../../../python/snippets/export.py?raw';

/** How long the button stays confirmed. Long enough to read, short enough not to feel stuck. */
const CONFIRM_MS = 1500;

export function SnippetPanel() {
  const [isOpen, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(snippet).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), CONFIRM_MS);
      },
      () => {
        // Clipboard access can be denied outright. The snippet is on screen and selectable, so
        // the fallback is the text itself rather than an error the reader cannot act on.
        setCopied(false);
      },
    );
  }, []);

  return (
    <section className="shrink-0 border-t border-line pt-2">
      <button
        type="button"
        aria-expanded={isOpen}
        className="flex w-full cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-left text-[11px] text-[color:var(--color-ink-subtle)] transition-colors duration-150 hover:text-[color:var(--color-ink)]"
        onClick={() => setOpen((open) => !open)}
      >
        {isOpen ? <ChevronDown className="text-[9px]" /> : <ChevronRight className="text-[9px]" />}
        Have a live Python object? Export it with real cycles and shared references
      </button>

      {isOpen && (
        <div className="mt-1 flex flex-col gap-2 px-1 pb-1">
          <p className="text-[11px] leading-relaxed text-[color:var(--color-ink-subtle)]">
            Paste this into any REPL — no install, standard library only — then call{' '}
            <code className="font-mono text-[color:var(--color-node-scalar)]">lens(obj)</code> and
            drop the file it writes back here.
          </p>

          <button
            type="button"
            className="flex w-fit cursor-pointer items-center gap-1.5 rounded border border-line-strong px-2 py-1 text-[11px] text-[color:var(--color-ink-muted)] transition-colors duration-150 hover:bg-surface-raised"
            onClick={copy}
          >
            {copied ? <Check className="text-[color:var(--color-node-scalar)]" /> : <Copy />}
            {copied ? 'Copied' : 'Copy snippet'}
          </button>

          <pre className="max-h-40 overflow-auto rounded border border-line bg-surface-sunken p-2 font-mono text-[10px] leading-relaxed text-[color:var(--color-ink-subtle)]">
            {snippet}
          </pre>
        </div>
      )}
    </section>
  );
}
