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
const FAKE_SUPABASE = `window.supabase={createClient:()=>({auth:{},functions:{},rpc:async(fn,args)=>{(window.__rpcs=window.__rpcs||[]).push(fn);
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
  // Top bar: only logo + account menu; language/theme live inside the menu (2026-11-25).
  if(await page.locator('.topbar .seg').count()) errors.push('language switch should be inside the account menu');
  if(width<=900){
    // Phones: YouTube-style bottom bar (5 tabs); language/theme live under the “You” tab.
    if(await page.locator('.bottomnav > *').count()!==5) errors.push('bottom bar should have 5 items');
    if(!(await page.getByTestId('nav-ai').isVisible())) errors.push('centre AI button missing from bottom bar');
    await page.locator('.bottomnav a[href="#me"]').click();
    await page.locator('.me-page').waitFor();
    if(lang==='en'){await page.locator('.me-page button',{hasText:'EN'}).click();await page.waitForTimeout(300);}
    if(await page.locator('.me-page a.me-row').count()<4) errors.push('You page should link years, feedback, help, settings');
    await page.evaluate(()=>{location.hash='dashboard';}); await page.waitForTimeout(300);
  } else {
    await page.locator('.topbar .acct-btn').click();
    if(!(await page.locator('.acct-menu').isVisible())) errors.push('account menu did not open');
    if(lang==='en'){await page.locator('.acct-menu button',{hasText:'EN'}).click();await page.waitForTimeout(300);}
    await page.keyboard.press('Escape');
    if(await page.locator('.acct-menu').count()) errors.push('account menu did not close on Escape');
    if(await page.locator('.side .nav-group').count()!==2) errors.push('sidebar should have 2 labelled groups');
  }
  if(await page.evaluate(()=>{const s=document.querySelectorAll('.brand-mark linearGradient');return new Set([...s].map(x=>x.id)).size!==s.length;})) errors.push('logo gradient ids are not unique');
  // Floating AI button with one-time intro bubble, and search beside the semester picker.
  if(!(await page.locator('.ai-fab-intro').isVisible())) errors.push('AI intro bubble not shown on first visit');
  await page.locator('.ai-fab-intro .btn.primary').click();
  if(await page.locator('.chat-q').count()!==3) errors.push('AI chat should offer 3 quick actions');
  await page.keyboard.press('Escape');
  if(await page.locator('.chat').count()) errors.push('AI chat did not close on Escape');
  if(await page.locator('.ai-fab-intro').count()) errors.push('AI intro bubble should not return after use');
  if(width>900 && !(await page.locator('.ai-fab').isVisible())) errors.push('AI button not visible');
  // AI chat: local answers + confirmed score entry, never invents items (2026-11-26).
  if(width<=900) await page.getByTestId('nav-ai').click(); else await page.locator('.ai-fab').click();
  await page.locator('.chat-input input').fill('GPA');
  await page.locator('.chat-input input').press('Enter');
  if(!/GPA/.test(await page.locator('.chat-msg.ai').last().innerText())) errors.push('chat GPA answer missing');
  await page.locator('.chat-input input').fill('HW5 econ 4/5');
  await page.locator('.chat-input input').press('Enter');
  await page.getByTestId('chat-save').waitFor();
  await page.getByTestId('chat-save').click();
  if(!(await page.evaluate(()=>{const a=GradeSpace.S.state.assessments.find(x=>x.name==='HW5');return a&&a.score===4&&a.max===5&&a.status==='graded';}))) errors.push('chat did not save HW5 4/5');
  await page.locator('.chat-input input').fill('Quiz 99 econ 3/5');
  await page.locator('.chat-input input').press('Enter');
  if(await page.evaluate(()=>GradeSpace.S.state.assessments.some(x=>/quiz 99/i.test(x.name||'')))) errors.push('chat invented an assessment');
  await page.locator('.chat-input input').fill(lang==='th'?'ต้องได้เท่าไหร่ถึงได้ A econ':'what do I need for A econ');
  await page.locator('.chat-input input').press('Enter');
  if(!/Economics/.test(await page.locator('.chat-msg.ai').last().innerText())) errors.push('chat need-for-grade answer missing');
  await page.keyboard.press('Escape');
  await page.evaluate(()=>GradeSpace.update(d=>{const a=d.assessments.find(x=>x.name==='HW5');a.score=null;a.status='pending';}));
  await page.locator('.topbar .top-search').click();
  await page.locator('.cmd-input').waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.locator('.cmd-input').waitFor();
  await page.locator('.cmd-input').fill('2900111');
  if(await page.locator('.cmd-item').count()<1) errors.push('command menu did not find course 2900111');
  await page.locator('.cmd-input').press('Enter');
  await page.waitForTimeout(200);
  if(!(await page.evaluate(()=>location.hash)).startsWith('#course-')) errors.push('command menu Enter did not open the course');
  await page.evaluate(()=>{location.hash='dashboard';}); await page.waitForTimeout(200);
  await page.keyboard.press('Control+k'); await page.locator('.cmd-input').fill(lang==='th'?'GPA':'สรุป');
  if(await page.locator('.cmd-item').count()<1) errors.push('command search should match both languages');
  await page.keyboard.press('Escape');
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
  // Summary is a single compact row on desktop, with two GPA tiles and a full-width plan on mobile.
  await page.evaluate(()=>location.hash='dashboard');
  await page.locator('.dashboard-summary.has-plan .sp-card').waitFor();
  const summary=await page.locator('.dashboard-summary').evaluate(el=>{
    const cards=[...el.children].map(c=>{const r=c.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};});
    return {cards,height:el.getBoundingClientRect().height};
  });
  if(summary.cards.length!==3)errors.push('overview summary missing tiles');
  if(width>950&&(Math.max(...summary.cards.map(c=>c.top))-Math.min(...summary.cards.map(c=>c.top))>2||summary.height>150))errors.push('overview summary not compact single row');
  if(width<=950&&summary.cards[2].top<summary.cards[0].bottom-1)errors.push('mobile plan must follow GPA tiles');
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
  // Interaction-level regression: real controls in both languages and every viewport.
  await page.evaluate(()=>location.hash='dashboard');
  await page.getByTestId('study-priority').waitFor();
  await page.getByTestId('gpa-range').waitFor();
  await page.getByTestId('reminders').waitFor();
  await page.evaluate(()=>{
    Object.defineProperty(window,'Notification',{configurable:true,value:class {
      static permission='default'; static async requestPermission(){return 'denied';}
    }});
  });
  await page.getByTestId('reminders').getByRole('button',{name:lang==='th'?'เปิดการแจ้งเตือน':'Enable notifications'}).click();
  await page.getByTestId('reminders').getByRole('status').waitFor();
  // A finished exam without a released score must not be recommended (synthetic enrollment).
  await page.evaluate(()=>GradeSpace.update(d=>{
    const c={...d.courses.find(x=>x.id==='c-imp004'),id:'exam-finished-test',name:'Completed exam fixture',code:'',targetPct:85,examCompleted:{},exams:{source:'manual',fin:{date:'2026-11-21',time:'09:00-12:00',source:'manual'}}};
    d.courses.push(c);
  }));
  await page.locator('.overview-hub').waitFor();
  if(await page.getByTestId('study-priority').locator('.study-row[href="#course-exam-finished-test"]').count())errors.push('past ungraded final recommended');
  if(!(await page.locator('.focus-complete').count()))errors.push('completed course summary missing');
  await page.evaluate(()=>GradeSpace.update(d=>{d.courses=d.courses.filter(c=>c.id!=='exam-finished-test');}));
  // Dashboard is compact; actionable rows have an explicit semantic style, not course-color alone.
  const geometry=await page.locator('.dashboard-planning-grid').evaluate(el=>{
    const r=el.getBoundingClientRect(), minis=[...el.querySelectorAll('.planning-mini')].map(x=>x.getBoundingClientRect());
    return {height:r.height,minis:minis.map(x=>({top:x.top,left:x.left,width:x.width,height:x.height})),rows:el.querySelectorAll('.study-row').length,tones:[...el.querySelectorAll('.study-row')].map(x=>x.className)};
  });
  if(geometry.minis.length!==2||geometry.minis.some(x=>x.height>180))errors.push('planning mini cards not compact '+JSON.stringify(geometry.minis));
  if(width===390&&Math.abs(geometry.minis[0].top-geometry.minis[1].top)>2)errors.push('mobile mini cards do not share row');
  if(geometry.rows>3||geometry.tones.some(t=>!/(urgent|soon|normal|done|review)/.test(t)))errors.push('study recommendation preview invalid');
  if(!(await page.locator('.overview-hub .focus-day').count()))errors.push('new focus layout missing');
  await page.screenshot({path:'overview-'+lang+'-'+width+'.png',fullPage:false});
  // Mark an upcoming personal exam done without changing scores or removing calendar history.
  const examId=await page.evaluate(()=>GradeSpace.S.state.courses.find(c=>String(c.code).split('.')[0]==='2900111').id);
  const before=await page.evaluate(id=>JSON.stringify(GradeSpace.S.state.assessments.filter(a=>a.courseId===id)),examId);
  await page.evaluate(id=>location.hash='course-'+id,examId);
  await page.getByTestId('exam-complete-fin').click();
  if(!(await page.evaluate(id=>GradeSpace.S.state.courses.find(c=>c.id===id).examCompleted.fin===true,examId)))errors.push('exam completion not saved');
  if(before!==await page.evaluate(id=>JSON.stringify(GradeSpace.S.state.assessments.filter(a=>a.courseId===id)),examId))errors.push('marking exam changed scores');
  await page.evaluate(()=>location.hash='dashboard');
  await page.getByTestId('study-priority').waitFor();
  if(await page.locator('.dashboard-upcoming-list').getByText('TEST-ROOM-B',{exact:false}).count())errors.push('completed exam still upcoming');
  if(await page.getByTestId('study-priority').locator('a[href="#course-'+examId+'"]').count())errors.push('completed final still recommended');
  await page.locator('.dashboard-cal-cell.has-exam').filter({has:page.locator('.cal-num',{hasText:/^24$/})}).click();
  await page.locator('.dashboard-cal-event').getByText('TEST-ROOM-B',{exact:false}).waitFor();
  if(!(await page.locator('.dashboard-cal-event').filter({hasText:'TEST-ROOM-B'}).innerText()).includes(lang==='th'?'สอบแล้ว':'Completed'))errors.push('calendar lacks completed status');
  await page.evaluate(id=>location.hash='course-'+id,examId);
  await page.getByTestId('exam-complete-fin').click();
  await page.evaluate(()=>location.hash='dashboard');
  await page.locator('.dashboard-upcoming-list').getByText('TEST-ROOM-B',{exact:false}).waitFor();
  const testId='c-imp004';
  await page.evaluate(id=>{
    GradeSpace.update(d=>{const c=d.courses.find(x=>x.id===id);c.gradingMode='norm';c.gradingUser=true;c.normFloors={};c.classSnapshot={};c.advancedPolicy={};});
    location.hash='course-'+id;
  },testId);
  const comparison=page.getByTestId('class-comparison');
  await comparison.waitFor();
  const fields=comparison.locator('input');
  await fields.nth(0).fill('72');await fields.nth(1).fill('60');await fields.nth(2).fill('0');
  const save=comparison.getByRole('button',{name:lang==='th'?'บันทึก':'Save',exact:true});
  if(await save.isEnabled())errors.push('zero SD must not save');
  await fields.nth(2).fill('10');
  await comparison.getByText(/Z-score 1\.20?/).waitFor();
  await save.click();
  if(!(await page.evaluate(id=>GradeSpace.S.state.courses.find(c=>c.id===id).classSnapshot.sd===10,testId)))errors.push('class snapshot not persisted');
  await page.getByRole('button',{name:lang==='th'?'แก้':'Change',exact:true}).click();
  await page.getByLabel('D',{exact:true}).fill('40');
  await page.getByRole('button',{name:lang==='th'?'บันทึก':'Save',exact:true}).last().click();
  await page.waitForTimeout(150);
  if(!(await page.evaluate(id=>GradeSpace.S.state.courses.find(c=>c.id===id).normFloors.D===40,testId)))errors.push('minimum D threshold not persisted');
  const policy=page.getByTestId('advanced-policy');
  await policy.locator('summary').click();
  await policy.locator('input').first().fill('5');
  await policy.getByRole('button',{name:lang==='th'?'บันทึกกฎ':'Save rules'}).click();
  if(!(await page.evaluate(id=>GradeSpace.S.state.courses.find(c=>c.id===id).advancedPolicy.bonus===5,testId)))errors.push('bonus rule not persisted');
  await page.evaluate(()=>location.hash='gpa');
  const reverse=page.getByTestId('reverse-gpa');await reverse.waitFor();
  await reverse.locator('input').fill('0');
  await reverse.getByText(/^GPA [0-9]/).first().waitFor();
  await reverse.locator('input').fill('4.1');
  if(await reverse.getByText(/^GPA [0-9]/).count())errors.push('invalid GPA target has scenarios');
  const ids = await page.evaluate(() => GradeSpace.S.state.courses.map((c) => c.id));
  const hashes = ['dashboard', 'years', 'courses', 'simulator', 'gpa', 'feedback', 'help', 'preferences', 'me', ...ids.map((i) => 'course-' + i)];
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

// Thammasat mode (2026-11-26): pick TU on the sign-in screen; Chula-only features stay off.
async function runTU(browser, lang, width) {
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
  if(lang==='en'){await page.locator('.auth-card button',{hasText:'EN'}).first().click();}
  await page.locator('.auth-card button',{hasText:lang==='th'?'ธรรมศาสตร์':'Thammasat'}).click();
  if(await page.locator('#au-student').count()) errors.push('TU sign-in should not ask for a Chula student ID');
  await page.locator('#au-e').fill('tu@example.com');
  await page.locator('#au-e').press('Enter');
  await page.locator('.dashboard-exam-panel').first().waitFor();
  await page.waitForTimeout(400);
  if(await page.evaluate(()=>GradeSpace.S.state.settings.institution)!=='tu') errors.push('institution not saved as tu');
  if(await page.evaluate(()=>document.documentElement.getAttribute('data-uni'))!=='tu') errors.push('TU theme not applied');
  const rpcs=await page.evaluate(()=>window.__rpcs||[]);
  for (const fn of ['gs_reg_offerings','gs_reg_request','gs_exam_device']) if(rpcs.includes(fn)) errors.push('TU mode called Chula-only '+fn);
  if(!(await page.getByTestId('tu-exam-note').isVisible())) errors.push('TU exam note missing');
  if(await page.locator('.sp-card').count()) errors.push('CBS study plan card shown for TU');
  // GenEd: TU list, add TU101 through the course form.
  await page.evaluate(()=>{location.hash='years';}); await page.waitForTimeout(300);
  await page.getByTestId('tu-gened-open').click();
  await page.locator('.tuge-row').first().waitFor();
  if(await page.locator('.tuge-row').count()<50) errors.push('TU GenEd list incomplete');
  await page.locator('.tuge-row').filter({hasText:'TU101'}).getByRole('button').click();
  await page.waitForTimeout(300);
  await page.locator('.modal .btn.primary').last().click();
  await page.waitForTimeout(300);
  const added=await page.evaluate(()=>GradeSpace.S.state.courses.find(c=>c.code==='TU101'));
  if(!added||added.credits!==3||added.kind!=='gened') errors.push('TU101 not added as 3-credit GenEd: '+JSON.stringify(added&&{c:added.credits,k:added.kind}));
  // Course search suggests Thammasat codes.
  await page.evaluate(()=>{location.hash='courses';}); await page.waitForTimeout(300);
  const hashes = ['dashboard', 'years', 'courses', 'gpa', 'me', 'preferences'];
  for (const h of hashes) {
    await page.evaluate((x) => { location.hash = x; }, h);
    await page.waitForTimeout(250);
    const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (extra > 1) overflow.push(h + ' +' + extra + 'px');
  }
  await page.evaluate(()=>{location.hash='gpa';}); await page.waitForTimeout(300);
  if(!(await page.getByTestId('tu-rules').isVisible())) errors.push('TU rules card missing on GPA page');
  const outs=await page.evaluate(()=>GradeSpace.S.state.outcomes.map(o=>o.label));
  for (const l of ['ACC','EXE','AUD','W','I','S','U']) if(!outs.includes(l)) errors.push('TU outcome missing '+l);
  if(await page.evaluate(()=>[GradeSpace.Calc.fmt(2.345),GradeSpace.Calc.fmt(3.4949),GradeSpace.Calc.fmt(1.005)].join())!=='2.35,3.49,1.01') errors.push('GPA rounding is not half-up (TU ข้อ 48)');
  const sugg=await page.evaluate(()=>GradeSpace.catalogSearch?GradeSpace.catalogSearch('AC201').length:-1);
  if(sugg===0) errors.push('TU catalog search found nothing for AC201');
  await ctx.close();
  console.log(`TU ${lang} ${width}px: ${hashes.length} pages, overflow ${overflow.length ? overflow.join(', ') : 'none'}, errors ${errors.length ? errors.join(' | ') : 'none'}`);
  return errors.length + overflow.length;
}

const browser = await chromium.launch();
let bad = 0;
for (const lang of ['th', 'en']) for (const w of [390, 1280, 1800]) bad += await run(browser, lang, w);
for (const lang of ['th', 'en']) for (const w of [390, 1280]) bad += await runTU(browser, lang, w);
await browser.close();
if (bad) { console.error('FAILED'); process.exit(1); }
console.log('OK');
