"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  Download,
  KeyRound,
  LockKeyhole,
  Scale,
  ScanFace,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { StudentBallotRecord } from "@quorum/shared";
import { FaceVerification } from "@/components/face-verification";
import { listStudentBallots } from "@/lib/ballots-client";
import { listApprovedCandidates, loadCandidatePhoto } from "@/lib/candidates-client";
import { castBlindVote } from "@/lib/blind-voting-client";
import { registerLivenessCompletion } from "@/lib/face-verification-client";
import { QuorumSelect } from "@/components/quorum-select";

export type VoteStage = "intro" | "liveness" | "candidates" | "review" | "secure" | "receipt";

export type VotingState = {
  selectedCandidate: string;
  voteStage: VoteStage;
  livenessPassed: boolean;
  livenessProof: string;
  voted: boolean;
  votedBallotId: string;
  receipt: string;
  recordedAt: string;
};

type CandidateProfile = {
  id: string;
  initials: string;
  name: string;
  year: string;
  statement: string;
  color: string;
  highlights: string[];
  manifesto: string;
  topics: Record<string, string>;
  photo?: { ballotId: string; candidateId: string };
  isSelf?: boolean;
};

type StudentVotingProps = {
  state: VotingState;
  update: (patch: Partial<VotingState>) => void;
  accessToken: string;
};

const primaryButton = "focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-[#8f2f43] px-5 py-3 font-bold text-white transition hover:bg-[#742437] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-[#cbbfae] bg-white px-5 py-3 font-semibold text-[#352b34] transition hover:bg-[#f7f2e9] disabled:opacity-50";
const cardClass = "rounded-[22px] border border-[#ded5c5] bg-white shadow-[0_8px_30px_rgb(58_41_48/5%)]";

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header>
      <p className="text-xs font-bold uppercase tracking-[.2em] text-[#8f2f43]">{eyebrow}</p>
      <h1 className="display mt-2 text-4xl font-bold sm:text-5xl">{title}</h1>
      <p className="mt-2 max-w-3xl text-[#6e665f]">{description}</p>
    </header>
  );
}

function StatusBadge({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "gold" | "slate" }) {
  const tones = {
    green: "bg-[#e0f4ed] text-[#17745a]",
    gold: "bg-[#fbefce] text-[#8f671d]",
    slate: "bg-[#ece9e5] text-[#5e5752]",
  };
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

function CandidateDialog({ candidate }: { candidate: CandidateProfile }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-sm font-bold text-[#8f2f43]">Read full manifesto</button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-[#fbf8f1] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="display text-3xl">{candidate.name}</DialogTitle>
          <DialogDescription>{candidate.year}</DialogDescription>
        </DialogHeader>
        <blockquote className="rounded-2xl bg-[#1b1422] p-5 text-lg text-white">“{candidate.statement}”</blockquote>
        <div>
          <h3 className="font-bold">Manifesto highlights</h3>
          <ul className="mt-3 space-y-3">
            {candidate.highlights.map((highlight) => (
              <li key={highlight} className="flex gap-3">
                <CheckCircle2 size={18} className="mt-1 shrink-0 text-[#17745a]" />
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-bold">Full manifesto</h3>
          <p className="mt-2 whitespace-pre-line leading-7 text-[#5f5650]">{candidate.manifesto}</p>
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

function CandidateAvatar({ candidate, accessToken }: { candidate: CandidateProfile; accessToken: string }) {
  const [source, setSource] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!candidate.photo) return;
    void loadCandidatePhoto(candidate.photo.ballotId, candidate.photo.candidateId, accessToken)
      .then((url) => {
        objectUrl = url;
        if (active) setSource(url);
        else URL.revokeObjectURL(url);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [candidate.photo, accessToken]);

  if (source) {
    return <img src={source} alt={`${candidate.name} profile`} className="size-14 shrink-0 rounded-2xl object-cover" />;
  }
  return (
    <div className="grid size-14 shrink-0 place-items-center rounded-2xl font-bold text-white" style={{ background: candidate.color }}>
      {candidate.initials}
    </div>
  );
}

function ComparisonDialog({ ids, candidates }: { ids: string[]; candidates: CandidateProfile[] }) {
  const chosen = candidates.filter((candidate) => ids.includes(candidate.id));
  const topics = Array.from(new Set(chosen.flatMap((candidate) => Object.keys(candidate.topics))));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button disabled={ids.length < 2} className={secondaryButton}>
          <Scale size={17} /> Compare {ids.length || ""} candidates
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-auto bg-[#fbf8f1] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="display text-3xl">Compare priorities</DialogTitle>
          <DialogDescription>
            Positions are aligned by shared manifesto topics. “Not addressed” means a candidate did not cover that topic.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-[700px] overflow-hidden rounded-2xl border border-[#d8cebd]">
          <div className="grid bg-[#1b1422] text-white" style={{ gridTemplateColumns: `170px repeat(${chosen.length}, minmax(180px,1fr))` }}>
            <div className="p-4 font-bold">Topic</div>
            {chosen.map((candidate) => (
              <div key={candidate.id} className="border-l border-white/10 p-4">
                <strong>{candidate.name}</strong>
                <span className="block text-xs text-[#bdb3c2]">{candidate.year}</span>
              </div>
            ))}
          </div>
          {topics.map((topic, index) => (
            <div key={topic} className={`grid ${index % 2 ? "bg-[#f4efe6]" : "bg-white"}`} style={{ gridTemplateColumns: `170px repeat(${chosen.length}, minmax(180px,1fr))` }}>
              <div className="p-4 font-bold">{topic}</div>
              {chosen.map((candidate) => (
                <div key={candidate.id} className="border-l border-[#ded5c5] p-4 text-sm leading-6">
                  {candidate.topics[topic] || "Not addressed"}
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VoteFlow({ state, update, accessToken, candidates, ballot }: StudentVotingProps & { candidates: CandidateProfile[]; ballot: StudentBallotRecord }) {
  const router = useRouter();
  const [compare, setCompare] = useState<string[]>([]);
  const [secureProgress, setSecureProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [voteError, setVoteError] = useState("");
  const startedAt = useRef(0);
  const candidateRestricted = candidates.some((candidate) => candidate.isSelf);
  const selected = candidateRestricted ? undefined : candidates.find((candidate) => candidate.id === state.selectedCandidate && !candidate.isSelf);
  const votingOpen = ballot.phase === "VOTING_OPEN";

  const castVote = async () => {
    if (!selected) return;
    update({ voteStage: "secure" });
    setVoteError("");
    setSecureProgress(12);
    setStatus("Creating private authorization");
    try {
      setSecureProgress(35);
      const result = await castBlindVote({
        ballotId: ballot.id,
        candidateId: selected.id,
        accessToken,
        livenessProof: state.livenessProof,
        startedAt: startedAt.current || Date.now(),
      });
      setSecureProgress(100);
      setStatus("Ballot recorded");
      update({
        voted: true,
        votedBallotId: ballot.id,
        receipt: result.receipt,
        recordedAt: result.recordedAt,
        voteStage: "receipt",
      });
    } catch (failure) {
      setVoteError(failure instanceof Error ? failure.message : "The ballot could not be submitted. Please try again.");
      setSecureProgress(0);
      setStatus("");
      update({ voteStage: "review" });
    }
  };

  const downloadReceipt = () => {
    const body = `QUORUM VOTE RECEIPT\nBallot: ${ballot.title}\nReceipt: ${state.receipt}\nRecorded: ${new Date(state.recordedAt).toLocaleString()}\nThis receipt confirms recording without revealing the candidate choice.`;
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "quorum-vote-receipt.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (state.voteStage === "receipt" && state.voted && state.receipt) {
    return (
      <>
        <PageHeader
          eyebrow="Vote recorded"
          title="Your ballot is secured."
          description="Keep this receipt to verify that your anonymous ballot appears in the public ledger."
        />
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
          <div className={`${cardClass} overflow-hidden`}>
            <div className="bg-[#163c34] p-6 text-white">
              <CheckCircle2 size={38} className="text-[#7bdbc2]" />
              <h2 className="display mt-4 text-3xl font-bold">Submission complete</h2>
              <p className="mt-2 text-[#bfe4d8]">Recorded {new Date(state.recordedAt).toLocaleString()}</p>
            </div>
            <div className="p-6">
              <p className="text-sm font-bold">Receipt</p>
              <div className="mt-2 break-all rounded-xl bg-[#f1ece3] p-4 font-mono text-sm">{state.receipt}</div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={() => navigator.clipboard?.writeText(state.receipt)} className={secondaryButton}><Copy size={17} />Copy receipt</button>
                <button onClick={downloadReceipt} className={secondaryButton}><Download size={17} />Download</button>
                <button onClick={() => router.push("/student/ledger")} className={primaryButton}><Search size={17} />Verify now</button>
              </div>
            </div>
          </div>
          <aside className={`${cardClass} p-6`}>
            <LockKeyhole className="text-[#8f2f43]" />
            <h3 className="display mt-4 text-2xl font-bold">What this receipt proves</h3>
            <ul className="mt-5 space-y-4 text-sm text-[#5f5650]">
              <li className="flex gap-3"><Check size={18} className="shrink-0 text-[#17745a]" />The anonymous ballot was recorded.</li>
              <li className="flex gap-3"><Check size={18} className="shrink-0 text-[#17745a]" />The one-time voting authorization cannot be reused.</li>
              <li className="flex gap-3"><ShieldCheck size={18} className="shrink-0 text-[#17745a]" />The receipt does not reveal your identity or choice.</li>
            </ul>
          </aside>
        </div>
      </>
    );
  }

  const stages = ["Eligibility", "Face check", "Candidates", "Review", "Receipt"];
  const active = { intro: 0, liveness: 1, candidates: 2, review: 3, secure: 3, receipt: 4 }[state.voteStage];

  return (
    <>
      <PageHeader
        eyebrow="Secure voting booth"
        title={ballot.title}
        description={votingOpen ? "Choose one candidate. Your identity is separated before the anonymous ballot is submitted." : "Review the approved candidates and their manifestos for this ballot."}
      />
      <div className="mt-7 grid grid-cols-5 gap-2">
        {stages.map((stage, index) => (
          <div key={stage} className="text-center">
            <div className={`mx-auto grid size-8 place-items-center rounded-full text-sm font-bold ${index <= active ? "bg-[#8f2f43] text-white" : "bg-[#e3dbcf] text-[#786f67]"}`}>
              {index < active ? <Check size={16} /> : index + 1}
            </div>
            <span className="mt-2 hidden text-xs font-semibold sm:block">{stage}</span>
          </div>
        ))}
      </div>

      {state.voteStage === "intro" && (
        <section className={`${cardClass} mt-8 overflow-hidden`}>
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_.9fr]">
            <div>
              <StatusBadge tone={votingOpen && !candidateRestricted ? "green" : "slate"}>
                {votingOpen ? (candidateRestricted ? "Candidate access" : "Voting open") : ballot.phase === "CLOSED" ? "Voting closed" : ballot.phase === "UPCOMING" ? "Voting scheduled" : "Nominations open"}
              </StatusBadge>
              <h2 className="display mt-4 text-3xl font-bold">{votingOpen && !candidateRestricted ? "Before you begin" : "Candidate profiles"}</h2>
              <p className="mt-3 leading-7 text-[#5f5650]">
                {candidateRestricted
                  ? "Because you are an approved candidate in this ballot, you cannot cast a vote in it. You may still review and compare every candidate, and vote in other ballots where you are eligible."
                  : votingOpen
                    ? "You are eligible for this ballot. Voting takes about three minutes and cannot be changed after submission."
                    : "You can still read every approved candidacy statement, manifesto and reviewed highlight."}
              </p>
              <div className="mt-6 grid gap-3">
                {!candidateRestricted && (
                  <div className="flex gap-3 rounded-xl bg-[#f5f1e8] p-4"><ScanFace className="shrink-0 text-[#8f2f43]" /><div><strong>Face and presence check</strong><p className="text-sm text-[#6e665f]">A short camera check confirms your identity and that you are completing the ballot yourself.</p></div></div>
                )}
                <div className="flex gap-3 rounded-xl bg-[#f5f1e8] p-4"><KeyRound className="shrink-0 text-[#8f2f43]" /><div><strong>{candidateRestricted ? "Ballot restriction" : "Protect your privacy"}</strong><p className="text-sm text-[#6e665f]">{candidateRestricted ? "Candidates do not receive voting authorization for a ballot in which they are standing." : "Your identity is separated before your choice is submitted."}</p></div></div>
                {!candidateRestricted && (
                  <div className="flex gap-3 rounded-xl bg-[#f5f1e8] p-4"><ClipboardCheck className="shrink-0 text-[#8f2f43]" /><div><strong>Keep your receipt</strong><p className="text-sm text-[#6e665f]">Verify recording without revealing your choice.</p></div></div>
                )}
              </div>
            </div>
            <aside className="rounded-2xl bg-[#1b1422] p-6 text-white">
              <Clock3 className="text-[#d9ad5f]" />
              <p className="mt-10 text-sm uppercase tracking-widest text-[#bdb3c2]">{votingOpen ? "Voting closes" : "Schedule"}</p>
              <strong className="display mt-2 block text-3xl">{new Date(ballot.endTime).toLocaleString()}</strong>
              <p className="mt-5 text-sm leading-6 text-[#bdb3c2]">
                {candidateRestricted
                  ? "Your candidate profile remains visible, but voting is disabled only for this ballot."
                  : votingOpen
                    ? "You may leave before final confirmation. Once the ballot is recorded, it cannot be edited or cast again."
                    : "Voting is not currently open, but candidate information remains available."}
              </p>
              <button onClick={() => { if (votingOpen && !candidateRestricted) startedAt.current = Date.now(); update({ voteStage: votingOpen && !candidateRestricted ? "liveness" : "candidates" }); }} className={`${primaryButton} mt-8 w-full`}>
                {votingOpen && !candidateRestricted ? "Begin securely" : "View candidates"} <ArrowRight size={18} />
              </button>
            </aside>
          </div>
        </section>
      )}

      {state.voteStage === "liveness" && (
        <section className={`${cardClass} mt-8 p-6 sm:p-8`}>
          <FaceVerification
            accessToken={accessToken}
            verified={state.livenessPassed}
            onVerified={async (distance) => {
              const proof = (await registerLivenessCompletion(accessToken, ballot.id, distance)).proof;
              update({ livenessPassed: true, livenessProof: proof });
            }}
          />
          <div className="mt-6 flex justify-between">
            <button onClick={() => update({ voteStage: "intro" })} className={secondaryButton}><ArrowLeft size={17} />Back</button>
            {state.livenessPassed && <button onClick={() => update({ voteStage: "candidates" })} className={primaryButton}>Continue to candidates <ArrowRight size={17} /></button>}
          </div>
        </section>
      )}

      {state.voteStage === "candidates" && (
        <section className="mt-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="display text-3xl font-bold">{votingOpen && !candidateRestricted ? "Choose a candidate" : "Approved candidates"}</h2>
              <p className="text-[#6e665f]">Read full manifestos or compare up to three candidates side by side.</p>
            </div>
            <ComparisonDialog ids={compare} candidates={candidates} />
          </div>
          {candidateRestricted && (
            <div className="mt-5 rounded-2xl border border-[#e3ca92] bg-[#fff6d9] p-4 text-sm text-[#6e5a34]"><strong>Voting is disabled for you in this ballot.</strong> As an approved candidate, you may review the profiles but cannot select or vote for a candidate here.</div>
          )}
          {candidates.length === 0 ? (
            <div className={`${cardClass} mt-6 p-10 text-center`}><Users className="mx-auto text-[#8f2f43]" /><h3 className="mt-4 text-2xl font-bold">No approved candidates yet</h3><p className="mt-2 text-[#6e665f]">Approved nominations will appear here automatically.</p></div>
          ) : (
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {candidates.map((candidate) => (
                <article key={candidate.id} className={`${cardClass} flex flex-col p-6 ${state.selectedCandidate === candidate.id && !candidate.isSelf && !candidateRestricted ? "ring-2 ring-[#8f2f43] ring-offset-2" : ""}`}>
                  <div className="flex items-center gap-4"><CandidateAvatar candidate={candidate} accessToken={accessToken} /><div><h3 className="display text-2xl font-bold">{candidate.name}</h3><p className="text-sm text-[#6e665f]">{candidate.year}</p></div></div>
                  <blockquote className="mt-5 font-semibold leading-6">“{candidate.statement}”</blockquote>
                  <h4 className="mt-5 text-sm font-bold uppercase tracking-wider text-[#8f2f43]">Manifesto highlights</h4>
                  <ul className="mt-3 flex-1 space-y-2 text-sm text-[#5f5650]">{candidate.highlights.map((highlight) => <li key={highlight} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-[#17745a]" />{highlight}</li>)}</ul>
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <CandidateDialog candidate={candidate} />
                    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={compare.includes(candidate.id)} disabled={!compare.includes(candidate.id) && compare.length >= 3} onChange={(event) => setCompare((current) => event.target.checked ? [...current, candidate.id] : current.filter((id) => id !== candidate.id))} className="size-4 accent-[#8f2f43]" />Compare</label>
                    {votingOpen && !candidateRestricted && (candidate.isSelf ? <span className="rounded-xl bg-[#f2ece2] px-4 py-3 text-sm font-bold text-[#6e665f]">Your candidate profile</span> : <button onClick={() => update({ selectedCandidate: candidate.id })} className={state.selectedCandidate === candidate.id ? primaryButton : secondaryButton}>{state.selectedCandidate === candidate.id ? <><Check size={17} />Selected</> : "Select"}</button>)}
                  </div>
                </article>
              ))}
            </div>
          )}
          <div className="sticky bottom-4 mt-6 flex items-center justify-between gap-4 rounded-2xl border border-[#d8cebd] bg-[#fffdf9]/95 p-4 shadow-xl backdrop-blur">
            <button onClick={() => update({ voteStage: candidateRestricted || !votingOpen ? "intro" : "liveness" })} className={secondaryButton}><ArrowLeft size={17} />Back</button>
            <div className="hidden text-sm sm:block">{candidateRestricted ? "Candidate profiles are available for review only" : votingOpen ? (selected ? <><strong>{selected.name}</strong><span className="ml-2 text-[#6e665f]">selected</span></> : "Select one candidate to continue") : "Voting is not open for this ballot"}</div>
            {votingOpen && !candidateRestricted && <button disabled={!selected} onClick={() => update({ voteStage: "review" })} className={primaryButton}>Review ballot <ArrowRight size={17} /></button>}
          </div>
        </section>
      )}

      {state.voteStage === "review" && selected && (
        <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <div className={`${cardClass} p-6 sm:p-8`}>
            <StatusBadge tone="gold">Final review</StatusBadge>
            <h2 className="display mt-4 text-3xl font-bold">Your selection</h2>
            <div className="mt-6 flex items-center gap-4 rounded-2xl bg-[#f5f1e8] p-5"><CandidateAvatar candidate={selected} accessToken={accessToken} /><div><strong className="display text-2xl">{selected.name}</strong><p className="text-sm text-[#6e665f]">{selected.year}</p></div></div>
            <p className="mt-6 font-semibold">“{selected.statement}”</p>
            <button onClick={() => update({ voteStage: "candidates" })} className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#8f2f43]"><ArrowLeft size={16} />Change selection</button>
          </div>
          <aside className={`${cardClass} p-6`}>
            <LockKeyhole className="text-[#8f2f43]" />
            <h3 className="display mt-4 text-2xl font-bold">Submission privacy</h3>
            <ol className="mt-5 space-y-4 text-sm text-[#5f5650]"><li><strong className="text-[#211a22]">1. Confirm eligibility</strong><br />Your right to vote is checked before submission.</li><li><strong className="text-[#211a22]">2. Separate identity</strong><br />Your account details are removed from your ballot choice.</li><li><strong className="text-[#211a22]">3. Prevent duplicate voting</strong><br />Your one-time voting authorization cannot be reused.</li></ol>
            {voteError && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{voteError}</p>}
            <AlertDialog>
              <AlertDialogTrigger asChild><button className={`${primaryButton} mt-7 w-full`}>Confirm and cast vote</button></AlertDialogTrigger>
              <AlertDialogContent className="bg-[#fbf8f1]"><AlertDialogHeader><AlertDialogTitle className="display text-2xl">Cast this ballot?</AlertDialogTitle><AlertDialogDescription>Your selection cannot be changed after the anonymous ballot is recorded. The receipt will not show your candidate choice.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Review again</AlertDialogCancel><AlertDialogAction onClick={() => void castVote()}>Cast ballot</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
            </AlertDialog>
          </aside>
        </section>
      )}

      {state.voteStage === "secure" && (
        <section className={`${cardClass} mx-auto mt-8 max-w-2xl p-8 text-center sm:p-12`}>
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-[#1b1422] text-[#d9ad5f]"><LockKeyhole size={38} className="animate-pulse" /></div>
          <h2 className="display mt-6 text-3xl font-bold">Securing your anonymous ballot</h2>
          <p className="mt-3 text-[#6e665f]">Keep this page open until your receipt appears.</p>
          <Progress value={secureProgress} className="mt-8 h-3" />
          <p className="mt-4 text-sm font-semibold text-[#8f2f43]">{status}</p>
          <div className="mt-8 grid grid-cols-3 gap-2 text-xs text-[#6e665f]"><span>Authorization</span><span>Private submission</span><span>Receipt</span></div>
        </section>
      )}
    </>
  );
}

export function StudentVoting({ state, update, accessToken }: StudentVotingProps) {
  const searchParams = useSearchParams();
  const requestedBallot = searchParams.get("ballot");
  const [ballots, setBallots] = useState<StudentBallotRecord[]>([]);
  const [selectedBallotId, setSelectedBallotId] = useState(requestedBallot || "");
  const [candidates, setCandidates] = useState<CandidateProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void listStudentBallots(accessToken)
      .then((items) => {
        if (!active) return;
        setBallots(items);
        const requested = requestedBallot ? items.find((item) => item.id === requestedBallot) : undefined;
        const preferred = requested ?? items.find((item) => item.candidateCount > 0) ?? items[0];
        setSelectedBallotId(preferred?.id ?? "");
      })
      .catch(() => {
        if (active) setError("Ballots could not be loaded. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [accessToken, requestedBallot]);

  useEffect(() => {
    if (!selectedBallotId) {
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    void listApprovedCandidates(selectedBallotId, accessToken)
      .then((items) => {
        if (!active) return;
        const palette = ["#8f2f43", "#396257", "#5d4d8f", "#9a6234"];
        setCandidates(items.map((candidate, index) => ({
          id: candidate.id,
          initials: initialsFor(candidate.fullName),
          name: candidate.fullName,
          year: `${candidate.department} · Year ${candidate.classYear}`,
          statement: candidate.candidacyStatement,
          color: palette[index % palette.length],
          highlights: candidate.manifestoHighlights,
          manifesto: candidate.manifestoText,
          topics: candidate.manifestoTopics,
          photo: { ballotId: candidate.ballotId, candidateId: candidate.id },
          isSelf: candidate.isCurrentStudent,
        })));
      })
      .catch((failure) => {
        if (active) setError(failure instanceof Error ? failure.message : "Candidates could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [selectedBallotId, accessToken]);

  useEffect(() => {
    if (selectedBallotId && state.voted && state.votedBallotId !== selectedBallotId) {
      update({ selectedCandidate: "", voteStage: "intro", livenessPassed: false, livenessProof: "", voted: false, votedBallotId: "", receipt: "", recordedAt: "" });
    }
  }, [selectedBallotId, state.voted, state.votedBallotId, update]);

  const selectedBallot = ballots.find((ballot) => ballot.id === selectedBallotId);
  const chooseBallot = (ballotId: string) => {
    setSelectedBallotId(ballotId);
    update({ selectedCandidate: "", voteStage: "intro", livenessPassed: false, livenessProof: "", voted: false, votedBallotId: "", receipt: "", recordedAt: "" });
  };

  if (!loading && !selectedBallot) {
    return <><PageHeader eyebrow="Voting centre" title="No ballots available" description="Eligible ballots will appear here when they are posted." />{error && <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}</>;
  }

  return (
    <>
      <section className={`${cardClass} mb-7 p-5`}>
        <label className="font-semibold">Choose a ballot
          <QuorumSelect ariaLabel="Choose a ballot" value={selectedBallotId} onValueChange={chooseBallot} options={ballots.map(ballot=>({value:ballot.id,label:ballot.title}))}/>
        </label>
        <p className="mt-2 text-sm text-[#6e665f]">Only ballots for which you are eligible are listed.</p>
      </section>
      {error && <p role="alert" className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {loading || !selectedBallot
        ? <div className={`${cardClass} p-10 text-center text-[#6e665f]`}>Loading approved candidates…</div>
        : <VoteFlow state={state} update={update} accessToken={accessToken} candidates={candidates} ballot={selectedBallot} />}
    </>
  );
}
