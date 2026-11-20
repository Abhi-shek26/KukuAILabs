import { useCallback, useEffect, useRef, useState } from "react";
import { api, hashParams, setHash } from "./lib/api.js";
import TopBar from "./components/TopBar.jsx";
import PromosTab from "./components/PromosTab.jsx";
import NewRun from "./components/NewRun.jsx";
import HowItWorks from "./components/HowItWorks.jsx";
import PromoDialog from "./components/PromoDialog.jsx";

const EMPTY_FILTERS = { q: "", kind: "", verdict: "", judge: false, clean: false, sort: "rank" };

export default function App() {
  const [config, setConfig] = useState(null);
  const [runs, setRuns] = useState([]);
  const [run, setRun] = useState(null);
  const [data, setData] = useState(null);
  const [job, setJob] = useState(null);
  const [tab, setTab] = useState("promos");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [limit, setLimit] = useState(48);
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState("");
  const [fatal, setFatal] = useState("");
  const pollRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => {
    const onToast = (e) => showToast(e.detail);
    window.addEventListener("pf:toast", onToast);
    return () => window.removeEventListener("pf:toast", onToast);
  }, [showToast]);

  // --- boot: config, shows, last job, then the run named in the URL
  useEffect(() => {
    (async () => {
      try {
        setConfig(await api("/api/config"));
      } catch (e) {
        setFatal(`Cannot reach the API: ${e.message}. Start it with npm run dev:server.`);
        return;
      }
      const hp = hashParams();
      const initialTab = hp.new ? "new" : hp.how ? "how" : "promos";
      setTab(initialTab);
      const { job } = await api("/api/job").catch(() => ({ job: null }));
      if (job) {
        setJob(job);
        if (job.state === "running") poll();
      }
      await loadRuns(hp.run || null, hp.promo || null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- hash routing (back/forward and deep links)
  useEffect(() => {
    const onHash = () => {
      const hp = hashParams();
      if (hp.promo && data) setOpenId(hp.promo);
      else if (!hp.promo) setOpenId(null);
      if (hp.new) setTab("new");
      else if (hp.how) setTab("how");
      if (hp.run && hp.run !== run) openRun(hp.run);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, run]);

  async function loadRuns(select, focusPromo) {
    try {
      const { runs } = await api("/api/runs");
      setRuns(runs);
      const want = select || run || (runs.find((r) => r.ready) || {}).name;
      if (want && runs.some((r) => r.name === want)) await openRun(want, focusPromo);
      else {
        setData(null);
        setRun(null);
      }
    } catch (e) {
      setFatal(`Could not list runs: ${e.message}`);
    }
  }

  async function openRun(name, focusPromo) {
    setRun(name);
    setLimit(48);
    const meta = runs.find((r) => r.name === name);
    if (meta && !meta.ready) {
      setData({ unfinished: true, message: meta.active ? `“${name}” is still running. Its promos appear here when it finishes.` : "This run did not finish." });
      return;
    }
    try {
      const payload = await api(`/api/runs/${encodeURIComponent(name)}/promos`);
      setData(payload);
      setFilters(EMPTY_FILTERS);
      setHash({ run: name, promo: focusPromo || undefined });
      if (focusPromo) setOpenId(focusPromo);
    } catch (e) {
      setData({ unfinished: true, message: `Could not open this run: ${e.message}` });
    }
  }

  // --- live job polling (same 1.5 s cadence as the Python UI)
  function poll() {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { job } = await api("/api/job");
        setJob(job);
        if (!job || job.state !== "running") {
          clearInterval(pollRef.current);
          if (job?.state === "done") {
            showToast("Run finished: promos ready");
            await loadRuns(job.run);
          }
        }
      } catch {
        /* keep polling through a blip */
      }
    }, 1500);
  }

  useEffect(() => () => clearInterval(pollRef.current), []);

  function changeTab(next) {
    setTab(next);
    setHash(next === "promos" ? { run: run || undefined } : next === "new" ? { new: true } : { how: true });
    window.scrollTo({ top: 0 });
  }

  function openPromo(p) {
    setOpenId(p.id);
    setHash({ run, promo: p.id });
  }

  function closePromo() {
    setOpenId(null);
    setHash({ run: run || undefined });
  }

  const promo = data?.promos?.find((p) => p.id === openId) || null;

  if (fatal) {
    return (
      <main>
        <div className="empty">{fatal}</div>
      </main>
    );
  }

  return (
    <>
      <TopBar
        tab={tab}
        setTab={changeTab}
        runs={runs}
        run={run}
        data={data && !data.unfinished ? data : null}
        job={job}
        onPickRun={(name) => {
          changeTab("promos");
          openRun(name);
        }}
        onJobPill={() => changeTab("new")}
      />

      <main>
        <section style={{ display: tab === "promos" ? "block" : "none" }}>
          {data?.unfinished ? (
            <div className="empty">{data.message}</div>
          ) : data ? (
            <PromosTab
              data={data}
              filters={filters}
              setFilters={(f) => {
                setFilters(f);
                setLimit(48);
              }}
              limit={limit}
              more={() => setLimit((n) => n + 48)}
              onOpen={openPromo}
              onPickFromHero={openPromo}
            />
          ) : (
            <div className="empty">No finished runs yet. Start one under “New run”.</div>
          )}
        </section>

        <section style={{ display: tab === "new" ? "block" : "none" }}>
          <NewRun
            config={config}
            job={job}
            onJob={(j) => {
              setJob(j);
              poll();
            }}
            onOpenRun={async (name) => {
              changeTab("promos");
              await loadRuns(name);
            }}
            onToast={showToast}
          />
        </section>

        <section style={{ display: tab === "how" ? "block" : "none" }}>
          <HowItWorks />
        </section>

        <footer>Promo Finder · built for the Kuku AI Generalist assignment · timestamps are script timings (MM:SS.ss from the start of each episode)</footer>
      </main>

      {promo && data && (
        <PromoDialog
          p={promo}
          data={data}
          run={run}
          onClose={closePromo}
          onReviews={(reviews) => setData((d) => (d ? { ...d, reviews } : d))}
        />
      )}

      {toast && <div id="toast" className="show">{toast}</div>}
    </>
  );
}
