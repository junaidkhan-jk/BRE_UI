import { useNavigate } from 'react-router-dom';

import './screens.css';

/**
 * Junaid's life — the proposal.
 *
 * Not part of the product. Reached from a button in the shell header and routed like any other
 * screen, so it renders inside the studio rather than opening a window the browser might block.
 *
 * The content is a placeholder with the right shape. Say what the proposal should actually be and
 * it is one edit to this file — nothing else references it.
 */
export function JunaidsLife(): React.JSX.Element {
  const navigate = useNavigate();

  return (
    <section>
      <header className="page__head">
        <div>
          <p className="page__crumb">Junaid</p>
          <h1 className="page__title">Junaid&rsquo;s life</h1>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--quiet" onClick={() => void navigate(-1)}>
            Back
          </button>
        </div>
      </header>

      <div className="panel">
        <h2 className="panel__title">The proposal</h2>
        <p className="lead">
          For <b>SAM</b>.
        </p>
        <p>
          The sections below are a placeholder with the right shape &mdash; say what the proposal
          should actually say and it is one edit to this file.
        </p>
      </div>

      <div className="panel">
        <h2 className="panel__title">What it is</h2>
        <p>One paragraph on what is being proposed, and for whom.</p>
      </div>

      <div className="panel">
        <h2 className="panel__title">Why now</h2>
        <p>The reason this is worth doing, and what happens if it is not done.</p>
      </div>

      <div className="panel">
        <h2 className="panel__title">What it takes</h2>
        <p>Time, cost, people &mdash; whatever the commitment actually is, stated plainly.</p>
      </div>
    </section>
  );
}
