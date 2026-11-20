// Static explainer, copied verbatim from the Python page.
export default function HowItWorks() {
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
    </div>
  );
}
