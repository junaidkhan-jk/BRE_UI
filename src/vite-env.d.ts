/// <reference types="vite/client" />

/**
 * The environment variables the browser is allowed to see.
 *
 * Vite only exposes variables prefixed `VITE_`, which is the boundary that matters: anything here
 * is compiled into the bundle and readable by anyone who opens the page. A BFF URL and an
 * environment label are fine; a secret never belongs in this interface.
 */
interface ImportMetaEnv {
  /** Shown in the header so an author can tell which environment they are in. */
  readonly VITE_ENV_LABEL?: string;
  /** `'false'` turns off the sample data and makes the app talk to the BFF. */
  readonly VITE_USE_FIXTURES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
