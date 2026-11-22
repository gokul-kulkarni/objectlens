/**
 * The slice of Orca's custom-editor frame API this plugin uses.
 *
 * Orca defines `window.orca` before any plugin script runs. The full typings come from
 * `orca plugin types`, which writes into a folder that is not committed; declaring only what is
 * used keeps the build independent of that step and of the installed Orca version.
 */

export interface Disposable {
  dispose(): void;
}

export interface EditorSession<T> {
  readonly value: T;
  readonly readOnly: boolean;
  onReplace(handler: (value: T) => void): Disposable;
  dispose(): void;
}

export interface OrcaFrameApi {
  readonly document?: {
    session<T = string>(options?: { debounceMs?: number }): Promise<EditorSession<T>>;
  };
}

/** The open document, as a stream of whole texts: the first one, then each outside change. */
export interface DocumentFeed {
  readonly text: string;
  subscribe(listener: (text: string) => void): Disposable;
}

/** Opens the document Orca handed this frame, or explains why there is none. */
export async function openDocument(api: OrcaFrameApi | undefined): Promise<DocumentFeed> {
  if (api?.document === undefined) {
    throw new Error('ObjectLens runs as an Orca custom editor; open a JSON or YAML file in Orca.');
  }
  const session = await api.document.session<string>();
  return {
    text: session.value,
    subscribe: (listener) => session.onReplace(listener),
  };
}
