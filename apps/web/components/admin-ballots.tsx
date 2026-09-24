"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown, Plus, RefreshCw, Vote } from "lucide-react";
import type { BallotRecord, PersistedBallotScope } from "@quorum/shared";
import { BallotApiError, createBallot, listAdministratorBallots } from "@/lib/ballots-client";
import { AdminNominationReview } from "@/components/admin-nomination-review";
import { DateTimePicker } from "@/components/date-time-picker";
import { QuorumSelect } from "@/components/quorum-select";

const fieldClass = "mt-2 w-full rounded-xl border border-[#d8cebd] bg-white px-4 py-3 text-[#211a22] outline-none focus:border-[#8f2f43] focus:ring-2 focus:ring-[#8f2f43]/20";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#8f2f43] px-5 py-3 font-bold text-white transition hover:bg-[#742437] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#cbbfae] bg-white px-5 py-3 font-semibold text-[#352b34] transition hover:bg-[#f7f2e9] disabled:opacity-50";
const cardClass = "rounded-[22px] border border-[#ded5c5] bg-white shadow-[0_8px_30px_rgb(58_41_48/5%)]";

function localDateTimeValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function initialVotingTime(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(daysFromNow === 3 ? 9 : 23, 0, 0, 0);
  return localDateTimeValue(date);
}

function defaultTarget(): string {
  return "";
}

function scopeLabel(scope: PersistedBallotScope, target: string | null): string {
  if (scope === "GLOBAL") return "Every eligible student";
  if (scope === "DEPARTMENTAL") return `Department · ${target}`;
  if (scope === "SENIOR") return `Class year · Year ${target}`;
  if (scope === "CLUB") return `Club · ${target}`;
  return `Combined · ${target}`;
}

function phasePresentation(phase: BallotRecord["phase"]): { label: string; className: string } {
  if (phase === "NOMINATIONS_OPEN") return { label: "Nominations open", className: "bg-[#ece9ff] text-[#6550b5]" };
  if (phase === "UPCOMING") return { label: "Runoff scheduled", className: "bg-[#edf3f7] text-[#36586a]" };
  if (phase === "VOTING_OPEN") return { label: "Voting open", className: "bg-[#e0f4ed] text-[#17745a]" };
  return { label: "Closed", className: "bg-[#ece9e5] text-[#5e5752]" };
}

export function AdminBallotBuilder({ accessToken }: { accessToken: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"details" | "schedule" | "review">("details");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scopeType, setScopeType] = useState<PersistedBallotScope>("GLOBAL");
  const [scopeTarget, setScopeTarget] = useState("");
  const [startTime, setStartTime] = useState(() => initialVotingTime(3));
  const [endTime, setEndTime] = useState(() => initialVotingTime(4));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const chooseScope = (scope: PersistedBallotScope) => {
    setScopeType(scope);
    setScopeTarget(defaultTarget());
  };

  const continueFromDetails = () => {
    if (title.trim().length < 5) {
      setError("Enter a ballot title containing at least five characters.");
      return;
    }
    setError("");
    setStep("schedule");
  };

  const continueFromSchedule = () => {
    if (scopeType !== "GLOBAL" && !scopeTarget.trim()) {
      setError("Enter the eligibility target for this ballot.");
      return;
    }
    if (!startTime || !endTime || new Date(startTime) >= new Date(endTime)) {
      setError("Voting must close after it opens.");
      return;
    }
    setError("");
    setStep("review");
  };

  const save = async () => {
    setSubmitting(true);
    setError("");
    try {
      await createBallot(accessToken, {
        title: title.trim(),
        description: description.trim() || undefined,
        scopeType,
        scopeTarget: scopeType === "GLOBAL" ? null : scopeTarget.trim(),
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString()
      });
      router.push("/admin/ballots");
    } catch (failure) {
      setError(failure instanceof BallotApiError ? failure.message : "The ballot could not be posted.");
    } finally {
      setSubmitting(false);
    }
  };

  return <>
    <header><p className="text-xs font-bold uppercase tracking-[.2em] text-[#8f2f43]">Ballot builder</p><h1 className="mt-2 text-4xl font-bold sm:text-5xl">Post a new ballot</h1><p className="mt-2 max-w-3xl text-[#6e665f]">Posting opens nominations immediately. Choose when voting opens and closes.</p></header>
    <div className="mt-8 grid grid-cols-3 gap-2 rounded-xl bg-[#e9e1d4] p-1 text-center text-sm font-bold">{[["details","1. Details"],["schedule","2. Scope & schedule"],["review","3. Review"]].map(([value,label])=><div key={value} className={`rounded-lg px-3 py-3 ${step===value?"bg-white text-[#211a22] shadow-sm":"text-[#756d66]"}`}>{label}</div>)}</div>
    <section className={`${cardClass} mt-5 p-6 sm:p-8`}>
      {step==="details"&&<><h2 className="text-3xl font-bold">Ballot details</h2><label className="mt-6 block font-semibold">Ballot title<input value={title} maxLength={150} onChange={event=>setTitle(event.target.value)} className={fieldClass}/></label><label className="mt-5 block font-semibold">Description<textarea value={description} maxLength={2000} onChange={event=>setDescription(event.target.value)} rows={5} className={fieldClass}/></label><div className="mt-6 flex justify-end"><button onClick={continueFromDetails} className={primaryButton}>Continue <ArrowRight size={17}/></button></div></>}
      {step==="schedule"&&<><h2 className="text-3xl font-bold">Scope and schedule</h2><div className="mt-6 grid gap-5 sm:grid-cols-2"><label className="font-semibold">Eligibility scope<QuorumSelect ariaLabel="Eligibility scope" value={scopeType} onValueChange={value=>chooseScope(value as PersistedBallotScope)} options={[{value:"GLOBAL",label:"Global — every eligible student"},{value:"DEPARTMENTAL",label:"Department"},{value:"SENIOR",label:"Class year"},{value:"CLUB",label:"Club or organization"},{value:"COMBINED",label:"Combined rules"}]}/></label>{scopeType!=="GLOBAL"&&<label className="font-semibold">Scope target<input value={scopeTarget} onChange={event=>setScopeTarget(event.target.value)} className={fieldClass}/></label>}<label className="font-semibold">Voting opens<DateTimePicker ariaLabel="Voting opens" value={startTime} onChange={setStartTime}/></label><label className="font-semibold">Voting closes<DateTimePicker ariaLabel="Voting closes" value={endTime} onChange={setEndTime}/></label></div><div className="mt-5 rounded-xl border border-[#e3ca92] bg-[#fff6d9] p-4 text-sm text-[#6e5a34]">Nominations open as soon as you post this ballot and close when voting begins. Results remain unpublished until administrator review.</div><div className="mt-6 flex justify-between"><button onClick={()=>setStep("details")} className={secondaryButton}><ArrowLeft size={17}/>Back</button><button onClick={continueFromSchedule} className={primaryButton}>Review ballot <ArrowRight size={17}/></button></div></>}
      {step==="review"&&<><h2 className="text-3xl font-bold">Review before posting</h2><div className="mt-6 grid gap-4 rounded-2xl bg-[#f5f1e8] p-5 sm:grid-cols-2"><div><span className="text-sm text-[#7c746d]">Ballot</span><strong className="block">{title}</strong></div><div><span className="text-sm text-[#7c746d]">Eligibility</span><strong className="block">{scopeLabel(scopeType,scopeTarget||null)}</strong></div><div><span className="text-sm text-[#7c746d]">Nominations</span><strong className="block">Open immediately until voting starts</strong></div><div><span className="text-sm text-[#7c746d]">Voting</span><strong className="block">{new Date(startTime).toLocaleString()} – {new Date(endTime).toLocaleString()}</strong></div></div><div className="mt-5 rounded-xl border border-[#e3ca92] bg-[#fff6d9] p-4 text-sm">Eligible students will see the ballot and a new-ballot notice on their dashboard as soon as it is posted.</div><div className="mt-6 flex justify-between"><button onClick={()=>setStep("schedule")} className={secondaryButton}><ArrowLeft size={17}/>Back</button><button disabled={submitting} onClick={()=>void save()} className={primaryButton}>{submitting?"Posting…":"Post ballot"}</button></div></>}
      {error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    </section>
  </>;
}

export function AdminBallotList({ accessToken }: { accessToken: string }) {
  const router = useRouter();
  const [ballots, setBallots] = useState<BallotRecord[]>([]);
  const [open, setOpen] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setBallots(await listAdministratorBallots(accessToken));
    } catch (failure) {
      setError(failure instanceof BallotApiError ? failure.message : "Ballots could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(()=>{void load();},[accessToken]);

  return <>
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#8f2f43]">Ballot management</p><h1 className="mt-2 text-4xl font-bold sm:text-5xl">Manage ballots</h1><p className="mt-2 text-[#6e665f]">Review posted ballots, schedules and candidate activity.</p></div><button onClick={()=>router.push("/admin/ballots/new")} className={primaryButton}><Plus size={18}/>Post ballot</button></header>
    <AdminNominationReview accessToken={accessToken}/>
    {error&&<div role="alert" className="mt-8 rounded-xl bg-red-50 p-4 text-red-800">{error}<button onClick={()=>void load()} className="ml-3 font-bold underline">Try again</button></div>}
    {loading?<div className={`${cardClass} mt-8 p-10 text-center text-[#6e665f]`}>Loading ballots…</div>:ballots.length===0?<div className={`${cardClass} mt-8 p-10 text-center`}><Vote className="mx-auto text-[#8f2f43]"/><h2 className="mt-4 text-2xl font-bold">No ballots posted yet</h2><p className="mt-2 text-[#6e665f]">Create the first ballot to open nominations.</p><button onClick={()=>router.push("/admin/ballots/new")} className={`${primaryButton} mt-5`}><Plus size={18}/>Post first ballot</button></div>:<div className="mt-8 space-y-4">{ballots.map(ballot=>{const phase=phasePresentation(ballot.phase);return <section key={ballot.id} className={`${cardClass} overflow-hidden`}><button onClick={()=>setOpen(open===ballot.id?"":ballot.id)} className="flex w-full items-center justify-between gap-4 p-5 text-left"><div><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${phase.className}`}>{phase.label}</span><h2 className="mt-3 text-2xl font-bold">{ballot.title}</h2><p className="mt-1 text-sm text-[#6e665f]">{scopeLabel(ballot.scopeType,ballot.scopeTarget)}</p></div><ChevronDown className={`transition ${open===ballot.id?"rotate-180":""}`}/></button>{open===ballot.id&&<div className="border-t border-[#ded5c5] bg-[#fcfaf6] p-5"><p className="text-[#5f5650]">{ballot.description||"No description provided."}</p><div className="mt-5 grid gap-4 sm:grid-cols-3"><div className="rounded-xl bg-white p-4"><CalendarDays className="text-[#8f2f43]" size={18}/><span className="mt-3 block text-xs text-[#7d756e]">Voting opens</span><strong>{new Date(ballot.startTime).toLocaleString()}</strong></div><div className="rounded-xl bg-white p-4"><CalendarDays className="text-[#8f2f43]" size={18}/><span className="mt-3 block text-xs text-[#7d756e]">Voting closes</span><strong>{new Date(ballot.endTime).toLocaleString()}</strong></div><div className="rounded-xl bg-white p-4"><Vote className="text-[#8f2f43]" size={18}/><span className="mt-3 block text-xs text-[#7d756e]">Candidates</span><strong>{ballot.candidateCount}</strong></div></div></div>}</section>})}<button onClick={()=>void load()} className={`${secondaryButton} mt-3`}><RefreshCw size={16}/>Refresh</button></div>}
  </>;
}
