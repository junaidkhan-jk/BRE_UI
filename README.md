# BRE 2.0 — Rule Studio (UI)

The web studio for **BRE 2.0**, a multi-tenant business-rules and credit-decisioning platform for
Indian lenders. This is where a credit-policy analyst authors a policy, tests it, submits it for
review, approves it and deploys it — **without an engineering ticket**, which is the product's
central promise.

The backend lives in a separate repository:
**[BRE_Backend](https://github.com/junaidkhan-jk/BRE_Backend)**.

Eleven screens: rule repository, source editor (Monaco with real BEL diagnostics), policy
structure, simulator, decision trace, review inbox, deployment console, version diff, shared
assets, audit trail, and sign-in.

---

## Quick start

```bash
git clone https://github.com/junaidkhan-jk/BRE_UI.git
cd BRE_UI
npm ci
npm run dev
```

That runs on **sample data** and needs no backend. For the real thing see §7 below — and note that
the studio **says on every screen** when it is showing samples, because sample data that looks real
is how a demo gets mistaken for a working system.

---

## 1. Clone

```bash
git clone https://github.com/junaidkhan-jk/BRE_UI.git
cd BRE_UI
```

To run against a live backend, clone that too — they are independent repositories, not submodules:

```bash
git clone https://github.com/junaidkhan-jk/BRE_Backend.git
```

---

## 2. The database — user, password

**None.** The studio is a browser application. It holds no database, no connection string and no
credentials; it talks to the backend over HTTP and keeps a session token in memory.

The backend owns PostgreSQL, and for local development it needs nothing installed — it downloads
and runs its own server. See
[the backend README, §2](https://github.com/junaidkhan-jk/BRE_Backend#2-the-database--user-password-schemas).

---

## 3. Extra setup — Docker, anything else

**Nothing beyond Node.** No Docker, no global installs, no build tools to configure.

One optional extra: the end-to-end tests drive a real browser, so Playwright needs Chromium once.

```bash
npx playwright install chromium
```

Only needed for `npm run e2e`. `npm run dev`, `build` and `test` do not use it.

---

## 4. Node and Java versions

```
Node         >= 20.19   (declared in package.json engines; 22.x is what CI and development use)
npm          >= 10
```

Check yours:

```bash
node -v && npm -v
```

**Java is not needed for the UI.** It is a browser application — TypeScript, bundled by Vite. Java
25 is the *backend's* requirement, and the backend provisions it itself.

---

## 5. Versions in use

| | |
|---|---|
| React | 19.2 |
| React Router | 7.9 |
| Vite | 7.1 |
| TypeScript | 5.9 |
| Monaco Editor | 0.57 — the BEL editor |
| Vitest | 3.2 — unit tests |
| Playwright | 1.64 — end-to-end and accessibility |
| ESLint | 9.37 — `--max-warnings 0` |

> **Monaco is about two megabytes** and every page parses it. That matters for the Playwright
> suite: the default of one worker per core ran the browser out of memory on a 16-core machine and
> failed a *different* test each run, so workers are capped in `playwright.config.ts`. Rotating
> failures that pass on a re-run are worse than a red suite — the re-run gets read as proof there
> was nothing wrong.

---

## 6. Starting the backend

Full instructions in the
[backend README](https://github.com/junaidkhan-jk/BRE_Backend#6-starting-the-backend). The short
version — no database or Docker needed:

```bash
cd ../BRE_Backend
./devstack/up.sh --registry        # PostgreSQL + registry + decision service + an admin account
```

Registry on **8081**, decision service on **8080**. Override with `BRE_REGISTRY_PORT` and
`BRE_PORT` if something already holds them.

Sign in with **`admin@lender.local` / `devstack-admin-password`**.

For the approval path you need more than one person, so use `--sandbox`, which seeds one account
per role (`author@`, `reviewer@`, `approver@`, `viewer@`, `auditor@sandbox.invalid`, password
`sandbox-password-1`). Segregation of duties is enforced by database trigger — an author genuinely
cannot approve their own work, which is the point.

---

## 7. Starting the UI

### Against sample data — no backend

```bash
npm ci
npm run dev
```

Opens on `http://localhost:5173`. Every screen renders from fixtures, and a banner says so.

### Against a real backend

```bash
VITE_USE_FIXTURES=false VITE_REGISTRY_URL=http://127.0.0.1:8081 npm run dev
```

Or persist it — copy `.env.example` to `.env.local` and set:

```
VITE_USE_FIXTURES=false
VITE_REGISTRY_URL=http://127.0.0.1:8081
VITE_ENV_LABEL=LOCAL
```

| Variable | Default | What it does |
|---|---|---|
| `VITE_USE_FIXTURES` | `true` | `false` makes the studio call the real registry |
| `VITE_REGISTRY_URL` | `''` | the backend's base URL |
| `VITE_ENV_LABEL` | `LOCAL` | shown in the header, so nobody mistakes which environment they are authoring in |

**`VITE_USE_FIXTURES` defaults to `true` on purpose.** A studio that defaulted to a live backend
and silently failed to reach one would look broken; one that defaults to samples and *announces*
it cannot be mistaken for the real thing.

### Other commands

```bash
npm run typecheck     # tsc -b --noEmit
npm run lint          # eslint src --max-warnings 0
npm run format        # prettier
npm test              # vitest unit tests
npm run build         # tsc -b && vite build  — production bundle
npm run preview       # serve the built bundle
npm run e2e           # Playwright, against the BUILT bundle
npm run e2e:a11y      # axe-core accessibility checks
```

> **`npm run e2e` tests the production bundle, not the dev server**, and that is deliberate. The one
> UI defect this project shipped was a *bundling* defect — an ES-module script that rendered a
> blank page — and a suite that only exercised the dev server was green throughout.

### Live decision lookup needs the hot store

The decision-trace screen reads decisions through the registry, which needs the decision service's
PostgreSQL hot store. Start the backend with `--deliver` rather than `--registry`:

```bash
cd ../BRE_Backend && ./devstack/up.sh --deliver
```

And for a decision's **explanation** — the replay that answers "why was this declined" — the
backend must be storing fact snapshots, which are off by default because they are the applicant's
personal data. See
[the backend README, §8](https://github.com/junaidkhan-jk/BRE_Backend#fact-snapshots-are-off-by-default).

In live mode the trace screen renders **lookup only**: there is no endpoint that lists decisions or
aggregates a day's outcomes, so the monitoring tiles you see with fixtures are not rendered against
a real installation. Showing a fixture's "decisions today" over live data is exactly the mistake
the test suite guards against.

---

## 8. Pre-data scripts and seeding

**None for the UI.** No migrations, no seed scripts, no reference data — it is a browser
application and holds no state of its own beyond a session token.

What the studio *displays* is seeded by the backend, and none of it is a script you run by hand:

| Layer | Seeded by |
|---|---|
| Schema (23 migrations) | Flyway, at backend startup |
| Tenant and admin account | `./devstack/up.sh --registry` |
| One account per role | `./devstack/up.sh --sandbox` |
| The reference MFI JLG policy, its parameters, lists and fixtures | `devstack/e2e.sh`, which `up.sh` runs for you |

So a `--registry` start gives you a signed, deployed, decidable policy to open in the studio. See
[the backend README, §8](https://github.com/junaidkhan-jk/BRE_Backend#8-pre-data-scripts-and-seeding).

---

## Layout

```
src/
  api/          typed clients — auth, governance, assets, audit, decisions, bel, runs, fixtures
  app/          shell, router, session context, route guard
  components/   BelEditor (Monaco + diagnostics), FlowGraph, StatusPill, ScreenState
  screens/      the eleven screens
  styles/       tokens shared with the published HTML documents
e2e/            Playwright: login, the screens, accessibility
```

## Two things worth knowing about the design

**The diagnostics are the feature.** Monaco without a language service is a two-megabyte text area.
The BEL editor registers a completion provider, a hover provider and live diagnostics computed by
the **real type checker** — the same one that runs inside a save — so an expression the editor
accepts is one the submit gate will accept too.

**The policy-structure screen is read-only, deliberately.** It shows the decision-table grid with
gap and overlap witnesses and row hit counts, and no editing. Editing would mean regenerating the
policy source from the grid, and the source is where an author's comments live — the sentence
explaining why a threshold is 21 and not 18 does not survive a round trip. Authoring stays in the
source; this screen is where you see what the source compiled to.

Whether that is the right call is an open question with real evidence attached: it is one of the
three unbuilt mitigations for risk **RK1** ("BEL is too technical for business analysts"), and
[`docs/USABILITY-PROTOCOL.md`](https://github.com/junaidkhan-jk/BRE_Backend/blob/main/docs/USABILITY-PROTOCOL.md)
in the backend repo is the session protocol designed to settle it with three real analysts.
