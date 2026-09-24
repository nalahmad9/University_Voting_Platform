"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BarChart3, ListChecks, RefreshCw, ShieldCheck, Users, Vote } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdminAnomalyRecord, AdminNominationRecord, BallotRecord } from "@quorum/shared";

import { listAdminAnomalies } from "@/lib/admin-audit-client";
import { listAdminNominations } from "@/lib/admin-nominations-client";
import { listAdministratorBallots } from "@/lib/ballots-client";

const cardClass = "rounded-[22px] border border-[#ded5c5] bg-white shadow-[0_8px_30px_rgb(58_41_48/5%)]";
const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#cbbfae] bg-white px-5 py-3 font-semibold text-[#352b34] transition hover:bg-[#f7f2e9] disabled:opacity-50";

function phasePresentation(phase: BallotRecord["phase"]): { label: string; className: string } {
  if (phase === "NOMINATIONS_OPEN") return { label: "Nominations open", className: "bg-[#ece9ff] text-[#6550b5]" };
  if (phase === "UPCOMING") return { label: "Upcoming", className: "bg-[#edf3f7] text-[#36586a]" };
  if (phase === "VOTING_OPEN") return { label: "Voting open", className: "bg-[#e0f4ed] text-[#17745a]" };
  return { label: "Closed", className: "bg-[#ece9e5] text-[#5e5752]" };
}

function scopeLabel(ballot: BallotRecord): string {
  if (ballot.scopeType === "GLOBAL") return "Every eligible student";
  if (ballot.scopeType === "DEPARTMENTAL") return `Department · ${ballot.scopeTarget}`;
  if (ballot.scopeType === "SENIOR") return `Class year · Year ${ballot.scopeTarget}`;
  if (ballot.scopeType === "CLUB") return `Club · ${ballot.scopeTarget}`;
  return `Combined eligibility · ${ballot.scopeTarget?.replaceAll(";", " · ")}`;
}

export function AdminOperationsOverview({ accessToken }: { accessToken: string }) {
  const router = useRouter();
  const [ballots, setBallots] = useState<BallotRecord[]>([]);
  const [nominations, setNominations] = useState<AdminNominationRecord[]>([]);
  const [anomalies, setAnomalies] = useState<AdminAnomalyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextBallots, nextNominations, nextAnomalies] = await Promise.all([
        listAdministratorBallots(accessToken),
        listAdminNominations(accessToken),
        listAdminAnomalies(accessToken)
      ]);
      setBallots(nextBallots);
      setNominations(nextNominations);
      setAnomalies(nextAnomalies);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Election operations could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  const pendingNominations = nominations.filter(item => item.nominationStatus === "PENDING").length;
  const pendingAnomalies = anomalies.filter(item => item.reviewStatus === "PENDING").length;
  const openVoting = ballots.filter(ballot => ballot.phase === "VOTING_OPEN").length;
  const unpublishedClosed = ballots.filter(ballot => ballot.phase === "CLOSED" && !ballot.resultsPublishedAt).length;
  const metrics: Array<{ value: number; label: string; icon: LucideIcon }> = [
    { value: ballots.length, label: "Ballots posted", icon: Vote },
    { value: openVoting, label: "Voting now open", icon: Vote },
    { value: pendingNominations, label: "Nominations pending", icon: Users },
    { value: pendingAnomalies, label: "Flagged votes pending", icon: ShieldCheck }
  ];
  const nextActions = useMemo(() => [
    { count: pendingNominations, label: "nominations awaiting review", path: "/admin/ballots", icon: Users },
    { count: pendingAnomalies, label: "flagged votes awaiting review", path: "/admin/anomalies", icon: ShieldCheck },
    { count: unpublishedClosed, label: "closed ballots awaiting publication", path: "/admin/results", icon: BarChart3 }
  ].filter(item => item.count > 0), [pendingNominations, pendingAnomalies, unpublishedClosed]);

  return <>
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#8f2f43]">Administrator workspace</p><h1 className="mt-2 text-4xl font-bold sm:text-5xl">Election operations</h1><p className="mt-2 max-w-3xl text-[#6e665f]">Monitor current ballot phases and review the actions that require attention.</p></div><button disabled={loading} onClick={()=>void load()} className={secondaryButton}><RefreshCw size={16}/>{loading?"Refreshing…":"Refresh"}</button></header>
    {error&&<p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({value,label,icon:Icon})=><div key={label} className={`${cardClass} p-5`}><Icon className="text-[#8f2f43]"/><strong className="mt-5 block text-3xl">{loading?"—":String(value)}</strong><span className="text-sm text-[#6e665f]">{label}</span></div>)}</section>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_.75fr]"><section className={`${cardClass} overflow-hidden`}><div className="border-b border-[#ded5c5] p-6"><h2 className="text-2xl font-bold">Ballots at a glance</h2></div>{loading?<div className="p-8 text-center text-[#6e665f]">Loading ballots…</div>:ballots.length===0?<div className="p-8 text-center text-[#6e665f]">No ballots have been posted.</div>:<div className="divide-y divide-[#e4dccf]">{ballots.map(ballot=>{const phase=phasePresentation(ballot.phase);return <div key={ballot.id} className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><strong>{ballot.title}</strong><p className="mt-1 text-sm text-[#6e665f]">{scopeLabel(ballot)} · {ballot.candidateCount} candidate{ballot.candidateCount===1?"":"s"}</p></div><span className={`inline-flex justify-self-start rounded-full px-3 py-1 text-xs font-bold ${phase.className}`}>{phase.label}</span></div>})}</div>}</section><aside className={`${cardClass} p-6`}><div className="flex items-center gap-3"><ListChecks className="text-[#a27022]"/><h2 className="text-2xl font-bold">Next actions</h2></div>{loading?<p className="mt-5 text-sm text-[#6e665f]">Checking election activity…</p>:nextActions.length===0?<div className="mt-5 rounded-xl bg-[#e3f4ee] p-4 text-sm text-[#17604c]"><strong>No pending actions</strong><p className="mt-1">All current reviews are complete.</p></div>:<div className="mt-5 space-y-3">{nextActions.map(({count,label,path,icon:Icon})=><button key={path} onClick={()=>router.push(path)} className="flex w-full items-center gap-3 rounded-xl bg-[#f5f1e8] p-4 text-left transition hover:bg-[#eee7dc]"><Icon className="shrink-0 text-[#8f2f43]" size={19}/><span className="flex-1"><strong>{count}</strong> {label}</span><ArrowRight size={17}/></button>)}</div>}</aside></div>
  </>;
}
