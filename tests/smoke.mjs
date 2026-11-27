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
const FAKE_SUPABASE = `window.supabase={createClient:()=>({auth:{
  getSession:async()=>({data:{session:JSON.parse(sessionStorage.getItem('fakeSess')||'null')}}),
  signInWithOtp:async({email})=>{window.__otpTo=email;return {error:null};},
  verifyOtp:async({email,token})=>{if(token!=='123456')return {data:{},error:{message:'bad code'}};const sess={user:{id:'u-1',email}};sessionStorage.setItem('fakeSess',JSON.stringify(sess));return {data:{user:sess.user,session:sess},error:null};},
  signOut:async()=>{sessionStorage.removeItem('fakeSess');return {error:null};}},functions:{},rpc:async(fn,args)=>{(window.__rpcs=window.__rpcs||[]).push(fn);
  if(fn==='gs_load'||fn==='gs_me_load')return {data:window.__D?[{data:window.__D,client_updated_at:Date.now()}]:[],error:null};
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

async function checkCampusPalette(page, uni, errors) {
  const valid=await page.evaluate(uni=>{
    const root=document.documentElement, css=getComputedStyle(root), token=k=>css.getPropertyValue(k).trim().toUpperCase();
    const dark=css.colorScheme==='dark', word=document.querySelector('[data-testid="campus-brand"]');
    const base=word.querySelector('.brand-word'), space=word.querySelector('.brand-name-accent'), campus=word.querySelector('.brand-campus');
    return getComputedStyle(base).color===getComputedStyle(space).color &&
      getComputedStyle(base).color!==getComputedStyle(campus).color &&
      token('--bg')===(dark?'#151517':'#F7F8FA') &&
      token('--surface')===(dark?'#1C1C20':'#FFFFFF') &&
      token('--earned')===(dark?'#9BB2CE':'#526B88') &&
      token('--sky')===(dark?'#8FC5EE':'#286795') &&
      token('--accent')===(uni==='tu'?(dark?'#D8B84C':'#8C1D2C'):(dark?'#F4A5C9':'#A71D5D')) &&
      token('--action')===(uni==='tu'?'#8C1D2C':'#A71D5D') &&
      (uni!=='tu'||(token('--tu-gold')==='#D8B84C'&&token('--tu-gold-text')===(dark?'#E4C35E':'#806016')&&getComputedStyle(campus).color===(dark?'rgb(228, 195, 94)':'rgb(128, 96, 22)'))) &&
      document.querySelector('meta[name="theme-color"]').content.toUpperCase()===token('--bg');
  },uni);
  if(!valid) errors.push(uni+' should use neutral shared palette and campus-only accents');
}

async function checkAiColors(page, uni, errors) {
  const result=await page.evaluate(uni=>{
    const el=document.querySelector('[data-testid="sidebar-ai"]'), dot=document.querySelector('.nav-ai-dot');
    if(!el||!dot)return false;
    const st=getComputedStyle(el), icon=el.querySelector('.ic'), root=getComputedStyle(document.documentElement);
    const dark=root.colorScheme==='dark';
    const expected=uni==='tu'?(dark?'rgb(81, 42, 44)':'rgb(140, 29, 44)'):(dark?'rgb(112, 38, 75)':'rgb(167, 29, 93)');
    return st.color==='rgb(255, 255, 255)'&&icon&&getComputedStyle(icon).color==='rgb(255, 255, 255)'&&st.backgroundColor===expected&&
      (uni==='tu'?(getComputedStyle(dot).backgroundColor==='rgb(140, 29, 44)'&&getComputedStyle(dot).color==='rgb(255, 255, 255)'):(getComputedStyle(dot).backgroundColor==='rgb(244, 165, 201)'&&getComputedStyle(dot).color==='rgb(137, 23, 73)'));
  },uni);
  if(!result)errors.push(uni+' AI shortcut colors incorrect');
}
// Exercise the real card action using disposable, graded fixtures in the active university.
async function checkCourseCardDelete(page,errors) {
  await page.evaluate(()=>{location.hash='courses';});
  await page.waitForSelector('.ccard');
  const fixture=await page.evaluate(()=>{
    const d=GradeSpace.S.state, c=d.courses[0], id='smoke-delete-course';
    if(!c)return null;
    const copy={...c,id,code:'',name:'Delete GPA fixture',credits:3,finalGrade:'A',demo:false};
    GradeSpace.update(s=>{s.courses.push(copy);s.categories.push({id:id+'-cat',courseId:id,name:'Delete fixture',type:'homework',weight:100,dist:'manual'});s.assessments.push({id:id+'-a',courseId:id,categoryId:id+'-cat',name:'Delete fixture',type:'homework',weight:100,max:100,score:100,status:'graded'});});
    const state=GradeSpace.S.state, C=GradeSpace.Calc;
    const stats=mode=>({term:C.semesterStats(state,copy.semesterId,mode),all:C.cumulativeStats(state,mode)});
    return {id,sem:copy.semesterId,before:stats('confirmed'),estimate:stats('estimated'),count:state.courses.length};
  });
  if(!fixture){errors.push('missing course deletion fixture');return;}
  const card=page.locator('[data-course-id="smoke-delete-course"]'), button=card.getByTestId('delete-course-card');
  await button.click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();
  if(!(await dialog.innerText()).includes('Delete GPA fixture'))errors.push('delete confirmation missing course name');
  await dialog.locator('.modal-foot .btn:not(.danger)').click();
  if(!(await card.isVisible()))errors.push('cancel deleted course');
  await button.click();
  if(!['Confirm','ยืนยัน'].includes((await dialog.locator('.modal-foot .btn.danger').innerText()).trim()))errors.push('course deletion confirm label incorrect');
  await dialog.locator('.modal-foot .btn.danger').click();
  await card.waitFor({state:'detached'});
  const result=await page.evaluate(f=>{
    const s=GradeSpace.S.state,C=GradeSpace.Calc,stats=m=>({term:C.semesterStats(s,f.sem,m),all:C.cumulativeStats(s,m)});
    return {count:s.courses.length,exists:s.courses.some(c=>c.id===f.id),orphan:s.assessments.some(a=>a.courseId===f.id)||s.categories.some(c=>c.courseId===f.id),confirmed:stats('confirmed'),estimate:stats('estimated')};
  },fixture);
  if(result.exists||result.orphan||result.count!==fixture.count-1)errors.push('course deletion did not remove linked records');
  for(const scope of ['term','all'])for(const [before,after] of [[fixture.before,result.confirmed],[fixture.estimate,result.estimate]]){
    if(Math.abs(before[scope].gpaCredits-after[scope].gpaCredits-3)>1e-8||Math.abs(before[scope].qp-after[scope].qp-12)>1e-8)errors.push('deleted course still counted in '+scope+' GPA');
    const g=after[scope].gpaCredits?after[scope].qp/after[scope].gpaCredits:null;
    if(g!==after[scope].gpa)errors.push('GPA not recalculated');
  }
}
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
  if((await page.locator('.auth-card [data-testid=campus-brand]').getAttribute('aria-label'))!=='GradeSpace CU')errors.push('CU auth brand missing');
  if(!(await page.locator('.auth-card [data-testid=campus-brand]').evaluate(el=>{const a=getComputedStyle(el.querySelector('.brand-word')),b=getComputedStyle(el.querySelector('.brand-campus'));return a.fontSize===b.fontSize&&a.fontWeight===b.fontWeight&&b.backgroundColor==='rgba(0, 0, 0, 0)';})))errors.push('CU suffix should match brand size without badge');
  await checkCampusPalette(page,'cu',errors);
  if(await page.evaluate(()=>document.documentElement.getAttribute('data-uni'))!=='cu')errors.push('CU theme missing on auth');
  await page.locator('#au-student').fill('6940102426');
  await page.locator('#au-student').press('Enter');
  await page.locator('.dashboard-upcoming-list').getByText('TEST-ROOM-A',{exact:false}).waitFor();
  await checkAiColors(page,'cu',errors);
  if(!(await page.evaluate(()=>{const c=GradeSpace.S.state.courses.find(c=>c.code==='2900111'||String(c.code||'').startsWith('2900111.'));if(!c)return false;const catalog=GradeSpace.catalogSearch('2900111').find(x=>x.code==='2900111');const result=GradeSpace.standardCourseName({...c,name:'ชื่อวิชาทดสอบ'});return !!catalog&&/[A-Za-z]/.test(result)&&!/[\u0E00-\u0E7F]/.test(result)&&result===GradeSpace.standardCourseName(c); })))errors.push('CU English course title should not depend on stored Thai title');
  if(await page.evaluate(()=>window.__studentId!=='6940102426')) errors.push('login did not save student ID');
  if(await page.locator('.side .nav-item').first().getAttribute('href')!=='#dashboard') errors.push('overview is not first menu');
  if(await page.locator('.side .nav-item[aria-current="page"]').getAttribute('href')!=='#dashboard') errors.push('overview is not default');
  if(await page.locator('#exam-student-id').count()) errors.push('student ID form leaked into dashboard');
  // Desktop and tablet quick display controls; phones retain You-page settings.
  const display=page.getByTestId('topbar-display');
  if((await display.isVisible())!==(width>=768))errors.push('wrong topbar display control visibility');
  if(width===390){
    await page.setViewportSize({width:768,height:1024});
    if(!(await display.isVisible())||!(await page.locator('.topbar .acct-btn').isVisible()))errors.push('portrait tablet quick controls/profile missing');
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))errors.push('tablet topbar overflow');
    await display.getByRole('button',{name:'EN',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.lang==='en');
    await display.getByRole('button',{name:'Dark',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.getAttribute('data-theme')==='dark');
    await checkCampusPalette(page,'cu',errors);
    await display.getByRole('button',{name:'Light',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.getAttribute('data-theme')==='light');
    await display.getByRole('button',{name:'TH',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.lang==='th');
    await page.setViewportSize({width,height:900});
  }
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
    await page.keyboard.press('Escape');
    if(lang==='en')await display.getByRole('button',{name:'EN',exact:true}).click();
    await page.waitForFunction(l=>document.documentElement.lang===l,lang);
    const previousTheme=await page.evaluate(()=>GradeSpace.S.state.settings.theme);
    await display.getByRole('button',{name:lang==='th'?'มืด':'Dark',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.getAttribute('data-theme')==='dark');
    await display.getByRole('button',{name:lang==='th'?'สว่าง':'Light',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.getAttribute('data-theme')==='light');
    await page.evaluate(v=>GradeSpace.update(d=>{d.settings.theme=v;}),previousTheme);
    if(await page.locator('.acct-menu').count()) errors.push('account menu did not close on Escape');
    if(await page.locator('.side .nav-group').count()!==2) errors.push('sidebar should have 2 labelled groups');
  }
  if(await page.evaluate(()=>{const s=document.querySelectorAll('.brand-mark linearGradient');return new Set([...s].map(x=>x.id)).size!==s.length;})) errors.push('logo gradient ids are not unique');
  // Mobile must never show the unsolicited floating intro; desktop keeps the first-visit hint.
  if(width<=900){
    if(await page.locator('.ai-fab-wrap').isVisible())errors.push('floating AI popup must be hidden on mobile');
    await page.getByTestId('nav-ai').click();
  }else{
    if(!(await page.locator('.ai-fab-intro').isVisible())) errors.push('desktop AI intro bubble not shown on first visit');
    await page.locator('.ai-fab-intro .btn.primary').click();
  }
  if(await page.locator('[data-testid="ai-hub"] .hub-tools .hub-row').count()!==3) errors.push('AI hub should offer 3 tools');
  await page.keyboard.press('Escape');
  if(await page.locator('[data-testid="ai-hub"]').count()) errors.push('AI hub did not close on Escape');
  if(await page.locator('.ai-fab-intro').isVisible()) errors.push('AI intro bubble should not return after use');
  if(width>900 && !(await page.locator('.ai-fab').isVisible())) errors.push('AI button not visible');
  // AI hub: GradeSpace has no AI of its own; connect cards first, then in-site tools (2026-11-26).
  if(width<=900) await page.getByTestId('nav-ai').click(); else await page.locator('.ai-fab').click();
  await page.getByTestId('ai-hub').waitFor();
  if(!(await page.getByTestId('connect-card').isVisible())) errors.push('ChatGPT/Claude connect card missing');
  const recommended=page.getByTestId('askai-open');
  if(!(await recommended.getByTestId('ai-recommended').isVisible())) errors.push('recommended AI label missing');
  if(!(await recommended.innerText()).includes('ChatGPT · Gemini · Claude')) errors.push('recommended providers missing');
  if(!(await recommended.evaluate(el=>el.classList.contains('hub-recommended')))) errors.push('recommended AI styling missing');
  if(width>900&&!(await page.getByTestId('sidebar-ai').evaluate(el=>el.classList.contains('nav-ai-main')))) errors.push('desktop AI emphasis missing');
  if(width===390){
    for(const w of [320,768,1024]){
      await page.setViewportSize({width:w,height:1024});
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))errors.push('AI hub viewport overflow at '+w);
      if(!(await recommended.isVisible()))errors.push('recommended AI missing at '+w);
    }
    await page.setViewportSize({width,height:900});
  }
  if(!(await page.getByTestId('connect-gpt').isVisible())||!(await page.getByTestId('connect-claude').isVisible())) errors.push('AI hub should list ChatGPT and Claude');
  if(await page.locator('.chat-input').count()) errors.push('GradeSpace should not have its own chat');
  if(await page.locator('[data-testid="ai-hub"] .hub-tools .hub-row').count()!==3) errors.push('AI hub should keep 3 tools');
  await page.keyboard.press('Escape');
  // Bridge to the student's own AI: it reads screenshots/voice/text, answers with a gradespace block, the student pastes it back.
  if(width<=900) await page.getByTestId('nav-ai').click(); else await page.locator('.ai-fab').click();
  await page.getByTestId('askai-open').click();
  for(const k of ['course','weights','score']){
    const example=page.getByTestId('askai-example-'+k);
    if(!(await example.isVisible()))errors.push('missing AI import example: '+k);
    const sample=await example.locator('.askai-sample').innerText();
    if(!/econ/i.test(sample)||/อีคอน/.test(sample))errors.push('missing Econ conversational AI example: '+k);
    if(k==='weights'&&lang==='th'&&!/30%.*40%.*30%/.test(sample))errors.push('Thai AI weights should use %');
  }
  if(width===390){
    for(const w of [320,768,1024]){
      await page.setViewportSize({width:w,height:1024});
      if(await page.evaluate(()=>{const m=document.querySelector('.modal');return document.documentElement.scrollWidth>innerWidth+1||(m&&m.scrollWidth>m.clientWidth+1);}))errors.push('AI instructions overflow at '+w);
      if(!(await page.getByTestId('askai-guide').isVisible()))errors.push('AI instructions missing at '+w);
    }
    await page.setViewportSize({width,height:900});
  }
  for(const k of ['gpt','gemini','claude']) if(!(await page.getByTestId('askai-'+k).isVisible())) errors.push('ask-AI missing '+k+' button');
  const prompt=await page.getByTestId('askai-prompt').inputValue();
  if(!/Econ ได้ 5 เต็ม 20 การบ้านหนึ่ง|got 5 out of 20 on econ homework 1/i.test(prompt)) errors.push('AI prompt lacks casual speech example');
  // Tapping an AI copies the instruction first, then opens the AI (copy must not wait until the tab has opened).
  await page.evaluate(()=>{window.__opened=[];window.open=(u)=>{window.__opened.push(u);return {};};document.addEventListener('copy',()=>{window.__copied=String(document.getSelection());},{once:true});});
  await page.getByTestId('askai-gemini').click();
  if(!(await page.evaluate(()=>window.__opened[0]==='https://gemini.google.com/app'))) errors.push('ask-AI did not open Gemini');
  if(!(await page.evaluate((p)=>window.__copied===p,prompt))) errors.push('ask-AI did not copy the instruction before opening');
  if(!prompt.includes('```gradespace')||!prompt.includes('2900111')) errors.push('ask-AI text lacks format or known courses');
  if(prompt.includes('test@example.com')||prompt.includes('6940102426')) errors.push('ask-AI text leaks email or student ID');
  await page.getByTestId('ask-ai').locator('.seg button').nth(1).click();
  await page.getByTestId('askai-paste').fill('Here you go!\n```gradespace\n{"gradespace":2,"courses":[{"code":"2900111","assessments":[{"name":"HW5","type":"homework","score":4,"max":5}]},{"code":"2603111","name":"Principles of Economics","credits":3,"assessments":[{"name":"Midterm","type":"midterm","weight":30,"score":24,"max":30}]}]}\n```');
  await page.getByTestId('askai-check').click();
  await page.locator('.scan-item').first().waitFor();
  if(await page.locator('.scan-item').count()!==2) errors.push('ask-AI review should list 2 courses');
  await page.locator('.modal .btn.primary').last().click();
  if(!(await page.evaluate(()=>{const a=GradeSpace.S.state.assessments.find(x=>x.name==='HW5');return a&&a.score===4&&a.status==='graded';}))) errors.push('ask-AI did not save HW5');
  if(!(await page.evaluate(()=>{const c=GradeSpace.S.state.courses.find(x=>x.code==='2603111');return c&&GradeSpace.S.state.assessments.some(a=>a.courseId===c.id&&a.score===24&&a.max===30);}))) errors.push('ask-AI did not add the new course');
  await page.evaluate(()=>GradeSpace.update(d=>{const c=d.courses.find(x=>x.code==='2603111');if(c){d.courses=d.courses.filter(x=>x!==c);d.assessments=d.assessments.filter(a=>a.courseId!==c.id);d.categories=d.categories.filter(k=>k.courseId!==c.id);}}));
  if(await page.locator('.modal').count()) await page.keyboard.press('Escape');
  await page.evaluate(()=>GradeSpace.update(d=>{const a=d.assessments.find(x=>x.name==='HW5');a.score=null;a.status='pending';}));
  // Hiding the floating AI button must not remove the permanent desktop entry.
  if(width>900){
    await page.locator('.ai-fab-x').click();
    if(await page.locator('.ai-fab').count()) errors.push('floating AI button not hidden');
    await page.getByTestId('sidebar-ai').click();
    await page.getByTestId('ai-hub').waitFor();
    await page.keyboard.press('Escape');
    if(!(await page.getByTestId('sidebar-ai').isVisible())) errors.push('desktop AI entry disappeared');
  }
  // Course action replaces the scan shortcut, but direct scan remains available inside AI.
  await page.evaluate(()=>location.hash='courses');
  const courseAi=page.getByTestId('course-ai');
  await courseAi.waitFor();
  if(!(await courseAi.innerText()).includes('AI')) errors.push('course AI label missing');
  if(await page.locator('.courses-actions .scan-icon').count()) errors.push('duplicate standalone scan shortcut');
  await courseAi.click();
  await page.getByTestId('ai-hub').waitFor();
  if(!(await page.getByTestId('askai-open').isVisible())) errors.push('course AI cannot open external AI');
  if(await page.locator('[data-testid="ai-hub"] .hub-tools .hub-row').count()!==3) errors.push('course AI lost in-app tools');
  await page.keyboard.press('Escape');
  await page.evaluate(()=>location.hash='dashboard');
  await page.locator('.side .nav-item[aria-current="page"][href="#dashboard"]').waitFor({state:'attached'});
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
  // University spaces: a Chula space left aside while Chula is active comes back on load, and switching never
  // puts an empty space over a stored one.
  const sp=await page.evaluate(()=>{
    const G=window.GradeSpace, base=JSON.parse(JSON.stringify(G.S.state));
    const stash={savedAt:1,years:base.years,semesters:base.semesters,courses:base.courses,categories:base.categories,assessments:base.assessments,settings:{currentSemesterId:base.settings.currentSemesterId}};
    const broken=Object.assign({},base,{years:[],semesters:[],courses:[],categories:[],assessments:[],settings:Object.assign({},base.settings,{institution:'cu',currentSemesterId:null,spaces:{cu:stash}})});
    const healed=G.Store.normalize(JSON.parse(JSON.stringify(broken)));
    const d=JSON.parse(JSON.stringify(broken)); d.settings.spaces=JSON.parse(JSON.stringify(broken.settings.spaces));
    G.switchSpace(d,'cu','tu');
    return {n:base.courses.length, healed:healed.courses.length, left:!!(healed.settings.spaces&&healed.settings.spaces.cu), kept:d.settings.spaces.cu.courses.length};
  });
  if(sp.healed!==sp.n||sp.left) errors.push('stored Chula space not restored on load: '+JSON.stringify(sp));
  if(sp.kept!==sp.n) errors.push('switching from an empty space overwrote the stored one: '+JSON.stringify(sp));
  // What-if grades on the GPA page (nothing saved).
  await page.evaluate(()=>{location.hash='gpa';}); await page.waitForTimeout(300);
  const wi=page.getByTestId('whatif'); await wi.waitFor();
  const gpaGap=await page.evaluate(()=>{const m=document.querySelector('.gpa-metrics'),w=document.querySelector('.whatif');return w.getBoundingClientRect().top-m.getBoundingClientRect().bottom;});
  if(gpaGap<15)errors.push('GPA metrics and what-if card touch: '+gpaGap);
  const wiBefore=await page.evaluate(()=>JSON.stringify(GradeSpace.S.state.courses.map(c=>c.finalGrade||null)));
  const sels=wi.locator('.whatif-row select'); const nSel=await sels.count();
  if(nSel<3) errors.push('what-if should list this term\'s courses');
  for(let i=0;i<nSel;i++) await sels.nth(i).selectOption({index:1});
  const hi=parseFloat(await page.getByTestId('wi-term').innerText());
  for(let i=0;i<nSel;i++){ const n=await sels.nth(i).locator('option').count(); await sels.nth(i).selectOption({index:n-1}); }
  const lo=parseFloat(await page.getByTestId('wi-term').innerText());
  if(!(hi>lo)) errors.push('what-if term GPA should drop from best to worst grades: '+hi+' vs '+lo);
  await wi.locator('input[type=number]').fill('2.5');
  await page.getByTestId('wi-solve').click();
  if(await wi.locator('.whatif-set').count()<1&&!(await wi.locator('.banner').count())) errors.push('what-if found no grade sets for 2.50');
  if(await wi.locator('.whatif-set').count()){ await page.getByTestId('wi-use').first().click(); const v=parseFloat(await page.getByTestId('wi-term').innerText()); if(!(v>=2.5-1e-9)) errors.push('suggested set gives '+v+' < 2.50'); }
  if(await page.evaluate(()=>JSON.stringify(GradeSpace.S.state.courses.map(c=>c.finalGrade||null)))!==wiBefore) errors.push('what-if changed saved grades');
  await page.evaluate(()=>{location.hash='dashboard';}); await page.waitForTimeout(300);
  const lookup=await page.evaluate(()=>window.__examRequest);
  if(lookup.p_year!=='2569'||lookup.p_term!=='s1'||lookup.p_round!=='fin'||!lookup.p_courses.some(c=>c.code==='2900111'&&c.sec==='4')) errors.push('incorrect exam lookup payload');
  const upcoming=page.locator('.dashboard-upcoming-row').filter({hasText:'TEST-ROOM-A'});
  if(!(await upcoming.innerText()).includes('08:30-10:30')||await upcoming.locator('.date-pill b').innerText()!=='23') errors.push('personal upcoming date/time not used');
  await page.locator('.dashboard-cal-cell.has-exam').filter({has:page.locator('.cal-num',{hasText:/^23$/})}).click();
  await page.locator('.dashboard-cal-event').getByText('TEST-ROOM-A',{exact:false}).waitFor();
  // Update the saved ID via the email-entry screen only, and verify both calendar and upcoming change.
  await page.evaluate(()=>location.hash='preferences');
  const editId=page.getByTestId('student-id-edit');
  if((await editId.innerText())!==(lang==='th'?'แก้ไขเลขนิสิต':'Edit student ID')) errors.push('CU student ID action label changed');
  await editId.click();
  await page.locator('#au-student').fill('6940102526');
  await page.locator('#au-student').press('Enter');
  await page.locator('#au-student').waitFor({state:'detached'});
  await page.evaluate(()=>location.hash='dashboard');
  await page.locator('.dashboard-upcoming-list').getByText('TEST-ROOM-B',{exact:false}).waitFor();
  await page.evaluate(()=>location.hash='preferences');
  await page.getByTestId('student-identity').filter({hasText:'6940102526'}).waitFor();
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
  await checkCourseCardDelete(page,errors);
  await ctx.close();
  console.log(`${lang} ${width}px: ${hashes.length} pages, overflow ${overflow.length ? overflow.join(', ') : 'none'}, errors ${errors.length ? errors.join(' | ') : 'none'}`);
  return errors.length + overflow.length;
}

// Thammasat mode (2026-11-26): pick TU on the sign-in screen; Chula-only features stay off.
async function runTU(browser, lang, width) {
  const errors = [], overflow = [];
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(([d]) => { window.__D = d; localStorage.removeItem('gradespace.email'); localStorage.removeItem('gradespace.mode'); }, [null]);
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
  if((await page.locator('.auth-card [data-testid=campus-brand]').getAttribute('aria-label'))!=='GradeSpace TU')errors.push('TU auth brand missing');
  await page.waitForFunction(()=>document.documentElement.getAttribute('data-uni')==='tu');
  await checkCampusPalette(page,'tu',errors);
  await page.locator('#au-tu-student').fill('0000000001');
  await page.locator('#au-e').fill('tu@example.com');
  await page.locator('#au-e').press('Enter');
  await page.waitForFunction(()=>window.GradeSpace&&GradeSpace.S.state&&GradeSpace.S.state.settings.institution==='tu'&&GradeSpace.S.cloud);
  await page.waitForTimeout(400);
  if(await page.evaluate(()=>GradeSpace.S.state.courses.length!==0)) errors.push('new TU account should start empty');
  // Set language using actual controls after loading account (server fixture may override sign-in language).
  if(width>=768){await page.getByTestId('topbar-display').getByRole('button',{name:lang.toUpperCase(),exact:true}).click();}
  else{await page.evaluate(()=>location.hash='me');await page.locator('.me-page button',{hasText:lang.toUpperCase()}).click();}
  await page.waitForFunction(l=>document.documentElement.lang===l,lang);
  // Fresh TU workspace: select multiple courses for the term through the dashboard CTA.
  await page.evaluate(()=>location.hash='dashboard');
  await page.getByTestId('dashboard-start').waitFor();
  await page.getByTestId('dashboard-semester-courses').click();
  await page.getByTestId('tup-new-term').waitFor();
  await page.getByTestId('tup-new-level').selectOption('1');
  await page.getByTestId('tup-new-academic').fill('2569');
  await page.getByTestId('tup-new-kind').selectOption('s1');
  await page.getByTestId('tup-search').fill('หลักกฎหมายเกี่ยวกับการประกอบธุรกิจ');
  const law=page.getByTestId('tu-plan').locator('.tup-row').filter({hasText:'BA201'});
  await law.waitFor();
  if((await law.locator('.tup-name').innerText()).trim()!=='Business Law')errors.push('TU browse title should be English even when searching Thai');
  await law.locator('input').check();
  await page.getByTestId('tup-search').fill('MK201');
  await page.getByTestId('tu-plan').locator('.tup-row').filter({hasText:'MK201'}).locator('input').check();
  if(!(await page.getByTestId('tup-add').isEnabled()))errors.push('fresh TU workspace cannot add a course');
  await page.getByTestId('tup-add').click();
  await page.waitForFunction(()=>GradeSpace.S.state.courses.some(c=>c.code==='MK201'));
  await page.getByTestId('first-course-ai-tip').waitFor();
  if(!(await page.getByTestId('askai-open').isVisible()))errors.push('first TU course should recommend AI import');
  await page.keyboard.press('Escape');
  await page.getByTestId('ai-hub').waitFor({state:'detached'});
  if(!(await page.evaluate(()=>{const c=GradeSpace.S.state.courses.find(c=>c.code==='MK201');const name=GradeSpace.standardCourseName({...c,name:'ชื่อวิชาทดสอบ'});return /[A-Za-z]/.test(name)&&!/[\u0E00-\u0E7F]/.test(name)&&name===GradeSpace.standardCourseName(c)&&GradeSpace.standardCourseName({name:'Unknown custom course',code:''})==='Unknown custom course';})))errors.push('TU English course title should use its own catalog and retain unknown custom course names');
  const fresh=await page.evaluate(()=>({years:GradeSpace.S.state.years,terms:GradeSpace.S.state.semesters,courses:GradeSpace.S.state.courses,current:GradeSpace.S.state.settings.currentSemesterId}));
  if(fresh.years.length!==1||fresh.terms.length!==1||fresh.courses.length!==2||fresh.terms[0].id!==fresh.current||fresh.courses.some(c=>c.semesterId!==fresh.current))errors.push('first semester batch not saved correctly');
  if(fresh.courses.find(c=>c.code==='MK201')?.name!=='Principles of Marketing')errors.push('TU saved course title should be English');
  if(!fresh.courses.some(c=>c.code==='BA201'))errors.push('TU selection lost when searching for another course');
  await page.evaluate(()=>{location.hash='dashboard';}); await page.waitForTimeout(300);
  await page.locator('.dashboard-exam-panel').first().waitFor();
  if(await page.evaluate(()=>GradeSpace.S.state.settings.institution)!=='tu') errors.push('institution not saved as tu');
  if(await page.evaluate(()=>document.documentElement.getAttribute('data-uni'))!=='tu') errors.push('TU theme not applied');
  if(await page.getByTestId('campus-brand').filter({hasText:'TU'}).count()!==2)errors.push('TU workspace wordmarks missing');
  await checkAiColors(page,'tu',errors);
  if(width<=900&&await page.locator('.ai-fab-wrap').isVisible())errors.push('TU mobile floating AI popup must be hidden');
  if(!(await page.getByTestId('campus-brand').first().evaluate(el=>{const w=el.querySelector('.brand-word'),c=el.querySelector('.brand-campus'),a=getComputedStyle(w),b=getComputedStyle(c);return a.fontSize===b.fontSize&&a.fontWeight===b.fontWeight&&b.backgroundColor==='rgba(0, 0, 0, 0)'&&b.paddingLeft==='0px'&&getComputedStyle(el.querySelector('.brand-name-accent')).color!==b.color;})))errors.push('TU suffix should match brand size without badge and use distinct color');
  if(!(await page.locator('.side .brand-mark').evaluate(el=>el.querySelector('path').getAttribute('stroke')==='#fff'&&el.querySelector('stop[offset="55%"]').getAttribute('stop-color')==='#8C1D2C'&&el.querySelector('circle').getAttribute('fill')==='#FFD13F')))errors.push('TU logo should have red background, white G and yellow dot');
  await checkCampusPalette(page,'tu',errors);
  const rpcs=await page.evaluate(()=>window.__rpcs||[]);
  for (const fn of ['gs_reg_offerings','gs_reg_request','gs_exam_device']) if(rpcs.includes(fn)) errors.push('TU mode called Chula-only '+fn);
  if(!(await page.getByTestId('tu-exam-note').isVisible())) errors.push('TU exam note missing');
  if(await page.locator('.sp-card').count()) errors.push('CBS study plan card shown for TU');
  if(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--uni-secondary').trim())!=='#FFD13F') errors.push('TU gold palette missing');
  if(!(await page.getByTestId('tu-academic').isVisible())) errors.push('TU academic profile missing');
  await page.evaluate(()=>{location.hash='me';}); await page.waitForTimeout(300);
  if(!(await page.getByTestId('student-identity').innerText()).includes('0000000001')) errors.push('TU own session ID missing');
  if(await page.getByTestId('workspace-shortcut').count()) errors.push('normal TU account must not have a workspace shortcut');
  await page.keyboard.press('Alt+Shift+t');
  if(await page.evaluate(()=>GradeSpace.S.state.settings.institution)!=='tu') errors.push('normal TU account switched campus through keyboard');
  if(await page.evaluate(()=>JSON.stringify(GradeSpace.S.state).includes('0000000001'))) errors.push('TU student ID leaked into grade JSON');
  await page.getByTestId('profile-signout').click();
  if(!(await page.locator('.modal').isVisible())) errors.push('profile sign-out confirmation missing');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  // GenEd: TU list, add TU101 through the course form.
  await page.evaluate(()=>{location.hash='years';}); await page.waitForTimeout(300);
  await page.getByTestId('tu-gened-open').click();
  await page.locator('.tuge-row').first().waitFor();
  if(await page.locator('.tuge-row').count()<50) errors.push('TU GenEd list incomplete');
  await page.locator('.tuge-row').filter({hasText:'TU101'}).getByRole('button').click();
  await page.waitForTimeout(300);
  await page.locator('.modal .btn.primary').last().click();
  await page.waitForTimeout(300);
  await page.getByTestId('ai-hub').waitFor();
  await page.keyboard.press('Escape');
  await page.getByTestId('ai-hub').waitFor({state:'detached'});
  const added=await page.evaluate(()=>GradeSpace.S.state.courses.find(c=>c.code==='TU101'));
  if(!added||added.credits!==3||added.kind!=='gened') errors.push('TU101 not added as 3-credit GenEd: '+JSON.stringify(added&&{c:added.credits,k:added.kind}));
  // "Pick by major" opens the Thammasat picker, never the Chula plan window.
  await page.evaluate(()=>{location.hash='courses';}); await page.waitForTimeout(300);
  await page.locator('.courses-actions .btn').nth(1).click();
  await page.getByTestId('tu-plan').waitFor({timeout:5000}).catch(()=>errors.push('TU plan picker did not open'));
  if(await page.locator('.modal .planner,.modal .prog-tiles').count()) errors.push('Chula plan window shown in TU space');
  const picker=page.getByTestId('tu-plan'), category=page.getByTestId('tup-category'), search=page.getByTestId('tup-search');
  if(await category.inputValue()!=='all')errors.push('TU picker should start on faculty courses');
  if(await category.locator('optgroup').first().getAttribute('label')!==(lang==='th'?'วิชาคณะพาณิชย์ฯ':'Business school'))errors.push('faculty category not first');
  if(!(await category.locator('option[value="MK"]').innerText()).includes(lang==='th'?'การตลาด':'Marketing'))errors.push('marketing category not expanded');
  if(!(await category.locator('option[value="IB"]').innerText()).includes(lang==='th'?'ธุรกิจระหว่างประเทศ':'International business'))errors.push('IB category not expanded');
  await search.fill('AC201');
  await picker.locator('.tup-row').filter({hasText:'AC201'}).locator('input').check();
  await search.fill('IS201');
  await picker.locator('.tup-row').filter({hasText:'IS201'}).locator('input').check();
  if(!(await page.getByTestId('tup-selected').innerText()).includes('2'))errors.push('selection did not survive search');
  await search.fill('TU101');
  if(!(await picker.locator('.tup-row').filter({hasText:'TU101'}).locator('input').isDisabled()))errors.push('existing TU101 should not be added twice');
  await page.getByTestId('tup-guide-mode').click();
  await page.getByTestId('tup-track').selectOption('AC');
  const guided=page.getByTestId('tup-guided');await guided.waitFor();
  if((await guided.locator('.tup-row').filter({hasText:'AC201'}).locator('.tup-name').first().innerText()).trim()!=='Fundamental Accounting')errors.push('TU guided plan title should be English');
  await page.getByTestId('tup-bulk').click();
  const selected=await guided.locator('input:checked:not(:disabled)').count();
  if(selected!==2)errors.push('TU accounting semester 1 must select exactly AC201 and IS201, got '+selected);
  if(!(await guided.locator('.tup-row').filter({hasText:'AC201'}).locator('input').isChecked()))errors.push('AC201 not selected by guided bulk');
  await page.getByTestId('tup-add').click();
  await page.getByTestId('first-course-ai-tip').waitFor();
  await page.keyboard.press('Escape');
  await page.getByTestId('ai-hub').waitFor({state:'detached'});
  if(!(await page.evaluate(()=>GradeSpace.S.state.courses.some(c=>c.code==='AC201')&&GradeSpace.S.state.courses.some(c=>c.code==='IS201')&&GradeSpace.S.state.settings.tuAcademicProfile.track==='AC'))) errors.push('TU guided picker did not add the named accounting courses and persist major');
  if(!(await page.evaluate(()=>GradeSpace.catalogSearch('AC396').some(x=>x.code==='AC396'&&x.cr===1.5))))errors.push('Thai scoped catalog credits incorrect');
  if(await page.evaluate(()=>GradeSpace.S.state.courses.filter(c=>c.code==='TU101').length)!==1)errors.push('TU101 duplicate');
  // Ordinary TU accounts cannot switch via settings or direct hash navigation.
  const before=await page.evaluate(()=>GradeSpace.S.state.courses.map(c=>c.code));
  await page.evaluate(()=>location.hash='preferences'); await page.waitForTimeout(300);
  if(await page.locator('.seg button',{hasText:/^(จุฬาฯ|Chulalongkorn|ธรรมศาสตร์|Thammasat)$/}).count()) errors.push('normal TU account has a campus picker');
  await page.keyboard.press('Alt+Shift+t');
  await page.evaluate(()=>location.hash='dashboard'); await page.waitForTimeout(300);
  const after=await page.evaluate(()=>({u:GradeSpace.S.state.settings.institution,codes:GradeSpace.S.state.courses.map(c=>c.code)}));
  if(after.u!=='tu'||JSON.stringify(after.codes)!==JSON.stringify(before)) errors.push('normal TU account campus or courses changed');
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
  await checkCourseCardDelete(page,errors);
  await ctx.close();
  console.log(`TU ${lang} ${width}px: ${hashes.length} pages, overflow ${overflow.length ? overflow.join(', ') : 'none'}, errors ${errors.length ? errors.join(' | ') : 'none'}`);
  return errors.length + overflow.length;
}

// One-time-code sign-in (switched on with GS_WEB.otp; off in production until the migration is applied).
async function runOTP(browser, width) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(([d]) => { window.__D = d; let g; Object.defineProperty(window,'GS_WEB',{configurable:true,get(){return g;},set(v){g=Object.assign(v,{otp:true});}}); }, [state]);
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
  // A remembered email alone must not open the account.
  await page.evaluate(()=>localStorage.setItem('gradespace.email','otp@example.com'));
  await page.reload();
  await page.locator('#au-e').waitFor();
  if(await page.locator('.dashboard-exam-panel').count()) errors.push('remembered email opened the account without a code');
  if(await page.locator('#au-e').inputValue()!=='otp@example.com') errors.push('remembered email not pre-filled');
  await page.locator('#au-e').press('Enter');
  await page.locator('#au-code').waitFor();
  if(await page.evaluate(()=>window.__otpTo)!=='otp@example.com') errors.push('code not requested for the email');
  await page.locator('#au-code').fill('000000'); await page.locator('#au-code').press('Enter');
  await page.waitForTimeout(300);
  if(!(await page.locator('.banner.bad').count())) errors.push('wrong code not rejected');
  await page.locator('#au-code').fill('123456'); await page.locator('#au-code').press('Enter');
  await page.locator('.dashboard-exam-panel').first().waitFor();
  const rpcs=await page.evaluate(()=>window.__rpcs||[]);
  if(!rpcs.includes('gs_me_load')) errors.push('verified load not used');
  if(rpcs.includes('gs_load')||rpcs.includes('gs_save')) errors.push('email-only RPC used after code sign-in');
  // Non-admin verified CU cannot switch even with a valid session.
  await page.waitForFunction(()=>GradeSpace.S.cloud&&GradeSpace.S.state.settings.institution==='cu');
  await page.evaluate(()=>location.hash='me');
  await page.locator('.me-page').waitFor();
  if(await page.getByTestId('workspace-shortcut').count())errors.push('normal verified CU has workspace shortcut');
  await page.keyboard.press('Alt+Shift+t');
  if(await page.evaluate(()=>GradeSpace.S.state.settings.institution)!=='cu')errors.push('normal verified CU switched with keyboard');
  await page.evaluate(()=>location.hash='preferences');
  await page.waitForTimeout(300);
  if(await page.locator('.seg button',{hasText:/^(จุฬาฯ|Chulalongkorn|ธรรมศาสตร์|Thammasat)$/}).count())errors.push('normal verified CU has campus picker');
  await page.evaluate(()=>location.hash='dashboard');
  // Session survives a reload; no sign-in screen.
  await page.reload();
  await page.locator('.dashboard-exam-panel').first().waitFor({timeout:10000}).catch(()=>errors.push('session not restored after reload'));
  await ctx.close();
  console.log(`OTP ${width}px: errors ${errors.length ? errors.join(' | ') : 'none'}`);
  return errors.length;
}


// Verified admin can switch both ways, restoring the existing CU courses.
async function runCampusAdmin(browser) {
  const errors=[];
  const ctx=await browser.newContext({viewport:{width:390,height:900}});
  const page=await ctx.newPage();
  await page.addInitScript(d=>{
    window.__D=d; let g;
    Object.defineProperty(window,'GS_WEB',{configurable:true,get(){return g;},set(v){g=Object.assign(v,{otp:true});}});
    sessionStorage.setItem('fakeSess',JSON.stringify({user:{id:'admin-1',email:'admin@example.com',app_metadata:{gradespace_admin:true}}}));
  },state);
  await page.route('**/*',route=>{
    const u=route.request().url();
    if(u.startsWith('file:')||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();
    for(const [k,f] of Object.entries(LIBS))if(u.includes(k))return route.fulfill({path:f,contentType:'application/javascript'});
    if(u.includes('supabase.js'))return route.fulfill({body:FAKE_SUPABASE,contentType:'application/javascript'});
    return route.abort();
  });
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  await page.goto(PAGE);
  await page.waitForFunction(()=>window.GradeSpace&&GradeSpace.S.cloud&&GradeSpace.S.state.courses.length>=5);
  const before=await page.evaluate(()=>GradeSpace.S.state.courses.map(c=>c.id));
  await page.evaluate(()=>location.hash='me');
  await page.getByTestId('workspace-shortcut').click();
  await page.locator('.modal .btn.primary, .modal .btn.danger').last().click();
  await page.waitForFunction(()=>GradeSpace.S.state.settings.institution==='tu');
  if(await page.evaluate(()=>GradeSpace.S.state.courses.length!==0))errors.push('admin TU did not start with separate space');
  await page.keyboard.press('Alt+Shift+t');
  await page.waitForFunction(()=>GradeSpace.S.state.settings.institution==='cu');
  const after=await page.evaluate(()=>GradeSpace.S.state.courses.map(c=>c.id));
  if(JSON.stringify(before)!==JSON.stringify(after))errors.push('admin switch failed to restore CU courses');
  await ctx.close();
  console.log('Campus admin: errors '+(errors.join(' | ')||'none'));
  return errors.length;
}


// A fresh CU account: direct dashboard CTA and AI Hub after each explicit successful add,
// not during the form, programmatic restoration or reload.
async function runFirstCourseCU(browser) {
  const errors=[];
  const ctx=await browser.newContext({viewport:{width:390,height:900}});
  const page=await ctx.newPage();
  await page.addInitScript(()=>{window.__D=null;});
  await page.route('**/*',route=>{
    const u=route.request().url();
    if(u.startsWith('file:')||u.startsWith('data:')||u.startsWith('blob:'))return route.continue();
    for(const [k,f] of Object.entries(LIBS))if(u.includes(k))return route.fulfill({path:f,contentType:'application/javascript'});
    if(u.includes('supabase.js'))return route.fulfill({body:FAKE_SUPABASE,contentType:'application/javascript'});
    return route.abort();
  });
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  await page.goto(PAGE);
  await page.locator('#au-e').fill('test@example.com');
  await page.locator('#au-e').press('Enter');
  await page.waitForFunction(()=>window.GradeSpace&&GradeSpace.S.cloud&&GradeSpace.S.state.settings.institution==='cu');
  if(await page.getByTestId('ai-hub').count())errors.push('AI opened before any CU course');
  await page.getByTestId('dashboard-start').waitFor();
  await page.getByTestId('dashboard-semester-courses').click();
  await page.locator('.modal .prog-tiles .prog-tile').first().click();
  await page.locator('.modal .seg-pick').nth(0).locator('button').first().click();
  await page.locator('.modal .seg-pick').nth(1).locator('button').first().click();
  await page.locator('.modal input[id^="plan-course-"]:checked').first().waitFor();
  const selectedCount=await page.locator('.modal input[id^="plan-course-"]:checked').count();
  if(selectedCount<2)errors.push('CU semester CTA did not select a batch');
  if(await page.getByTestId('ai-hub').count())errors.push('AI opened before course save');
  await page.locator('.modal-foot .btn.primary').click();
  await page.getByTestId('first-course-ai-tip').waitFor();
  if(!(await page.getByTestId('askai-open').isVisible()))errors.push('first CU course should recommend AI import');
  await page.keyboard.press('Escape');
  await page.getByTestId('ai-hub').waitFor({state:'detached'});
  const saved=await page.evaluate(()=>GradeSpace.S.state.courses);
  if(saved.length!==selectedCount||new Set(saved.map(c=>c.semesterId)).size!==1)errors.push('CU semester batch not saved');
  await page.evaluate(()=>GradeSpace.update(d=>{d.courses=[];},{undo:true}));
  await page.evaluate(courses=>GradeSpace.update(d=>{d.courses.push(...courses);}),saved);
  await page.waitForTimeout(300);
  if(await page.getByTestId('ai-hub').count())errors.push('AI recommendation repeated after deleting and adding a course');
  if(!(await page.evaluate(()=>GradeSpace.S.state.settings.firstCourseAiSeen===true)))errors.push('first-course marker not persisted in account data');
  await page.reload();
  await page.waitForFunction(n=>window.GradeSpace&&GradeSpace.S.cloud&&GradeSpace.S.state.courses.length===n,selectedCount);
  if(await page.getByTestId('ai-hub').count())errors.push('AI recommendation repeated after reload');
  await page.evaluate(()=>location.hash='courses');
  await page.locator('.courses-actions .btn.primary').click();
  await page.locator('#c-name').fill('Second course');
  await page.locator('.modal-foot .btn.primary').click();
  await page.getByTestId('first-course-ai-tip').waitFor();
  await page.keyboard.press('Escape');
  await page.getByTestId('ai-hub').waitFor({state:'detached'});
  if(!(await page.evaluate(n=>GradeSpace.S.state.courses.length===n+1,selectedCount)))errors.push('later CU course not saved');
  await ctx.close();
  console.log('First CU course: errors '+(errors.join(' | ')||'none'));
  return errors.length;
}

const browser = await chromium.launch();
let bad = 0;
for (const lang of ['th', 'en']) for (const w of [390, 1280, 1800]) bad += await run(browser, lang, w);
for (const lang of ['th', 'en']) for (const w of [390, 1280]) bad += await runTU(browser, lang, w);
for (const w of [390, 1280]) bad += await runOTP(browser, w);
bad += await runCampusAdmin(browser);
bad += await runFirstCourseCU(browser);
await browser.close();
if (bad) { console.error('FAILED'); process.exit(1); }
console.log('OK');
