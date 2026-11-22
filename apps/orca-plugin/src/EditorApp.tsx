/**
 * The Orca editor: the open file, explored.
 *
 * Read-only by design. Orca's own Source view, one click away in the view toggle, is where the
 * file is edited; this view re-parses whenever the file changes, whether the person typed in
 * Source or an agent rewrote it on disk. Writing back would mean owning merges against agents
 * editing the same file, for no gain over the editor already beside it.
 */

import { useEffect, useState } from 'react';
import { ObjectExplorer, usePanelSizes, useViewer } from '@objectlens/ui';
import type { DocumentFeed } from './orca.js';

export function EditorApp({ feed }: { readonly feed: DocumentFeed }) {
  const [text, setText] = useState(feed.text);
  const viewer = useViewer();
  const panels = usePanelSizes();
  const { setInput, parse } = viewer;

  useEffect(() => {
    const subscription = feed.subscribe(setText);
    return () => subscription.dispose();
  }, [feed]);

  useEffect(() => setInput(text), [text, setInput]);

  // `parse` changes identity whenever the text or detected format does, so this runs once per
  // new document — including the first.
  useEffect(() => parse(), [parse]);

  return (
    <div className="flex h-full flex-col bg-surface text-[color:var(--color-ink)]">
      <main className="flex min-h-0 flex-1 flex-row">
        <ObjectExplorer viewer={viewer} panels={panels} emptyHint={<EmptyFileHint />} />
      </main>
    </div>
  );
}

function EmptyFileHint() {
  return (
    <p className="leading-relaxed">
      This file is empty. Switch to <strong>Source</strong> to add some JSON, YAML or a Python{' '}
      <code className="font-mono">repr()</code> dump, and it will appear here.
    </p>
  );
}
