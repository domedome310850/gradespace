// GradeSpace screenshot scanner: reads LMS screenshots (syllabus, score pages) and returns courses as JSON.
// Secrets (Supabase → Edge Functions → Secrets): GEMINI_API_KEY (free tier) or ANTHROPIC_API_KEY.
// Optional: SCAN_MODEL to force a specific model id.
//
// Accuracy measures:
// - the site sends screenshots at full resolution, with tall ones split into overlapping parts (labelled here);
// - the site sends the assessments it already knows for each course, so the model mostly matches scores;
// - results are checked (score above full marks, weights not adding up, duplicates); if anything looks off
//   the model looks at the images again for just those values;
// - anything still doubtful is flagged so the site can highlight it for the student to check.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const MAX_IMAGES = 24;
const MAX_B64 = 4_000_000;      // per image part
const MAX_TOTAL = 18_000_000;   // all parts together (Gemini accepts ~20 MB per request)

const PROMPT = `You read screenshots from a university LMS (for example MyCourseVille at Chulalongkorn University) and extract course grading data.
Screenshots may show: a course syllabus "Assessment and criteria" page (grading method, grade cut-offs, assessment weights),
a "Portfolio" / score page (points obtained "from [total points]"), or an assignment list with scores.
Several screenshots can belong to the same course: merge them by course code. Use the syllabus for weights and the score page for scores.

Return ONLY JSON in this exact shape:
{
  "courses": [
    {
      "code": "2301115.01",            // course code with section if shown, else null
      "name": "Calculus for Business I", // course name as shown (complete the truncated part only if another screenshot shows it)
      "credits": null,                   // only if a screenshot shows credits, else null
      "grading": {
        "method": "letter",              // "letter" for A-F, "su" for Pass-Fail (S/U)
        "referencing": "criterion",      // "criterion" (อิงเกณฑ์), "norm" (อิงกลุ่ม) or null
        "cutoffs": {"A":80,"B+":75,"B":70,"C+":65,"C":60,"D+":55,"D":50}, // only for criterion letter grades, else null
        "minimumGrades": null,          // norm grading only: sparse map of explicitly guaranteed minimum grades, e.g. {"D":40}; otherwise null
        "mpl": null                      // Minimum Passing Level number if shown, else null
      },
      "groups": [ {"name": "Homework before final exam", "weight": 15} ],
      "assessments": [
        {"name": "Midterm Exam", "type": "midterm", "weight": 35, "max": 35, "score": 28, "group": null, "due": null}
      ]
    }
  ],
  "notes": ["short notes in the user's language about anything uncertain"]
}

Rules:
- type is one of: midterm, final, assignment, homework, quiz, project, presentation, lab, participation, attendance, custom.
- weight = percentage of the course grade from the syllabus. If only the score page is visible and it shows points out of a total that matches the weight, use that total as the weight.
- max = full raw score shown as "/ N" on the score page; if unknown use the weight.
- score = points obtained. "Not ready", "-", blank, or pending = null. Never turn a missing score into 0. A score shown as 0 is 0.
- Child items under a parent row (indented, e.g. HW1, HW2 under "Homework before midterm exam") go in "assessments" with "group" set to the parent name; put the parent in "groups" with its weight. Do not also list the parent as an assessment.
- Scores shown in blue are calculated totals of child items; do not add them as separate assessments.
- If a page says Pass-Fail (S/U) is selected, method is "su"; put the MPL in "mpl".
- For norm grading, extract minimumGrades only when the syllabus explicitly guarantees at least that letter at or above a total course percentage. Never use distribution, mean, tentative cutoffs, component thresholds, a standard scale, or a strict greater-than threshold as an inclusive guarantee. Omit unknown entries; if unclear, return null and explain in notes.
- Thai Buddhist years: subtract 543 for due dates (2569 → 2026). Thai months: ม.ค.=1 ... ธ.ค.=12.
- Do not invent courses, weights, or scores that are not visible. Keep names short but recognizable.

Reading numbers:
- Copy every number exactly as printed, digit by digit, keeping all decimals (e.g. 4.85 stays 4.85, 21.88 stays 21.88). Do not round.
- Read the score and the full score of each row from the same row. Check that a score is not larger than its full score; if it seems to be, look again.
- Some images are parts of one tall screenshot ("part 1 of 3" …). Parts overlap: a row seen at the end of one part and the start of the next is the SAME row — list it once.`;

type Img = { mime: string; data: string; label?: string };
type Hint = { code?: string; name?: string; section?: string; assessments?: { name?: string; type?: string; max?: number; weight?: number; group?: string }[] };

function hintText(hints: Hint[]) {
  if (!Array.isArray(hints) || !hints.length) return "";
  const lines = hints.slice(0, 15).map((h) => {
    const items = (h.assessments || []).slice(0, 40).map((a) =>
      `    - "${a.name}" (type ${a.type || "?"}${a.max != null ? `, full score ${a.max}` : ""}${a.weight != null ? `, weight ${a.weight}%` : ""}${a.group ? `, in group "${a.group}"` : ""})`).join("\n");
    return `  * ${h.code || ""} ${h.name || ""}${h.section ? ` (Sec ${h.section})` : ""}\n${items}`;
  }).join("\n");
  return `\n\nThe student already has these courses and assessments in the app. When a screenshot row is one of these, use the EXACT assessment name and course code from this list (the app matches by name), and use the full score shown in the screenshot. Only add new assessments for rows that are clearly not in the list.\n${lines}`;
}

function cleanJSON(text: string) {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  return JSON.parse(s >= 0 && e > s ? t.slice(s, e + 1) : t);
}

const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// Checks a reading; returns human-readable issues and marks doubtful assessments with `flag`.
// deno-lint-ignore no-explicit-any
function validate(result: any) {
  const issues: string[] = [];
  const courses = Array.isArray(result?.courses) ? result.courses : [];
  for (const c of courses) {
    const g = c.grading;
    if (g && g.minimumGrades != null) {
      const raw = g.minimumGrades;
      let prev = Infinity;
      let bad = g.referencing !== "norm" || !raw || typeof raw !== "object" || Array.isArray(raw);
      const clean: Record<string, number> = {};
      for (const key of ["A","B+","B","C+","C","D+","D"]) {
        const v = raw?.[key]; if (v == null) continue;
        if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 100 || v >= prev) { bad = true; continue; }
        clean[key] = v; prev = v;
      }
      g.minimumGrades = bad ? null : clean;
      if (bad) issues.push(`${c.code || c.name || "course"}: invalid minimum grade guarantees; review syllabus`);
    }
    const items = Array.isArray(c.assessments) ? c.assessments : [];
    const groups = Array.isArray(c.groups) ? c.groups : [];
    const label = c.code || c.name || "course";
    const seen = new Map<string, number>();
    const shown = new Map<string, string>();
    for (const a of items) {
      delete a.flag;
      const s = num(a.score), m = num(a.max);
      const key = String(a.name || "").trim().toLowerCase() + "|" + String(a.group || "").trim().toLowerCase();
      seen.set(key, (seen.get(key) || 0) + 1);
      if (!shown.has(key)) shown.set(key, String(a.name || "").trim());
      if (s !== null && s < 0) { a.flag = "negative"; issues.push(`${label}: "${a.name}" score ${s} is negative`); }
      else if (s !== null && m !== null && s > m + 1e-9) { a.flag = "over_max"; issues.push(`${label}: "${a.name}" score ${s} is above its full score ${m}`); }
      else if (s !== null && m === null) { a.flag = "no_max"; issues.push(`${label}: "${a.name}" has a score but no full score`); }
    }
    for (const [k, n] of seen) if (n > 1) {
      issues.push(`${label}: "${shown.get(k)}" appears ${n} times (overlapping parts?)`);
      for (const a of items) {
        const ak = String(a.name || "").trim().toLowerCase() + "|" + String(a.group || "").trim().toLowerCase();
        if (ak === k) a.flag = a.flag || "duplicate";
      }
    }
    // Weights: ungrouped items + group weights should make 100 when the syllabus weights are present.
    const ungrouped = items.filter((a: { group?: string }) => !a.group);
    const w = ungrouped.reduce((t: number, a: { weight?: unknown }) => t + (num(a.weight) || 0), 0)
      + groups.reduce((t: number, g: { weight?: unknown }) => t + (num(g.weight) || 0), 0);
    const allWeighted = ungrouped.every((a: { weight?: unknown }) => num(a.weight) !== null);
    if (allWeighted && items.length && w > 0 && Math.abs(w - 100) > 0.5) {
      issues.push(`${label}: weights add up to ${Math.round(w * 100) / 100}%, not 100%`);
      c.weightFlag = Math.round(w * 100) / 100;
    } else delete c.weightFlag;
  }
  return issues;
}

// ---- model calls ----
async function geminiCall(key: string, models: string[], parts: unknown[], allowFallbackOnLimit: boolean, deadline: number) {
  let last = "";
  for (const m of models) {
    for (const hiRes of [true, false]) {
      const body = {
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", ...(hiRes ? { mediaResolution: "MEDIA_RESOLUTION_HIGH" } : {}) },
      };
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(body),
        signal: AbortSignal.timeout(Math.max(5_000, deadline - Date.now())),
      });
      if (r.status === 404) { last = `model ${m} not found`; break; }
      const j = await r.json().catch(() => ({}));
      if (r.status === 400 && hiRes && /mediaResolution|media_resolution|Unknown name/i.test(JSON.stringify(j))) continue; // older model: retry without
      if (!r.ok) {
        // busy / overloaded / quota for this model: try the next model
        if (r.status === 429 || r.status >= 500) { last = "rate_limited"; if (allowFallbackOnLimit) break; throw new Error("rate_limited"); }
        throw new Error(j?.error?.message || `gemini_${r.status}`);
      }
      const text = (j?.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("");
      return { model: m, text };
    }
  }
  throw new Error(last || "no_model");
}

const FLASH = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3-flash", "gemini-3-flash-preview", "gemini-2.5-flash"];
const PRO = ["gemini-pro-latest", "gemini-3.5-pro", "gemini-3-pro", "gemini-3-pro-preview", "gemini-2.5-pro"];

async function claudeCall(key: string, images: Img[], text: string, deadline: number) {
  const model = Deno.env.get("SCAN_MODEL") || "claude-sonnet-5-5";
  const content: unknown[] = [];
  images.forEach((i) => {
    if (i.label) content.push({ type: "text", text: i.label });
    content.push({ type: "image", source: { type: "base64", media_type: i.mime, data: i.data } });
  });
  content.push({ type: "text", text });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 12000, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(Math.max(5_000, deadline - Date.now())),
  });
  const j = await r.json();
  if (!r.ok) {
    if (r.status === 429 || r.status === 529) throw new Error("rate_limited");
    throw new Error(j?.error?.message || `claude_${r.status}`);
  }
  const out = (j.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  return { model, text: out };
}

function geminiParts(images: Img[], text: string) {
  const parts: unknown[] = [{ text }];
  images.forEach((i) => {
    if (i.label) parts.push({ text: i.label });
    parts.push({ inline_data: { mime_type: i.mime, data: i.data } });
  });
  return parts;
}

// Accepts the usual names people give these secrets (and trims stray spaces).
function pick(names: string[]) {
  for (const n of names) { const v = (Deno.env.get(n) || "").trim(); if (v) return v; }
  return "";
}
function keys() {
  return {
    anthropic: pick(["ANTHROPIC_API_KEY", "CLAUDE_API_KEY", "ANTHROPIC_KEY"]),
    gemini: pick(["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_AI_API_KEY", "GEMINI_KEY", "GOOGLE_GENAI_API_KEY", "API_KEY"]),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const reply = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  // Status check for the app: says whether a key is set, never reveals it.
  if (req.method === "GET") {
    const k = keys();
    return reply({ ready: !!(k.anthropic || k.gemini), provider: k.anthropic ? "claude" : k.gemini ? "gemini" : null, maxImages: MAX_IMAGES });
  }
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  try {
    const { images, lang, hints } = await req.json();
    if (!Array.isArray(images) || images.length === 0) return reply({ error: "no_images" }, 400);
    if (images.length > MAX_IMAGES) return reply({ error: "too_many_images" }, 400);
    const ok = images.every((i: Img) =>
      typeof i?.data === "string" && i.data.length <= MAX_B64 && /^image\/(png|jpeg|webp|gif)$/.test(i.mime || ""));
    if (!ok) return reply({ error: "bad_image" }, 400);
    if (images.reduce((t: number, i: Img) => t + i.data.length, 0) > MAX_TOTAL) return reply({ error: "too_large" }, 400);
    const imgs: Img[] = images.map((i: Img) => ({ mime: i.mime, data: i.data, label: typeof i.label === "string" ? i.label.slice(0, 120) : undefined }));

    const { anthropic, gemini } = keys();
    if (!anthropic && !gemini) return reply({ error: "no_key" }, 503);
    const forced = Deno.env.get("SCAN_MODEL");
    const noteLang = `\nWrite "notes" in ${lang === "th" ? "Thai" : "English"}.`;
    const firstText = PROMPT + hintText(hints) + noteLang;

    // Edge functions are stopped after ~150 s; keep well inside that so a slow second look never loses the first reading.
    const started = Date.now();
    const END = started + 140_000;
    // Pass 1: read everything.
    const first = anthropic ? await claudeCall(anthropic, imgs, firstText, started + 110_000)
      : await geminiCall(gemini, forced ? [forced] : [...FLASH, ...PRO], geminiParts(imgs, firstText), true, started + 110_000);
    let result = cleanJSON(first.text);
    let model = first.model;
    let issues = validate(result);
    const firstIssues = issues.length;
    let rechecked = false;

    // Pass 2: only when something looks off, look again at just those values.
    if (issues.length && Date.now() < started + 75_000) {
      const verifyText = PROMPT + hintText(hints) +
        `\n\nA first reading of these same screenshots produced the JSON below, but these values look wrong:\n- ${issues.join("\n- ")}\n\n` +
        `Look at the images again carefully, especially those rows. Return the complete corrected JSON in the same shape (all courses and rows, not only the corrected ones). ` +
        `If a value really is as printed, keep it and mention it in "notes".\n\nFirst reading:\n${JSON.stringify(result).slice(0, 60000)}` + noteLang;
      try {
        const second = anthropic ? await claudeCall(anthropic, imgs, verifyText, END)
          : await geminiCall(gemini, forced ? [forced] : [...PRO, ...FLASH], geminiParts(imgs, verifyText), true, END);
        const corrected = cleanJSON(second.text);
        if (Array.isArray(corrected?.courses) && corrected.courses.length) {
          const after = validate(corrected);
          if (after.length <= issues.length) { result = corrected; issues = after; model = second.model; rechecked = true; }
          else validate(result); // keep the first reading; re-mark its flags
        }
      } catch (_) {
        // keep the first reading if the second look fails (e.g. rate limit); its doubtful values stay flagged
      }
    }

    const courses = Array.isArray(result?.courses) ? result.courses : [];
    return reply({ courses, notes: Array.isArray(result?.notes) ? result.notes : [], model, check: { found: firstIssues, rechecked, remaining: issues } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/timed? ?out|TimeoutError|aborted/i.test(msg)) return reply({ error: "timeout", detail: msg }, 504);
    const badKey = /api key|api_key|permission|unauthori|invalid.*key|PERMISSION_DENIED/i.test(msg);
    return reply({ error: msg === "rate_limited" ? "rate_limited" : badKey ? "bad_key" : "scan_failed", detail: msg }, msg === "rate_limited" ? 429 : 500);
  }
});
