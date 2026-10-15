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
 * The dotted symbol under the cursor, as one token.
 *
 * Monaco's own word boundaries stop at the dot, so `getWordAtPosition` on `param.MIN_AGE` returns
 * `param` or `MIN_AGE` depending on which half the cursor is in — neither of which is a symbol the
 * language service knows. This widens the match to the whole dotted path, which is what `param.X`,
 * `list.Y` and every fact path actually are.
 */
function symbolAt(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): { text: string; range: monaco.IRange } | null {
  const line = model.getLineContent(position.lineNumber);
  const isSymbolChar = (character: string): boolean => /[A-Za-z0-9_.[\]]/.test(character);

  let start = position.column - 1;
  while (start > 0 && isSymbolChar(line[start - 1] ?? '')) start -= 1;
  let end = position.column - 1;
  while (end < line.length && isSymbolChar(line[end] ?? '')) end += 1;

  const text = line.slice(start, end).replace(/^[.]+|[.]+$/g, '');
  if (!text) return null;

  return {
    text,
    range: {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: start + 1,
      endColumn: end + 1,
    },
  };
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
 *
 * **Hover and F12 are here; rename is not, and that is a decision.** A rename in an IDE works
 * because the definition and every reference are in one project the refactor owns. Here they are
 * not: `param.INDEBTEDNESS_CAP` is defined in a shared asset with its own DRAFT → IN_REVIEW →
 * APPROVED lifecycle, and an approved policy version pinned that asset at an exact version
 * (FR-MODEL-003). Renaming the reference in this expression would leave the parameter set
 * untouched, so the expression would compile against the editor's symbol table and resolve to a
 * missing parameter at decision time — fail-closed, correct, and REFER on every application. The
 * rename belongs on the asset, as a new asset version, followed by a new version of each policy
 * the usage panel lists.
 */
export function BelEditor({
  value,
  scope,
  readOnly,
  onChange,
  onNavigate,
  label,
}: {
  value: string;
  scope?: Scope;
  readOnly?: boolean;
  onChange?: (next: string) => void;
  /**
   * Called when the author asks where a symbol is defined (F12, or the context menu).
   *
   * Not a Monaco definition provider, because the definition is not in this document and usually
   * not in any document: `param.INDEBTEDNESS_CAP` is defined in a shared asset under its own
   * maker-checker, and a reference list in another. Monaco's provider contract wants a range in a
   * model, so the navigation is handed to the screen instead.
   */
  onNavigate?: (kind: 'PARAMETER' | 'LIST', name: string) => void;
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
    let hoverProvider: monaco.IDisposable | null = null;

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

      // Hover, from the same offers the completion list uses.
      //
      // One source for both, deliberately: a hover that said something the completion list did not
      // would be a second description of the same symbol, and the two drift. What it adds over
      // completion is the moment it arrives — an author reading somebody else's expression never
      // opens the completion list at all, and `param.INDEBTEDNESS_CAP` tells them nothing about
      // its type or that it is effective-dated.
      hoverProvider = monaco.languages.registerHoverProvider(LANGUAGE, {
        provideHover: async (model: monaco.editor.ITextModel, position: monaco.Position) => {
          const symbol = symbolAt(model, position);
          if (!symbol) return null;
          try {
            const offers = await belCompletions(scope ?? {});
            const offer = offers.find((candidate) => candidate.label === symbol.text);
            if (!offer) return null;
            const lines = [
              { value: `**${offer.label}**${offer.detail ? ` — \`${offer.detail}\`` : ''}` },
              ...(offer.documentation ? [{ value: offer.documentation }] : []),
            ];
            return { range: symbol.range, contents: lines };
          } catch {
            return null;
          }
        },
      });

      // F12 and the context menu. Monaco's own "Go to Definition" is not used — see onNavigate.
      editor.current.addAction({
        id: 'bre.bel.goToAsset',
        label: 'Go to the shared asset that defines this',
        keybindings: [monaco.KeyCode.F12],
        contextMenuGroupId: 'navigation',
        run: (instance: monaco.editor.ICodeEditor) => {
          const position = instance.getPosition();
          const model = instance.getModel();
          if (!position || !model || !onNavigate) return;
          const symbol = symbolAt(model, position);
          if (!symbol) return;
          if (symbol.text.startsWith('param.')) {
            onNavigate('PARAMETER', symbol.text.slice('param.'.length));
          } else if (symbol.text.startsWith('list.')) {
            onNavigate('LIST', symbol.text.slice('list.'.length));
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
      hoverProvider?.dispose();
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
