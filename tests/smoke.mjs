// Smoke test for public/index.html: opens every page in Thai and English, on a phone and a desktop width,
// with the network replaced by local copies (no real Supabase calls). Fails on any page error, console
// error or horizontal overflow.
//   cd tests && npm install && npx playwright install chromium && npm test
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = 'file://' + resolve(here, '../public/index.html');
const state = JSON.parse(readFileSync(resolve(here, 'fixtures/sample-state.json'), 'utf8'));
const LIBS = {
  'react.production': resolve(here, 'node_modules/react/umd/react.production.min.js'),
  'react-dom.production': resolve(here, 'node_modules/react-dom/umd/react-dom.production.min.js'),
  'htm.umd': resolve(here, 'node_modules/htm/dist/htm.umd.js'),
};
// Stand-in for supabase-js: gs_load returns the fixture, every other call succeeds with nothing.
const FAKE_SUPABASE = `window.supabase={createClient:()=>({auth:{},functions:{},rpc:async(fn,args)=>{
  if(fn==='gs_load')return {data:[{data:window.__D,client_updated_at:Date.now()}],error:null};
  if(fn==='gs_exam_device'){
    if(args.p_email!=='test@example.com'||!(/^[0-9a-f]{64}$/).test(args.p_device))throw Error('invalid device scope');
    if(args.p_action==='get')return {data:{studentId:window.__studentId||null},error:null};
    if(args.p_action==='save'){window.__studentId=args.p_student_id;return {data:{saved:true},error:null};}
    if(args.p_action==='remove'){window.__studentId=null;return {data:{saved:false},error:null};}
    if(args.p_action==='lookup'){window.__examRequest=args;return {data:[{code:args.p_courses[0].code,sec:args.p_courses[0].sec,date:'2026-11-23',time:'08:30-10:30',room:'TEST-ROOM',page:1}],error:null};}
  }
  if(fn==='gs_reg_offerings'||fn==='gs_gened_list')return {data:[],error:null};
  return {data:0,error:null};}})};
`;

async function run(browser, lang, width) {
  const errors = [], overflow = [];
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(([d]) => { window.__D = d; localStorage.setItem('gradespace.email', 'test@example.com'); }, [state]);
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    for (const [k, f] of Object.entries(LIBS)) if (u.includes(k)) return route.fulfill({ path: f, contentType: 'application/javascript' });
    if (u.includes('supabase.js')) return route.fulfill({ body: FAKE_SUPABASE, contentType: 'application/javascript' });
    if (u.includes('gs-scan')) return route.fulfill({ body: '{"ready":true}', contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } });
    return route.abort();
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push('console: ' + m.text()); });
  await page.goto(PAGE + '#dashboard');
  await page.waitForTimeout(1500);
  if (lang === 'en') { await page.locator('button', { hasText: 'EN' }).first().click(); await page.waitForTimeout(300); }
  // Save and lookup without email verification, using the browser-scoped device key.
  await page.evaluate(() => {
    const s=GradeSpace.S.state, sem=s.semesters.find(x=>x.id===s.settings.currentSemesterId)||s.semesters[s.semesters.length-1];
    if(!sem)throw Error('fixture needs semester');
    const year=s.years.find(x=>x.id===sem.yearId);
    GradeSpace.update(d=>{d.years.find(x=>x.id===year.id).academic='2569'; d.semesters.find(x=>x.id===sem.id).kind='s1';d.settings.currentSemesterId=sem.id;const c=d.courses.find(x=>x.semesterId===sem.id);if(c){c.code='5500111';c.section='72';}});
  });
  await page.locator('#exam-student-id').waitFor();
  await page.locator('#exam-student-id').fill('6940102426');
  await page.getByRole('button',{name:lang==='th'?'บันทึกเลขนิสิต':'Save student ID',exact:true}).click();
  if(await page.locator('#exam-student-id').inputValue()!=='6940102426') errors.push('exam profile not saved');
  await page.getByText('TEST-ROOM',{exact:true}).waitFor();
  const lookup=await page.evaluate(()=>window.__examRequest);
  if(lookup.p_year!=='2569'||lookup.p_term!=='s1'||lookup.p_round!=='fin'||!lookup.p_courses.some(c=>c.code==='5500111'&&c.sec==='72')) errors.push('incorrect exam lookup payload');
  const ids = await page.evaluate(() => GradeSpace.S.state.courses.map((c) => c.id));
  const hashes = ['dashboard', 'years', 'courses', 'simulator', 'gpa', 'feedback', 'help', 'preferences', ...ids.map((i) => 'course-' + i)];
  for (const h of hashes) {
    await page.evaluate((x) => { location.hash = x; }, h);
    await page.waitForTimeout(250);
    const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (extra > 1) overflow.push(h + ' +' + extra + 'px');
  }
  await ctx.close();
  console.log(`${lang} ${width}px: ${hashes.length} pages, overflow ${overflow.length ? overflow.join(', ') : 'none'}, errors ${errors.length ? errors.join(' | ') : 'none'}`);
  return errors.length + overflow.length;
}

const browser = await chromium.launch();
let bad = 0;
for (const lang of ['th', 'en']) for (const w of [390, 1280]) bad += await run(browser, lang, w);
await browser.close();
if (bad) { console.error('FAILED'); process.exit(1); }
console.log('OK');
