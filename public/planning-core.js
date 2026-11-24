/* GradeSpace planning rules: pure, deterministic; no DOM or network. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GSPlanning=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const pct=n=>finite(n)&&n>=0&&n<=100;
  const EPS=1e-8;
  function active(p){
    return !!(p&&(p.rounding&&p.rounding!=='none'||p.bonus||p.minimums?.length||Object.keys(p.drops||{}).length||Object.keys(p.retakes||{}).length));
  }
  function compare(score,mean,sd){
    return pct(score)&&pct(mean)&&finite(sd)&&sd>0&&sd<=100?{z:(score-mean)/sd,difference:score-mean}:null;
  }
  function evaluate(policy,state,course,summary,grades,sim){
    const p=policy||{};
    const fail=reason=>({status:'invalid',reason});
    const pending=()=>({status:'pending'});
    if(!summary||!Array.isArray(summary.rows)||!summary.rows.length)return pending();
    if(summary.issues?.over||summary.issues?.overMax||Math.abs(summary.totalWeight-100)>0.005)return fail('weights');
    if(!['none','nearest','floor','ceil'].includes(p.rounding||'none')||!pct(p.bonus??0))return fail('policy');
    const rows=summary.rows.map(r=>{
      let score=r.graded?r.a.score:sim?.[r.id];
      const retake=p.retakes?.[r.id];
      if(retake){
        if(!r.graded||!finite(retake.score)||retake.score<0||!finite(r.max)||retake.score>r.max||!['replace','higher'].includes(retake.mode))return {...r,invalid:true};
        score=retake.mode==='higher'?Math.max(score,retake.score):retake.score;
      }
      return {...r,score,weight:r.w,ratio:finite(score)&&finite(r.max)&&r.max>0?score/r.max:null};
    });
    if(rows.some(r=>r.invalid||r.virtual||!finite(r.weight)||r.weight<0||r.ratio!==null&&(r.ratio<0||r.ratio>1&&!r.extra)))return fail('scores');
    if(rows.some(r=>r.ratio===null))return pending();
    for(const [id,n] of Object.entries(p.drops||{})){
      const cat=state.categories.find(k=>k.id===id&&k.courseId===course.id);
      const group=rows.filter(r=>r.a.categoryId===id);
      if(!cat||cat.dist!=='equal'||!Number.isInteger(n)||n<1||n>=group.length||group.some(r=>r.extra))return fail('drop');
      const weight=group.reduce((s,r)=>s+r.weight,0);
      const ranked=group.slice().sort((a,b)=>a.ratio-b.ratio||String(a.id).localeCompare(String(b.id)));
      ranked.forEach((r,i)=>{r.weight=i<n?0:weight/(group.length-n);});
    }
    let score=rows.reduce((s,r)=>s+r.ratio*r.weight,0)+(p.bonus||0);
    if(p.rounding==='nearest')score=Math.round(score+EPS);
    else if(p.rounding==='floor')score=Math.floor(score+EPS);
    else if(p.rounding==='ceil')score=Math.ceil(score-EPS);
    const ordered=(grades||[]).filter(g=>finite(g.min)).slice().sort((a,b)=>b.min-a.min);
    let grade=ordered.find(g=>score+EPS>=g.min)||ordered[ordered.length-1]||null;
    const failed=[];
    for(const rule of p.minimums||[]){
      if(!rule||!pct(rule.min)||!rule.type||!ordered.some(g=>g.label===rule.cap))return fail('minimum');
      const group=rows.filter(r=>r.a.type===rule.type&&r.weight>0);
      const weight=group.reduce((s,r)=>s+r.weight,0);
      if(weight<=EPS)return fail('component');
      const achieved=group.reduce((s,r)=>s+r.ratio*r.weight,0)/weight*100;
      if(achieved+EPS<rule.min){
        failed.push({type:rule.type,achieved,min:rule.min,cap:rule.cap});
        const cap=ordered.find(g=>g.label===rule.cap);
        if(grade&&ordered.indexOf(grade)<ordered.indexOf(cap))grade=cap;
      }
    }
    return {status:'ok',score,grade,failed,dropped:rows.filter(r=>r.weight===0&&r.w>0).map(r=>r.id)};
  }
  function range(fixed,courses,options){
    const credits=fixed.gpaCredits+courses.reduce((n,c)=>n+Number(c.credits||0),0);
    if(!(credits>0)||options.length!==courses.length||options.some(o=>!o.length))return null;
    const totals=[0,1].map(high=>fixed.qp+options.reduce((n,o,i)=>n+o[high?o.length-1:0].points*Number(courses[i].credits),0));
    return {low:totals[0]/credits,high:totals[1]/credits,credits};
  }
  function scenarios(fixed,courses,options,target){
    const bounds=range(fixed,courses,options);
    if(!bounds||!finite(target)||target<0||target>4||target>bounds.high+EPS)return [];
    const out=[];
    for(let policy=0;policy<3;policy++){
      const ix=options.map(()=>0);
      let qp=fixed.qp+options.reduce((n,o,i)=>n+o[0].points*Number(courses[i].credits),0);
      while(qp+EPS<target*bounds.credits){
        const candidates=options.map((o,i)=>({i,delta:ix[i]+1<o.length?(o[ix[i]+1].points-o[ix[i]].points)*Number(courses[i].credits):-1})).filter(x=>x.delta>=0);
        if(!candidates.length)break;
        candidates.sort((a,b)=>policy===1?b.delta-a.delta:policy===2?a.delta-b.delta:options[a.i][ix[a.i]].points-options[b.i][ix[b.i]].points);
        const x=candidates[0];ix[x.i]++;qp+=x.delta;
      }
      if(qp+EPS>=target*bounds.credits){
        const labels=ix.map((k,i)=>options[i][k].label);
        if(!out.some(x=>x.labels.join('|')===labels.join('|')))out.push({labels,gpa:qp/bounds.credits});
      }
    }
    return out;
  }
  return {active,compare,evaluate,range,scenarios};
});
