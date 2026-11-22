// GradeSpace: sync public course schedules (sections, class times, instructors, exam dates)
// from Reg Chula (cas.reg.chula.ac.th) into public.reg_offerings. No student data is read.
// Called by pg_cron with the token stored in Vault (see reg_sync_check_token).
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const BASE = "https://cas.reg.chula.ac.th";
const FORM = "/servlet/com.dtm.chula.cs.servlet.QueryCourseScheduleNew.QueryCourseScheduleNewServlet";
const LIST = "/servlet/com.dtm.chula.cs.servlet.QueryCourseScheduleNew.CourseListNewServlet";
const DETAIL = "/servlet/com.dtm.chula.cs.servlet.QueryCourseScheduleNew.CourseScheduleDtlNewServlet";
// Reg's server leaves this intermediate out of its TLS chain; we add it ourselves instead of turning verification off.
const INTERMEDIATE = "http://secure.globalsign.com/cacert/gsrsaovsslca2018.crt";

let httpClient: Deno.HttpClient | null = null;
async function regClient(): Promise<Deno.HttpClient> {
  if (httpClient) return httpClient;
  const raw = new Uint8Array(await (await fetch(INTERMEDIATE)).arrayBuffer());
  const asText = new TextDecoder().decode(raw.slice(0, 30));
  let pem: string;
  if (asText.startsWith("-----BEGIN")) pem = new TextDecoder().decode(raw);
  else {
    let b = "";
    for (const x of raw) b += String.fromCharCode(x);
    pem = "-----BEGIN CERTIFICATE-----\n" + (btoa(b).match(/.{1,64}/g) || []).join("\n") + "\n-----END CERTIFICATE-----\n";
  }
  httpClient = Deno.createHttpClient({ caCerts: [pem] });
  return httpClient;
}

class Session {
  jar = new Map<string, string>();
  async get(path: string, params?: Record<string, string>): Promise<string> {
    let url = BASE + path + (params ? "?" + new URLSearchParams(params).toString() : "");
    const client = await regClient();
    for (let i = 0; i < 6; i++) {
      const r = await fetch(url, {
        // deno-lint-ignore no-explicit-any
        client, redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (GradeSpace course schedule sync)",
          Cookie: [...this.jar].map(([k, v]) => k + "=" + v).join("; "),
        },
      } as RequestInit & { client: Deno.HttpClient });
      for (const c of r.headers.getSetCookie()) {
        const kv = c.split(";")[0];
        const j = kv.indexOf("=");
        if (j > 0) this.jar.set(kv.slice(0, j).trim(), kv.slice(j + 1).trim());
      }
      const loc = r.headers.get("location");
      if (r.status >= 300 && r.status < 400 && loc) {
        await r.body?.cancel();
        url = new URL(loc, url).toString();
        continue;
      }
      return new TextDecoder("windows-874").decode(new Uint8Array(await r.arrayBuffer()));
    }
    throw new Error("too many redirects");
  }
}

const clean = (s: string | null | undefined) => (s || "").replace(/\s+/g, " ").trim();
const MONTHS: Record<string, number> = {
  "มกราคม": 1, "กุมภาพันธ์": 2, "มีนาคม": 3, "เมษายน": 4, "พฤษภาคม": 5, "มิถุนายน": 6,
  "กรกฎาคม": 7, "สิงหาคม": 8, "กันยายน": 9, "ตุลาคม": 10, "พฤศจิกายน": 11, "ธันวาคม": 12,
  "ม.ค.": 1, "ก.พ.": 2, "มี.ค.": 3, "เม.ย.": 4, "พ.ค.": 5, "มิ.ย.": 6,
  "ก.ค.": 7, "ส.ค.": 8, "ก.ย.": 9, "ต.ค.": 10, "พ.ย.": 11, "ธ.ค.": 12,
};
const pad = (t: string) => (t.length < 5 ? "0" + t : t);
const EXAM_RE = /(\d{1,2})\s+([^\s]+)\s+(\d{4})\s+เวลา\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/;

function parseExam(value: string) {
  const v = clean(value);
  if (!v || /TDF|รอประกาศ|TBA/.test(v.slice(0, 40))) return null;
  const m = v.match(EXAM_RE);
  if (!m) return null;
  const month = MONTHS[m[2]];
  if (!month) return null;
  const y = Number(m[3]) - 543;
  const date = `${y}-${String(month).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
  return { date, start: pad(m[4]), end: pad(m[5]) };
}

// Reg's pages are old-style HTML (<FONT COLOR="#660000" FACE="...">, upper-case tags), so they are read with
// plain patterns instead of a DOM library.
const decode = (h: string) => clean(h.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">"));
const between = (h: string, from: RegExp, to: RegExp) => {
  const i = h.search(from);
  if (i < 0) return "";
  const rest = h.slice(i);
  const j = rest.slice(1).search(to);
  return j < 0 ? rest : rest.slice(0, j + 1);
};
function fontTexts(html: string, face: string) {
  const out: string[] = [];
  const re = /<font\b([^>]*)>([\s\S]*?)<\/font>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (!/color\s*=\s*"?#660000/i.test(attrs)) continue;
    const f = attrs.match(/face\s*=\s*"([^"]*)"/i);
    if (!f || f[1].trim() !== face) continue;
    out.push(decode(m[2]));
  }
  return out;
}

function parseDetail(html: string) {
  const l1 = fontTexts(html, "Tahoma,Verdana,Arial,Helvetica");
  if (!l1.length) throw new Error("cannot parse course header");
  const l2 = fontTexts(html, "MS Sans Serif");
  const dept = l2[2] || "";
  const deptM = dept.match(/\(([^)]+)\)/);

  const examText = decode(between(html, /id\s*=\s*"?Table4/i, /id\s*=\s*"?Table3/i) || html);
  const mi = examText.indexOf("วันสอบกลางภาค"), fi = examText.indexOf("วันสอบปลายภาค");
  const after = (at: number, label: string, stop: number) =>
    at < 0 ? "" : (stop > at ? examText.slice(at, stop) : examText.slice(at)).slice(label.length).replace(/^[\s:]+/, "");
  const midterm = parseExam(after(mi, "วันสอบกลางภาค", fi));
  const final = parseExam(after(fi, "วันสอบปลายภาค", -1));

  type Cls = { type: string; day: string | null; start: string; end: string; building: string | null; room: string | null; teachers: string[] };
  type Sec = { sec: string; closed: boolean; note: string | null; seats: string | null; teachers: string[]; classes: Cls[] };
  const sections: Sec[] = [];
  let cur: Sec | null = null;
  const t3 = between(html, /id\s*=\s*"?Table3/i, /<\/table>/i);
  if (!t3) throw new Error("missing schedule table");
  const rows = [...t3.matchAll(/<tr\b[^>]*>([\s\S]*?)(?=<tr\b|<\/table>|$)/gi)].map((m) => m[1]);
  rows.forEach((row, idx) => {
    if (idx < 2) return;
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)(?=<td\b|<\/tr>|$)/gi)].map((m) => decode(m[1]));
    if (cells.length < 2) return;
    const secM = cells[1].match(/^(\d+)/);
    // Continuation rows (more days for the same section) either drop the section cell or leave it empty.
    const off = secM || cells[1] === "" ? 1 : 0;
    if (secM && (!cur || cur.sec !== String(parseInt(secM[1], 10)))) {
      cur = { sec: String(parseInt(secM[1], 10)), closed: cells[0] !== "", note: cells[8] || null, seats: cells[9] || null, teachers: [], classes: [] };
      sections.push(cur);
    }
    if (!cur) return;
    const type = cells[off + 1] || "LECT";
    const days = (cells[off + 2] || "").split(" ").filter(Boolean);
    const period = cells[off + 3] || "IA";
    const [ps, pe] = period.includes("-") ? period.split("-", 2) : [period, period];
    const building = cells[off + 4] && cells[off + 4] !== "IA" ? cells[off + 4] : null;
    const room = cells[off + 5] && cells[off + 5] !== "IA" ? cells[off + 5] : null;
    const teachers = (cells[off + 6] || "").split(",").map((x) => x.trim()).filter(Boolean);
    for (const t of teachers) if (!cur.teachers.includes(t)) cur.teachers.push(t);
    const dayList: (string | null)[] = days.length && days.every((d) => /^(MO|TU|WE|TH|FR|SA|SU|IA|AR)$/.test(d)) ? days : [null];
    for (const d of dayList) cur.classes.push({ type, day: d, start: /\d/.test(ps) ? pad(ps) : ps, end: /\d/.test(pe) ? pad(pe) : pe, building, room, teachers });
  });

  return {
    abbr_name: l1[1] || null,
    name_en: l1[2] || null,
    credits: /^\d+(\.\d+)?$/.test(l1[3] || "") ? Number(l1[3]) : null,
    credit_hours: clean((l1[4] || "") + " " + (l1[5] || "")) || null,
    name_th: l2[1] || null,
    department: deptM ? deptM[1].trim() : (dept || null),
    midterm, final, sections,
  };
}

function listHasCourse(html: string, code: string) {
  // Reg writes old-style markup (<A HREF=... >, unquoted, upper case), so look at the raw HTML.
  const re = new RegExp("CourseScheduleDtlNewServlet[^>]*>(?:\\s|&#160;|&nbsp;|<[^>]+>)*" + code + "(?![0-9])", "i");
  return re.test(html);
}

const listParams = (code: string, program: string, term: string, year: string) => ({
  studyProgram: program, semester: term, acadyearEfd: year, courseno: code, coursename: "",
  faculty: code.slice(0, 2), examdate: "", examstart: "", examend: "", coursetype: "0", genedcode: "",
  cursemester: term, curacadyear: year, acadyear: year, lang: "T", activestatus: "ON", download: "download",
});

const BUSY = /ระบบยังไม่พร้อมใช้งาน|ปิดปรับปรุง|service unavailable/i;
class RegBusy extends Error { constructor() { super("reg busy"); } }

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const later = (ms: number) => new Date(Date.now() + ms).toISOString();

Deno.serve(async (req: Request) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const token = req.headers.get("x-sync-token") || "";
  const chk = await sb.rpc("reg_sync_check_token", { p_token: token });
  if (chk.error || chk.data !== true) return json({ error: "forbidden" }, 403);

  const batch = Math.min(Math.max(Number(body.batch) || 8, 1), 15);
  type Job = { academic_year: string; term: string; program: string; course_no: string; fails: number };
  let jobs: Job[];
  if (Array.isArray(body.codes) && body.year && body.term) {
    jobs = body.codes.slice(0, 15).map((c: string) => ({ academic_year: String(body.year), term: String(body.term), program: "S", course_no: String(c).slice(0, 7), fails: 0 }));
  } else {
    const q = await sb.from("reg_queue").select("academic_year,term,program,course_no,fails")
      .lte("next_due", new Date().toISOString()).order("next_due").limit(batch);
    if (q.error) return json({ error: q.error.message }, 500);
    jobs = (q.data || []) as Job[];
  }
  if (!jobs.length) return json({ processed: 0, results: [] });

  const s = new Session();
  let formHtml = "";
  try { formHtml = await s.get(FORM); } catch (e) { return json({ error: "reg_unreachable", detail: String((e as Error).message || e) }, 502); }

  const results: unknown[] = [];
  if (body.debug) results.push({ form: true, len: formHtml.length, cookies: [...s.jar.keys()] });
  for (const j of jobs) {
    const key = { academic_year: j.academic_year, term: j.term, program: j.program, course_no: j.course_no };
    try {
      const list = await s.get(LIST, listParams(j.course_no, j.program, j.term, j.academic_year));
      if (body.debug) {
        const html = await s.get(DETAIL, { courseNo: j.course_no, studyProgram: j.program });
        const t3 = html.search(/Table3/i);
        let parsed: unknown = null, perr = "";
        try { parsed = parseDetail(html); } catch (e) { perr = String((e as Error).message || e); }
        results.push({ course: j.course_no, debug: true, parsed, perr, table3: t3 >= 0 ? html.slice(t3 + 1500, t3 + 5000) : null,
          listText: decode(list).slice(0, 500), detailText: decode(html).slice(0, 500), detailLen: html.length, cookies: [...s.jar.entries()].map(([k, v]) => k + "=" + v.slice(0, 6)) });
        continue;
      }
      // Reg sometimes answers "system not ready" (busy or closed). Then stop this batch and come back later
      // rather than retrying or wrongly recording the course as not offered.
      const listText = decode(list);
      if (BUSY.test(listText)) throw new RegBusy();
      if (/ไม่พบรายวิชา/.test(listText)) {
        // Reg also says "not found" while it's struggling, so only wait a day before checking again.
        await sb.from("reg_queue").upsert({ ...key, status: "not_offered", last_error: null, fails: 0, next_due: later(86400e3) });
        results.push({ course: j.course_no, status: "not_offered" });
        await sleep(400);
        continue;
      }
      const html = await s.get(DETAIL, { courseNo: j.course_no, studyProgram: j.program });
      if (BUSY.test(decode(html).slice(0, 400))) throw new RegBusy();
      // The detail page must show this exact course (it follows the session's last search).
      const shown = fontTexts(html, "Tahoma,Verdana,Arial,Helvetica")[0] || "";
      if (!/Table3/i.test(html) || shown !== j.course_no) {
        throw new Error("unexpected page (shows '" + shown.slice(0, 20) + "')");
      } else {
        const row = parseDetail(html);
        const up = await sb.from("reg_offerings").upsert({ ...key, ...row, fetched_at: new Date().toISOString() });
        if (up.error) throw new Error(up.error.message);
        await sb.from("reg_queue").upsert({ ...key, status: "ok", last_ok: new Date().toISOString(), last_error: null, fails: 0, next_due: later(86400e3) });
        results.push({ course: j.course_no, status: "ok", sections: row.sections.length, midterm: row.midterm, final: row.final });
      }
    } catch (e) {
      if (e instanceof RegBusy) {
        // Push this and the rest of the batch back 30 minutes without counting a failure.
        const rest = jobs.slice(jobs.indexOf(j));
        for (const r of rest) await sb.from("reg_queue").upsert({ academic_year: r.academic_year, term: r.term, program: r.program, course_no: r.course_no, status: "waiting", last_error: "reg busy", fails: r.fails || 0, next_due: later(30 * 60e3) });
        results.push({ course: j.course_no, status: "reg_busy", postponed: rest.length });
        break;
      }
      const fails = (j.fails || 0) + 1;
      const msg = String((e as Error).message || e).slice(0, 300);
      await sb.from("reg_queue").upsert({ ...key, status: "error", last_error: msg, fails, next_due: later(Math.min(fails * 30, 720) * 60e3) });
      results.push({ course: j.course_no, status: "error", error: msg });
    }
    await sleep(400);
  }
  return json({ processed: results.length, results });
});
