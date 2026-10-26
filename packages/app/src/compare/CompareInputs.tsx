/**
 * The two inputs of a comparison, each with its own format picker — the sides need not share a
 * format — plus the options that shape the match.
 */

import type { Detection } from '@objectlens/core';
import { Play, Spinner, Swap } from '@objectlens/icons';
import { SourceEditor } from '../components/SourceEditor.jsx';
import { COMPARE_EXAMPLES } from '../examples.js';
import type { Side, SideState } from './useCompare.js';

export interface CompareInputsProps {
  readonly left: SideState;
  readonly right: SideState;
  readonly leftDetections: readonly Detection[];
  readonly rightDetections: readonly Detection[];
  readonly leftAdapter: string | null;
  readonly rightAdapter: string | null;
  readonly arrayKey: string;
  readonly canCompare: boolean;
  readonly comparing: boolean;
  readonly onChangeText: (side: Side, text: string, filename?: string) => void;
  readonly onChangeAdapter: (side: Side, adapterId: string | null) => void;
  readonly onChangeArrayKey: (arrayKey: string) => void;
  readonly onSwap: () => void;
  readonly onLoad: (left: string, right: string, arrayKey?: string) => void;
  readonly onCompare: () => void;
}

export function CompareInputs(props: CompareInputsProps) {
  const { arrayKey, canCompare, comparing, onChangeArrayKey, onSwap, onLoad, onCompare } = props;

  return (
    <section className="flex h-full flex-col gap-2 p-3">
      <SideEditor side="left" title="Original" {...props} />

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          title="Swap the two sides"
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-slate-700 px-2 py-1 text-xs text-[color:var(--color-ink-muted)] transition-colors duration-150 hover:bg-slate-800"
          onClick={onSwap}
        >
          <Swap />
          Swap
        </button>

        <label htmlFor="compare-array-key" className="shrink-0 text-xs text-[color:var(--color-ink-subtle)]">
          Match arrays by
        </label>
        <input
          id="compare-array-key"
          type="text"
          spellCheck={false}
          placeholder="position (or a key, e.g. id)"
          title="Match array records by this field, so reordered records line up"
          className="min-w-0 flex-1 rounded border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-xs outline-none transition-colors duration-150 focus:border-sky-700"
          value={arrayKey}
          onChange={(event) => onChangeArrayKey(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onCompare();
          }}
        />

        <button
          type="button"
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded bg-sky-700 px-3 py-1 text-xs font-medium text-white transition-colors duration-150 hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canCompare || comparing}
          onClick={onCompare}
        >
          {comparing ? <Spinner /> : <Play className="text-[9px]" />}
          {comparing ? 'Comparing…' : 'Compare'}
        </button>
      </div>

      <SideEditor side="right" title="Modified" {...props} />

      <div className="flex shrink-0 flex-wrap gap-1.5">
        <span className="py-0.5 text-[11px] text-[color:var(--color-ink-subtle)]">Examples:</span>
        {COMPARE_EXAMPLES.map((example) => (
          <button
            key={example.name}
            type="button"
            title={example.description}
            className="cursor-pointer rounded border border-slate-800 px-2 py-1 text-[11px] text-[color:var(--color-ink-subtle)] transition-colors duration-150 hover:border-slate-600 hover:text-[color:var(--color-ink)]"
            onClick={() => onLoad(example.left, example.right, example.arrayKey)}
          >
            {example.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function SideEditor({ side, title, ...props }: CompareInputsProps & { readonly side: Side; readonly title: string }) {
  const state = side === 'left' ? props.left : props.right;

  return (
    <SourceEditor
      idPrefix={`compare-${side}-`}
      title={title}
      text={state.text}
      label={`${title} source`}
      placeholder={`Paste the ${title.toLowerCase()} JSON, YAML or repr() — then Compare (⌘⏎)`}
      detections={side === 'left' ? props.leftDetections : props.rightDetections}
      adapterId={state.adapterId}
      effectiveAdapterId={side === 'left' ? props.leftAdapter : props.rightAdapter}
      onChangeText={(text, filename) => props.onChangeText(side, text, filename)}
      onChangeAdapter={(adapterId) => props.onChangeAdapter(side, adapterId)}
      onSubmit={props.onCompare}
    />
  );
}
