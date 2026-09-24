"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Clock3, FileText, RefreshCw, UserCheck, Users, XCircle } from "lucide-react";
import type { AdminNominationRecord, ReviewNominationRequest } from "@quorum/shared";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminNominationApiError, listAdminNominations, reviewAdminNomination } from "@/lib/admin-nominations-client";

const cardClass = "rounded-[22px] border border-[#ded5c5] bg-white shadow-[0_8px_30px_rgb(58_41_48/5%)]";
const fieldClass = "mt-2 w-full rounded-xl border border-[#d8cebd] bg-white px-4 py-3 text-[#211a22] outline-none focus:border-[#8f2f43] focus:ring-2 focus:ring-[#8f2f43]/20";
const primaryButton = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#8f2f43] px-5 py-3 font-bold text-white transition hover:bg-[#742437] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#cbbfae] bg-white px-5 py-3 font-semibold text-[#352b34] transition hover:bg-[#f7f2e9] disabled:opacity-50";

type HighlightDrafts = Record<string, [string, string, string]>;

function initialsFor(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function isExactExcerpt(excerpt: string, manifesto: string): boolean {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
  return normalize(manifesto).includes(normalize(excerpt));
}

function statusPresentation(status: AdminNominationRecord["nominationStatus"]): { label: string; className: string } {
  if (status === "APPROVED") return { label: "Approved", className: "bg-[#e0f4ed] text-[#17745a]" };
  if (status === "REJECTED") return { label: "Rejected", className: "bg-[#fde8e6] text-[#a4382e]" };
  if (status === "WITHDRAWN") return { label: "Withdrawn", className: "bg-[#ece9e5] text-[#5e5752]" };
  return { label: "Pending review", className: "bg-[#fbefce] text-[#8f671d]" };
}

export function AdminNominationReview({ accessToken }: { accessToken: string }) {
  const [nominations, setNominations] = useState<AdminNominationRecord[]>([]);
  const [highlightDrafts, setHighlightDrafts] = useState<HighlightDrafts>({});
  const [openId, setOpenId] = useState("");
  const [filter, setFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [rejecting, setRejecting] = useState<AdminNominationRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listAdminNominations(accessToken);
      setNominations(result);
      setHighlightDrafts(Object.fromEntries(result.map((item) => [item.id, [...item.manifestoHighlights]])) as HighlightDrafts);
      setOpenId((current) => current || result.find((item) => item.nominationStatus === "PENDING")?.id || "");
    } catch (failure) {
      setError(failure instanceof AdminNominationApiError ? failure.message : "Nominations could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [accessToken]);

  const pendingCount = nominations.filter((item) => item.nominationStatus === "PENDING").length;
  const visible = useMemo(
    () => filter === "PENDING" ? nominations.filter((item) => item.nominationStatus === "PENDING") : nominations,
    [filter, nominations],
  );

  const replaceNomination = (updated: AdminNominationRecord) => {
    setNominations((current) => current.map((item) => item.id === updated.id ? updated : item));
    setHighlightDrafts((current) => ({ ...current, [updated.id]: [...updated.manifestoHighlights] }));
  };

  const updateHighlight = (nominationId: string, index: number, value: string) => {
    setHighlightDrafts((current) => {
      const next = [...(current[nominationId] ?? ["", "", ""])] as [string, string, string];
      next[index] = value;
      return { ...current, [nominationId]: next };
    });
  };

  const decide = async (nomination: AdminNominationRecord, input: ReviewNominationRequest) => {
    setReviewingId(nomination.id);
    setError("");
    try {
      replaceNomination(await reviewAdminNomination(accessToken, nomination.id, input));
      setRejecting(null);
      setRejectionReason("");
    } catch (failure) {
      setError(failure instanceof AdminNominationApiError ? failure.message : "The review decision could not be saved.");
    } finally {
      setReviewingId("");
    }
  };

  const approve = (nomination: AdminNominationRecord) => {
    const highlights = highlightDrafts[nomination.id] ?? nomination.manifestoHighlights;
    if (highlights.some((item) => item.trim().length < 5)) {
      setError("Each manifesto highlight must contain at least five characters.");
      return;
    }
    if (highlights.some((item) => !isExactExcerpt(item, nomination.manifestoText))) {
      setError("Highlights may be replaced only with exact wording copied from the submitted manifesto.");
      return;
    }
    void decide(nomination, { decision: "APPROVE", manifestoHighlights: highlights });
  };

  const reject = () => {
    if (!rejecting || rejectionReason.trim().length < 5) return;
    void decide(rejecting, { decision: "REJECT", rejectionReason: rejectionReason.trim() });
  };

  return (
    <section className="mt-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-3">
            <Users className="text-[#8f2f43]" />
            <h2 className="text-3xl font-bold">Nomination review</h2>
            {pendingCount > 0 && <span className="rounded-full bg-[#8f2f43] px-2.5 py-1 text-xs font-bold text-white">{pendingCount}</span>}
          </div>
          <p className="mt-2 text-[#6e665f]">Review submitted candidate profiles before making them visible to voters.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilter("PENDING")} className={filter === "PENDING" ? primaryButton : secondaryButton}>Pending ({pendingCount})</button>
          <button onClick={() => setFilter("ALL")} className={filter === "ALL" ? primaryButton : secondaryButton}>All ({nominations.length})</button>
          <button aria-label="Refresh nominations" onClick={() => void load()} className={secondaryButton}><RefreshCw size={16} /></button>
        </div>
      </div>

      {error && <div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-800">{error}</div>}
      {loading ? (
        <div className={`${cardClass} mt-5 p-10 text-center text-[#6e665f]`}>Loading nominations…</div>
      ) : visible.length === 0 ? (
        <div className={`${cardClass} mt-5 p-10 text-center`}>
          <UserCheck className="mx-auto text-[#17745a]" />
          <h3 className="mt-4 text-2xl font-bold">{filter === "PENDING" ? "No nominations awaiting review" : "No nominations submitted"}</h3>
          <p className="mt-2 text-[#6e665f]">{filter === "PENDING" ? "New student submissions will appear here." : "Submitted nominations will be listed here."}</p>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {visible.map((nomination) => {
            const status = statusPresentation(nomination.nominationStatus);
            const open = openId === nomination.id;
            const highlights = highlightDrafts[nomination.id] ?? nomination.manifestoHighlights;
            return (
              <article key={nomination.id} className={`${cardClass} overflow-hidden`}>
                <button onClick={() => setOpenId(open ? "" : nomination.id)} className="flex w-full items-center justify-between gap-4 p-5 text-left">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#8f2f43] font-bold text-white">{initialsFor(nomination.student.fullName)}</div>
                    <div className="min-w-0"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${status.className}`}>{status.label}</span><h3 className="mt-2 truncate text-xl font-bold">{nomination.student.fullName}</h3><p className="truncate text-sm text-[#6e665f]">{nomination.ballot.title}</p></div>
                  </div>
                  <ChevronDown className={`shrink-0 transition ${open ? "rotate-180" : ""}`} />
                </button>

                {open && (
                  <div className="border-t border-[#ded5c5] bg-[#fcfaf6] p-5 sm:p-6">
                    <div className="grid gap-5 lg:grid-cols-[.72fr_1.28fr]">
                      <aside className="rounded-2xl border border-[#e1d8ca] bg-white p-5">
                        <h4 className="font-bold">Student profile</h4>
                        <dl className="mt-4 space-y-3 text-sm">
                          <div><dt className="text-[#7d756e]">University ID</dt><dd className="font-semibold">{nomination.student.universityId}</dd></div>
                          <div><dt className="text-[#7d756e]">Email</dt><dd className="break-all font-semibold">{nomination.student.email}</dd></div>
                          <div><dt className="text-[#7d756e]">Department and year</dt><dd className="font-semibold">{nomination.student.department} · Year {nomination.student.classYear}</dd></div>
                          <div><dt className="text-[#7d756e]">Club memberships</dt><dd className="font-semibold">{nomination.student.clubMemberships.join(" · ") || "None"}</dd></div>
                          <div><dt className="text-[#7d756e]">Submitted</dt><dd className="font-semibold">{new Date(nomination.createdAt).toLocaleString()}</dd></div>
                        </dl>
                      </aside>
                      <div>
                        <div className="rounded-2xl border border-[#e1d8ca] bg-white p-5">
                          <h4 className="flex items-center gap-2 font-bold"><FileText size={17} className="text-[#8f2f43]" />Candidacy statement</h4>
                          <p className="mt-3 font-semibold leading-6">“{nomination.candidacyStatement}”</p>
                          <h4 className="mt-6 font-bold">Full manifesto</h4>
                          <p className="mt-3 whitespace-pre-line leading-7 text-[#5f5650]">{nomination.manifestoText}</p>
                        </div>
                        <div className="mt-4 rounded-2xl bg-[#f2ece2] p-5">
                          <h4 className="font-bold">Manifesto highlights</h4>
                          <p className="mt-1 text-sm text-[#6e665f]">Review these excerpts before approval. Any replacement must use exact wording from the submitted manifesto.</p>
                          <div className="mt-4 space-y-3">
                            {highlights.map((highlight, index) => (
                              <label key={index} className="block text-sm font-semibold">Highlight {index + 1}<input disabled={nomination.nominationStatus !== "PENDING"} maxLength={180} value={highlight} onChange={(event) => updateHighlight(nomination.id, index, event.target.value)} className={fieldClass} /></label>
                            ))}
                          </div>
                        </div>
                        {nomination.rejectionReason && <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800"><strong>Rejection reason</strong><p className="mt-1">{nomination.rejectionReason}</p></div>}
                        {nomination.nominationStatus === "PENDING" && (
                          <div className="mt-5 flex flex-wrap justify-end gap-3">
                            <button disabled={reviewingId === nomination.id} onClick={() => { setRejecting(nomination); setRejectionReason(""); }} className={secondaryButton}><XCircle size={17} />Reject with reason</button>
                            <button disabled={reviewingId === nomination.id} onClick={() => approve(nomination)} className={primaryButton}><Check size={17} />{reviewingId === nomination.id ? "Saving…" : "Approve candidate"}</button>
                          </div>
                        )}
                        {nomination.nominationStatus !== "PENDING" && <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-[#6e665f]"><Clock3 size={16} />Decision saved {new Date(nomination.updatedAt).toLocaleString()}</div>}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => { if (!open) { setRejecting(null); setRejectionReason(""); } }}>
        <DialogContent className="bg-[#fbf8f1]">
          <DialogHeader><DialogTitle className="text-2xl">Reject nomination</DialogTitle><DialogDescription>The student will see this reason and may resubmit while nominations remain open.</DialogDescription></DialogHeader>
          <label className="font-semibold">Reason<textarea rows={5} maxLength={500} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Explain what must be corrected…" className={fieldClass} /></label>
          <DialogFooter><button onClick={() => { setRejecting(null); setRejectionReason(""); }} className={secondaryButton}>Cancel</button><button disabled={rejectionReason.trim().length < 5 || Boolean(reviewingId)} onClick={reject} className={primaryButton}>{reviewingId ? "Saving…" : "Reject nomination"}</button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
