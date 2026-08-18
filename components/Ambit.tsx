"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DIAL_KEYS, DIAL_LABEL, MOODS, type Dials, type Mood, type Track } from "../lib/moods";
import { scoreAll, selectQueue, sequence, reweight, type Scored } from "../lib/scoring";
import { explain, summarise } from "../lib/explain";
import { withDerivedBands } from "../lib/bands";
import { artFor, paletteFor, themeFor, type Theme } from "../lib/theme";

type Screen = "home" | "session" | "track" | "saved";
const SAVED_KEY = "ambit.saved.v1";

export default function Ambit({ tracks }: { tracks: Track[] }) {
  // Tempo bands come from the shipped library, not from constants — see lib/bands.ts
  const moods = useMemo(() => withDerivedBands(tracks, MOODS), [tracks]);

  const [screen, setScreen] = useState<Screen>("home");
  const [moodId, setMoodId] = useState(moods[1].id);
  const [dials, setDials] = useState<Dials | null>(null);
  const [dialsOpen, setDialsOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const mood = moods.find((m) => m.id === moodId) ?? moods[0];
  const activeDials = dials ?? mood.dials;
  const theme: Theme = screen === "home" ? paletteFor(250, 0.18) : themeFor(mood);

  // Rejections persist across visits — this is the feedback signal, so losing it
  // on refresh would make the re-weighting meaningless.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (raw) setSaved(JSON.parse(raw));
    } catch { /* storage unavailable; the app still works, saves just don't persist */ }
  }, []);

  const pool = useMemo(
    () => tracks.filter((t) => !dismissed.includes(t.id)),
    [tracks, dismissed],
  );
  const scored = useMemo(
    () => scoreAll(pool, activeDials, mood),
    [pool, activeDials, mood],
  );
  const queue = useMemo(() => sequence(selectQueue(scored, 6)), [scored]);

  // Saved tracks keep their original order (most recent last) and are scored
  // against the current session, so opening one still explains itself.
  const savedTracks = useMemo(
    () => scoreAll(tracks.filter((t) => saved.includes(t.id)), activeDials, mood),
    [tracks, saved, activeDials, mood],
  );

  const playing = tracks.find((t) => t.id === nowPlaying) ?? null;
  const detail = detailId
    ? scored.find((t) => t.id === detailId) ??
      scoreAll(tracks.filter((t) => t.id === detailId), activeDials, mood)[0]
    : null;

  // ---- audio ---------------------------------------------------------------
  useEffect(() => {
    if (!playing) return;
    let el = audioRef.current;
    if (!el) {
      el = new Audio();
      audioRef.current = el;
      el.addEventListener("timeupdate", () => setPos(el!.currentTime));
      el.addEventListener("loadedmetadata", () => setDur(el!.duration));
      el.addEventListener("ended", () => nextTrack());
    }
    if (el.src !== new URL(playing.audio, location.href).href) {
      el.src = playing.audio;
      setPos(0);
    }
    if (isPlaying) el.play().catch(() => setIsPlaying(false));
    else el.pause();
  }, [playing, isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = (id: string) => { setNowPlaying(id); setIsPlaying(true); };
  const nextTrack = () => {
    if (!queue.length) return;
    const i = queue.findIndex((t) => t.id === nowPlaying);
    play(queue[(i + 1) % queue.length].id);
  };
  const prevTrack = () => {
    if (!queue.length) return;
    const i = queue.findIndex((t) => t.id === nowPlaying);
    play(queue[(i - 1 + queue.length) % queue.length].id);
  };

  // ---- actions -------------------------------------------------------------
  const openMood = (id: string) => {
    setMoodId(id); setDials(null); setDismissed([]); setDialsOpen(false); setScreen("session");
  };

  /** "Not now" moves the dials away from what was rejected, then hides it. */
  const dismiss = (t: Scored) => {
    setDials(reweight(activeDials, t));
    setDismissed((d) => [...d, t.id]);
  };

  const setDial = (key: keyof Dials, value: number) =>
    setDials({ ...activeDials, [key]: value });

  /** Saves persist across visits — a list that empties on refresh isn't a list. */
  const toggleSave = (id: string) => {
    const next = saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id];
    setSaved(next);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch {}
  };

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return `${m}:${r < 10 ? "0" : ""}${r}`;
  };

  // ---- render --------------------------------------------------------------
  return (
    <div style={{ background: theme.bg, color: theme.text, minHeight: "100vh", paddingBottom: 104, transition: "background .6s ease, color .6s ease" }}>
      <Header
        theme={theme}
        savedCount={saved.length}
        onHome={() => setScreen("home")}
        onSession={() => setScreen("session")}
        onSaved={() => setScreen("saved")}
      />

      {screen === "home" && (
        <Home moods={moods} onOpen={openMood} />
      )}

      {screen === "session" && (
        <Session
          mood={mood} theme={theme} dials={activeDials} queue={queue}
          dialsOpen={dialsOpen} onToggleDials={() => setDialsOpen((v) => !v)}
          onSetDial={setDial} onPlay={play} onDismiss={dismiss}
          onOpenTrack={(id) => { setDetailId(id); setScreen("track"); }}
          onReset={() => { setDismissed([]); setDials(null); }}
          onToggleSave={toggleSave}
          saved={saved}
        />
      )}

      {screen === "saved" && (
        <Saved
          tracks={savedTracks} mood={mood} theme={theme}
          onPlay={play} onRemove={toggleSave}
          onOpenTrack={(id) => { setDetailId(id); setScreen("track"); }}
          onBrowse={() => setScreen("home")}
        />
      )}

      {screen === "track" && detail && (
        <TrackPage
          track={detail} mood={mood} theme={theme} scored={scored}
          saved={saved.includes(detail.id)}
          onBack={() => setScreen("session")}
          onPlay={play} onSave={() => toggleSave(detail.id)}
          onOpenTrack={(id) => setDetailId(id)}
          isPlaying={isPlaying && nowPlaying === detail.id}
        />
      )}

      <Player
        theme={theme} mood={mood} track={playing} isPlaying={isPlaying} pos={pos} dur={dur}
        onToggle={() => setIsPlaying((v) => !v)} onNext={nextTrack} onPrev={prevTrack}
        onSeek={(frac) => { if (audioRef.current && isFinite(dur)) audioRef.current.currentTime = frac * dur; }}
        onOpen={() => { if (playing) { setDetailId(playing.id); setScreen("track"); } }}
        fmt={fmt}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Header({ theme, savedCount, onHome, onSession, onSaved }: {
  theme: Theme; savedCount: number;
  onHome: () => void; onSession: () => void; onSaved: () => void;
}) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 40, background: theme.bgFade, backdropFilter: "blur(14px)", borderBottom: `1px solid ${theme.line}` }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 24px", height: 62, display: "flex", alignItems: "center", gap: 26 }}>
        <button onClick={onHome} style={{ ...btnReset, display: "flex", alignItems: "baseline", gap: 9, color: "inherit" }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 500, letterSpacing: "0.2em" }}>AMBIT</span>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: theme.accent, display: "block" }} />
        </button>
        <nav style={{ display: "flex", gap: 2 }}>
          <button onClick={onHome} style={{ ...navBtn, color: theme.textSoft }}>Home</button>
          <button onClick={onSession} style={{ ...navBtn, color: theme.textSoft }}>Your session</button>
          <button onClick={onSaved} style={{ ...navBtn, color: theme.textSoft, display: "flex", alignItems: "center", gap: 7 }}>
            Saved
            {savedCount > 0 && (
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, background: theme.chipStrong,
                             color: theme.accentText, borderRadius: 999, padding: "1px 7px" }}>
                {savedCount}
              </span>
            )}
          </button>
        </nav>
      </div>
    </div>
  );
}

function Home({ moods, onOpen }: { moods: Mood[]; onOpen: (id: string) => void }) {
  return (
    <>
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "100px 24px 60px" }}>
        <h1 style={{ fontSize: "clamp(32px,5.2vw,56px)", fontWeight: 300, letterSpacing: "-0.035em", lineHeight: 1.1, margin: "0 0 28px", maxWidth: "17ch", textWrap: "balance" }}>
          Music that fits what you&apos;re <span style={{ color: "oklch(0.50 0.13 250)", fontWeight: 400 }}>doing</span>.
        </h1>
        <p style={{ fontSize: 17.5, lineHeight: 1.62, color: "oklch(0.44 0.012 250)", margin: 0, maxWidth: "50ch", textWrap: "pretty" }}>
          Tell Ambit the moment — a long drive, a slow morning, two hours of work — and it builds a queue for it. Every track comes with the reason it was picked.
        </p>
      </section>
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "0 24px 96px" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "oklch(0.54 0.012 250)", marginBottom: 22 }}>
          Pick a moment
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(238px,1fr))", gap: 14 }}>
          {moods.map((m) => {
            const p = paletteFor(m.hue, m.force);
            return (
              <button key={m.id} onClick={() => onOpen(m.id)} className="moodcard"
                style={{ ...btnReset, textAlign: "left", background: `oklch(${(0.988 - m.force * 0.01).toFixed(3)} ${(0.004 + m.force * 0.014).toFixed(3)} ${m.hue})`, border: `1px solid oklch(${(0.908 - m.force * 0.026).toFixed(3)} ${(0.01 + m.force * 0.03).toFixed(3)} ${m.hue})`, borderRadius: 5, padding: "20px 20px 22px", display: "flex", flexDirection: "column", gap: 9, minHeight: 138, color: "oklch(0.22 0.01 250)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: p.accent, flex: "none" }} />
                  <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-0.014em" }}>{m.name}</div>
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.52, color: "oklch(0.46 0.014 250)", flex: 1, textWrap: "pretty" }}>{m.desc}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: "0.12em", color: p.accentText }}>{m.lo}–{m.hi} BPM</div>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Session(props: {
  mood: Mood; theme: Theme; dials: Dials; queue: Scored[];
  dialsOpen: boolean; onToggleDials: () => void;
  onSetDial: (k: keyof Dials, v: number) => void;
  onPlay: (id: string) => void; onDismiss: (t: Scored) => void;
  onOpenTrack: (id: string) => void; onReset: () => void;
  onToggleSave: (id: string) => void; saved: string[];
}) {
  const { mood, theme, dials, queue } = props;
  return (
    <>
      <div style={{ background: theme.wash, borderBottom: `1px solid ${theme.line}` }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "52px 24px 34px" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: theme.onWashSoft, marginBottom: 16 }}>Your session</div>
          <h1 style={{ fontFamily: "var(--mono)", fontSize: "clamp(28px,4.4vw,46px)", fontWeight: 300, letterSpacing: "-0.055em", margin: "0 0 10px", lineHeight: 1.06, color: theme.onWash }}>{mood.name}</h1>
          <div style={{ fontSize: 15.5, color: theme.onWashSoft, maxWidth: "46ch" }}>{mood.desc}</div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 24px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", padding: "22px 0 18px", borderBottom: `1px solid ${theme.line}` }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {summarise(dials).map((label) => (
              <span key={label} style={{ fontSize: 12.5, color: theme.text2, background: theme.chip, borderRadius: 999, padding: "5px 13px" }}>{label}</span>
            ))}
          </div>
          <button onClick={props.onToggleDials} style={{ ...btnReset, fontSize: 13.5, color: theme.accentText }}>
            {props.dialsOpen ? "Hide the dials" : "Adjust this session"} →
          </button>
        </div>

        {props.dialsOpen && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "22px 34px", padding: "26px 0", borderBottom: `1px solid ${theme.line}`, color: theme.accent }}>
            {DIAL_KEYS.map((k) => (
              <div key={k}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <label htmlFor={`dial-${k}`} style={{ fontSize: 13, color: theme.textSoft }}>{DIAL_LABEL[k]}</label>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12.5 }}>{dials[k]}</span>
                </div>
                <input id={`dial-${k}`} type="range" min={0} max={100} value={dials[k]}
                  onChange={(e) => props.onSetDial(k, Number(e.target.value))}
                  style={{ width: "100%" }} />
              </div>
            ))}
          </div>
        )}

        {/*
          The queue is sequenced, not ranked: strongest match opens, then energy
          rises. That means the match percentages are deliberately out of order,
          which reads as a bug unless the list says so. Naming it costs one line
          and turns a apparent glitch into a visible design decision.
        */}
        {queue.length > 0 && (
          <div style={{ fontSize: 12.5, color: theme.textMute, padding: "16px 0 2px" }}>
            Ordered as a session — best match first, then building. Not ranked by score.
          </div>
        )}

        <div style={{ paddingTop: 6 }}>
          {queue.map((t, i) => (
            <div key={t.id} className="trackrow" style={{ padding: "20px 0", borderBottom: `1px solid ${theme.line}` }}>
              <button className="t-art" onClick={() => props.onOpenTrack(t.id)} aria-label={`Open ${t.title}`}
                style={{ ...btnReset, width: 66, height: 66, borderRadius: 4, background: artFor(t, mood, i), boxShadow: "inset 0 0 0 1px oklch(0.5 0.02 250 / 0.14)" }} />
              <button className="t-meta" onClick={() => props.onOpenTrack(t.id)} style={{ ...btnReset, textAlign: "left", minWidth: 0, color: "inherit" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.06em", color: t.match >= 70 ? theme.accentText : theme.textMute, marginBottom: 6 }}>{t.match}% match</div>
                <div style={{ fontSize: 16.5, fontWeight: 500, letterSpacing: "-0.014em" }}>{t.title}</div>
                <div style={{ fontSize: 13.5, color: theme.textMute, marginTop: 2 }}>{t.artist}</div>
              </button>
              <div className="t-why" style={{ fontSize: 14.5, lineHeight: 1.55, color: theme.text2, borderLeft: `2px solid ${theme.rule}`, paddingLeft: 15, textWrap: "pretty" }}>
                {explain(t, mood, i)}
              </div>
              <div className="t-act" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => props.onPlay(t.id)} style={{ ...pill, background: theme.chipStrong, color: theme.accentText }}>Play</button>
                <button onClick={() => props.onDismiss(t)} style={{ ...pill, border: `1px solid ${theme.line2}`, color: theme.textMute, background: "transparent" }}>Not now</button>
                <button
                  onClick={() => props.onToggleSave(t.id)}
                  aria-label={props.saved.includes(t.id) ? `Remove ${t.title} from saved` : `Save ${t.title}`}
                  title={props.saved.includes(t.id) ? "Saved" : "Save"}
                  style={{ ...btnReset, fontSize: 17, lineHeight: 1, padding: "6px 4px",
                           color: props.saved.includes(t.id) ? theme.accent : theme.textMute }}>
                  {props.saved.includes(t.id) ? "★" : "☆"}
                </button>
              </div>
            </div>
          ))}

          {queue.length === 0 && (
            <div style={{ padding: "56px 0", textAlign: "center" }}>
              <div style={{ fontSize: 15, color: theme.textSoft, marginBottom: 18 }}>You&apos;ve turned down everything in this session.</div>
              <button onClick={props.onReset} style={{ ...pill, background: theme.solid, color: theme.onSolid }}>Start it over</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Saved(props: {
  tracks: Scored[]; mood: Mood; theme: Theme;
  onPlay: (id: string) => void; onRemove: (id: string) => void;
  onOpenTrack: (id: string) => void; onBrowse: () => void;
}) {
  const { tracks, mood, theme } = props;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 24px 40px" }}>
      <h1 style={{ fontFamily: "var(--mono)", fontSize: "clamp(26px,3.6vw,38px)", fontWeight: 300,
                   letterSpacing: "-0.05em", margin: "0 0 8px", lineHeight: 1.06 }}>Saved</h1>
      <div style={{ fontSize: 15, color: theme.textSoft, marginBottom: 34, maxWidth: "52ch" }}>
        {tracks.length === 0
          ? "Nothing saved yet."
          : `${tracks.length} track${tracks.length === 1 ? "" : "s"}, kept in this browser. Match percentages are against ${mood.name}.`}
      </div>

      {tracks.length === 0 ? (
        <div style={{ padding: "40px 0", borderTop: `1px solid ${theme.line}` }}>
          <p style={{ fontSize: 15, color: theme.textSoft, maxWidth: "46ch", lineHeight: 1.6 }}>
            Star a track in any session to keep it here. Saves live in this
            browser only — there is no account, so clearing site data clears them.
          </p>
          <button onClick={props.onBrowse}
            style={{ ...pill, marginTop: 8, background: theme.solid, color: theme.onSolid, padding: "11px 22px" }}>
            Pick a moment
          </button>
        </div>
      ) : (
        <div>
          {tracks.map((t, i) => (
            <div key={t.id} className="trackrow" style={{ padding: "18px 0", borderBottom: `1px solid ${theme.line}` }}>
              <button className="t-art" onClick={() => props.onOpenTrack(t.id)} aria-label={`Open ${t.title}`}
                style={{ ...btnReset, width: 66, height: 66, borderRadius: 4, background: artFor(t, mood, i),
                         boxShadow: "inset 0 0 0 1px oklch(0.5 0.02 250 / 0.14)" }} />
              <button className="t-meta" onClick={() => props.onOpenTrack(t.id)}
                style={{ ...btnReset, textAlign: "left", minWidth: 0, color: "inherit" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.06em",
                              color: t.match >= 70 ? theme.accentText : theme.textMute, marginBottom: 6 }}>
                  {t.match}% match
                </div>
                <div style={{ fontSize: 16.5, fontWeight: 500, letterSpacing: "-0.014em" }}>{t.title}</div>
                <div style={{ fontSize: 13.5, color: theme.textMute, marginTop: 2 }}>{t.artist}</div>
              </button>
              <div className="t-why" style={{ fontSize: 14.5, lineHeight: 1.55, color: theme.text2,
                                              borderLeft: `2px solid ${theme.rule}`, paddingLeft: 15, textWrap: "pretty" }}>
                {explain(t, mood, i)}
              </div>
              <div className="t-act" style={{ display: "flex", gap: 8 }}>
                <button onClick={() => props.onPlay(t.id)}
                  style={{ ...pill, background: theme.chipStrong, color: theme.accentText }}>Play</button>
                <button onClick={() => props.onRemove(t.id)}
                  style={{ ...pill, border: `1px solid ${theme.line2}`, color: theme.textMute, background: "transparent" }}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrackPage(props: {
  track: Scored; mood: Mood; theme: Theme; scored: Scored[]; saved: boolean;
  onBack: () => void; onPlay: (id: string) => void; onSave: () => void;
  onOpenTrack: (id: string) => void; isPlaying: boolean;
}) {
  const { track, mood, theme } = props;
  const similar = props.scored.filter((t) => t.id !== track.id).slice(0, 3);
  const bars: [string, number][] = [["Energy", track.e], ["Warmth", track.w], ["Pace", track.t], ["Vocals", track.v]];

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "30px 24px" }}>
      <button onClick={props.onBack} style={{ ...btnReset, fontSize: 13.5, color: theme.textSoft, marginBottom: 34 }}>← Back to session</button>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(275px,1fr))", gap: 52, alignItems: "start" }}>
        <div>
          <div style={{ aspectRatio: "1", borderRadius: 6, background: artFor(track, mood, 0), boxShadow: `0 18px 40px -24px ${theme.shadow}, inset 0 0 0 1px oklch(0.5 0.02 250 / 0.14)` }} />
          <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
            <button onClick={() => props.onPlay(track.id)} style={{ ...pill, padding: "12px 26px", background: theme.solid, color: theme.onSolid }}>
              {props.isPlaying ? "Pause" : "Play track"}
            </button>
            <button onClick={props.onSave} style={{ ...pill, padding: "12px 26px", border: `1px solid ${theme.line2}`, background: "transparent", color: props.saved ? theme.accentText : theme.textSoft }}>
              {props.saved ? "Saved" : "Save"}
            </button>
          </div>
        </div>

        <div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.14em", color: theme.accentText, marginBottom: 12 }}>{track.match}% match — {mood.name}</div>
          <h1 style={{ fontFamily: "var(--mono)", fontSize: "clamp(26px,3.8vw,40px)", fontWeight: 300, letterSpacing: "-0.055em", margin: "0 0 10px", lineHeight: 1.06 }}>{track.title}</h1>
          <div style={{ fontSize: 15.5, color: theme.textSoft }}>{track.artist}{track.album ? ` · ${track.album}` : ""}{track.year ? ` · ${track.year}` : ""}</div>

          <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: theme.textMute, margin: "36px 0 12px" }}>Why it&apos;s here</div>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: theme.text, margin: "0 0 28px", textWrap: "pretty" }}>{explain(track, mood, 0)}</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 30px", marginBottom: 30 }}>
            {bars.map(([label, v]) => (
              <div key={label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: theme.textSoft, marginBottom: 6 }}>
                  <span>{label}</span><span style={{ fontFamily: "var(--mono)" }}>{v}</span>
                </div>
                <div style={{ height: 4, borderRadius: 999, background: theme.track }}>
                  <div style={{ height: 4, borderRadius: 999, width: `${v}%`, background: theme.accent }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 32, flexWrap: "wrap", padding: "18px 0", borderTop: `1px solid ${theme.line}`, borderBottom: `1px solid ${theme.line}` }}>
            <Fact k="Tempo" v={track.bpm ? `${track.bpm} BPM` : "No steady beat"} theme={theme} />
            <Fact k="Length" v={`${Math.floor(track.dur / 60)}:${String(track.dur % 60).padStart(2, "0")}`} theme={theme} />
            <Fact k="Genre" v={track.genre} theme={theme} />
          </div>

          {/* Creative Commons requires attribution — see ingest README */}
          {track.license && (
            <p style={{ fontSize: 12.5, lineHeight: 1.6, color: theme.textMute, margin: "18px 0 0" }}>
              {track.artist} — licensed under{" "}
              <a href={track.license} target="_blank" rel="noreferrer" style={{ color: theme.accentText }}>Creative Commons</a>
              {track.source && <> · <a href={track.source} target="_blank" rel="noreferrer" style={{ color: theme.accentText }}>source</a></>}
            </p>
          )}

          <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: theme.textMute, margin: "40px 0 6px" }}>More like this</div>
          {similar.map((t, i) => (
            <button key={t.id} onClick={() => props.onOpenTrack(t.id)}
              style={{ ...btnReset, width: "100%", display: "flex", alignItems: "center", gap: 15, padding: "13px 0", borderBottom: `1px solid ${theme.line}`, color: "inherit", textAlign: "left" }}>
              <div style={{ width: 42, height: 42, flex: "none", borderRadius: 3, background: artFor(t, mood, i + 1), boxShadow: "inset 0 0 0 1px oklch(0.5 0.02 250 / 0.14)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 500 }}>{t.title}</div>
                <div style={{ fontSize: 12.5, color: theme.textMute }}>{t.artist}</div>
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: t.match >= 70 ? theme.accentText : theme.textMute }}>{t.match}%</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const Fact = ({ k, v, theme }: { k: string; v: string; theme: Theme }) => (
  <div>
    <div style={{ fontSize: 11.5, color: theme.textMute, marginBottom: 4 }}>{k}</div>
    <div style={{ fontFamily: "var(--mono)", fontSize: 14.5 }}>{v}</div>
  </div>
);

function Player(props: {
  theme: Theme; mood: Mood; track: Track | null; isPlaying: boolean; pos: number; dur: number;
  onToggle: () => void; onNext: () => void; onPrev: () => void;
  onSeek: (frac: number) => void; onOpen: () => void; fmt: (s: number) => string;
}) {
  const { theme, track } = props;
  if (!track) return null;
  const frac = props.dur ? Math.min(100, (props.pos / props.dur) * 100) : 0;

  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, background: theme.bgFade, backdropFilter: "blur(14px)", borderTop: `1px solid ${theme.line}` }}>
      <div role="progressbar" aria-label="Seek" aria-valuenow={Math.round(frac)} aria-valuemin={0} aria-valuemax={100}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          props.onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
        }}
        style={{ height: 3, background: theme.track, cursor: "pointer" }}>
        <div style={{ height: 3, width: `${frac}%`, background: theme.accent }} />
      </div>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 24px", height: 72, display: "flex", alignItems: "center", gap: 18 }}>
        <button onClick={props.onOpen} aria-label={`Open ${track.title}`}
          style={{ ...btnReset, width: 44, height: 44, flex: "none", borderRadius: 4, background: artFor(track, props.mood, 0), boxShadow: "inset 0 0 0 1px oklch(0.5 0.02 250 / 0.14)" }} />
        <button onClick={props.onOpen} style={{ ...btnReset, flex: 1, minWidth: 0, textAlign: "left", color: "inherit" }}>
          <div className="truncate" style={{ fontSize: 14.5, fontWeight: 500 }}>{track.title}</div>
          <div className="truncate" style={{ fontSize: 12.5, color: theme.textMute }}>{track.artist} — {props.mood.name}</div>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={props.onPrev} aria-label="Previous track" style={{ ...btnReset, fontSize: 14, color: theme.textSoft }}>⏮</button>
          <button onClick={props.onToggle} aria-label={props.isPlaying ? "Pause" : "Play"}
            style={{ ...btnReset, width: 40, height: 40, borderRadius: 999, background: theme.solid, color: theme.onSolid, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
            {props.isPlaying ? "❚❚" : "▶"}
          </button>
          <button onClick={props.onNext} aria-label="Next track" style={{ ...btnReset, fontSize: 14, color: theme.textSoft }}>⏭</button>
        </div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: theme.textMute, whiteSpace: "nowrap" }}>
          {props.fmt(props.pos)} / {props.fmt(props.dur || track.dur)}
        </div>
      </div>
    </div>
  );
}

const btnReset: React.CSSProperties = { background: "none", border: "none", padding: 0, margin: 0, font: "inherit", cursor: "pointer" };
const navBtn: React.CSSProperties = { ...btnReset, fontSize: 14, padding: "7px 12px", borderRadius: 3 };
const pill: React.CSSProperties = { ...btnReset, fontSize: 13, padding: "9px 18px", borderRadius: 999, whiteSpace: "nowrap" };
