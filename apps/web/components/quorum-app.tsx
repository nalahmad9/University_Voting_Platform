"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  LayoutDashboard,
  ListChecks,
  LockKeyhole,
  LogOut,
  Megaphone,
  Plus,
  ShieldCheck,
  Vote,
} from "lucide-react";
import type { AuthenticatedAdministrator, AuthenticatedStudent } from "@quorum/shared";
import {
  AuthenticationError,
  clearStoredSession,
  login,
  notifyLogout,
  readStoredSession,
  restoreAdministratorSession,
  restoreStudentSession,
  storeSession,
  type QuorumSession,
} from "@/lib/auth-client";
import { AdminBallotBuilder, AdminBallotList } from "@/components/admin-ballots";
import { AdminOperationsOverview } from "@/components/admin-overview";
import { StudentBallotDashboard } from "@/components/student-ballots";
import { StudentNominations } from "@/components/student-nominations";
import { StudentVoting, type VotingState } from "@/components/student-voting";
import { ReceiptLookup } from "@/components/receipt-lookup";
import { verifyPublicReceipt } from "@/lib/receipt-client";
import { AdminAnomalyBoard } from "@/components/admin-audit";
import { AdminTallyWorkspace } from "@/components/admin-tally";
import { PublicResults } from "@/components/public-results";
import { QuorumSelect } from "@/components/quorum-select";

type Role = "student" | "admin";

const INITIAL_VOTING_STATE: VotingState = {
  selectedCandidate: "",
  voteStage: "intro",
  livenessPassed: false,
  livenessProof: "",
  voted: false,
  votedBallotId: "",
  receipt: "",
  recordedAt: "",
};

const fieldClass = "focus-ring mt-2 w-full rounded-xl border border-[#d8cebd] bg-white px-4 py-3 text-[#211a22] placeholder:text-[#9a9188]";
const primaryButton = "focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-[#8f2f43] px-5 py-3 font-bold text-white transition hover:bg-[#742437] disabled:cursor-not-allowed disabled:opacity-50";

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function useVotingState() {
  const [state, setState] = useState<VotingState>(INITIAL_VOTING_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("quorum-voting-state");
      if (saved) {
        const parsed = { ...INITIAL_VOTING_STATE, ...JSON.parse(saved) } as VotingState;
        setState({
          ...parsed,
          livenessPassed: false,
          livenessProof: "",
          voteStage: parsed.voted && parsed.receipt ? "receipt" : "intro",
        });
      }
    } catch {
      localStorage.removeItem("quorum-voting-state");
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(
      "quorum-voting-state",
      JSON.stringify({
        ...state,
        livenessPassed: false,
        livenessProof: "",
        voteStage: state.voted && state.receipt ? "receipt" : "intro",
      }),
    );
  }, [state, hydrated]);

  const update = useCallback((patch: Partial<VotingState>) => {
    setState((previous) => ({ ...previous, ...patch }));
  }, []);

  return { state, update, hydrated };
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#c49a4a]/50 bg-[#2b1a29] text-[#d9ad5f]"><Vote size={20} /></div>
      {!compact && <div><div className="display text-xl font-bold text-[#fff7ef]">Quorum</div><div className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#a99daf]">Campus Election Authority</div></div>}
    </div>
  );
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

function Login({ onAuthenticated }: { onAuthenticated: (session: QuorumSession) => void }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const signIn = async () => {
    if (!identifier.trim() || !password) {
      setError("Enter your university ID or email and password.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      onAuthenticated(await login(identifier.trim(), password));
    } catch (failure) {
      setError(failure instanceof AuthenticationError ? failure.message : "Sign-in could not be completed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="fine-grid min-h-screen bg-[#15101c] p-4 text-white sm:grid sm:place-items-center sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-32px)] w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/10 bg-[#1b1422] shadow-2xl sm:min-h-0 sm:grid-cols-[1.05fr_.95fr]">
        <section className="relative flex min-h-[350px] flex-col justify-between overflow-hidden p-7 sm:min-h-[680px] sm:p-12">
          <div className="absolute -right-24 top-36 size-80 rounded-full bg-[#8f2f43]/20 blur-3xl" />
          <Brand />
          <div className="relative max-w-lg">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[.22em] text-[#d9ad5f]">Private by design · accountable by proof</p>
            <h1 className="display text-4xl font-semibold leading-[1.08] text-[#fff7ef] sm:text-6xl">Every campus voice, counted with privacy and verifiable proof.</h1>
            <p className="mt-6 max-w-md leading-7 text-[#bdb3c2]">Nominate, compare, vote and verify through one trusted election workspace.</p>
          </div>
          <div className="relative grid grid-cols-3 gap-3 border-t border-white/10 pt-6 text-sm text-[#bdb3c2]">
            <div><ShieldCheck className="mb-2 text-[#7bdbc2]" size={20} /><strong className="block text-white">Eligibility</strong>Confirmed before voting</div>
            <div><LockKeyhole className="mb-2 text-[#d9ad5f]" size={20} /><strong className="block text-white">Ballot privacy</strong>Identity separated</div>
            <div><ClipboardCheck className="mb-2 text-[#b6a4e9]" size={20} /><strong className="block text-white">Receipt</strong>Publicly verifiable</div>
          </div>
        </section>
        <section className="paper-noise flex flex-col justify-center bg-[#fbf8f1] p-7 text-[#211a22] sm:p-12">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#8f2f43]">University access</p>
          <h2 className="display mt-3 text-4xl font-bold">Welcome back</h2>
          <p className="mt-2 text-[#6e665f]">Use your registered university credentials.</p>
          <form onSubmit={(event) => { event.preventDefault(); void signIn(); }} className="mt-8 space-y-5">
            <label className="block text-sm font-semibold">University ID or email<input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} className={fieldClass} /></label>
            <label className="block text-sm font-semibold">Password<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className={fieldClass} /></label>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
            <button disabled={submitting} type="submit" className={`${primaryButton} w-full justify-between`}>{submitting ? "Signing in…" : "Sign in"} <ArrowRight size={19} /></button>
          </form>
          <div className="mt-8 flex flex-wrap gap-4 text-sm font-semibold text-[#8f2f43]">
            <button onClick={() => router.push("/public/verify")}>Verify a receipt</button>
            <button onClick={() => router.push("/public/results")}>View public results</button>
          </div>
        </section>
      </div>
    </main>
  );
}

const studentNav = [
  ["Dashboard", LayoutDashboard, "/student/dashboard"],
  ["Nominate", Megaphone, "/student/nominations"],
  ["Vote", Vote, "/student/vote"],
  ["Public ledger", ClipboardCheck, "/student/ledger"],
  ["Results", BarChart3, "/student/results"],
] as const;

const adminNav = [
  ["Overview", LayoutDashboard, "/admin/overview"],
  ["Post a ballot", Plus, "/admin/ballots/new"],
  ["Manage ballots", ListChecks, "/admin/ballots"],
  ["Anomaly console", ShieldCheck, "/admin/anomalies"],
  ["Results & publish", BarChart3, "/admin/results"],
  ["Public ledger", ClipboardCheck, "/admin/ledger"],
] as const;

function Shell({ role, user, children, onLogout }: { role: Role; user?: AuthenticatedStudent | AuthenticatedAdministrator; children: React.ReactNode; onLogout: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const nav = role === "student" ? studentNav : adminNav;
  const displayName = user?.fullName ?? "Election Administrator";
  const currentPage = nav.find(([, , path]) => path === pathname)?.[0] ?? "Quorum";

  return (
    <div className="min-h-screen bg-[#f5f1e8] text-[#211a22] lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[270px] shrink-0 flex-col overflow-hidden bg-[#17111f] p-6 text-[#bfb4c4] lg:flex">
        <Brand />
        <div className={`mt-10 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${role === "student" ? "bg-[#123c38] text-[#7bdbc2]" : "bg-[#49351d] text-[#ecc56e]"}`}>{role} access</div>
        <nav className="scrollbar-thin mt-7 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
          {nav.map(([label, Icon, path]) => (
            <button key={path} onClick={() => router.push(path)} className={`focus-ring flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${pathname === path ? "bg-[#3c2030] text-white shadow-[inset_3px_0_0_#c49a4a]" : "hover:bg-white/5 hover:text-white"}`}><Icon size={19} />{label}</button>
          ))}
        </nav>
        <div className="shrink-0 border-t border-white/10 pt-6">
          <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-full bg-[#9d5c37] font-bold text-white">{initialsFor(displayName)}</div><div className="font-semibold text-white">{displayName}</div></div>
          <button onClick={onLogout} className="mt-5 flex items-center gap-2 text-sm hover:text-white"><LogOut size={16} />Sign out</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-[#ded5c5] bg-[#f8f4ec]/95 px-4 py-3 shadow-[0_1px_0_rgb(255_255_255/70%)] backdrop-blur sm:px-8">
          <div className="lg:hidden"><Brand compact /></div>
          <div className="hidden lg:block"><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#8f2f43]">{role === "student" ? "Student workspace" : "Administration"}</p><p className="font-semibold text-[#352b34]">{currentPage}</p></div>
          <div className="flex items-center gap-2 lg:hidden"><QuorumSelect compact ariaLabel="Navigate" value={pathname} onValueChange={value=>router.push(value)} options={nav.map(([label,,path])=>({value:path,label}))}/><button aria-label="Sign out" onClick={onLogout} className="grid size-10 place-items-center rounded-xl border border-[#cbbfae] bg-white text-[#493d45] shadow-sm transition hover:border-[#8f2f43] hover:text-[#8f2f43]"><LogOut size={18} /></button></div>
          <div className="hidden items-center gap-2 text-sm text-[#6e665f] lg:flex"><ShieldCheck size={17} className="text-[#17745a]"/><span>Secure {role === "student" ? "student" : "administrator"} session</span></div>
        </header>
        <main className="p-5 sm:p-8 lg:p-12"><div className="mx-auto max-w-6xl">{children}<footer className="mt-12 border-t border-[#d8cebd] py-6 text-xs text-[#756d66]">Quorum · Campus Election Authority</footer></div></main>
      </div>
    </div>
  );
}

function Ledger({ initialReceipt = "", admin = false }: { initialReceipt?: string; admin?: boolean }) {
  return (
    <>
      <PageHeader
        eyebrow={admin ? "Administrative verification" : "Public verification"}
        title="Verify an anonymous receipt"
        description="Paste a receipt to confirm that its anonymous ballot was recorded. Verification does not reveal the voter or candidate choice."
      />
      <ReceiptLookup initialReceipt={initialReceipt} />
    </>
  );
}

function NotFound() {
  const router = useRouter();
  return (
    <div className="grid min-h-screen place-items-center bg-[#17111f] p-6 text-white">
      <div className="max-w-lg text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-[#c49a4a]/40 text-[#d9ad5f]"><AlertTriangle /></div>
        <p className="mt-6 text-xs font-bold uppercase tracking-widest text-[#d9ad5f]">Page not found</p>
        <h1 className="display mt-3 text-5xl font-bold">This page is unavailable.</h1>
        <p className="mt-4 text-[#bdb3c2]">Return to sign in or use the public verification tools.</p>
        <button onClick={() => router.push("/")} className={`${primaryButton} mt-7`}>Return to sign in</button>
      </div>
    </div>
  );
}

function PublicPage({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const navClass = (path: string) => `rounded-lg px-3 py-2 text-sm font-semibold transition ${pathname === path ? "bg-white/12 text-white" : "text-[#d8cedc] hover:bg-white/10 hover:text-white"}`;
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f1e8]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#17111f]/96 px-5 py-4 text-white shadow-lg backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between"><Brand /><nav aria-label="Public navigation" className="flex gap-1"><button aria-current={pathname==="/public/verify"?"page":undefined} onClick={() => router.push("/public/verify")} className={navClass("/public/verify")}>Verify</button><button aria-current={pathname==="/public/results"?"page":undefined} onClick={() => router.push("/public/results")} className={navClass("/public/results")}>Results</button><button onClick={() => router.push("/")} className="ml-1 rounded-lg border border-white/25 px-3 py-2 text-sm font-semibold transition hover:border-[#d9ad5f] hover:bg-white/10">Sign in</button></nav></div></header>
      <main className="flex-1 p-5 sm:p-8 lg:p-12"><div className="mx-auto max-w-6xl">{children}</div></main>
      <footer className="border-t border-[#d8cebd] px-5 py-6 text-center text-xs text-[#756d66]">Quorum · Campus Election Authority</footer>
    </div>
  );
}

type ToolContext = {
  registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void>;
};

export function QuorumApp() {
  const pathname = usePathname();
  const router = useRouter();
  const { state, update, hydrated } = useVotingState();
  const [session, setSession] = useState<QuorumSession | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      const stored = readStoredSession();
      if (stored?.role === "student") {
        try {
          const refreshed = await restoreStudentSession(stored);
          if (active) { storeSession(refreshed); setSession(refreshed); }
        } catch {
          clearStoredSession();
          if (active) setSession(null);
        }
      } else if (stored?.role === "admin") {
        try {
          const refreshed = await restoreAdministratorSession(stored);
          if (active) { storeSession(refreshed); setSession(refreshed); }
        } catch {
          clearStoredSession();
          if (active) setSession(null);
        }
      } else if (active) {
        setSession(stored);
      }
      if (active) setAuthReady(true);
    };
    void restore();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const isPublic = pathname === "/" || pathname.startsWith("/public/");
    if (!isPublic && !session) {
      router.replace("/");
      return;
    }
    if (pathname === "/" && session) {
      router.replace(session.role === "student" ? "/student/dashboard" : "/admin/overview");
    }
  }, [authReady, pathname, router, session]);

  const authenticated = (nextSession: QuorumSession) => {
    storeSession(nextSession);
    setSession(nextSession);
    router.push(nextSession.role === "student" ? "/student/dashboard" : "/admin/overview");
  };

  const logout = () => {
    if (session) void notifyLogout(session.accessToken).catch(() => {});
    clearStoredSession();
    setSession(null);
    router.replace("/");
  };

  useEffect(() => {
    const context = (document as Document & { modelContext?: ToolContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({
        name: "navigate_quorum",
        title: "Open Quorum area",
        description: "Navigate to a named Quorum area.",
        inputSchema: { type: "object", properties: { area: { type: "string", enum: ["login", "student-dashboard", "student-nominations", "student-vote", "public-verify", "public-results", "admin-overview", "admin-ballots", "admin-anomalies", "admin-results"] } }, required: ["area"], additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: (input: unknown) => {
          const map: Record<string, string> = { login: "/", "student-dashboard": "/student/dashboard", "student-nominations": "/student/nominations", "student-vote": "/student/vote", "public-verify": "/public/verify", "public-results": "/public/results", "admin-overview": "/admin/overview", "admin-ballots": "/admin/ballots", "admin-anomalies": "/admin/anomalies", "admin-results": "/admin/results" };
          const area = (input as { area?: string }).area;
          if (!area || !map[area]) throw new Error("Unknown area");
          router.push(map[area]);
          return { path: map[area] };
        },
      }, { signal: lifecycle.signal });
      await context.registerTool({
        name: "verify_quorum_receipt",
        title: "Verify receipt",
        description: "Check whether a Quorum receipt is present in the anonymous ledger.",
        inputSchema: { type: "object", properties: { receipt: { type: "string" } }, required: ["receipt"], additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async (input: unknown) => {
          const receipt = (input as { receipt?: string }).receipt?.trim();
          if (!receipt) throw new Error("Receipt is required");
          const result = await verifyPublicReceipt(receipt);
          return { recorded: true, status: result.status, recordedAt: result.recordedAt, ballotTitle: result.ballotTitle, revealsIdentity: false, revealsCandidate: false };
        },
      }, { signal: lifecycle.signal });
    };
    void register().catch(() => {});
    return () => lifecycle.abort();
  }, [router]);

  if (!authReady || !hydrated || (pathname === "/" && session)) return <div className="min-h-screen bg-[#15101c]" />;
  if (pathname === "/") return <Login onAuthenticated={authenticated} />;
  if (pathname === "/public/verify") return <PublicPage><Ledger /></PublicPage>;
  if (pathname === "/public/results") return <PublicPage><PublicResults /></PublicPage>;
  if (pathname.startsWith("/student/") && session?.role !== "student") return <NotFound />;
  if (pathname.startsWith("/admin/") && session?.role !== "admin") return <NotFound />;

  const studentUser = session?.role === "student" ? session.user : undefined;
  const administratorUser = session?.role === "admin" ? session.user : undefined;

  if (pathname === "/student/dashboard" && studentUser && session?.role === "student") return <Shell role="student" user={studentUser} onLogout={logout}><StudentBallotDashboard accessToken={session.accessToken} user={studentUser} /></Shell>;
  if (pathname === "/student/nominations" && studentUser && session?.role === "student") return <Shell role="student" user={studentUser} onLogout={logout}><StudentNominations accessToken={session.accessToken} user={studentUser} /></Shell>;
  if (pathname === "/student/vote" && session?.role === "student") return <Shell role="student" user={studentUser} onLogout={logout}><StudentVoting state={state} update={update} accessToken={session.accessToken} /></Shell>;
  if (pathname === "/student/ledger") return <Shell role="student" user={studentUser} onLogout={logout}><Ledger initialReceipt={state.receipt} /></Shell>;
  if (pathname === "/student/results") return <Shell role="student" user={studentUser} onLogout={logout}><PublicResults /></Shell>;
  if (pathname === "/admin/overview" && session?.role === "admin") return <Shell role="admin" user={administratorUser} onLogout={logout}><AdminOperationsOverview accessToken={session.accessToken} /></Shell>;
  if (pathname === "/admin/ballots/new" && session?.role === "admin") return <Shell role="admin" user={administratorUser} onLogout={logout}><AdminBallotBuilder accessToken={session.accessToken} /></Shell>;
  if (pathname === "/admin/ballots" && session?.role === "admin") return <Shell role="admin" user={administratorUser} onLogout={logout}><AdminBallotList accessToken={session.accessToken} /></Shell>;
  if (pathname === "/admin/anomalies" && session?.role === "admin") return <Shell role="admin" user={administratorUser} onLogout={logout}><AdminAnomalyBoard accessToken={session.accessToken} /></Shell>;
  if (pathname === "/admin/results" && session?.role === "admin") return <Shell role="admin" user={administratorUser} onLogout={logout}><AdminTallyWorkspace accessToken={session.accessToken} /></Shell>;
  if (pathname === "/admin/ledger") return <Shell role="admin" user={administratorUser} onLogout={logout}><Ledger admin /></Shell>;
  return <NotFound />;
}
