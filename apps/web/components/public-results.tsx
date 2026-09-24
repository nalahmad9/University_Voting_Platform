"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, Clock3, Crown, GitBranch, ShieldCheck } from "lucide-react";
import type { PublishedBallotResult } from "@quorum/shared";

import { listPublishedResults } from "@/lib/results-client";
import { QuorumSelect } from "@/components/quorum-select";

const cardClass = "rounded-[22px] border border-[#ded5c5] bg-white shadow-[0_8px_30px_rgb(58_41_48/5%)]";

function outcomeText(result: PublishedBallotResult): { title: string; detail: string; tone: string } {
  if (result.outcome === "NO_VOTES") {
    return {
      title: "No winner declared",
      detail: "No accepted votes were recorded for this ballot.",
      tone: "bg-[#f5f1e8] text-[#5f5650]"
    };
  }
  if (result.outcome === "TIE") {
    const names = result.candidates
      .filter(candidate => result.tiedCandidateIds.includes(candidate.candidateId))
      .map(candidate => candidate.candidateName)
      .join(" and ");
    return {
      title: "Exact tie — runoff required",
      detail: `${names} received the same highest total. No winner was selected manually.`,
      tone: "bg-[#fff6d9] text-[#7a5518]"
    };
  }
  const winner = result.candidates.find(candidate => candidate.candidateId === result.winnerCandidateId);
  return {
    title: winner ? `${winner.candidateName} elected` : "Winner declared",
    detail: "The winner has the highest accepted vote total.",
    tone: "bg-[#e3f4ee] text-[#17604c]"
  };
}

export function PublicResults() {
  const searchParams = useSearchParams();
  const requestedBallotId = searchParams.get("ballot");
  const [results, setResults] = useState<PublishedBallotResult[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void listPublishedResults()
      .then(items => {
        if (!active) return;
        setResults(items);
        setSelectedId(
          requestedBallotId && items.some(item => item.ballotId === requestedBallotId)
            ? requestedBallotId
            : items[0]?.ballotId ?? ""
        );
      })
      .catch(failure => {
        if (active) setError(failure instanceof Error ? failure.message : "Published results could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [requestedBallotId]);

  const selected = useMemo(
    () => results.find(result => result.ballotId === selectedId) ?? null,
    [results, selectedId]
  );
  const outcome = selected ? outcomeText(selected) : null;

  return <>
    <header>
      <p className="text-xs font-bold uppercase tracking-[.2em] text-[#8f2f43]">Published election record</p>
      <h1 className="mt-2 text-4xl font-bold sm:text-5xl">Published results</h1>
      <p className="mt-2 max-w-3xl text-[#6e665f]">Only administrator-published totals are shown. Candidate totals never reveal voter identities or individual choices.</p>
    </header>

    {loading&&<div className={`${cardClass} mt-8 p-10 text-center text-[#6e665f]`}>Loading published results…</div>}
    {error&&<p role="alert" className="mt-8 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {!loading&&!error&&results.length===0&&<div className={`${cardClass} mt-8 p-10 text-center`}><Clock3 className="mx-auto text-[#a27022]"/><h2 className="mt-4 text-2xl font-bold">No results published yet</h2><p className="mt-2 text-[#6e665f]">Completed ballots will appear after verification and administrator publication.</p></div>}

    {selected&&outcome&&<>
      <section className={`${cardClass} mt-8 p-5`}>
        <label className="font-semibold">Published ballot
          <QuorumSelect ariaLabel="Published ballot" value={selectedId} onValueChange={setSelectedId} options={results.map(result=>({value:result.ballotId,label:result.ballotTitle}))}/>
        </label>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className={`${cardClass} p-5`}><ShieldCheck className="text-[#17745a]"/><strong className="mt-5 block text-3xl">{selected.acceptedVotes}</strong><span className="text-sm text-[#6e665f]">Accepted votes</span></div>
        <div className={`${cardClass} p-5`}><Clock3 className="text-[#8f2f43]"/><strong className="mt-5 block text-lg">{new Date(selected.publishedAt).toLocaleString()}</strong><span className="text-sm text-[#6e665f]">Published</span></div>
        <div className={`${cardClass} p-5`}><GitBranch className="text-[#a27022]"/><strong className="mt-5 block text-3xl">{selected.roundNumber}</strong><span className="text-sm text-[#6e665f]">Election round</span></div>
      </section>

      <section className={`${cardClass} mt-6 p-6 sm:p-8`}>
        <div className={`rounded-2xl p-5 ${outcome.tone}`}><div className="flex items-start gap-3">{selected.outcome==="WINNER"?<Crown className="shrink-0"/>:<GitBranch className="shrink-0"/>}<div><h2 className="text-xl font-bold">{outcome.title}</h2><p className="mt-1 text-sm">{outcome.detail}</p></div></div></div>
        <div className="mt-8 space-y-5">
          {selected.candidates.map(candidate=><div key={candidate.candidateId}><div className="mb-2 flex justify-between gap-4"><strong>{candidate.candidateName}</strong><span>{candidate.voteCount} ({candidate.percentage}%)</span></div><div className="h-3 overflow-hidden rounded-full bg-[#eee8df]"><div className="h-full rounded-full bg-[#8f2f43]" style={{width:`${candidate.percentage}%`}}/></div></div>)}
        </div>
        <p className="mt-7 text-sm text-[#6e665f]">{selected.quarantinedVotes} quarantined vote{selected.quarantinedVotes===1?" was":"s were"} excluded from this published total.</p>
      </section>

      {selected.outcome==="TIE"&&<section className={`${cardClass} mt-6 p-6`}><h2 className="text-xl font-bold">Runoff status</h2>{selected.runoffBallot?<div className="mt-4 flex items-start gap-3 rounded-xl bg-[#edf3f7] p-4"><CalendarDays className="shrink-0 text-[#36586a]"/><div><strong>{selected.runoffBallot.title}</strong><p className="mt-1 text-sm text-[#526873]">Voting opens {new Date(selected.runoffBallot.startTime).toLocaleString()} and closes {new Date(selected.runoffBallot.endTime).toLocaleString()}.</p></div></div>:<p className="mt-3 text-[#6e665f]">The administrator has not scheduled the runoff yet.</p>}</section>}
    </>}
  </>;
}
