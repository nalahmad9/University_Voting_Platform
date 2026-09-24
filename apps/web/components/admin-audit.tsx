"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, RefreshCw, ShieldCheck } from "lucide-react";
import type { AdminAnomalyRecord } from "@quorum/shared";

import { listAdminAnomalies, reviewAdminAnomaly } from "@/lib/admin-audit-client";

const cardClass = "rounded-[22px] border border-[#ded5c5] bg-white shadow-[0_8px_30px_rgb(58_41_48/5%)]";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#8f2f43] px-5 py-3 font-bold text-white disabled:opacity-50";
const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#cbbfae] bg-white px-5 py-3 font-semibold text-[#352b34] disabled:opacity-50";
const fieldClass = "mt-2 w-full rounded-xl border border-[#d8cebd] bg-white px-4 py-3";

function reviewLabel(status: AdminAnomalyRecord["reviewStatus"]): string {
  if (status === "RESTORED") return "Restored";
  if (status === "CONFIRMED") return "Quarantine confirmed";
  return "Awaiting review";
}

export function AdminAnomalyBoard({ accessToken }: { accessToken: string }) {
  const [items, setItems] = useState<AdminAnomalyRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await listAdminAnomalies(accessToken);
      setItems(next);
      setSelectedId(current => next.some(item => item.id === current) ? current : next[0]?.id ?? "");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Anomaly reviews could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);
  const selected = items.find(item => item.id === selectedId);

  const decide = async (decision: "RESTORE" | "CONFIRM") => {
    if (!selected || reason.trim().length < 10) return;
    setSaving(true);
    setError("");
    try {
      await reviewAdminAnomaly(accessToken, selected.id, decision, reason.trim());
      setReason("");
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The review decision could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return <>
    <header><p className="text-xs font-bold uppercase tracking-[.2em] text-[#8f2f43]">Ballot integrity</p><h1 className="mt-2 text-4xl font-bold sm:text-5xl">Anomaly review</h1><p className="mt-2 max-w-3xl text-[#6e665f]">Inspect anonymous risk signals and document every decision to restore or exclude a flagged vote.</p></header>
    {error&&<p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {loading?<div className={`${cardClass} mt-8 p-10 text-center`}>Loading anomaly reviews…</div>:items.length===0?<div className={`${cardClass} mt-8 p-10 text-center`}><ShieldCheck className="mx-auto text-[#17745a]"/><h2 className="mt-4 text-2xl font-bold">No flagged votes</h2><p className="mt-2 text-[#6e665f]">Votes requiring review will appear here.</p></div>:<div className="mt-8 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
      <section className={`${cardClass} overflow-hidden`}><div className="border-b border-[#ded5c5] p-5"><h2 className="text-xl font-bold">Review queue</h2></div>{items.map(item=><button key={item.id} onClick={()=>{setSelectedId(item.id);setReason("");}} className={`block w-full border-b border-[#eee7dc] p-4 text-left ${selectedId===item.id?"bg-[#f7f0f2]":"hover:bg-[#fbf8f1]"}`}><span className="text-xs font-bold uppercase text-[#8f2f43]">{reviewLabel(item.reviewStatus)}</span><strong className="mt-1 block">{item.ballotTitle}</strong><span className="text-sm text-[#6e665f]">Risk score {item.anomalyScore.toFixed(2)} · Receipt {item.receiptPrefix}</span></button>)}</section>
      {selected&&<section className={`${cardClass} p-6`}>
        <div className="flex justify-between gap-4"><div><span className="inline-flex rounded-full bg-[#fdebea] px-3 py-1 text-xs font-bold text-[#a4382e]">{reviewLabel(selected.reviewStatus)}</span><h2 className="mt-3 text-2xl font-bold">Anonymous risk event</h2><p className="text-sm text-[#6e665f]">{selected.ballotTitle} · {new Date(selected.recordedAt).toLocaleString()}</p></div><strong className="font-mono text-3xl text-[#a4382e]">{selected.anomalyScore.toFixed(2)}</strong></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">{[["Completion time",selected.riskFeatures.completionDurationBand.replaceAll("_"," ")],["Request activity",selected.riskFeatures.requestRateBucket],["Device class",selected.riskFeatures.deviceClass],["Replay signal",selected.riskFeatures.replayIndicator?"Present":"None"]].map(([label,value])=><div key={label} className="rounded-xl bg-[#f5f1e8] p-4"><span className="text-xs text-[#756d66]">{label}</span><strong className="block capitalize">{value}</strong></div>)}</div>
        <p className="mt-4 text-xs text-[#6e665f]">Only coarse, anonymous risk signals are available for review. Voter identity and candidate choice remain unavailable.</p>
        {selected.reviewStatus==="PENDING"?<><label className="mt-6 block font-semibold">Decision reason<textarea value={reason} onChange={event=>setReason(event.target.value)} rows={4} className={fieldClass} placeholder="Explain the evidence for this decision…"/></label><p className="mt-2 text-xs text-[#6e665f]">Enter at least 10 characters.</p><div className="mt-4 flex flex-wrap gap-3"><button disabled={saving||reason.trim().length<10} onClick={()=>void decide("CONFIRM")} className={secondaryButton}><AlertTriangle size={17}/>Confirm exclusion</button><button disabled={saving||reason.trim().length<10} onClick={()=>void decide("RESTORE")} className={primaryButton}><Check size={17}/>Restore to tally</button></div></>:<div className="mt-6 rounded-xl bg-[#edf3f7] p-4"><strong>Decision recorded</strong><p className="mt-1 text-sm">{selected.reviewReason}</p><p className="mt-2 text-xs">{selected.reviewedBy} · {selected.reviewedAt&&new Date(selected.reviewedAt).toLocaleString()}</p></div>}
      </section>}
    </div>}
    <button onClick={()=>void load()} className={`${secondaryButton} mt-5`}><RefreshCw size={16}/>Refresh</button>
  </>;
}
