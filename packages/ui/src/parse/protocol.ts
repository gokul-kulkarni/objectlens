/** Messages between the UI and the parse engine, wherever the engine runs. */

import type { Diagnostic, ObjectGraph } from '@objectlens/core';
import type { DiffOptions, DiffResult } from '@objectlens/diff';

export interface SourceInput {
  readonly adapterId: string;
  readonly text: string;
  readonly filename?: string;
}

export interface ParseRequest extends SourceInput {
  readonly type: 'parse';
  readonly id: number;
}

export interface CompareRequest {
  readonly type: 'compare';
  readonly id: number;
  readonly left: SourceInput;
  readonly right: SourceInput;
  readonly options: DiffOptions;
}

export type ParseEngineRequest = ParseRequest | CompareRequest;

export interface ParseResponse {
  readonly type: 'parse';
  readonly id: number;
  readonly graph: ObjectGraph | null;
  readonly diagnostics: readonly Diagnostic[];
  readonly elapsedMs: number;
}

export interface CompareResponse {
  readonly type: 'compare';
  readonly id: number;
  /** `null` when either side could not be parsed at all. */
  readonly diff: DiffResult | null;
  readonly leftDiagnostics: readonly Diagnostic[];
  readonly rightDiagnostics: readonly Diagnostic[];
  readonly elapsedMs: number;
}

export type ParseEngineResponse = ParseResponse | CompareResponse;
