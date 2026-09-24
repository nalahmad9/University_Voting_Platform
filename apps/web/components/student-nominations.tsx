"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Megaphone,
  RefreshCw,
  UserCheck
} from "lucide-react";
import type {
  AuthenticatedStudent,
  StudentNominationOpportunity,
  StudentNominationRecord
} from "@quorum/shared";
import {
  listNominationOpportunities,
  NominationApiError,
  submitNomination,
  withdrawNomination
} from "@/lib/nominations-client";
import { QuorumSelect } from "@/components/quorum-select";

const cardClass = "rounded-[22px] border border-[#ded5c5] bg-white shadow-[0_8px_30px_rgb(58_41_48/5%)]";
const fieldClass = "mt-2 w-full rounded-xl border border-[#d8cebd] bg-white px-4 py-3 text-[#211a22] outline-none focus:border-[#8f2f43] focus:ring-2 focus:ring-[#8f2f43]/20";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#8f2f43] px-5 py-3 font-bold text-white transition hover:bg-[#742437] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#cbbfae] bg-white px-5 py-3 font-semibold text-[#352b34] transition hover:bg-[#f7f2e9] disabled:opacity-50";

function initialsFor(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function statusPresentation(status: StudentNominationRecord["nominationStatus"]): { label: string; className: string } {
  if (status === "APPROVED") return { label: "Approved", className: "bg-[#e0f4ed] text-[#17745a]" };
  if (status === "REJECTED") return { label: "Changes required", className: "bg-[#fde8e6] text-[#a4382e]" };
  if (status === "WITHDRAWN") return { label: "Withdrawn", className: "bg-[#ece9e5] text-[#5e5752]" };
  return { label: "Under review", className: "bg-[#fbefce] text-[#8f671d]" };
}

function scopeLabel(opportunity: StudentNominationOpportunity): string {
  const ballot = opportunity.ballot;
  if (ballot.scopeType === "GLOBAL") return "All eligible students";
  if (ballot.scopeType === "DEPARTMENTAL") return `Department: ${ballot.scopeTarget}`;
  if (ballot.scopeType === "SENIOR") return `Class year: Year ${ballot.scopeTarget}`;
  if (ballot.scopeType === "CLUB") return `Club: ${ballot.scopeTarget}`;
  return "Combined eligibility rules";
}

export function StudentNominations({
  accessToken,
  user
}: {
  accessToken: string;
  user: AuthenticatedStudent;
}) {
  const searchParams = useSearchParams();
  const requestedBallotId = searchParams.get("ballot");
  const [opportunities, setOpportunities] = useState<StudentNominationOpportunity[]>([]);
  const [selectedBallotId, setSelectedBallotId] = useState(requestedBallotId ?? "");
  const [statement, setStatement] = useState("");
  const [manifesto, setManifesto] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listNominationOpportunities(accessToken);
      setOpportunities(result);
      const requested = result.find(item => item.ballot.id === requestedBallotId);
      const firstOpen = result.find(item => item.canNominate || item.nomination);
      setSelectedBallotId(current => requested?.ballot.id ?? (result.some(item => item.ballot.id === current) ? current : firstOpen?.ballot.id ?? ""));
    } catch (failure) {
      setError(failure instanceof NominationApiError ? failure.message : "Nomination opportunities could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [accessToken]);

  const selected = useMemo(
    () => opportunities.find(item => item.ballot.id === selectedBallotId),
    [opportunities, selectedBallotId]
  );

  useEffect(() => {
    setStatement(selected?.nomination?.candidacyStatement ?? "");
    setManifesto(selected?.nomination?.manifestoText ?? "");
    setAgreed(false);
    setError("");
  }, [selectedBallotId]);

  const replaceNomination = (nomination: StudentNominationRecord) => {
    setOpportunities(current => current.map(item => item.ballot.id === nomination.ballotId
      ? { ...item, nomination, canNominate: nomination.nominationStatus === "WITHDRAWN" }
      : item));
  };

  const submit = async () => {
    if (!selected) return;
    if (statement.trim().length < 20) {
      setError("Your candidacy statement must contain at least 20 characters.");
      return;
    }
    if (manifesto.trim().length < 100) {
      setError("Your manifesto must contain at least 100 characters.");
      return;
    }
    if (!agreed) {
      setError("Confirm the declaration before submitting your nomination.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      replaceNomination(await submitNomination(accessToken, {
        ballotId: selected.ballot.id,
        candidacyStatement: statement.trim(),
        manifestoText: manifesto.trim()
      }));
    } catch (failure) {
      setError(failure instanceof NominationApiError ? failure.message : "Your nomination could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };

  const withdraw = async () => {
    if (!selected?.nomination) return;
    setSubmitting(true);
    setError("");
    try {
      replaceNomination(await withdrawNomination(accessToken, selected.nomination.id));
    } catch (failure) {
      setError(failure instanceof NominationApiError ? failure.message : "Your nomination could not be withdrawn.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <><header><p className="text-xs font-bold uppercase tracking-[.2em] text-[#8f2f43]">Nomination centre</p><h1 className="mt-2 text-4xl font-bold sm:text-5xl">Your nominations</h1></header><div className={`${cardClass} mt-8 p-10 text-center text-[#6e665f]`}>Loading nomination opportunities…</div></>;

  if (!selected) return <><header><p className="text-xs font-bold uppercase tracking-[.2em] text-[#8f2f43]">Nomination centre</p><h1 className="mt-2 text-4xl font-bold sm:text-5xl">Your nominations</h1><p className="mt-2 text-[#6e665f]">Eligible nomination opportunities will appear here.</p></header>{error&&<div role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-800">{error}</div>}<div className={`${cardClass} mt-8 p-10 text-center`}><Megaphone className="mx-auto text-[#8f2f43]"/><h2 className="mt-4 text-2xl font-bold">No nomination opportunities</h2><p className="mt-2 text-[#6e665f]">There are no eligible ballots available for nomination right now.</p><button onClick={()=>void load()} className={`${secondaryButton} mt-5`}><RefreshCw size={16}/>Refresh</button></div></>;

  const nomination = selected.nomination;
  const isTracking = nomination && ["PENDING", "APPROVED"].includes(nomination.nominationStatus);
  const status = nomination ? statusPresentation(nomination.nominationStatus) : null;

  return <>
    <header><p className="text-xs font-bold uppercase tracking-[.2em] text-[#8f2f43]">Nomination centre</p><h1 className="mt-2 text-4xl font-bold sm:text-5xl">{isTracking?"Your nomination":"Nominate yourself"}</h1><p className="mt-2 max-w-3xl text-[#6e665f]">{isTracking?"Track the review status of your submitted nomination.":"Submit your candidacy statement and manifesto for an eligible ballot."}</p></header>

    {opportunities.length>1&&<label className="mt-7 block max-w-xl font-semibold">Choose a ballot<QuorumSelect ariaLabel="Choose a ballot" value={selectedBallotId} onValueChange={setSelectedBallotId} options={opportunities.map(item=>({value:item.ballot.id,label:item.ballot.title}))}/></label>}
    {error&&<div role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-800">{error}</div>}

    {isTracking&&nomination&&status?<section className={`${cardClass} mt-8 overflow-hidden`}><div className="bg-[#1b1422] p-6 text-white"><div className="flex items-center justify-between gap-4"><div><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${status.className}`}>{status.label}</span><h2 className="mt-4 text-3xl font-bold">{selected.ballot.title}</h2><p className="mt-2 text-[#bdb3c2]">Submitted {new Date(nomination.createdAt).toLocaleString()}</p></div><FileCheck2 size={44} className="text-[#d9ad5f]"/></div></div><div className="grid gap-7 p-6 lg:grid-cols-[1fr_.65fr]"><div><h3 className="font-bold">Candidacy statement</h3><p className="mt-2 text-[#5f5650]">{nomination.candidacyStatement}</p><h3 className="mt-6 font-bold">Manifesto</h3><p className="mt-2 whitespace-pre-line leading-7 text-[#5f5650]">{nomination.manifestoText}</p></div><aside className="rounded-2xl bg-[#f4efe6] p-5"><h3 className="font-bold">Review progress</h3><div className="mt-5 space-y-5 text-sm"><div className="flex gap-3"><CheckCircle2 className="text-[#17745a]" size={19}/><div><strong>Submitted</strong><p className="text-[#6e665f]">Eligibility confirmed</p></div></div><div className="flex gap-3"><Clock3 className={nomination.nominationStatus==="APPROVED"?"text-[#17745a]":"text-[#a27022]"} size={19}/><div><strong>{nomination.nominationStatus==="APPROVED"?"Approved":"Administrative review"}</strong><p className="text-[#6e665f]">{nomination.nominationStatus==="APPROVED"?"Your candidate profile is approved.":"Your submission is waiting for review."}</p></div></div></div>{nomination.nominationStatus==="PENDING"&&<button disabled={submitting} onClick={()=>void withdraw()} className="mt-7 text-sm font-bold text-[#a4382e]">{submitting?"Withdrawing…":"Withdraw nomination"}</button>}</aside></div></section>:!selected.canNominate?<section className={`${cardClass} mt-8 p-8 text-center`}><Clock3 className="mx-auto text-[#a27022]" size={36}/><span className="mt-5 inline-flex rounded-full bg-[#ece9e5] px-3 py-1 text-xs font-bold text-[#5e5752]">Nominations closed</span><h2 className="mt-4 text-3xl font-bold">{selected.ballot.title}</h2><p className="mx-auto mt-3 max-w-2xl text-[#6e665f]">The nomination period for this ballot ended when voting opened. You can still follow the ballot from your dashboard.</p>{nomination?.nominationStatus==="REJECTED"&&<div className="mx-auto mt-5 max-w-2xl rounded-xl bg-red-50 p-4 text-sm text-red-800"><strong>Previous submission was not approved</strong><p className="mt-1">{nomination.rejectionReason||"No rejection reason was provided."}</p></div>}</section>:<div className="mt-8 grid gap-6 lg:grid-cols-[.72fr_1.28fr]"><aside className={`${cardClass} h-fit p-6`}><div className="flex items-center gap-4"><div className="grid size-16 place-items-center rounded-2xl bg-[#8f2f43] text-xl font-bold text-white">{initialsFor(user.fullName)}</div><div><h2 className="text-2xl font-bold">{user.fullName}</h2><p className="text-sm text-[#6e665f]">ID #{user.universityId}</p></div></div><dl className="mt-6 grid gap-4 text-sm"><div><dt className="text-[#837a72]">Department</dt><dd className="font-semibold">{user.department}</dd></div><div><dt className="text-[#837a72]">Class year</dt><dd className="font-semibold">Year {user.classYear}</dd></div><div><dt className="text-[#837a72]">Registered clubs</dt><dd className="font-semibold">{user.clubMemberships.join(" · ")||"None registered"}</dd></div></dl><div className="mt-6 flex gap-2 rounded-xl bg-[#e5f4ef] p-3 text-sm text-[#17604c]"><UserCheck className="shrink-0" size={18}/>Eligible for this ballot</div></aside><form onSubmit={event=>{event.preventDefault();void submit();}} className={`${cardClass} p-6 sm:p-8`}><div className="flex items-start justify-between gap-4"><div><span className="inline-flex rounded-full bg-[#ece9ff] px-3 py-1 text-xs font-bold text-[#6550b5]">Nominations open</span><h2 className="mt-3 text-3xl font-bold">{selected.ballot.title}</h2><p className="mt-1 text-sm text-[#6e665f]">{scopeLabel(selected)} · Closes {new Date(selected.ballot.startTime).toLocaleString()}</p></div><Megaphone className="text-[#8f2f43]"/></div>{nomination?.nominationStatus==="REJECTED"&&<div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-800"><strong>Changes requested</strong><p className="mt-1">{nomination.rejectionReason||"Review your submission and send it again."}</p></div>}{nomination?.nominationStatus==="WITHDRAWN"&&<div className="mt-6 rounded-xl bg-[#f4efe6] p-4 text-sm">Your previous nomination was withdrawn. You may submit it again while nominations remain open.</div>}<label className="mt-7 block font-semibold">Candidacy statement <span className="font-normal text-[#766e67]">({statement.length}/140)</span><input maxLength={140} value={statement} onChange={event=>setStatement(event.target.value)} placeholder="One clear sentence describing your candidacy" className={fieldClass}/></label><label className="mt-5 block font-semibold">Manifesto <span className="font-normal text-[#766e67]">({manifesto.length}/2000)</span><textarea maxLength={2000} rows={9} value={manifesto} onChange={event=>setManifesto(event.target.value)} placeholder="Explain your priorities, commitments and how you will report progress." className={fieldClass}/></label><label className="mt-5 flex items-start gap-3 rounded-xl bg-[#f5f1e8] p-4 text-sm"><input type="checkbox" checked={agreed} onChange={event=>setAgreed(event.target.checked)} className="mt-1 size-4 accent-[#8f2f43]"/><span>I confirm that this manifesto is my own submission and may be published if approved.</span></label><div className="mt-6 flex justify-end"><button disabled={submitting} type="submit" className={primaryButton}>{submitting?"Submitting…":"Submit nomination"}<ArrowRight size={17}/></button></div></form></div>}
  </>;
}
