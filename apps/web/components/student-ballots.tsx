"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ClipboardCheck,
  Inbox,
  LockKeyhole,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import type { AuthenticatedStudent, StudentBallotRecord } from "@quorum/shared";
import { BallotApiError, listStudentBallots } from "@/lib/ballots-client";

const cardClass = "rounded-[22px] border border-[#ded5c5] bg-white shadow-[0_8px_30px_rgb(58_41_48/5%)]";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#8f2f43] px-5 py-3 font-bold text-white transition hover:bg-[#742437] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#cbbfae] bg-white px-5 py-3 font-semibold text-[#352b34] transition hover:bg-[#f7f2e9] disabled:opacity-50";

function scopeLabel(ballot: StudentBallotRecord): string {
  if (ballot.scopeType === "GLOBAL") return "Every eligible student";
  if (ballot.scopeType === "DEPARTMENTAL") return `Department · ${ballot.scopeTarget}`;
  if (ballot.scopeType === "SENIOR") return `Class year · Year ${ballot.scopeTarget}`;
  if (ballot.scopeType === "CLUB") return `Club · ${ballot.scopeTarget}`;
  return `Combined eligibility · ${ballot.scopeTarget?.replaceAll(";", " · ")}`;
}

function phaseDetails(ballot: StudentBallotRecord): {
  label: string;
  tone: string;
  dateLabel: string;
  action: string;
  path: string;
} {
  if (ballot.phase === "NOMINATIONS_OPEN") {
    return {
      label: "Nominations open",
      tone: "bg-[#ece9ff] text-[#6550b5]",
      dateLabel: `Voting opens ${new Date(ballot.startTime).toLocaleString()}`,
      action: "Nominate yourself",
      path: `/student/nominations?ballot=${encodeURIComponent(ballot.id)}`
    };
  }
  if (ballot.phase === "VOTING_OPEN") {
    return {
      label: "Voting open",
      tone: "bg-[#e0f4ed] text-[#17745a]",
      dateLabel: `Voting closes ${new Date(ballot.endTime).toLocaleString()}`,
      action: "Enter voting booth",
      path: `/student/vote?ballot=${encodeURIComponent(ballot.id)}`
    };
  }
  if (ballot.phase === "UPCOMING") {
    return {
      label: ballot.roundNumber > 1 ? `Runoff · Round ${ballot.roundNumber}` : "Upcoming",
      tone: "bg-[#edf3f7] text-[#36586a]",
      dateLabel: `Voting opens ${new Date(ballot.startTime).toLocaleString()}`,
      action: "View candidates",
      path: `/student/vote?ballot=${encodeURIComponent(ballot.id)}`
    };
  }
  return {
    label: "Tallying",
    tone: "bg-[#fff1cf] text-[#8a5b13]",
    dateLabel: `Voting ended ${new Date(ballot.endTime).toLocaleString()}`,
    action: "View tally status",
    path: `/student/results?ballot=${encodeURIComponent(ballot.id)}`
  };
}

function phaseBanner(ballots: StudentBallotRecord[]): {
  ballot: StudentBallotRecord;
  title: string;
  message: string;
  classes: string;
} | null {
  const voting = ballots.find(ballot => ballot.phase === "VOTING_OPEN");
  if (voting) return {
    ballot: voting,
    title: "Voting is open",
    message: `${voting.title} closes ${new Date(voting.endTime).toLocaleString()}.`,
    classes: "border-[#a8d7c9] bg-[#e3f4ee] text-[#17604c]"
  };

  const nominations = ballots.find(ballot => ballot.phase === "NOMINATIONS_OPEN");
  if (nominations) return {
    ballot: nominations,
    title: "Nominations are open",
    message: `${nominations.title} is accepting nominations before voting begins ${new Date(nominations.startTime).toLocaleString()}.`,
    classes: "border-[#cbc2f2] bg-[#ece9ff] text-[#5945a3]"
  };

  const upcomingRunoff = ballots.find(ballot => ballot.phase === "UPCOMING" && ballot.roundNumber > 1);
  if (upcomingRunoff) return {
    ballot: upcomingRunoff,
    title: "A runoff has been scheduled",
    message: `${upcomingRunoff.title} opens ${new Date(upcomingRunoff.startTime).toLocaleString()}.`,
    classes: "border-[#b8ccd7] bg-[#edf3f7] text-[#36586a]"
  };

  const tallying = ballots.find(ballot => ballot.phase === "CLOSED");
  if (tallying) return {
    ballot: tallying,
    title: "Tally verification is in progress",
    message: `${tallying.title} has closed. Results will appear after review and publication.`,
    classes: "border-[#e3ca92] bg-[#fff6d9] text-[#7a5518]"
  };
  return null;
}

function readKey(studentId: string): string {
  return `quorum-read-ballots:${studentId}`;
}

function loadReadBallots(studentId: string): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(readKey(studentId)) ?? "[]") as unknown;
    return new Set(Array.isArray(value) ? value.filter(item => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

export function StudentBallotDashboard({
  accessToken,
  user
}: {
  accessToken: string;
  user: AuthenticatedStudent;
}) {
  const router = useRouter();
  const [ballots, setBallots] = useState<StudentBallotRecord[]>([]);
  const [readBallotIds, setReadBallotIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => setReadBallotIds(loadReadBallots(user.id)), [user.id]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      setBallots(await listStudentBallots(accessToken));
    } catch (failure) {
      setError(failure instanceof BallotApiError ? failure.message : "Your ballots could not be loaded.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 20_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const unread = useMemo(
    () => ballots.filter(ballot => !readBallotIds.has(ballot.id)),
    [ballots, readBallotIds]
  );

  const markRead = (ids: string[]) => {
    const next = new Set(readBallotIds);
    ids.forEach(id => next.add(id));
    setReadBallotIds(next);
    localStorage.setItem(readKey(user.id), JSON.stringify([...next]));
  };

  const openBallot = (ballot: StudentBallotRecord) => {
    markRead([ballot.id]);
    router.push(phaseDetails(ballot).path);
  };

  const latestUnread = unread[0];
  const currentPhase = phaseBanner(ballots);

  return <>
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#8f2f43]">Student dashboard</p><h1 className="mt-2 text-4xl font-bold sm:text-5xl">Welcome, {user.fullName.split(" ")[0]}.</h1><p className="mt-2 max-w-3xl text-[#6e665f]">Your eligible ballots, current deadlines and next actions are gathered here.</p></div>
      <div className="flex items-center gap-3 rounded-2xl border border-[#ded5c5] bg-white px-4 py-3 text-sm"><ShieldCheck className="text-[#17745a]"/><div><strong className="block">Identity verified</strong><span className="text-[#6e665f]">University account confirmed</span></div>{unread.length>0&&<span aria-label={`${unread.length} unread ballot notifications`} className="grid size-6 place-items-center rounded-full bg-[#8f2f43] text-xs font-bold text-white">{unread.length}</span>}</div>
    </header>

    {currentPhase&&<section aria-live="polite" className={`mt-8 rounded-2xl border p-4 sm:flex sm:items-center sm:justify-between ${currentPhase.classes}`}>
      <div className="flex items-start gap-3"><Bell className="mt-0.5 shrink-0" size={20}/><div><strong>{currentPhase.title}</strong><p className="text-sm opacity-85">{currentPhase.message}</p></div></div>
      <button onClick={()=>openBallot(currentPhase.ballot)} className="mt-3 text-sm font-bold underline-offset-4 hover:underline sm:mt-0">View details →</button>
    </section>}

    {latestUnread&&<section role="status" className="mt-4 rounded-2xl border border-[#e3ca92] bg-[#fff6d9] p-4 sm:flex sm:items-center sm:justify-between">
      <div className="flex items-start gap-3"><div className="relative"><Bell className="mt-0.5 text-[#9a6818]" size={20}/><span className="absolute -right-1 -top-1 size-2 rounded-full bg-[#8f2f43]"/></div><div><strong>{unread.length===1?"New ballot posted":`${unread.length} new ballots posted`}</strong><p className="text-sm text-[#6e5a34]">{latestUnread.title} is now available to you.</p></div></div>
      <div className="mt-3 flex flex-wrap gap-3 sm:mt-0"><button onClick={()=>markRead(unread.map(ballot=>ballot.id))} className="text-sm font-semibold text-[#6e5a34]">Mark as read</button><button onClick={()=>openBallot(latestUnread)} className="text-sm font-bold text-[#8f2f43]">View ballot →</button></div>
    </section>}

    <section className="mt-8 flex items-center justify-between gap-4"><div><h2 className="text-2xl font-bold">Your ballots</h2><p className="text-sm text-[#6e665f]">Only ballots matching your university profile are shown.</p></div><button aria-label="Refresh ballots" onClick={()=>void load()} className={secondaryButton}><RefreshCw size={16}/><span className="hidden sm:inline">Refresh</span></button></section>

    {error&&<div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-800">{error}<button onClick={()=>void load()} className="ml-3 font-bold underline">Try again</button></div>}
    {loading?<div className={`${cardClass} mt-5 p-10 text-center text-[#6e665f]`}>Loading your eligible ballots…</div>:ballots.length===0?<div className={`${cardClass} mt-5 p-10 text-center`}><Inbox className="mx-auto text-[#8f2f43]"/><h3 className="mt-4 text-2xl font-bold">No eligible ballots yet</h3><p className="mt-2 text-[#6e665f]">A new ballot will appear here when an administrator posts one for your department, year, club or the whole university.</p></div>:<div className="mt-5 grid gap-5">{ballots.map(ballot=>{const phase=phaseDetails(ballot);const isUnread=!readBallotIds.has(ballot.id);return <article key={ballot.id} className={`${cardClass} relative p-5 transition hover:-translate-y-0.5 hover:shadow-xl sm:flex sm:items-center sm:justify-between sm:p-6`}>{isUnread&&<span className="absolute right-4 top-4 rounded-full bg-[#8f2f43] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">New</span>}<div className="pr-12"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${phase.tone}`}>{phase.label}</span><h3 className="mt-3 text-2xl font-bold">{ballot.title}</h3><p className="mt-1 text-sm text-[#6e665f]">{scopeLabel(ballot)}</p>{ballot.description&&<p className="mt-3 max-w-3xl text-sm leading-6 text-[#5f5650]">{ballot.description}</p>}<p className="mt-3 flex items-center gap-2 text-sm font-medium"><CalendarDays size={16} className="text-[#8f2f43]"/>{phase.dateLabel}</p></div><button onClick={()=>openBallot(ballot)} className={`${ballot.phase==="CLOSED"?secondaryButton:primaryButton} mt-5 shrink-0 sm:mt-0`}>{phase.action}<ArrowRight size={17}/></button></article>})}</div>}

    <section className="mt-8 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl bg-[#1b1422] p-5 text-white"><Check className="text-[#69c6aa]"/><strong className="mt-8 block text-2xl">{ballots.length}</strong><span className="text-sm text-[#bdb3c2]">Eligible ballots</span></div><div className={`${cardClass} p-5`}><LockKeyhole className="text-[#8f2f43]"/><strong className="mt-8 block text-2xl">Private ballot</strong><span className="text-sm text-[#6e665f]">Identity is separated before your choice is submitted</span></div><div className={`${cardClass} p-5`}><ClipboardCheck className="text-[#a27022]"/><strong className="mt-8 block text-2xl">Public proof</strong><span className="text-sm text-[#6e665f]">Your receipt can be checked after submission</span></div></section>
  </>;
}
