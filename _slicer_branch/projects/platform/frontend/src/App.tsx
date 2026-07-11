import { useEffect, useRef, useState } from "react";
import * as api from "./api";
import logoUrl from "./assets/Logo_Meltio.png";
import { Browser } from "./Browser";
import { AdminPanel } from "./AdminPanel";

export default function App() {
  const [me, setMe] = useState<api.Me | null>(null);
  const [view, setView] = useState<"files" | "admin" | "slicer">("files");
  const [error, setError] = useState("");
  const [acctOpen, setAcctOpen] = useState(false);
  const [slicerMounted, setSlicerMounted] = useState(false);
  const [stream, setStream] = useState<
    { part: string; org: string; slice?: string; view: string } | null
  >(null);
  const [reloadKey, setReloadKey] = useState(0);
  const slicerRef = useRef<HTMLIFrameElement>(null);
  const slicerLoaded = useRef(false);
  const pendingPart = useRef<{ partId: string; sliceId?: string; scope: string } | null>(null);

  useEffect(() => {
    api.getMe().then(setMe).catch((e) => setError(String(e)));
  }, []);

  // Switching views always lands at the top (esp. on mobile, where a deep scroll
  // in the file view would otherwise leave the slicer with no visible header).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  // Mobile WebKit sizes an iframe to its content height (ignoring CSS height), so
  // the embedded slicer's bottom-anchored UI ends up below the visible area. Pin
  // the iframe to exactly the space below the header.
  useEffect(() => {
    if (view !== "slicer") return;
    const fit = () => {
      const f = slicerRef.current;
      if (!f) return;
      const top = f.getBoundingClientRect().top;
      f.style.height = `${Math.max(0, window.innerHeight - top)}px`;
    };
    fit();
    const t = setTimeout(fit, 300);
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      clearTimeout(t);
    };
  }, [view, slicerMounted, stream]);

  // The embedded slicer pings the shell when it saves a slice → refresh the panels.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "slice-saved") setReloadKey((n) => n + 1);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  function postLoadPart(p: { partId: string; sliceId?: string; scope: string }) {
    slicerRef.current?.contentWindow?.postMessage(
      { type: "load-part", partId: p.partId, sliceId: p.sliceId, orgId: p.scope },
      window.location.origin,
    );
  }

  function openSlicer(partId?: string, sliceId?: string, scope?: string) {
    const org = scope ?? me?.org.id ?? "";
    // Server-side rendering is a simple per-user on/off: on = open in the streamed viewer,
    // off = render locally. ?stream=1 forces, ?stream=0 disables (for testing).
    const force = new URLSearchParams(location.search).get("stream");
    const canStream = !!(me?.renderUrl && me?.canStream);
    const streamFromOpen = force === "1" || (canStream && me?.streamPref.always && force !== "0");
    if (partId && me?.renderUrl && streamFromOpen) {
      setStream({ part: partId, org, slice: sliceId, view: sliceId ? "toolpath" : "stl" });
      setView("slicer");
      return;
    }
    setStream(null);
    setSlicerMounted(true);
    setView("slicer");
    if (!partId) return;
    const p = { partId, sliceId, scope: org };
    if (slicerLoaded.current) postLoadPart(p);
    else pendingPart.current = p;
  }

  async function toggleSSR(on: boolean) {
    try {
      await api.setStreamPref(on);
      setMe((m) => (m ? { ...m, streamPref: { always: on } } : m));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className={`app ${view === "slicer" ? "slicer-view" : ""}`}>
      <header className="topbar">
        <nav className="nav">
          <img className="brand brand-logo" src={logoUrl} alt="Meltio" />
          <button
            className={`tab ${view === "files" ? "active" : ""}`}
            onClick={() => setView("files")}
          >
            Database
          </button>
          <button
            className={`tab ${view === "slicer" ? "active" : ""}`}
            onClick={() => openSlicer()}
          >
            Slicer
          </button>
        </nav>
        {me && (
          <div className="account">
            <button className="acct-trigger" onClick={() => setAcctOpen((o) => !o)}>
              <span className="acct-avatar">
                {(me.displayName || me.email).slice(0, 2).toUpperCase()}
              </span>
              <span className="acct-email">{me.email}</span>
              {me.role !== "member" && (
                <span className="acct-role">{me.roleLabel || me.role}</span>
              )}
              <span className="acct-caret">▾</span>
            </button>
            {acctOpen && (
              <>
                <div className="rowmenu-backdrop" onClick={() => setAcctOpen(false)} />
                <div className="acct-menu">
                  {me.isAdmin && (
                    <button
                      className="acct-item"
                      onClick={() => {
                        setAcctOpen(false);
                        setView("admin");
                      }}
                    >
                      Permissions console
                    </button>
                  )}
                  {me.canStream && (
                    <label
                      className="acct-item"
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}
                    >
                      <span>Server Side Rendering</span>
                      <input
                        type="checkbox"
                        checked={!!me.streamPref.always}
                        onChange={(e) => toggleSSR(e.target.checked)}
                      />
                    </label>
                  )}
                  {me.version && (
                    <div className="acct-version">Meltio Cloud · {me.version}</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </header>
      <main className="main">
        <div className="content" hidden={view === "slicer"}>
          {error && (
            <div className="error" onClick={() => setError("")}>
              {error}
            </div>
          )}
          {view === "admin" && me?.isAdmin ? (
            <AdminPanel me={me} onError={setError} />
          ) : (
            <Browser
              me={me}
              reloadKey={reloadKey}
              bumpReload={() => setReloadKey((n) => n + 1)}
              openSlicer={openSlicer}
              onError={setError}
            />
          )}
        </div>
        {stream && view === "slicer" && me?.renderUrl && (
          // Streaming = the real slicer GUI in remote-scene mode: an embedded iframe
          // (3D rendered server-side over WebRTC), pinned by the shell below its
          // mobile-responsive header. See docs/PIXEL_STREAMING.md.
          <iframe
            // NOTE: no slicerRef here — only the local iframe uses it for postLoadPart.
            // Sharing the ref let the streamed iframe's unmount null it, breaking the next
            // local part load (it would keep showing the previous part).
            key={`scene:${stream.part}:${stream.slice ?? ""}:${stream.view}`}
            title="Slicer"
            className="slicer-frame"
            src={`/slicer/?embed=1&scene=remote&part=${encodeURIComponent(stream.part)}&org=${encodeURIComponent(stream.org)}${stream.slice ? `&slice=${encodeURIComponent(stream.slice)}` : ""}&view=${encodeURIComponent(stream.view)}`}
          />
        )}
        {slicerMounted && (
          <iframe
            ref={slicerRef}
            title="Slicer"
            className="slicer-frame"
            src="/slicer/?embed=1"
            hidden={view !== "slicer" || !!stream}
            onLoad={() => {
              slicerLoaded.current = true;
              if (pendingPart.current) {
                postLoadPart(pendingPart.current);
                pendingPart.current = null;
              }
            }}
          />
        )}
      </main>
    </div>
  );
}
