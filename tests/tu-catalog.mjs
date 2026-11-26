import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const read=n=>JSON.parse(html.match(new RegExp('^var '+n+' = ([\\s\\S]*?);$','m'))[1]);
const ge=read('TU_GENED'), bba=read('TU_TBS'), pre=read('TU_BBA_PREREQ'), syllabi=read('TU_SYLLABI');
assert.equal(ge.length,229); assert.equal(bba.length,208);
assert.equal(new Set(ge.map(x=>x[1])).size,ge.length);
assert.equal(new Set(bba.map(x=>x[0])).size,bba.length);
assert.deepEqual(ge.find(x=>x[1]==='TU101').slice(0,2),[1,'TU101']);
assert.ok(ge.some(x=>x[1]==='IEA101'&&x[4]===3));
assert.ok(ge.some(x=>x[1]==='FIN201'&&x[0]===5));
assert.ok(bba.some(x=>x[0]==='AC352'&&x[2]===3));
assert.match(pre.AC352,/AC201.*IS201/);
for(const r of syllabi){assert.equal(r.weights.reduce((s,x)=>s+x[2],0),100);if(r.cutoffs){assert.equal(Object.keys(r.cutoffs).length,8);assert.equal(r.cutoffs.F,0);}assert.match(r.source,/^https:\/\/(socadmin|www.tbs)\.tu\.ac\.th\//);}
assert.equal(syllabi.find(x=>x.code==='SW366').cutoffs.C,60);
assert.equal(syllabi.find(x=>x.code==='JA315').cutoffs.C,55);
assert.equal(syllabi.find(x=>x.code==='SW366').sections.length,0);
assert.match(html,/if \(isCU\(p.state\)\) return null;/);
console.log('TU catalog data checks passed');

const thai=read('TU_TBS_THAI_2566');
assert.equal(thai.majors.length,8);assert.equal(thai.minGenEd+thai.minSpecialized+thai.minFreeElective,thai.minTotal);
assert.equal(thai.genEdSlots.length*3+thai.genEdOtherCredits,30);
assert.equal(thai.core.length*3,45);assert.equal(thai.accountingCore.length*3,42);
for(const m of thai.majors){for(const t of m.required)assert.equal(t.codes.length*3,t.credits);if(m.majorElective!==null)assert.equal(m.coreCredits+m.required[0].credits+m.majorElective+m.other,99);}
assert.equal(syllabi.find(x=>x.code==='RB211').cutoffs,null);
assert.equal(syllabi.find(x=>x.code==='RB211').weights.at(-1)[2],40);

const thaiCourses=read('TU_TBS_THAI_COURSES');
assert.equal(thaiCourses.length,297);assert.equal(new Set(thaiCourses.map(x=>x[0])).size,thaiCourses.length);
assert.ok(thaiCourses.every(x=>x[1]&&x[2]&&x[3]>0&&x[4]&&x[5].length));
assert.equal(thaiCourses.find(x=>x[0]==='AC201')[4],'บช.201');

const thaiPre=read('TU_TBS_THAI_PREREQ');
assert.match(thaiPre.OM319[0][1],/87/);
for(const m of thai.majors)for(const t of m.required)for(const code of t.codes)assert.ok(thaiCourses.some(x=>x[0]===code),code);
