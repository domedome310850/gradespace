// Extract only JSON literals from the legacy frontend. Never execute its JavaScript.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export function extractCatalog(source, sourceBlob) {
  function readJSON(name, open, close) {
    const start=source.indexOf("var CATALOG = ");
    if(start<0) throw Error("CATALOG missing");
    const marker="var "+name+" = ";
    const offset=source.indexOf(marker,start);
    if(offset<0)throw Error(name+" missing");
    const first=offset+marker.length;
    if(source[first]!==open)throw Error(name+" not a JSON literal");
    let depth=0, quoted=false, escaped=false;
    for(let i=first;i<source.length;i++){
      const c=source[i];
      if(quoted){if(escaped)escaped=false;else if(c==="\\")escaped=true;else if(c==='"')quoted=false;continue;}
      if(c==='"'){quoted=true;continue;}
      if(c===open)depth++;
      if(c===close&&--depth===0)return JSON.parse(source.slice(first,i+1));
    }
    throw Error(name+" incomplete");
  }
  const raw=readJSON("COURSES","{","}"), plans=readJSON("PLANS","[","]");
  const courses=Object.entries(raw).sort(([a],[b])=>a.localeCompare(b)).map(([code,v])=>{
    if(!/^\d{7}$/.test(code)||!v.n||!Number.isFinite(v.cr)||v.cr<0)throw Error("Invalid legacy course "+code);
    return {id:"cu:"+code,institution_id:"cu",code,title_legacy:v.n,title_th:v.th||null,credits:v.cr,owner_unit_id:null,source_url:v.sourceUrl||null,status:"legacy_unverified",legacy:v};
  });
  const ids=new Set(courses.map(c=>c.id));
  const planIds=new Set(), missing=new Set();
  const study_plans=plans.map(p=>{
    if(!p.id||planIds.has(p.id)||!Array.isArray(p.items))throw Error("Invalid or duplicate legacy plan "+p.id);
    planIds.add(p.id);
    const refs=p.items.filter(x=>x.c).map(x=>"cu:"+x.c);
    for(const id of refs)if(!ids.has(id))missing.add(id);
    return {id:"cu:"+p.id,institution_id:"cu",academic_year_be:p.ay||null,program_label_th:p.th||null,program_label_en:p.en||null,major_label_th:p.mth||null,major_label_en:p.men||null,course_refs:refs,status:"legacy_unverified",legacy:p};
  });
  return {schema_version:1,source:{path:"public/index.html",blob_sha:sourceBlob,kind:"legacy_embedded_catalog",status:"staging_only"},institution:{id:"cu",name_th:"จุฬาลงกรณ์มหาวิทยาลัย",name_en:"Chulalongkorn University"},courses,study_plans,quality:{courses:courses.length,study_plans:study_plans.length,source_urls:courses.filter(x=>x.source_url).length,thai_titles:courses.filter(x=>x.title_th).length,templates:courses.filter(x=>x.legacy.tpl).length,exam_date_records:courses.filter(x=>x.legacy.mid||x.legacy.fin).length,unresolved_course_refs:[...missing].sort()}};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const buf=readFileSync(resolve(root,'public/index.html'));
  const sha=createHash('sha1').update('blob '+buf.length+'\0').update(buf).digest('hex');
  const result=extractCatalog(buf.toString('utf8'),sha);
  const out=resolve(root,'data/staging/cu-legacy-catalog.json');
  mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.quality,null,2));
}
