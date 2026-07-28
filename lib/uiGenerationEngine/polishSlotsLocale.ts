/**
 * Optional Grok polish: rewrite slot strings into CONTENT_LOCALE only.
 * Never changes layout/template structure.
 */

import { runAiChatCompletion } from "../aiChatCompletion";
import type { SlotMap } from "./v2/types";

const SLOT_KEYS = [
  "nav_title",
  "hero_title",
  "hero_subtitle",
  "primary_cta",
  "secondary_cta",
  "empty_title",
  "empty_body",
  "section_title",
  "section_body",
] as const;

function collectSlots(slots: SlotMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of SLOT_KEYS) {
    if (slots[k]?.trim()) out[k] = slots[k].trim();
  }
  for (let i = 1; i <= 4; i++) {
    for (const prefix of ["item", "card", "row", "metric", "section", "field"] as const) {
      const t = slots[`${prefix}_${i}_title`] || slots[`${prefix}_${i}_label`];
      const m =
        slots[`${prefix}_${i}_meta`] ||
        slots[`${prefix}_${i}_value`] ||
        slots[`${prefix}_${i}_body`] ||
        slots[`${prefix}_${i}_placeholder`];
      if (t?.trim()) out[`${prefix}_${i}_title`] = t.trim();
      if (m?.trim()) out[`${prefix}_${i}_meta`] = m.trim();
    }
  }
  return out;
}

/**
 * Returns new slots with polished copy, or original slots on failure / missing key / en.
 */
export async function polishSlotsForContentLocale(options: {
  slots: SlotMap;
  contentLocale: string;
  apiKey?: string;
}): Promise<{ slots: SlotMap; polished: boolean; skippedReason?: string }> {
  const locale = (options.contentLocale || "en").trim().toLowerCase() || "en";
  if (!options.apiKey?.trim()) {
    return { slots: options.slots, polished: false, skippedReason: "no_api_key" };
  }
  if (locale === "en") {
    return { slots: options.slots, polished: false, skippedReason: "locale_en" };
  }

  const payload = collectSlots(options.slots);
  if (!Object.keys(payload).length) {
    return { slots: options.slots, polished: false, skippedReason: "empty_slots" };
  }

  const system = `You rewrite short UI labels into locale "${locale}".
Return ONLY valid JSON object with the same keys.
Rules: keep meaning; keep length short (titles ≤36 chars, CTAs ≤28); no markdown; no new keys; do not invent product features.`;

  try {
    const result = await runAiChatCompletion({
      apiKeyOverride: options.apiKey,
      preferredProvider: "xai",
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) },
      ],
    });
    if (!result.ok || !result.content?.trim()) {
      return { slots: options.slots, polished: false, skippedReason: "grok_failed" };
    }
    let raw = result.content.trim();
    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) raw = fence[1].trim();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: SlotMap = { ...options.slots };
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim() && k in payload) {
        // Map meta back onto original key shapes when we used *_title for labels
        if (k.endsWith("_meta") && !options.slots[k]) {
          const base = k.replace(/_meta$/, "");
          if (options.slots[`${base}_value`]) next[`${base}_value`] = v.trim().slice(0, 48);
          else if (options.slots[`${base}_body`]) next[`${base}_body`] = v.trim().slice(0, 80);
          else if (options.slots[`${base}_placeholder`])
            next[`${base}_placeholder`] = v.trim().slice(0, 36);
          else next[k] = v.trim().slice(0, 48);
        } else if (k.endsWith("_title") && options.slots[k.replace(/_title$/, "_label")]) {
          next[k.replace(/_title$/, "_label")] = v.trim().slice(0, 36);
        } else {
          next[k] = v.trim().slice(0, k.includes("subtitle") || k.includes("body") ? 80 : 40);
        }
      }
    }
    return { slots: next, polished: true };
  } catch {
    return { slots: options.slots, polished: false, skippedReason: "parse_or_network" };
  }
}
