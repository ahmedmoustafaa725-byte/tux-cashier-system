import React, { useEffect, useMemo, useState } from "react";
import {
  db,
  doc,
  onSnapshot,
  adminSignIn,
  adminSignOut,
  onAuthStateChanged,
  auth,
} from "./firebase";
// FIREBASE SYNC — add at the top of App.js
import { db } from "./firebase";
import {
  doc, setDoc, updateDoc, collection, addDoc, deleteDoc,
  serverTimestamp, arrayUnion
} from "firebase/firestore";


// Must match the admin emails you created in Firebase Auth
const ADMIN_EMAIL = (n) => `admin${n}@tux-pos.local`;

// Safe timestamp -> Date
const tsToDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [meta, setMeta] = useState(null);
  const [pos, setPos] = useState(null);
  const [adminNo, setAdminNo] = useState("1");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  // Track auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setAuthed(!!u && !!u.email));
    return unsub;
  }, []);

  // Live snapshots once logged in
  useEffect(() => {
    if (!authed) return;
    const u1 = onSnapshot(doc(db, "truck", "dayMeta"), (s) =>
      setMeta(s.data() || null)
    );
    const u2 = onSnapshot(doc(db, "truck", "posStatus"), (s) =>
      setPos(s.data() || null)
    );
    return () => {
      u1();
      u2();
    };
  }, [authed]);

  // Derive heartbeat + online status (supports updatedAt or lastSeen + optional online flag)
  const lastBeat = useMemo(
    () => tsToDate(pos?.updatedAt || pos?.lastSeen),
    [pos]
  );
  const isOnline =
    pos?.online === true ||
    (lastBeat ? Date.now() - lastBeat.getTime() < 40000 : false);

  // Worker field can be 'worker' or 'currentWorker' depending on your POS code
  const currentWorker = pos?.worker ?? pos?.currentWorker ?? "—";

  // Shift meta dates (support Firestore TS / Date / ISO)
  const startedAt = tsToDate(meta?.startedAt);
  const endedAt = tsToDate(meta?.endedAt);

  async function handleLogin(e) {
    e.preventDefault();
    setErr("");
    try {
      await adminSignIn(ADMIN_EMAIL(adminNo), pin);
    } catch {
      setErr("Wrong admin number or PIN.");
    }
  }

  if (!authed) {
    return (
      <div
        style={{
          padding: 16,
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
          maxWidth: 380,
          margin: "40px auto",
        }}
      >
        <h2>Admin Login</h2>
        <form onSubmit={handleLogin} style={{ display: "grid", gap: 8 }}>
          <label>
            Admin #
            <select
              value={adminNo}
              onChange={(e) => setAdminNo(e.target.value)}
              style={{ marginLeft: 8 }}
            >
              <option>1</option>
              <option>2</option>
              <option>3</option>
              <option>4</option>
              <option>5</option>
              <option>6</option>
            </select>
          </label>
          <label>
            PIN
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }}
            />
          </label>
          <button type="submit" style={{ padding: 10 }}>Login</button>
          {err && <div style={{ color: "red" }}>{err}</div>}
        </form>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        maxWidth: 640,
        margin: "24px auto",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Truck — Live Worker</h2>
        <button onClick={adminSignOut}>Logout</button>
      </div>

      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <div>
          <b>Current worker:</b> {currentWorker}
        </div>
        <div>
          <b>POS status:</b> {isOnline ? "Online ✅" : "Offline ⛔"}
        </div>
        <div>
          <b>Last heartbeat:</b>{" "}
          {lastBeat ? lastBeat.toLocaleString() : "—"}
        </div>
      </div>

      <h3 style={{ marginTop: 16 }}>Shift</h3>
      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <div>
          <b>Started by:</b> {meta?.startedBy || "—"}
        </div>
        <div>
          <b>Started at:</b>{" "}
          {startedAt ? startedAt.toLocaleString() : "—"}
        </div>
        <div>
          <b>Ended at:</b>{" "}
          {endedAt ? endedAt.toLocaleString() : "—"}
        </div>
        <div>
          <b>Ended by:</b> {meta?.endedBy || "—"}
        </div>

        <div style={{ marginTop: 8 }}>
          <b>Shift changes:</b>
          <ul style={{ marginTop: 6 }}>
            {(meta?.shiftChanges || []).map((c, i) => {
              const when = tsToDate(c?.at);
              return (
                <li key={i}>
                  #{i + 1}: {c?.from || "?"} → {c?.to || "?"} —{" "}
                  {when ? when.toLocaleString() : "—"}
                </li>
              );
            })}
            {!meta?.shiftChanges?.length && <li>None</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
