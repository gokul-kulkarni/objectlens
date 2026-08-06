import { describe, expect, it } from 'vitest';
import { diagnostic, hasErrors, parseError, parseWarning, positionAt } from './diagnostics.js';

describe('constructors', () => {
  it('builds a diagnostic with severity and message', () => {
    expect(diagnostic('info', 'note')).toEqual({ severity: 'info', message: 'note' });
  });

  it('carries position and node detail through', () => {
    const d = parseError('bad token', { line: 3, column: 7, offset: 42, nodeId: '$.a' });

    expect(d.severity).toBe('error');
    expect(d).toMatchObject({ line: 3, column: 7, offset: 42, nodeId: '$.a' });
  });

  it('builds warnings', () => {
    expect(parseWarning('heads up').severity).toBe('warning');
  });
});

describe('hasErrors', () => {
  it('is true only when an error is present', () => {
    expect(hasErrors([parseWarning('w'), parseError('e')])).toBe(true);
    expect(hasErrors([parseWarning('w'), diagnostic('info', 'i')])).toBe(false);
    expect(hasErrors([])).toBe(false);
  });
});

describe('positionAt', () => {
  const text = 'first\nsecond\nthird';

  it('reports 1-based line and column', () => {
    expect(positionAt(text, 0)).toEqual({ line: 1, column: 1 });
    expect(positionAt(text, 3)).toEqual({ line: 1, column: 4 });
  });

  it('advances the line at each newline', () => {
    expect(positionAt(text, 6)).toEqual({ line: 2, column: 1 });
    expect(positionAt(text, 13)).toEqual({ line: 3, column: 1 });
  });

  it('places the newline character itself at the end of its line', () => {
    expect(positionAt(text, 5)).toEqual({ line: 1, column: 6 });
  });

  it('clamps out-of-range offsets rather than returning nonsense', () => {
    expect(positionAt(text, -10)).toEqual({ line: 1, column: 1 });
    expect(positionAt(text, 9999)).toEqual({ line: 3, column: 6 });
  });

  it('handles empty input', () => {
    expect(positionAt('', 0)).toEqual({ line: 1, column: 1 });
  });
});
