/* Source-scoped TBS Thai 2566 advisory engine. No network or state writes. */
(function(root){const api=(function academicEngine(){
  'use strict';
  const points={'A':4,'B+':3.5,'B':3,'C+':2.5,'C':2,'D+':1.5,'D':1,'F':0};
  const ordinary=g=>g==='S'||Object.hasOwn(points,g)&&points[g]>0;
  const major=g=>Object.hasOwn(points,g)&&points[g]>=2;
  const compact=v=>String(v||'').toUpperCase().replace(/[\s.]/g,'');
  function catalog(rows,gen){
    const byCode={}, aliases={};
    for(const r of rows){byCode[r[0]]={code:r[0],th:r[1],en:r[2],credits:r[3]};aliases[compact(r[4])]=r[0];aliases[compact(r[0])]=r[0];}
    for(const r of gen){if(!byCode[r[1]])byCode[r[1]]={code:r[1],th:r[2],en:r[3],credits:r[4]};aliases[compact(r[1])]=r[1];}
    return {byCode,normalize:v=>aliases[compact(v)]||compact(v).replace(/^มธ(?=\d)/,'TU')};
  }
  function amendmentActive(info){const y=Number(info?.academic), t=info?.term;if(!Number.isInteger(y)||y<2500||y>2700||!['s1','s2','summer'].includes(t))return null;return y>2569||y===2569&&t!=='s1';}
  function basketsFor(track,rules,active){return (rules.electiveBaskets[track.id]||[]).map((b,i)=>track.id==='FN'&&i===0&&active?{...b,codes:[...new Set([...b.codes,'FN494'])]}:b);}
  function guidedPlan({track,plan,structure,rules,targetInfo}){const termNo={s1:1,s2:2,summer:3}[targetInfo?.term],term=plan?.terms.find(t=>t.year===targetInfo?.level&&t.term===termNo)||null;const allowed=new Set([...track.core,...track.required,...structure.genEdSlots.flat()]);const named=[],alternatives=[],open=[];for(const row of term?.rows||[]){const codes=[...new Set(row.codes)];if(codes.length===1&&allowed.has(codes[0]))named.push(codes[0]);else if(codes.length>1&&codes.every(x=>allowed.has(x))&&/หรือ/.test(row.label)&&!/และ/.test(row.label))alternatives.push(codes);else open.push(row.label);}
    const unique=[...new Set(named)], alt=new Set(alternatives.flat()), canBulk=!!term&&plan.total===135&&term.numericCellTotal===undefined&&term.rowCredits===undefined;
    return {term,named:unique,alternatives,open,canBulk,bulk:canBulk?unique.filter(x=>!alt.has(x)):[],remaining:[...new Set([...track.core,...track.required,...structure.genEdSlots.filter(x=>x.length===1).flat()])].filter(x=>!unique.includes(x)&&!alt.has(x)),genAlternatives:structure.genEdSlots.filter(x=>x.length>1),baskets:basketsFor(track,rules,amendmentActive(targetInfo)===true)};}
  function audit({courses=[],track,structure,rules,cat,gen=[],allocations={},termInfo={}}){
    const attempts={},review=[],used=new Set(),groups=[],missing=[];
    for(const c of courses){const code=cat.normalize(c.code);if(!code){review.push({code:'?',reason:'missing-code'});continue;}(attempts[code]??=[]).push(c);}
    const special=rules.specialCourses||{};
    const valid=(code,isMajor)=> (attempts[code]||[]).filter(c=>!special[code]&&(code!=='FN494'||amendmentActive(termInfo[c.semesterId])===true)&&(isMajor?major(c.finalGrade):ordinary(c.finalGrade))&&cat.byCode[code]&&Number(c.credits)===cat.byCode[code].credits);
    function use(code){used.add(code);return cat.byCode[code].credits;}
    function group(id,need,earned,codes){groups.push({id,need,earned,remaining:Math.max(0,need-earned),codes});}
    function required(id,slots,isMajor){
      let credits=0;const codes=[];
      for(const options of slots){const code=options.find(x=>!used.has(x)&&valid(x,isMajor).length);
        if(code){credits+=use(code);codes.push(code);}else missing.push({group:id,options,status:options.some(x=>(attempts[x]||[]).some(c=>['ACC','EXE','AUD','I'].includes(c.finalGrade)))?'review':options.some(x=>(attempts[x]||[]).some(c=>['F','U','W'].includes(c.finalGrade)||isMajor&&['D','D+'].includes(c.finalGrade)))?'retake':options.some(x=>(attempts[x]||[]).some(c=>!c.finalGrade))?'planned':'missing'});
      }group(id,slots.length*3,credits,codes);
    }
    required('genRequired',structure.genEdSlots,false);
    const geSet=new Set(gen.map(x=>x[1]));
    const geExtra=Object.keys(attempts).filter(x=>geSet.has(x)&&!used.has(x)&&valid(x,false).length&&cat.byCode[x].credits===3&&!track.core.includes(x)&&!track.required.includes(x));
    const ge=geExtra.slice(0,1);group('genExtra',structure.genEdOtherCredits,ge.reduce((n,x)=>n+use(x),0),ge);
    required('core',track.core.map(x=>[x]),false);required('major',track.required.map(x=>[x]),true);
    const baskets=basketsFor(track,rules,true);
    // Enumerate feasible choices (small credit caps); optimize total filled, never count a code twice.
    function choices(b,available){
      const out=[[]];const pairs=b.alternativePairs||[];
      function walk(start,chosen,sum){
        if(chosen.length>0)out.push(chosen);
        for(let i=start;i<available.length;i++){const x=available[i],cr=cat.byCode[x].credits;
          if(sum+cr>b.credits||b.exactCourses&&chosen.length>=b.exactCourses||pairs.some(p=>p.includes(x)&&p.some(y=>chosen.includes(y))))continue;
          walk(i+1,[...chosen,x],sum+cr);
          if(out.length>=2000)return;
        }
      }
      // Large sets are bounded; incomplete allocation must remain review-only.
      walk(0,[],0);return out.slice(0,2000);
    }
    const basketCandidates=baskets.map(b=>b.codes.filter(x=>!used.has(x)&&valid(x,false).length));
    let best=[],score=-1,explored=0;
    function search(i,seen,sets,total){
      if(++explored>20000)return;
      if(i===baskets.length){if(total>score){score=total;best=sets;}return;}
      const b=baskets[i],avail=basketCandidates[i].filter(x=>!seen.has(x));
      for(const xs of choices(b,avail)){const n=xs.reduce((s,x)=>s+cat.byCode[x].credits,0);search(i+1,new Set([...seen,...xs]),[...sets,xs],total+n);if(explored>20000)break;}
    }search(0,new Set(),[],0);
    baskets.forEach((b,i)=>{const xs=best[i]||[];group('basket'+i,b.credits,xs.reduce((n,x)=>n+use(x),0),xs);});
    if(explored>20000||baskets.some((b,i)=>basketCandidates[i].length>12))review.push({code:'—',reason:'allocation-review'});
    // Other/minor and free-elective categories are not inferred from provisional course labels.
    for(const id of ['other','free']){
      const need=id==='other'?track.other:structure.minFreeElective;
      const xs=[];let n=0;
      for(const code of Object.keys(attempts).sort()){
        if(allocations[code]!==id||used.has(code)||!valid(code,false).length)continue;
        if(id==='free'&&geSet.has(code)&&/^[A-Z]+1\d\d$/.test(code)){review.push({code,reason:'free-gened100'});continue;}
        if(n+cat.byCode[code].credits>need){review.push({code,reason:'over-cap'});continue;}
        n+=use(code);xs.push(code);
      }
      group(id,need,n,xs);
    }
    for(const [code,cs] of Object.entries(attempts)){
      if(cs.some(c=>['ACC','EXE','I','AUD'].includes(c.finalGrade)))review.push({code,reason:'special-outcome'});
      if(cs.some(c=>ordinary(c.finalGrade)&&(!cat.byCode[code]||Number(c.credits)!==cat.byCode[code].credits)))review.push({code,reason:'credit-source'});
      if(!used.has(code)&&valid(code,false).length)review.push({code,reason:'unallocated'});
      if(cs.length>1&&new Set(cs.map(c=>Number(c.credits))).size>1)review.push({code,reason:'repeat-credit'});
    }
    const earned=groups.reduce((n,g)=>n+g.earned,0);
    const majorRows=track.required.map(x=>valid(x,true).map(c=>points[c.finalGrade]));
    const majorGpa=majorRows.every(x=>x.length)?majorRows.reduce((n,x)=>n+Math.max(...x),0)/majorRows.length:null;
    return {groups,missing,review,earned,remaining:Math.max(0,structure.minTotal-earned),majorGpa,academicChecklistComplete:groups.every(g=>g.remaining===0)&&missing.length===0,graduationCertified:false};
  }
  function eligibility({code,courses=[],track,rules,prereq,cat,targetIndex=Infinity,termIndex={},targetInfo}){
    code=cat.normalize(code);
    const attempts=courses.filter(c=>cat.normalize(c.code)===code);
    if(rules.specialCourses?.[code])return {status:'review',reason:'special-course',source:[]};
    if(!cat.byCode[code])return {status:'review',reason:'unknown-course',source:[]};
    if(attempts.some(c=>termIndex[c.semesterId]===undefined||termIndex[c.semesterId]>=targetIndex))return {status:'blocked',reason:'already-planned',source:[]};
    if(attempts.some(c=>track.required.includes(code)?major(c.finalGrade):ordinary(c.finalGrade)))return {status:'blocked',reason:'already-passed',source:[]};
    if(attempts.some(c=>!c.finalGrade||['ACC','EXE','I','AUD'].includes(c.finalGrade)))return {status:'review',reason:'prior-unresolved',source:[]};
    const effective=amendmentActive(targetInfo);
    if(code==='FN494'&&effective!==true)return {status:effective===null?'review':'blocked',reason:effective===null?'term-unknown':'not-effective',source:[]};
    if(code==='MK412'&&effective===null)return {status:'review',reason:'term-unknown',source:[]};
    if(code==='MK412'&&track.id!=='MK')return {status:'blocked',reason:'major-restriction',source:[]};
    const source=code==='FN494'?['สอบได้วิชา กง.311 และ กง.312']:code==='MK412'?['นักศึกษาเอกวิชาการตลาด และสอบได้วิชา กต.'+(effective?'313':'318')]:(prereq[code]||[]).filter(r=>r[0]===(track.id==='AC'?0:1)).map(r=>r[1]);
    if(!source.length)return {status:'review',reason:'no-verified-rule',source};
    if(new Set(source).size!==1)return {status:'review',reason:'complex-rule',source};
    // Only exact simple "passed course" AND/OR statements are executable; no extrapolation.
    const body=source[0].trim().replace(code==='MK412'?/^นักศึกษาเอกวิชาการตลาด และสอบได้วิชา\s*/:/^สอบได้(?:วิชา)?\s*/,'');
    if(body===source[0].trim()||/และ/.test(body)&&/หรือ/.test(body))return {status:'review',reason:'complex-rule',source};
    const raw=body.split(/\s*(?:และ|หรือ)\s*/);
    if(raw.some(x=>!/^[A-Zก-๙.]+\s*\d{3}$/i.test(x.trim())))return {status:'review',reason:'complex-rule',source};
    const codes=raw.map(cat.normalize);if(codes.some(x=>!cat.byCode[x]))return {status:'review',reason:'complex-rule',source};
    const passed=x=>courses.some(c=>cat.normalize(c.code)===x&&termIndex[c.semesterId]!==undefined&&termIndex[c.semesterId]<targetIndex&&ordinary(c.finalGrade)&&Number(c.credits)===cat.byCode[x].credits);
    const ok=/หรือ/.test(body)?codes.some(passed):codes.every(passed);
    return {status:ok?'academic-pass':'blocked',reason:ok?'prerequisite-met':'prerequisite-missing',source,missing:codes.filter(x=>!passed(x))};
  }
  function plan(args){
    const rows=args.result.missing.flatMap(m=>m.options.map(code=>({code,group:m.group,alternative:m.options.length>1,priority:m.status==='retake'?0:m.group==='core'?1:m.group==='major'?2:3,...eligibility({...args,code})})));
    const seen=new Set();return rows.sort((a,b)=>(a.status==='academic-pass'?0:a.status==='review'?1:2)-(b.status==='academic-pass'?0:b.status==='review'?1:2)||a.priority-b.priority||a.code.localeCompare(b.code)).filter(x=>!seen.has(x.code)&&seen.add(x.code));
  }
  return {catalog,audit,eligibility,plan,amendmentActive,guidedPlan};
})();if(typeof module==='object'&&module.exports)module.exports=api;else root.GSAcademic=api;})(globalThis);
