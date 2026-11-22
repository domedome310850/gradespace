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
    if(args.p_action==='lookup'){window.__examRequest=args;const c=args.p_courses.find(c=>c.code==='2900111'&&c.sec==='4');const second=window.__studentId==='6940102526';return {data:c?[{code:c.code,sec:c.sec,date:second?'2026-11-24':'2026-11-23',time:second?'13:00-16:00':'08:30-10:30',room:second?'TEST-ROOM-B':'TEST-ROOM-A',page:1}]:[],error:null};}
  }
  if(fn==='gs_reg_offerings'||fn==='gs_gened_list')return {data:[],error:null};
  return {data:0,error:null};}})};
`;

async function run(browser, lang, width) {
  const errors = [], overflow = [];
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(([d]) => { window.__D = d; localStorage.removeItem('gradespace.email'); localStorage.removeItem('gradespace.mode'); }, [state]);
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
  await page.clock.setFixedTime(new Date('2026-11-22T07:00:00Z'));
  await page.goto(PAGE);
  await page.locator('#au-e').fill('test@example.com');
  await page.locator('#au-student').fill('6940102426');
  await page.locator('#au-student').press('Enter');
  await page.locator('.dashboard-upcoming-list').getByText('TEST-ROOM-A',{exact:false}).waitFor();
  if(await page.evaluate(()=>window.__studentId!=='6940102426')) errors.push('login did not save student ID');
  if(await page.locator('.side .nav-item').first().getAttribute('href')!=='#dashboard') errors.push('overview is not first menu');
  if(await page.locator('.side .nav-item[aria-current="page"]').getAttribute('href')!=='#dashboard') errors.push('overview is not default');
  if(await page.locator('#exam-student-id').count()) errors.push('student ID form leaked into dashboard');
  if(lang==='en'){await page.locator('button',{hasText:'EN'}).first().click();await page.waitForTimeout(300);}
  const lookup=await page.evaluate(()=>window.__examRequest);
  if(lookup.p_year!=='2569'||lookup.p_term!=='s1'||lookup.p_round!=='fin'||!lookup.p_courses.some(c=>c.code==='2900111'&&c.sec==='4')) errors.push('incorrect exam lookup payload');
  const upcoming=page.locator('.dashboard-upcoming-row').filter({hasText:'TEST-ROOM-A'});
  if(!(await upcoming.innerText()).includes('08:30-10:30')||await upcoming.locator('.date-pill b').innerText()!=='23') errors.push('personal upcoming date/time not used');
  await page.locator('.dashboard-cal-cell.has-exam').filter({has:page.locator('.cal-num',{hasText:/^23$/})}).click();
  await page.locator('.dashboard-cal-event').getByText('TEST-ROOM-A',{exact:false}).waitFor();
  // Update the saved ID via the email-entry screen only, and verify both calendar and upcoming change.
  await page.evaluate(()=>location.hash='preferences');
  await page.getByRole('button',{name:lang==='th'?'แก้ไขเลขนิสิต':'Edit student ID',exact:true}).click();
  await page.locator('#au-student').fill('6940102526');
  await page.locator('#au-student').press('Enter');
  await page.locator('#au-student').waitFor({state:'detached'});
  await page.evaluate(()=>location.hash='dashboard');
  await page.locator('.dashboard-upcoming-list').getByText('TEST-ROOM-B',{exact:false}).waitFor();
  const changed=page.locator('.dashboard-upcoming-row').filter({hasText:'TEST-ROOM-B'});
  if(!(await changed.innerText()).includes('13:00-16:00')||await changed.locator('.date-pill b').innerText()!=='24') errors.push('changed ID date/time not used');
  await page.locator('.dashboard-cal-cell.has-exam').filter({has:page.locator('.cal-num',{hasText:/^24$/})}).click();
  await page.locator('.dashboard-cal-event').getByText('TEST-ROOM-B',{exact:false}).waitFor();
  if(await page.locator('.dashboard-upcoming-list').getByText('TEST-ROOM-A',{exact:false}).count()) errors.push('stale personal room');
  if(await page.locator('#exam-student-id').count()) errors.push('old exam profile form still visible');
  // Deliberately vary titles and confirm every shared track lines up in each desktop row.
  await page.evaluate(()=>{
    GradeSpace.update(d=>{
      const sem=d.settings.currentSemesterId, cs=d.courses.filter(c=>c.semesterId===sem);
      if(cs.length>1){cs[0].name='Short';cs[1].name='Introduction to Extended International Business Statistics and Applied Financial Management';}
    });
  });
  if(width>=641){
    for(const hash of ['courses','dashboard']){
      await page.evaluate(h=>{location.hash=h;},hash);
      await page.waitForTimeout(350);
      const layout=await page.evaluate(()=>{
        const selectors=['.ccard-name','.ccard-meta','.ccard-bar-slot','.ccard-progress-slot','.ccard-warning-slot','.ccard-forecast-slot','.ccard-goal-slot','.ccard-exam-slot','.ccard-foot','.gbar-track','.ccard-forecast-slot .basis-box','.ccard-goal-slot .ccard-line','.ccard-exam-slot .ccard-line','.ccard-foot > .btn','.goal-pick-button'];
        let compared=0;const failures=[];
        document.querySelectorAll('.course-grid').forEach(grid=>{
          const cards=[...grid.querySelectorAll('.ccard')],groups=[];
          for(const c of cards){
            const top=c.getBoundingClientRect().top;
            let group=groups.find(g=>Math.abs(g.top-top)<2);
            if(!group){group={top,cards:[]};groups.push(group);}
            group.cards.push(c);
          }
          for(const group of groups){
            if(group.cards.length<2)continue;
            compared++;
            const bottoms=group.cards.map(c=>c.getBoundingClientRect().bottom);
            if(Math.max(...bottoms)-Math.min(...bottoms)>2)failures.push('card bottom');
            for(const sel of selectors){
              const positions=group.cards.map(c=>c.querySelector(sel)).filter(el=>el&&getComputedStyle(el).display!=='none').map(el=>el.getBoundingClientRect().top);
              if(positions.length>1&&Math.max(...positions)-Math.min(...positions)>2)failures.push(sel);
            }
          }
        });
        return {compared,failures};
      });
      if(!layout.compared)errors.push(hash+' no multi-card rows tested');
      if(layout.failures.length)errors.push(hash+' unaligned '+layout.failures.join(', '));
    }
  }
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
for (const lang of ['th', 'en']) for (const w of [390, 1280, 1800]) bad += await run(browser, lang, w);
await browser.close();
if (bad) { console.error('FAILED'); process.exit(1); }
console.log('OK');
