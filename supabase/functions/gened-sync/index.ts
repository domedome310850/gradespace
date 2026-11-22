// GradeSpace: keeps public.gened_courses in step with the GenEd course list that gened.chula.ac.th publishes
// (a PDF with one column per GenEd group), and asks the Reg sync to read those courses for the current and next
// term, so the app can say which GenEd courses are actually open and when. No student data is read.
// Called daily by pg_cron with the token stored in Vault (see reg_sync_check_token). ?dry=1 parses without saving.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { getDocumentProxy } from "npm:unpdf@0.12.1";

const LIST_PDF = "https://www.gened.chula.ac.th/server-api/pdf/course-list";
const CATS = ["hum", "inter", "sci", "soc", "c21", "mooc"]; // left to right in the PDF

type Item = { s: string; x: number; y: number };
type Course = { code: string; name: string; cats: string[]; credits: number | null; hours: string | null; tags: string[] };

// The six columns start at the header "รหัสวิชา" positions; fall back to an even split of the page.
function columnStarts(items: Item[], pageWidth: number) {
  const heads = items.filter((i) => i.s.trim() === "รหัสวิชา").map((i) => i.x).sort((a, b) => a - b);
  if (heads.length === 6) return heads;
  const w = pageWidth / 6;
  return [0, 1, 2, 3, 4, 5].map((k) => Math.round(k * w + 15));
}

function parsePage(items: Item[], pageWidth: number, found: Map<string, Course>) {
  const starts = columnStarts(items, pageWidth);
  const colOf = (x: number) => { let c = 0; for (let k = 0; k < 6; k++) if (x >= starts[k] - 6) c = k; return c; };
  for (let col = 0; col < 6; col++) {
    const x0 = starts[col];
    const mine = items.filter((i) => colOf(i.x) === col);
    // rows: same baseline (within 2pt), top to bottom
    const ys = [...new Set(mine.map((i) => i.y))].sort((a, b) => b - a);
    const rows: Item[][] = [];
    for (const y of ys) {
      const last = rows[rows.length - 1];
      const line = mine.filter((i) => i.y === y);
      if (last && Math.abs(last[0].y - y) <= 2) last.push(...line); else rows.push(line);
    }
    let cur: Course | null = null, curNew = false;
    for (const row of rows) {
      row.sort((a, b) => a.x - b.x);
      const text = row.map((i) => i.s).join(" ");
      if (/รหัสวิชา|หน่วยกิต|รายวิชาศึกษาทั่วไป/.test(text)) { cur = null; curNew = false; continue; }
      const codeItem = row.find((i) => /^\d{7}$/.test(i.s.trim()) && i.x < x0 + 25);
      const nameParts = row.filter((i) => i !== codeItem && i.x >= x0 + 25 && i.x < x0 + 128).map((i) => i.s);
      const credParts = row.filter((i) => i.x >= x0 + 128).map((i) => i.s).join("");
      if (codeItem) {
        const code = codeItem.s.trim();
        const m = credParts.replace(/\s+/g, "").match(/^(-?\d+(?:\.\d+)?)?(?:\(([\d-]+)\))?/);
        const prev = found.get(code);
        cur = prev || { code, name: "", cats: [], credits: null, hours: null, tags: [] };
        curNew = !prev;
        if (!prev) {
          cur.name = nameParts.join(" ").replace(/\s+/g, " ").trim();
          cur.credits = m && m[1] ? Math.abs(Number(m[1])) : null;
          cur.hours = m && m[2] ? m[2] : null;
          found.set(code, cur);
        }
        if (!cur.cats.includes(CATS[col])) cur.cats.push(CATS[col]);
      } else if (cur && curNew && nameParts.length) {
        // a name that wrapped onto the next line, e.g. "INTRO MECH DESIGN (-" + "กลุ่มพิเศษ)"
        cur.name = (cur.name + " " + nameParts.join(" ")).replace(/\(\s*-\s*/, "(").replace(/\s+/g, " ").trim();
        if (cur.credits === null) {
          const m = credParts.replace(/\s+/g, "").match(/^(\d+(?:\.\d+)?)?(?:\(([\d-]+)\))?/);
          if (m && m[1]) cur.credits = Number(m[1]);
          if (m && m[2]) cur.hours = m[2];
        }
      }
    }
  }
}

function finish(c: Course): Course {
  const tags: string[] = [];
  let name = c.name;
  if (/\(EN\/TH\)/i.test(name)) tags.push("enth");
  if (/\(INTER\)/i.test(name)) tags.push("inter");
  if (/กลุ่มพิเศษ/.test(name)) tags.push("special");
  if (/\(\s*INTER\s*\)/i.test(name) && !tags.includes("inter")) tags.push("inter");
  name = name.replace(/\(\s*(?:EN\/TH|INTER|-?\s*กลุ่มพิเศษ)\s*\)/gi, "")
    .replace(/\s+\d{2,3}$/, "") // a page or row count that sits on the same line as the last name in a column
    .replace(/\s+/g, " ").trim();
  return { ...c, name, tags };
}

// The term students are choosing courses for (Thai academic years; term 1 ≈ Aug–Dec, term 2 ≈ Jan–May):
// Aug–Sep the current term 1, Oct–Feb term 2, Mar–Jul the next year's term 1.
function terms(now = new Date()) {
  const m = now.getUTCMonth() + 1, y = now.getUTCFullYear() + 543;
  if (m >= 8 && m <= 9) return [[String(y), "1"]];
  if (m >= 10) return [[String(y), "2"]];
  if (m <= 2) return [[String(y - 1), "2"]];
  return [[String(y), "1"]];
}

Deno.serve(async (req) => {
  const reply = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const chk = await sb.rpc("reg_sync_check_token", { p_token: req.headers.get("x-sync-token") || "" });
  if (chk.error || chk.data !== true) return reply({ error: "forbidden" }, 403);
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const r = await fetch(LIST_PDF, { headers: { "User-Agent": "GradeSpace course sync" } });
    if (!r.ok) return reply({ error: "pdf_" + r.status }, 502);
    const pdf = await getDocumentProxy(new Uint8Array(await r.arrayBuffer()));
    const found = new Map<string, Course>();
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const width = page.getViewport({ scale: 1 }).width;
      const tc = await page.getTextContent();
      // deno-lint-ignore no-explicit-any
      const items: Item[] = (tc.items as any[]).filter((i) => i.str && i.str.trim()).map((i) => ({ s: i.str, x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) }));
      parsePage(items, width, found);
    }
    const list = [...found.values()].map(finish).filter((c) => c.name);
    // A broken download must not wipe the list: only save a list of believable size.
    if (list.length < 100) return reply({ error: "too_few", n: list.length, sample: list.slice(0, 5) }, 502);
    if (dry) return reply({ n: list.length, list });
    const now = new Date().toISOString();
    for (let i = 0; i < list.length; i += 200) {
      const up = await sb.from("gened_courses").upsert(list.slice(i, i + 200).map((c) => ({ ...c, seen_at: now, updated_at: now })));
      if (up.error) throw new Error(up.error.message);
    }
    // ask the Reg sync to read these courses for the term students are choosing for (existing queue rows are left alone)
    let queued = 0;
    for (const [y, t] of terms()) {
      const rows = list.map((c) => ({ academic_year: y, term: t, program: "S", course_no: c.code, next_due: now }));
      for (let i = 0; i < rows.length; i += 200) {
        const ins = await sb.from("reg_queue").upsert(rows.slice(i, i + 200), { onConflict: "academic_year,term,program,course_no", ignoreDuplicates: true });
        if (ins.error) throw new Error(ins.error.message);
      }
      queued += rows.length;
    }
    return reply({ n: list.length, queued, terms: terms() });
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
