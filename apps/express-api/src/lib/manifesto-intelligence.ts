import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import Groq from "groq-sdk";
import { z } from "zod";
import { env } from "../config/env.js";

export const MANIFESTO_TOPICS = [
  "Transparency and accountability",
  "Student welfare",
  "Access and inclusion",
  "Academic and career support",
  "Campus services",
  "Sustainability",
  "Clubs and community"
] as const;

const resultSchema = z.object({
  highlights: z.tuple([
    z.string().trim().min(5).max(180),
    z.string().trim().min(5).max(180),
    z.string().trim().min(5).max(180)
  ]),
  topics: z.object({
    "Transparency and accountability": z.string().trim().min(5).max(220),
    "Student welfare": z.string().trim().min(5).max(220),
    "Access and inclusion": z.string().trim().min(5).max(220),
    "Academic and career support": z.string().trim().min(5).max(220),
    "Campus services": z.string().trim().min(5).max(220),
    "Sustainability": z.string().trim().min(5).max(220),
    "Clubs and community": z.string().trim().min(5).max(220)
  }).strict()
}).strict();

type ManifestoResult = z.infer<typeof resultSchema>;
type ReviewDecision = "APPROVED" | "REJECTED";

type StoredIntelligence = ManifestoResult & {
  version: 1;
  generation: {
    status: "generated" | "fallback";
    provider: "groq" | "local";
    model: string;
    generatedAt: string;
    sourceHash: string;
  };
  review?: {
    decision: ReviewDecision;
    reviewedAt: string;
    administratorEdited: boolean;
  };
};

function manifestoHash(manifesto: string): string {
  return createHash("sha256").update(manifesto).digest("hex");
}

function excerptsFromManifesto(manifesto: string): [string, string, string] {
  const clean = manifesto.replace(/\s+/g, " ").trim();
  let parts = clean.split(/(?<=[.!?])\s+/)
    .map(part => part.replace(/[.!?]+$/, "").trim())
    .filter(part => part.length >= 5);
  if (parts.length < 3) {
    parts = clean.split(/[.;,]\s+/).map(part => part.trim()).filter(part => part.length >= 5);
  }
  if (parts.length < 3) {
    const words = clean.split(/\s+/);
    const size = Math.max(1, Math.ceil(words.length / 3));
    parts = [0, 1, 2].map(index => words.slice(index * size, (index + 1) * size).join(" ").trim()).filter(Boolean);
  }
  while (parts.length < 3) parts.push(clean);
  return parts.slice(0, 3).map(part => part.slice(0, 180)) as [string, string, string];
}

function fallback(manifesto: string): ManifestoResult {
  return {
    highlights: excerptsFromManifesto(manifesto),
    topics: Object.fromEntries(MANIFESTO_TOPICS.map(topic => [topic, "Not addressed"])) as ManifestoResult["topics"]
  };
}

function normalizedSource(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function isGrounded(result: ManifestoResult, manifesto: string): boolean {
  const source = normalizedSource(manifesto);
  const claims = [
    ...result.highlights,
    ...Object.values(result.topics).filter(value => value !== "Not addressed")
  ];
  return claims.every(claim => source.includes(normalizedSource(claim)));
}

function schemaDefinition() {
  const topicProperties = Object.fromEntries(MANIFESTO_TOPICS.map(topic => [topic, { type: "string", minLength: 5, maxLength: 220 }]));
  return {
    type: "object",
    properties: {
      highlights: {
        type: "array",
        items: { type: "string", minLength: 5, maxLength: 180 },
        minItems: 3,
        maxItems: 3
      },
      topics: {
        type: "object",
        properties: topicProperties,
        required: [...MANIFESTO_TOPICS],
        additionalProperties: false
      }
    },
    required: ["highlights", "topics"],
    additionalProperties: false
  } as const;
}

export async function generateManifestoIntelligence(manifesto: string): Promise<StoredIntelligence> {
  const generatedAt = new Date().toISOString();
  const sourceHash = manifestoHash(manifesto);
  if (!env.GROQ_API_KEY) {
    return {
      version: 1,
      ...fallback(manifesto),
      generation: { status: "fallback", provider: "local", model: "local-excerpts-v1", generatedAt, sourceHash }
    };
  }

  try {
    const client = new Groq({ apiKey: env.GROQ_API_KEY, timeout: env.GROQ_TIMEOUT_MS, maxRetries: 1 });
    const completion = await client.chat.completions.create({
      model: env.GROQ_MANIFESTO_MODEL,
      temperature: 0,
      max_completion_tokens: 900,
      messages: [
        {
          role: "system",
          content: [
            "You prepare neutral election-manifesto highlights and comparison topics.",
            "Every highlight and topic position must be copied as an exact contiguous excerpt from the submitted manifesto.",
            "Do not infer intentions, add promises, praise the candidate, or use outside knowledge.",
            "Select exactly three concise, distinct excerpts as highlights, without quotation marks.",
            "For every comparison topic, copy one short exact excerpt or write exactly 'Not addressed'."
          ].join(" ")
        },
        { role: "user", content: `Submitted manifesto:\n\n${manifesto}` }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "manifesto_intelligence",
          strict: true,
          schema: schemaDefinition()
        }
      }
    });
    const content = completion.choices[0]?.message?.content;
    const parsed = resultSchema.parse(JSON.parse(content ?? ""));
    if (!isGrounded(parsed, manifesto)) throw new Error("Groq output was not fully grounded in the submitted manifesto");
    return {
      version: 1,
      ...parsed,
      generation: {
        status: "generated",
        provider: "groq",
        model: completion.model || env.GROQ_MANIFESTO_MODEL,
        generatedAt,
        sourceHash
      }
    };
  } catch (error) {
    console.warn("Manifesto intelligence fallback used", error instanceof Error ? error.message : "Unknown Groq error");
    return {
      version: 1,
      ...fallback(manifesto),
      generation: { status: "fallback", provider: "local", model: "local-excerpts-v1", generatedAt, sourceHash }
    };
  }
}

function storedObject(value: Prisma.JsonValue | null): StoredIntelligence | null {
  const parsed = z.object({
    version: z.literal(1),
    highlights: resultSchema.shape.highlights,
    topics: resultSchema.shape.topics,
    generation: z.object({
      status: z.enum(["generated", "fallback"]),
      provider: z.enum(["groq", "local"]),
      model: z.string(),
      generatedAt: z.string(),
      sourceHash: z.string()
    }),
    review: z.object({
      decision: z.enum(["APPROVED", "REJECTED"]),
      reviewedAt: z.string(),
      administratorEdited: z.boolean()
    }).optional()
  }).safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function storedHighlights(value: Prisma.JsonValue | null, manifesto: string): [string, string, string] {
  const stored = storedObject(value);
  if (stored) return stored.highlights;
  if (Array.isArray(value) && value.length === 3 && value.every(item => typeof item === "string")) {
    return value as [string, string, string];
  }
  return excerptsFromManifesto(manifesto);
}

export function storedTopics(value: Prisma.JsonValue | null): Record<string, string> {
  return storedObject(value)?.topics ?? Object.fromEntries(MANIFESTO_TOPICS.map(topic => [topic, "Not addressed"]));
}

export function recordManifestoReview(
  value: Prisma.JsonValue | null,
  manifesto: string,
  decision: ReviewDecision,
  approvedHighlights?: [string, string, string]
): Prisma.InputJsonValue {
  const current = storedObject(value) ?? {
    version: 1 as const,
    ...fallback(manifesto),
    generation: {
      status: "fallback" as const,
      provider: "local" as const,
      model: "local-excerpts-v1",
      generatedAt: new Date().toISOString(),
      sourceHash: manifestoHash(manifesto)
    }
  };
  const highlights = approvedHighlights ?? current.highlights;
  return {
    ...current,
    highlights,
    review: {
      decision,
      reviewedAt: new Date().toISOString(),
      administratorEdited: approvedHighlights ? approvedHighlights.some((item, index) => item !== current.highlights[index]) : false
    }
  };
}
