import React, { useEffect, useState } from "react";
import { db, doc, onSnapshot, adminSignIn, adminSignOut, onAuthStateChanged, auth } from "./firebase";

const ADMIN_EMAIL = n => `admin${n}@tux-pos.local`; // must match the emails you created

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [meta, setMeta] = useState(null);
  const [pos, setPos] = useState(null);
  const [adminNo, setAdminNo] = useState("1");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => onAuthStateChanged(auth, u => setAuthed(!!u && !!u.email)), []);

  useEffect(() => {
    if (!authed) return;
    const u1 = onSnapshot(doc(db, "truck", "dayMeta"), s => setMeta(s.data() || null));
    const u2 = onSnapshot(doc(db, "truck", "posStatus"), s => setPos(s.data() || null));
    return () => { u1(); u2(); };
  }, [authed]);

  const lastBeat = pos?.updatedAt?.toDate ? pos.updatedAt.toDate() : null;
  const isOnline = lastBeat ? (Date.now() - lastBeat.getTime() < 40000) : false;

  async function handleLogin(e) {
    e.preventDefault();
    setErr("");
    try { await adminSignIn(ADMIN_EMAIL(adminNo), pin); }
    catch { setErr("Wrong admin number or PIN."); }
  }

  if (!authed) {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui", maxWidth: 360, margin: "0 auto" }}>
        <h2>Admin Login</h2>
        <form onSubmit={handleLogin} style={{ display: "grid", gap: 8 }}>
          <label>Admin #
            <select value={adminNo} onChange={e => setAdminNo(e.target.value)}>
              <option>1</option><option>2</option><option>3</option>
              <option>4</option><option>5</option><option>6</option>
            </select>
          </label>
          <label>PIN
            <input type="password" inputMode="numeric" pattern="[0-9]*" value={pin} onChange={e => setPin(e.target.value)} />
          </label>
          <button type="submit" style={{ padding: 10 }}>Login</button>
          {err && <div style={{ color: "red" }}>{err}</div>}
        </form>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui", maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Truck — Live Worker</h2>
        <button onClick={adminSignOut}>Logout</button>
      </div>

      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <div><b>Current worker:</b> {pos?.worker || "—"}</div>
        <div><b>POS status:</b> {isOnline ? "Online ✅" : "Offline ⛔"}</div>
        <div><b>Last heartbeat:</b> {lastBeat ? lastBeat.toLocaleString() : "—"}</div>
      </div>

      <h3 style={{ marginTop: 16 }}>Shift</h3>
      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <div><b>Started by:</b> {meta?.startedBy || "—"}</div>
        <div><b>Started at:</b> {meta?.startedAt ? new Date(meta.startedAt).toLocaleString() : "—"}</div>
        <div><b>Ended at:</b> {meta?.endedAt ? new Date(meta.endedAt).toLocaleString() : "—"}</div>
        <div><b>Ended by:</b> {meta?.endedBy || "—"}</div>
        <div style={{ marginTop: 8 }}>
          <b>Shift changes:</b>
          <ul style={{ marginTop: 6 }}>
            {(meta?.shiftChanges || []).map((c, i) => (
              <li key={i}>
                #{i + 1}: {c.from} → {c.to} — {c.at ? new Date(c.at).toLocaleString() : "—"}
              </li>
            ))}
            {!meta?.shiftChanges?.length && <li>None</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
