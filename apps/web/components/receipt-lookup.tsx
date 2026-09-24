"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  LockKeyhole,
  Search,
  ShieldCheck,
  XCircle
} from "lucide-react";
import type { ReceiptVerificationResult } from "@quorum/shared";

import {
  ReceiptVerificationError,
  verifyPublicReceipt
} from "@/lib/receipt-client";

const receiptPattern = /^[a-fA-F0-9]{64}$/;
const cardClass = "rounded-[22px] border border-[#ded5c5] bg-white shadow-[0_8px_30px_rgb(58_41_48/5%)]";
const fieldClass = "focus-ring w-full rounded-xl border border-[#d8cebd] bg-white px-4 py-3 text-[#211a22] placeholder:text-[#9a9188]";
const primaryButton = "focus-ring inline-flex items-center justify-center gap-2 rounded-xl bg-[#8f2f43] px-5 py-3 font-bold text-white transition hover:bg-[#742437] disabled:cursor-not-allowed disabled:opacity-50";

type LookupState = "idle" | "loading" | "found" | "not-found" | "invalid" | "error";

export function ReceiptLookup({ initialReceipt = "" }: { initialReceipt?: string }) {
  const [query, setQuery] = useState(initialReceipt);
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [result, setResult] = useState<ReceiptVerificationResult | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setQuery(initialReceipt);
    setLookupState("idle");
    setResult(null);
    setMessage("");
  }, [initialReceipt]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = query.trim().toLowerCase();
    setResult(null);
    setMessage("");
    if (!receiptPattern.test(normalized)) {
      setLookupState("invalid");
      setMessage("Enter the complete 64-character hexadecimal receipt hash.");
      return;
    }

    setLookupState("loading");
    try {
      setResult(await verifyPublicReceipt(normalized));
      setLookupState("found");
    } catch (failure) {
      if (failure instanceof ReceiptVerificationError && failure.code === "RECEIPT_NOT_FOUND") {
        setLookupState("not-found");
        setMessage(failure.message);
      } else {
        setLookupState("error");
        setMessage(failure instanceof Error ? failure.message : "The receipt could not be verified.");
      }
    }
  };

  const negativeState = lookupState === "not-found" || lookupState === "invalid" || lookupState === "error";

  return <>
    <form onSubmit={event => void submit(event)} className={`${cardClass} mt-8 p-6`}>
      <label htmlFor="receipt-hash" className="text-sm font-bold">Receipt hash</label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input
          id="receipt-hash"
          value={query}
          onChange={event => {
            setQuery(event.target.value);
            setLookupState("idle");
            setResult(null);
          }}
          placeholder="Paste the complete 64-character hash"
          spellCheck={false}
          autoComplete="off"
          className={`${fieldClass} min-w-0 flex-1 font-mono text-sm`}
        />
        <button disabled={lookupState === "loading"} type="submit" className={primaryButton}>
          <Search size={17}/>{lookupState === "loading" ? "Checking…" : "Verify receipt"}
        </button>
      </div>

      {result&&<div role="status" className={`mt-5 rounded-xl p-5 ${result.status === "RECORDED" ? "bg-[#e3f4ee] text-[#17604c]" : "bg-[#fff6d9] text-[#7a5518]"}`}>
        <div className="flex items-start gap-3">
          {result.status === "RECORDED" ? <CheckCircle2 className="shrink-0"/> : <Clock3 className="shrink-0"/>}
          <div>
            <strong>{result.status === "RECORDED" ? "Receipt recorded" : "Receipt recorded and under review"}</strong>
            <p className="mt-1 text-sm">{result.ballotTitle}</p>
            <p className="mt-1 text-sm">Recorded {new Date(result.recordedAt).toLocaleString()}</p>
          </div>
        </div>
        <div className="mt-4 break-all rounded-lg bg-white/60 p-3 font-mono text-xs">{result.receipt}</div>
      </div>}

      {negativeState&&<div role="alert" className="mt-5 flex items-start gap-3 rounded-xl bg-[#fdebea] p-4 text-[#9f2f27]">
        <XCircle className="shrink-0"/>
        <div><strong>{lookupState === "not-found" ? "Receipt not found" : lookupState === "invalid" ? "Invalid receipt format" : "Verification unavailable"}</strong><p className="mt-1 text-sm">{message}</p></div>
      </div>}
    </form>

    <section className="mt-6 grid gap-4 sm:grid-cols-3">
      <div className={`${cardClass} p-5`}><CheckCircle2 className="text-[#17745a]"/><strong className="mt-5 block">Confirms recording</strong><p className="mt-2 text-sm leading-6 text-[#6e665f]">A match confirms that the anonymous ballot reached the ledger.</p></div>
      <div className={`${cardClass} p-5`}><LockKeyhole className="text-[#8f2f43]"/><strong className="mt-5 block">Choice remains private</strong><p className="mt-2 text-sm leading-6 text-[#6e665f]">The lookup response never includes a candidate identifier or selection.</p></div>
      <div className={`${cardClass} p-5`}><ShieldCheck className="text-[#6550b5]"/><strong className="mt-5 block">Identity remains separate</strong><p className="mt-2 text-sm leading-6 text-[#6e665f]">Verification does not expose the voter’s identity or account details.</p></div>
    </section>
  </>;
}
