import { art, epLabel, firstLine, mmss, PlayIcon, segShort } from "../lib/ui.jsx";

// The 9:16 poster card. Same classes and structure as the Python UI's poster(),
// so the extracted styles.css renders it identically.
export default function Poster({ p, review, onOpen, noCap = false, noRank = false }) {
  const fl = firstLine(p);
  const j = p.judge || {};
  const open = () => onOpen(p);
  return (
    <div
      className={`poster-wrap ${review?.verdict === "skip" ? "dim" : ""}`}
      tabIndex={0}
      role="button"
      aria-label={`Open promo ${p.title}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter") open();
      }}
    >
      <div className="poster" style={art(p.id)}>
        <div className="shade" />
        <span className={`ep ${p.kind === "montage" ? "trailer" : ""}`}>
          {p.kind === "montage" ? `TRAILER · ${epLabel(p)}` : epLabel(p)}
        </span>
        {j.verdict === "post" && (
          <span className="crown" title="The blind judge says: post">
            ★
          </span>
        )}
        {review?.verdict && <div className={`review ${review.verdict}`}>{review.verdict === "post" ? "✓ POSTING" : "✗ SKIPPED"}</div>}
        <div className={`q ${fl.speech ? "" : "act"}`}>{fl.speech ? `“${fl.text}”` : fl.text}</div>
        <div className="bottom">
          <span className="play">
            <PlayIcon />
          </span>
          <span className="dur">{mmss(p.duration_seconds)}</span>
          {j.hook_score != null && (
            <span className="sc" title="judge: hook · cliffhanger · stands alone">
              {j.hook_score}·{j.cliffhanger_score}·{j.standalone_score}
            </span>
          )}
        </div>
      </div>
      {!noCap && (
        <div className="cap" style={{ cursor: "pointer" }} onClick={open}>
          <div className="t">{noRank ? p.title : `${p.rank}. ${p.title}`}</div>
          <div className="s">{segShort(p)}</div>
        </div>
      )}
    </div>
  );
}
