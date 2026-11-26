// Only public, static assets are cached. Never cache account, scan, or RPC responses.
const CACHE='gradespace-shell-v18';
const STATIC=['/','/index.html','/manifest.webmanifest','/app-icon.svg','/planning-core.js','/academic-core.js'];
const LIBS=[
'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js',
'https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js',
'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js'
];
self.addEventListener('install',e=>e.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await cache.addAll(STATIC);
 await Promise.allSettled(LIBS.map(async url=>{const req=new Request(url,{mode:'no-cors'});const res=await fetch(req);if(res.ok||res.type==='opaque')await cache.put(req,res);}));
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('gradespace-shell-')&&key!==CACHE)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',e=>{
 const req=e.request, url=new URL(req.url);
 if(req.method!=='GET')return;
 const navigation=req.mode==='navigate'&&url.origin===self.location.origin&&(url.pathname==='/'||url.pathname==='/index.html');
 const local=url.origin===self.location.origin&&STATIC.includes(url.pathname)&&!url.search;
 const lib=LIBS.includes(url.href);
 if(!navigation&&!local&&!lib)return;
 e.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   const key=navigation?'/':req;
   try{
     const response=await fetch(req);
     if(response.ok||lib&&response.type==='opaque')await cache.put(key,response.clone());
     return response;
   }catch(err){
     const cached=await cache.match(key);
     if(cached)return cached;
     throw err;
   }
 })());
});
