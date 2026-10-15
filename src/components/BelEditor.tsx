import { useEffect, useRef, useState } from 'react';
// Only the editor API, not the package's default entry — that one pulls in every built-in
// language and its web worker (TypeScript, JSON, CSS, HTML), which is megabytes of bundle for an
// editor that will only ever host one language of our own.
import * as monaco from 'monaco-editor/editor/editor.api';

import { type Scope, belCompletions, belGrammar, checkExpression } from '../api/bel';

import './BelEditor.css';

/** The language id Monaco knows BEL by. */
const LANGUAGE = 'bel';

let registered = false;

/**
 * Registers BEL with Monaco, once per page.
 *
 * **The tokenizer's keyword list comes from the server.** A keyword highlighted here that the
 * parser does not have would tell an author a word is reserved when it is not — and the reverse is
 * worse. Fetching it means a grammar change highlights without a UI release.
 */
async function registerBel(): Promise<void> {
  if (registered) {
    return;
  }
  registered = true;

  let keywords: readonly string[] = [];
  let functions: readonly string[] = [];
  try {
    const grammar = await belGrammar();
    keywords = grammar.keywords;
    functions = grammar.functions;
  } catch {
    // No registry: the editor still works as an editor, with no highlighting and no diagnostics.
    // Inventing a keyword list here is how the two drift apart.
    keywords = [];
  }

  monaco.languages.register({ id: LANGUAGE });
  monaco.languages.setMonarchTokensProvider(LANGUAGE, {
    keywords: [...keywords],
    functions: [...functions],
    tokenizer: {
      root: [
        // A fact path, a param or a list reference: the dotted forms an author writes most.
        [/\b(param|list)\.[A-Z][A-Z0-9_]*/, 'type'],
        [
          /[a-zA-Z_][\w]*(\.[a-zA-Z_][\w]*)+/,
          'variable.predefined',
        ],
        [
          /[a-zA-Z_][\w]*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@functions': 'support.function',
              '@default': 'identifier',
            },
          },
        ],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/\d+\.\d+/, 'number.float'],
        [/\d+/, 'number'],
        [/[<>]=?|[!=]=|\+|-|\*|\//, 'operator'],
        [/[[\]().,]/, 'delimiter'],
        [/#.*$/, 'comment'],
      ],
    },
  });
}

/**
 * A BEL expression editor with live type checking (TRD §13.5 U4, M5-02).
 *
 * **The diagnostics are the feature.** Monaco without a language service is a two-megabyte
 * textarea — which is exactly why this was left until there was one. Every marker shown here is
 * produced by the same lexer, parser and type checker that run inside a save, so an expression the
 * editor accepts is one the submit gate will accept. BEL-017 and BEL-026 are reported too: an
 * author reaching for a protected or Aadhaar field finds out as they type it, not from a reviewer.
 *
 * **Checked on a debounce, not on every keystroke.** A type error is useful a moment after you stop
 * typing and is noise while you are mid-identifier, when every expression is briefly invalid.
 *
 * **Completions come from the published fact schema**, so the list is exactly what the engine will
 * accept. A mistyped path reads as a missing fact at runtime — handled correctly and silently —
 * which is the one class of mistake an author cannot find by testing the happy path.
 */
export function BelEditor({
  value,
  scope,
  readOnly,
  onChange,
  label,
}: {
  value: string;
  scope?: Scope;
  readOnly?: boolean;
  onChange?: (next: string) => void;
  label: string;
}): React.JSX.Element {
  const host = useRef<HTMLDivElement | null>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [problems, setProblems] = useState<number>(0);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let disposed = false;
    let completionProvider: monaco.IDisposable | null = null;

    void (async () => {
      await registerBel();
      if (disposed || !host.current) {
        return;
      }
      editor.current = monaco.editor.create(host.current, {
        value,
        language: LANGUAGE,
        readOnly: readOnly ?? false,
        automaticLayout: true,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        fontSize: 13,
        // One expression per editor: wrapping beats a horizontal scrollbar for something a
        // person reads as a sentence.
        wordWrap: 'on',
        ariaLabel: label,
      });

      completionProvider = monaco.languages.registerCompletionItemProvider(LANGUAGE, {
        provideCompletionItems: async (
          model: monaco.editor.ITextModel,
          position: monaco.Position,
        ) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };
          try {
            const offers = await belCompletions(scope ?? {});
            return {
              suggestions: offers.map((offer) => ({
                label: offer.label,
                kind:
                  offer.kind === 'FUNCTION'
                    ? monaco.languages.CompletionItemKind.Function
                    : offer.kind === 'KEYWORD'
                      ? monaco.languages.CompletionItemKind.Keyword
                      : monaco.languages.CompletionItemKind.Field,
                detail: offer.detail,
                documentation: offer.documentation,
                insertText: offer.label,
                range,
              })),
            };
          } catch {
            return { suggestions: [] };
          }
        },
      });

      editor.current.onDidChangeModelContent(() => {
        const next = editor.current?.getValue() ?? '';
        onChange?.(next);
      });
    })();

    return () => {
      disposed = true;
      completionProvider?.dispose();
      editor.current?.dispose();
      editor.current = null;
    };
    // Created once. Re-creating the editor on every prop change would lose the cursor and the
    // undo stack, which is worse than a stale read-only flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced check. A type error is useful a moment after you stop typing and noise while you
  // are mid-identifier, when every expression is briefly invalid.
  useEffect(() => {
    const handle = setTimeout(() => {
      checkExpression(value, scope ?? {})
        .then((checked) => {
          setOffline(false);
          setType(checked.type ?? null);
          setProblems(checked.markers.length);
          const model = editor.current?.getModel();
          if (!model) {
            return;
          }
          monaco.editor.setModelMarkers(
            model,
            'bel',
            checked.markers.map((marker) => ({
              severity: monaco.MarkerSeverity.Error,
              message: `${marker.code}: ${marker.message}`,
              startLineNumber: marker.line,
              startColumn: marker.column,
              endLineNumber: marker.line,
              // The parser reports a position, not a span. Underlining to the end of the line
              // from the reported column is honest about that; guessing a token length would
              // underline the wrong thing, and an editor underlining the wrong token sends the
              // author looking in the wrong place.
              endColumn: model.getLineMaxColumn(marker.line),
            })),
          );
        })
        .catch(() => {
          setOffline(true);
          setType(null);
          setProblems(0);
        });
    }, 400);
    return () => clearTimeout(handle);
  }, [value, scope]);

  return (
    <div className="bel">
      <div className="bel__host" ref={host} />
      <p className="bel__status" role="status">
        {offline ? (
          <span className="bel__offline">
            No language service: highlighting and type checking need a registry.
          </span>
        ) : problems > 0 ? (
          <span className="bel__bad">
            {problems} problem{problems === 1 ? '' : 's'}
          </span>
        ) : type ? (
          <span className="bel__ok">
            type <code>{type}</code>
          </span>
        ) : (
          <span className="bel__idle">empty</span>
        )}
      </p>
    </div>
  );
}
