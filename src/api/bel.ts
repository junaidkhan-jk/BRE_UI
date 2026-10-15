/**
 * The BEL language service, as the editor consumes it (M5-02).
 *
 * There is deliberately no parser here. A second BEL parser in TypeScript would be a second answer
 * to "is this expression valid", and the two would diverge first on the case nobody tested — so an
 * author would be told their expression is fine and the submit gate would refuse it. The registry
 * runs the same lexer, parser and type checker the compile path uses, and this asks it.
 */

import { currentSession } from './auth';
import { RunError } from './runs';

/** One positioned diagnostic. */
export interface Marker {
  readonly code: string;
  readonly severity: 'ERROR';
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

/** What checking an expression established. */
export interface Checked {
  readonly type?: string;
  readonly markers: readonly Marker[];
  readonly ok: boolean;
}

/** One completion offer. */
export interface Completion {
  readonly label: string;
  readonly kind: 'FACT' | 'PARAMETER' | 'LIST' | 'VARIABLE' | 'FUNCTION' | 'KEYWORD';
  readonly detail: string;
  readonly documentation: string;
}

/** What the policy has in scope. */
export interface Scope {
  readonly parameters?: Readonly<Record<string, string>>;
  readonly referenceLists?: Readonly<Record<string, string>>;
  readonly variables?: Readonly<Record<string, string>>;
}

const REGISTRY: string = (import.meta.env.VITE_REGISTRY_URL as string | undefined) ?? '';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = currentSession();
  if (!session?.token) {
    throw new RunError(401, 'Your session has expired. Sign in again.');
  }
  const response = await fetch(`${REGISTRY}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${session.token}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new RunError(response.status, `The language service answered ${response.status}.`);
  }
  return (await response.json()) as T;
}

/** Parses and type-checks one expression. */
export function checkExpression(expression: string, scope: Scope = {}): Promise<Checked> {
  return call<Checked>('/v1/bel/check', {
    method: 'POST',
    body: JSON.stringify({ expression, ...scope }),
  });
}

/** Everything an author can reference. */
export function belCompletions(scope: Scope = {}): Promise<Completion[]> {
  return call<Completion[]>('/v1/bel/completions', {
    method: 'POST',
    body: JSON.stringify(scope),
  });
}

/** The grammar's keywords and function names, for the tokenizer. */
export function belGrammar(): Promise<{
  readonly keywords: readonly string[];
  readonly functions: readonly string[];
}> {
  return call('/v1/bel/grammar');
}
