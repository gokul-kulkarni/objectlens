import type { Plugin } from 'vite';

/*
 * The bundle must be plain text. Orca's plugin directory refuses to list a release containing
 * binary files, and a raw control character makes a file look binary. The YAML library uses a few
 * as markers (`"\x02"`, `"\x18"`, `"\x1f"`), and the minifier writes them out raw.
 *
 * Outside comments, a control character can only legally sit inside a string, template or regular
 * expression literal, and in all three its `\xNN` escape means the same character. Tab, line feed,
 * vertical tab, form feed and carriage return are left alone: they are also whitespace between
 * tokens, where an escape would not be.
 */
const CONTROL_CHARACTERS = /[\x00-\x08\x0e-\x1f\x7f]/g;

export function escapeControlCharacters(code: string): string {
  return code.replace(
    CONTROL_CHARACTERS,
    (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`,
  );
}

export function plainTextOutput(): Plugin {
  return {
    name: 'objectlens:plain-text-output',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk') file.code = escapeControlCharacters(file.code);
      }
    },
  };
}
