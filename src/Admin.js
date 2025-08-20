import React, { useEffect, useMemo, useState } from "react";
import { db, adminSignIn, adminSignOut, onAuthStateChanged, auth } from "./firebase";
import {
  doc, collection, query, orderBy, limit, onSnapshot
} from "firebase/firestore";

// PDF
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const ADMIN_EMAIL = n => `admin${n}@tux-pos.local`; // must match the emails you created

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [adminNo, setAdminNo] = useState("1");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  // live docs
  const [pos, setPos] = useState(null);
  const [meta, setMeta] = useState(null);
  const [metrics, setMetrics] = useState(null);

  // collections
  const [orders, setOrders] = useState([]);     // last N
  const [expenses, setExpenses] = useState([]); // last N

  useEffect(() => onAuthStateChanged(auth, u => setAuthed(!!u && !!u.email)), []);

  useEffect(() => {
    if (!authed) return;
    const u1 = onSnapshot(doc(db, "truck", "posStatus"), s => setPos(s.data() || null));
    const u2 = onSnapshot(doc(db, "truck", "dayMeta"), s => setMeta(s.data() || null));
    const u3 = onSnapshot(doc(db, "truck", "metrics"), s => setMetrics(s.data() || null));

    const qOrders = query(collection(db, "truck_orders"), orderBy("orderNo", "desc"), limit(100));
    const unOrders = onSnapshot(qOrders, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrders(list);
    });

    const qExp = query(collection(db, "truck_expenses"), orderBy("date", "desc"), limit(100));
    const unExp = onSnapshot(qExp, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setExpenses(list);
    });

    return () => { u1(); u2(); u3(); unOrders(); unExp(); };
  }, [authed]);

  const lastBeat = pos?.updatedAt?.toDate ? pos.updatedAt.toDate() : null;
  const isOnline = lastBeat ? (Date.now() - lastBeat.getTime() < 40000) : false;

  async function handleLogin(e) {
    e.preventDefault();
    setErr("");
    try { await adminSignIn(ADMIN_EMAIL(adminNo), pin); }
    catch { setErr("Wrong admin number or PIN."); }
  }

  // derive totals from cloud (fallback if metrics doc missing)
  const computed = useMemo(() => {
    if (metrics) return metrics;

    const validOrders = orders.filter(o => !o.voided);
    const itemsOnly = (o) => {
      const itemsTotal = Number(o.itemsTotal ?? (o.total - (o.deliveryFee || 0)));
      return isNaN(itemsTotal) ? 0 : itemsTotal;
    };

    const revenueTotal = validOrders.reduce((s, o) => s + itemsOnly(o), 0);
    const byPay = {};
    validOrders.forEach(o => { byPay[o.payment] = (byPay[o.payment] || 0) + itemsOnly(o); });
    const byType = {};
    validOrders.forEach(o => { byType[o.orderType || "-"] = (byType[o.orderType || "-"] || 0) + itemsOnly(o); });
    const deliveryFeesTotal = validOrders.reduce((s, o) => s + (o.deliveryFee || 0), 0);
    const expensesTotal = expenses.reduce((s, e) => s + Number((e.qty || 0) * (e.unitPrice || 0)), 0);
    const margin = revenueTotal - expensesTotal;

    return { revenueTotal, byPay, byType, deliveryFeesTotal, expensesTotal, margin };
  }, [metrics, orders, expenses]);

  function downloadPDF() {
    const docx = new jsPDF();
    docx.text("TUX — Shift Report (Admin)", 14, 12);

    const startedStr = meta?.startedAt ? new Date(meta.startedAt).toLocaleString() : "—";
    const endedStr   = meta?.endedAt ? new Date(meta.endedAt).toLocaleString()   : "—";

    autoTable(docx, {
      head: [["Start By", "Start At", "End At"]],
      body: [[meta?.startedBy || "—", startedStr, endedStr]],
      startY: 18, theme: "grid"
    });

    let y = (docx.lastAutoTable?.finalY || 28) + 8;
    docx.text("Orders (latest 100)", 14, y);
    autoTable(docx, {
      head: [["#", "Date", "Worker", "Payment", "Type", "Delivery", "Total", "Done", "Voided"]],
      body: orders.map(o => [
        o.orderNo,
        o.date?.toDate ? o.date.toDate().toLocaleString() : "—",
        o.worker || "",
        o.payment || "",
        o.orderType || "",
        (o.deliveryFee || 0).toFixed(2),
        Number(o.total || 0).toFixed(2),
        o.done ? "Yes" : "No",
        o.voided ? "Yes" : "No",
      ]),
      startY: y + 4, styles: { fontSize: 9 }, theme: "grid"
    });

    y = (docx.lastAutoTable?.finalY || y + 40) + 8;
    docx.text("Totals (cloud)", 14, y);
    const totalsRows = [
      ["Revenue (excl. delivery)", (computed.revenueTotal || 0).toFixed(2)],
      ["Delivery Fees (not in revenue)", (computed.deliveryFeesTotal || 0).toFixed(2)],
      ["Expenses", (computed.expensesTotal || 0).toFixed(2)],
      ["Margin", (computed.margin || 0).toFixed(2)],
      ...Object.entries(computed.byPay || {}).map(([k,v]) => [`By Payment — ${k}`, (v||0).toFixed(2)]),
      ...Object.entries(computed.byType || {}).map(([k,v]) => [`By Order Type — ${k}`, (v||0).toFixed(2)]),
    ];
    autoTable(docx, {
      head: [["Metric", "Amount (E£)"]],
      body: totalsRows,
      startY: y + 4, theme: "grid"
    });

    docx.save("tux_shift_report_admin.pdf");
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
    <div style={{ padding: 16, fontFamily: "system-ui", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h2>TUX Admin</h2>
        <button onClick={adminSignOut}>Logout</button>
      </div>

      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <div><b>POS status:</b> {isOnline ? "Online ✅" : "Offline ⛔"}</div>
        <div><b>Current worker:</b> {pos?.worker || "—"}</div>
        <div><b>Last heartbeat:</b> {lastBeat ? lastBeat.toLocaleString() : "—"}</div>
      </div>

      <h3 style={{ marginTop: 16 }}>Shift</h3>
      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <div><b>Started by:</b> {meta?.startedBy || "—"}</div>
        <div><b>Started at:</b> {meta?.startedAt ? new Date(meta.startedAt).toLocaleString() : "—"}</div>
        <div><b>Ended at:</b> {meta?.endedAt ? new Date(meta.endedAt).toLocaleString() : "—"}</div>
        <div><b>Ended by:</b> {meta?.endedBy || "—"}</div>
      </div>

      <h3 style={{ marginTop: 16 }}>Totals</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <div><b>Revenue:</b> E£{Number(computed?.revenueTotal || 0).toFixed(2)}</div>
        <div><b>Delivery Fees:</b> E£{Number(computed?.deliveryFeesTotal || 0).toFixed(2)}</div>
        <div><b>Expenses:</b> E£{Number(computed?.expensesTotal || 0).toFixed(2)}</div>
        <div><b>Margin:</b> E£{Number(computed?.margin || 0).toFixed(2)}</div>
        {Object.entries(computed?.byPay || {}).map(([k,v]) => (
          <div key={k}><b>{k}:</b> E£{Number(v || 0).toFixed(2)}</div>
        ))}
        {Object.entries(computed?.byType || {}).map(([k,v]) => (
          <div key={k}><b>{k}:</b> E£{Number(v || 0).toFixed(2)}</div>
        ))}
        <div style={{ flexBasis: "100%" }} />
        <button onClick={downloadPDF} style={{ padding: "8px 12px" }}>Download PDF Report</button>
      </div>

      <h3 style={{ marginTop: 16 }}>Recent Orders (live)</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>#</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Date</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Worker</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Payment</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 6 }}>Type</th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 6 }}>Delivery</th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #ddd", padding: 6 }}>Total</th>
              <th style={{ textAlign: "center", borderBottom: "1px solid #ddd", padding: 6 }}>Done</th>
              <th style={{ textAlign: "center", borderBottom: "1px solid #ddd", padding: 6 }}>Voided</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id}>
                <td style={{ padding: 6 }}>{o.orderNo}</td>
                <td style={{ padding: 6 }}>{o.date?.toDate ? o.date.toDate().toLocaleString() : "—"}</td>
                <td style={{ padding: 6 }}>{o.worker}</td>
                <td style={{ padding: 6 }}>{o.payment}</td>
                <td style={{ padding: 6 }}>{o.orderType || "-"}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{Number(o.deliveryFee || 0).toFixed(2)}</td>
                <td style={{ padding: 6, textAlign: "right" }}>{Number(o.total || 0).toFixed(2)}</td>
                <td style={{ padding: 6, textAlign: "center" }}>{o.done ? "Yes" : "No"}</td>
                <td style={{ padding: 6, textAlign: "center" }}>{o.voided ? "Yes" : "No"}</td>
              </tr>
            ))}
            {!orders.length && (
              <tr><td colSpan={9} style={{ padding: 6, color: "#777" }}>No orders yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
