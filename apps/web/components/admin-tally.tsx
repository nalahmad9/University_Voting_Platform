"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarPlus, CheckCircle2, GitBranch, ShieldCheck } from "lucide-react";
import type { BallotRecord, BallotTallyResult, PublishedBallotResult } from "@quorum/shared";

import { createRunoffBallot, loadBallotTally, publishBallotResults } from "@/lib/admin-audit-client";
import { listAdministratorBallots } from "@/lib/ballots-client";
import { getPublishedResult } from "@/lib/results-client";
import { DateTimePicker } from "@/components/date-time-picker";
import { QuorumSelect } from "@/components/quorum-select";

const cardClass = "rounded-[22px] border border-[#ded5c5] bg-white shadow-[0_8px_30px_rgb(58_41_48/5%)]";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#8f2f43] px-5 py-3 font-bold text-white transition hover:bg-[#742437] disabled:cursor-not-allowed disabled:opacity-50";

function futureLocalDate(hours: number): string {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function AdminTallyWorkspace({ accessToken }: { accessToken: string }) {
  const [ballots, setBallots] = useState<BallotRecord[]>([]);
  const [ballotId, setBallotId] = useState("");
  const [tally, setTally] = useState<BallotTallyResult | null>(null);
  const [publication, setPublication] = useState<PublishedBallotResult | null>(null);
  const [runoffStart, setRunoffStart] = useState(()=>futureLocalDate(24));
  const [runoffEnd, setRunoffEnd] = useState(()=>futureLocalDate(72));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedBallot = useMemo(
    () => ballots.find(ballot => ballot.id === ballotId) ?? null,
    [ballots, ballotId]
  );

  const loadBallots = useCallback(async () => {
    const items = await listAdministratorBallots(accessToken);
    setBallots(items);
    setBallotId(current => current || items[0]?.id || "");
  }, [accessToken]);

  useEffect(() => {
    let active = true;
    void loadBallots().catch(failure => {
      if (active) setError(failure instanceof Error ? failure.message : "Ballots could not be loaded.");
    });
    return () => { active = false; };
  }, [loadBallots]);

  useEffect(() => {
    if (!ballotId) return;
    let active = true;
    setError("");
    setNotice("");
    setTally(null);
    setPublication(null);
    const ballot = ballots.find(item => item.id === ballotId);
    const requests: [Promise<BallotTallyResult>, Promise<PublishedBallotResult | null>] = [
      loadBallotTally(accessToken, ballotId),
      ballot?.resultsPublishedAt ? getPublishedResult(ballotId) : Promise.resolve(null)
    ];
    void Promise.all(requests)
      .then(([nextTally, nextPublication]) => {
        if (!active) return;
        setTally(nextTally);
        setPublication(nextPublication);
      })
      .catch(failure => {
        if (active) setError(failure instanceof Error ? failure.message : "The tally could not be loaded.");
      });
    return () => { active = false; };
  }, [accessToken, ballotId, ballots]);

  const publish = async () => {
    if (!ballotId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await publishBallotResults(accessToken, ballotId);
      setPublication(result);
      await loadBallots();
      setNotice(result.outcome === "TIE" ? "Results published. This exact tie now requires a runoff." : "Verified results are now public.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The results could not be published.");
    } finally {
      setBusy(false);
    }
  };

  const createRunoff = async () => {
    if (!ballotId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const runoff = await createRunoffBallot(accessToken, ballotId, {
        startTime: new Date(runoffStart).toISOString(),
        endTime: new Date(runoffEnd).toISOString()
      });
      await loadBallots();
      setPublication(await getPublishedResult(ballotId));
      setNotice(`${runoff.title} was created with only the tied candidates.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The runoff could not be created.");
    } finally {
      setBusy(false);
    }
  };

  return <>
    <header><p className="text-xs font-bold uppercase tracking-[.2em] text-[#8f2f43]">Verified tally</p><h1 className="mt-2 text-4xl font-bold sm:text-5xl">Election tally workspace</h1><p className="mt-2 max-w-3xl text-[#6e665f]">Review live totals, publish a frozen public result, and schedule a runoff when the leading total is exactly tied.</p></header>
    <section className={`${cardClass} mt-8 p-5`}><label className="font-semibold">Ballot<QuorumSelect ariaLabel="Ballot" value={ballotId} onValueChange={setBallotId} options={ballots.map(ballot=>({value:ballot.id,label:`${ballot.title}${ballot.roundNumber>1?` · Round ${ballot.roundNumber}`:""}`}))} placeholder="Choose a ballot"/></label></section>
    {error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {notice&&<p role="status" className="mt-5 rounded-xl bg-[#e3f4ee] p-4 text-[#17604c]">{notice}</p>}
    {tally&&<>
      <section className="mt-6 grid gap-4 sm:grid-cols-3">{[[tally.acceptedVotes,"Accepted votes"],[tally.quarantinedVotes,publication?"Excluded votes":"Quarantined votes"],[tally.totalVotes,"Total received"]].map(([value,label])=><div key={String(label)} className={`${cardClass} p-5`}><BarChart3 className="text-[#8f2f43]"/><strong className="mt-5 block text-3xl">{value}</strong><span className="text-sm text-[#6e665f]">{label}</span></div>)}</section>
      <section className={`${cardClass} mt-6 p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-bold">{tally.ballotTitle}</h2><p className="text-sm text-[#6e665f]">{publication?"Published totals exclude votes confirmed as quarantined.":"Quarantined votes are excluded from the live tally."}</p></div>{publication?<span className="rounded-full bg-[#e3f4ee] px-3 py-1 text-xs font-bold text-[#17604c]">Published and frozen</span>:tally.tie&&<span className="rounded-full bg-[#fff6d9] px-3 py-1 text-xs font-bold text-[#7a5518]">Exact tie detected</span>}</div>
        <div className="mt-7 space-y-5">{tally.candidates.length===0?<p className="rounded-xl bg-[#f5f1e8] p-6 text-center">No approved candidates.</p>:tally.candidates.map(candidate=><div key={candidate.candidateId}><div className="mb-2 flex justify-between gap-4"><strong>{candidate.candidateName}</strong><span>{candidate.voteCount} ({candidate.percentage}%)</span></div><div className="h-3 overflow-hidden rounded-full bg-[#eee8df]"><div className="h-full rounded-full bg-[#8f2f43]" style={{width:`${candidate.percentage}%`}}/></div></div>)}</div>
        {publication?<div className="mt-6 flex items-start gap-3 rounded-xl bg-[#e3f4ee] p-4 text-sm text-[#17604c]"><CheckCircle2 className="shrink-0" size={19}/><span>Published {new Date(publication.publishedAt).toLocaleString()}. These results are final and cannot be edited.</span></div>:<div className="mt-6 flex items-start gap-3 rounded-xl bg-[#edf3f7] p-4 text-sm text-[#344c59]"><ShieldCheck className="shrink-0" size={19}/><span>{selectedBallot?.phase!=="CLOSED"?"Results can be published after voting closes.":tally.pendingReviewCount>0?`Review ${tally.pendingReviewCount} flagged vote${tally.pendingReviewCount===1?"":"s"} before publishing the result.`:"All vote reviews are complete. The result is ready to publish."}</span></div>}
        {!publication&&<button disabled={busy||selectedBallot?.phase!=="CLOSED"||tally.pendingReviewCount>0} onClick={()=>void publish()} className={`${primaryButton} mt-5`}><CheckCircle2 size={18}/>{busy?"Publishing…":"Publish verified results"}</button>}
        {!publication&&selectedBallot?.phase!=="CLOSED"&&<p className="mt-2 text-sm text-[#6e665f]">This action unlocks when voting closes.</p>}
      </section>
    </>}

    {publication?.outcome==="TIE"&&<section className={`${cardClass} mt-6 p-6`}><div className="flex items-start gap-3"><GitBranch className="shrink-0 text-[#a27022]"/><div><h2 className="text-xl font-bold">Runoff election</h2><p className="mt-1 text-sm text-[#6e665f]">The system carries forward only the tied leaders. Eligibility, manifesto information and the self-voting restriction remain unchanged; votes and credentials start fresh.</p></div></div>{publication.runoffBallot?<div className="mt-5 rounded-xl bg-[#e3f4ee] p-4 text-[#17604c]"><strong>{publication.runoffBallot.title}</strong><p className="mt-1 text-sm">Scheduled from {new Date(publication.runoffBallot.startTime).toLocaleString()} to {new Date(publication.runoffBallot.endTime).toLocaleString()}.</p></div>:<div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="font-semibold">Voting opens<DateTimePicker ariaLabel="Runoff voting opens" value={runoffStart} onChange={setRunoffStart}/></label><label className="font-semibold">Voting closes<DateTimePicker ariaLabel="Runoff voting closes" value={runoffEnd} onChange={setRunoffEnd}/></label><div className="sm:col-span-2"><button disabled={busy||!runoffStart||!runoffEnd} onClick={()=>void createRunoff()} className={primaryButton}><CalendarPlus size={18}/>{busy?"Creating runoff…":"Create runoff ballot"}</button></div></div>}</section>}
  </>;
}
