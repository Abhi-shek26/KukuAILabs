// Static explainer, copied verbatim from the Python page.
export default function HowItWorks({ config }) {
  return (
    <div className="panel">
      <h2>How Promo Finder works</h2>
      <p className="lead">
        Editors used to watch every episode to hand-pick promos. This tool reads the timestamped scripts and hands them a ranked
        shortlist. AI makes the judgment calls; code handles everything that has to be exact.
      </p>
      <div className="how">
        <div className="c">
          <b>1 · Read</b>
          <span>Code parses every shot, action, sound and line with its start and end time, and gives each one an ID.</span>
        </div>
        <div className="c">
          <b>2 · Find</b>
          <span>
            The AI reads each episode and picks promo moments <i>by line ID</i>. It never types a timestamp, so it can't invent one.
          </span>
        </div>
        <div className="c">
          <b>3 · Fix</b>
          <span>Code converts IDs to exact times, enforces 20–60 s, never cuts mid-line, and snaps cuts to shot changes.</span>
        </div>
        <div className="c">
          <b>4 · Judge</b>
          <span>
            A second AI pass sees only the clip, like a stranger scrolling: it scores the hook (first 3 s), the cliffhanger, and
            whether it makes sense on its own.
          </span>
        </div>
        <div className="c">
          <b>5 · Rank</b>
          <span>Code ranks the clips, removes near-duplicates and adds warnings. The editor makes the final ✓/✗ here.</span>
        </div>
      </div>
      <div className="box" style={{ marginTop: 16 }}>
        <h4>Checked against independent reviewers</h4>
        <p>
          On the free default model, blind reviewers (a different AI model) would post 8 of the top 10 and 70% of the top 30, against
          22% of the bottom of the list. Stronger paid models separate even more sharply (about 85% against 6–11%). The tool's
          candidates included the reviewer's favourite moment in 47–49 of 50 episodes.
        </p>
      </div>
      <div className="box">
        <h4>Built to swap models</h4>
        <p>
          Any OpenAI-compatible API works: one model to find candidates, another to judge, a fallback for content refusals, and a hard
          budget cap. The default runs on Qubrid's cheapest model, free.
        </p>
      </div>

      <div id="local" className="box" style={{ marginTop: 16 }}>
        <h4>Run it on your own scripts — and keep them yours</h4>
        <p style={{ marginBottom: 10 }}>
          Your zip or folder is read on your machine and nowhere else. This is the whole path, from download to a ranked list:
        </p>
        <ol className="path">
          <li>
            <b>Install and start.</b> <code>npm run app</code> from the repo root. It installs the client and server once, checks
            that MongoDB is answering (and tells you the one command to start it), then serves the API on <code>:4000</code> and
            the app on <code>:5173</code>.
          </li>
          <li>
            <b>Drop the scripts in.</b> On the <i>New run</i> tab, pick a show folder on disk or drop a <code>.zip</code> of episode
            scripts. The zip is unpacked into <code>uploads/&lt;show&gt;/</code> on your computer — nothing is sent to this site.
          </li>
          <li>
            <b>Run it.</b> The pipeline writes <code>outputs/&lt;run&gt;/</code> beside the app: the ranked list, the CSV, the report and
            every raw prompt and reply. Only the clip index goes into your own local MongoDB.
          </li>
          <li>
            <b>Review and export.</b> ✓ post / ✗ skip in the app, then ⬇ Export for the edit. Re-uploading under the same show name
            adds to that folder instead of making a new one.
          </li>
        </ol>
        <p className="muted" style={{ marginTop: 10 }}>
          <b>Why it stays local:</b>
        </p>
        <ul className="safety">
          <li>The app binds to <code>127.0.0.1</code>, so nothing on your network can reach it by default.</li>
          <li><code>uploads/</code>, <code>outputs/</code> and <code>.env</code> are git-ignored — a zip, its results or your key cannot be committed by accident.</li>
          <li>Outbound calls go only to the model provider you configured; a zip is never sent to this site or to any third party.</li>
          <li>Zips are unpacked defensively: text files only (<code>.txt .md .fountain</code>), paths flattened so <code>../</code> cannot escape, ≤5 MB per file, ≤100 MB unzipped.</li>
        </ul>
        {config?.read_only && (
          <p className="muted" style={{ marginTop: 8 }}>
            <b>On this hosted copy:</b> uploading and running are refused on purpose (read-only demo, one shared database with no
            accounts), so a visitor's scripts could never be visible to another visitor. That is the only thing missing here — the
            steps above are the same code.
          </p>
        )}
      </div>
    </div>
  );
}
