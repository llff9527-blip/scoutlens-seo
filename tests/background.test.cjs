const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname,'../src/background.js'),'utf8');
let listener;
const chrome = {
 runtime:{id:'testid',getURL:p=>'chrome-extension://testid/'+p,onMessage:{addListener:f=>listener=f},onInstalled:{addListener:()=>{}}},
 contextMenus:{onClicked:{addListener:()=>{}}}, commands:{onCommand:{addListener:()=>{}}},
 storage:{local:{get:async()=>({})},session:{get:async()=>({})}},tabs:{get:async()=>({active:true,url:'https://example.com/path?secret=abc#x'})},
 scripting:{executeScript:async()=>[{result:{title:'test'}}]}
};
const ctx=vm.createContext({chrome,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,console, TextEncoder, TextDecoder, Uint8Array, btoa: s=>Buffer.from(s,'binary').toString('base64'), fetch:async()=>{throw Error('unexpected network')}});
vm.runInContext(code,ctx);
const run=s=>vm.runInContext(s,ctx);
test('rejects local and literal IP hosts',()=>{ for(const u of ['http://127.0.0.1/','http://localhost/','http://server.local/','https://192.168.1.1/']) assert.throws(()=>run(`safeUrl(${JSON.stringify(u)})`)); assert.equal(run("safeUrl('https://example.com/').hostname"),'example.com'); });
test('rejects private IP answers',()=>{for(const ip of ['127.0.0.1','10.1.2.3','192.168.0.3','::1','fd00::1','fe80::1'])assert.equal(run(`publicAddress(${JSON.stringify(ip)})`),false,ip);assert.equal(run("publicAddress('8.8.8.8')"),true)});
test('only extension sender can request operations',()=>{assert.equal(listener({type:'ANALYZE',tabId:1},{id:'other',url:'https://evil.example'},()=>{}),false)});
test('detects stale URL',async()=>{await assert.rejects(run("currentTab(1,'https://example.com/different')"),/changed/)});
test('analysis returns captured result',async()=>{const x=await run('analyze(1)');assert.equal(x.data.title,'test')});
test('provider receives path but never query or fragment',async()=>{
  const calls=[];
  chrome.storage.session.get=async()=>({providerUrl:'https://provider.example.net/api',providerToken:'test-token'});
  ctx.fetch=async (input,opts)=>{
    const u=new URL(input); calls.push({url:u.href,headers:opts?.headers,method:opts?.method,body:opts?.body});
    if(u.hostname==='cloudflare-dns.com')return new Response(JSON.stringify({Answer:[{type:1,data:'8.8.8.8'}]}),{status:200});
    if(u.hostname==='data.iana.org')return new Response(JSON.stringify({services:[[['com'],['https://registry.example.net/']]]}),{status:200});
    if(u.hostname==='provider.example.net')return new Response(JSON.stringify({traffic:{monthlyVisits:1}}),{status:200});
    return new Response('{}',{status:200});
  };
  const result=await run("providerLookup('example.com','https://example.com/path')");
  assert.equal(result.ok,true); const p=calls.find(c=>c.url.startsWith('https://provider.example.net/'));
  assert.equal(new URL(p.url).search,''); assert.equal(p.method,'POST'); assert.equal(JSON.parse(p.body).url,'https://example.com/path'); assert.equal(p.headers.Authorization,'Bearer test-token');
});
test('PROVIDER handler contacts only DNS and configured provider',async()=>{
 const calls=[];chrome.storage.session.get=async()=>({providerUrl:'https://provider.example.net/api'});
 ctx.fetch=async input=>{const u=new URL(input);calls.push(u.hostname);if(u.hostname==='cloudflare-dns.com') return new Response(JSON.stringify({Answer:[{type:1,data:'8.8.8.8'}]}));if(u.hostname==='provider.example.net')return new Response('{"backlinks":{}}');throw Error('Unexpected host '+u.hostname)};
 const result=await new Promise(resolve=>listener({type:'PROVIDER',tabId:1,url:'https://example.com/path?secret=abc#x'},{id:'testid',url:'chrome-extension://testid/src/panel.html'},resolve));
 assert.equal(result.provider.ok,true);assert.deepEqual([...new Set(calls)].sort(),['cloudflare-dns.com','provider.example.net']);
});
test('response body is capped before parsing',async()=>{
 ctx.fetch=async()=>new Response(new Uint8Array(2_000_001));const result=await run("responseData('https://example.com/')");assert.equal(result.ok,false);assert.match(result.error,/exceeds 2 MB/);
});
test('timeout remains active while waiting for response body',async()=>{
 const delayed=vm.createContext({chrome,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,console,TextDecoder,Uint8Array,fetch:async(_url,opts)=>new Response(new ReadableStream({start(controller){opts.signal.addEventListener('abort',()=>controller.error(new Error('aborted body')))}}))});
 vm.runInContext(code.replace('const TIMEOUT_MS = 12000','const TIMEOUT_MS = 20'),delayed);
 const result=await vm.runInContext("responseData('https://example.com/')",delayed);assert.equal(result.ok,false);assert.match(result.error,/aborted/);
});

test('DataForSEO traffic sends hostname and explicit location, never URL secrets',async()=>{
 const calls=[];chrome.storage.local.get=async()=>({dfsSandbox:true});chrome.storage.session.get=async()=>({dfsLogin:'fixture',dfsPassword:'test-key'});
 ctx.fetch=async(input,opts)=>{calls.push({url:input,body:JSON.parse(opts.body),auth:opts.headers.Authorization});return new Response(JSON.stringify({status_code:20000,cost:0,tasks:[{status_code:20000,result:[{location_code:2840,language_code:'en',items:[{target:'example.com',metrics:{organic:{etv:12,count:3},paid:{etv:1,count:1}}}]}]}]}));};
 const r=await run("dataforseo(1,'https://example.com/path?secret=abc#x','traffic',2840,'en')");
 assert.equal(r.ok,true);assert.equal(r.data.organic.etv,12);assert.equal(r.source,'DataForSEO Sandbox (dummy data)');assert.match(calls[0].url,/sandbox\.dataforseo\.com/);assert.deepEqual(calls[0].body[0].targets,['example.com']);assert.equal(calls[0].body[0].location_code,2840);assert.ok(!JSON.stringify(calls[0].body).includes('secret'));assert.match(calls[0].auth,/^Basic /);
});
test('DataForSEO backlinks returns summary when second charged call fails',async()=>{
 let n=0;chrome.storage.session.get=async()=>({dfsLogin:'fixture',dfsPassword:'test-key'});ctx.fetch=async()=>{n++;return new Response(JSON.stringify(n===1?{status_code:20000,cost:.02,tasks:[{status_code:20000,result:[{rank:10,backlinks:2}]}]}:{status_code:20000,cost:.01,tasks:[{status_code:40000,status_message:'failed'}]}));};
 const r=await run("dataforseo(1,'https://example.com/path?secret=abc#x','backlinks')");assert.equal(r.ok,true);assert.equal(r.data.summary.backlinks,2);assert.equal(r.data.items,null);assert.match(r.warning,/failed/);assert.equal(r.costs.length,2);assert.equal(r.costs[1].cost,.01);
});
test('DataForSEO denies unknown report without network access',async()=>{chrome.storage.session.get=async()=>({dfsLogin:'fixture',dfsPassword:'test-key'});ctx.fetch=async()=>{throw Error('unexpected network')};const r=await run("dataforseo(1,'https://example.com/path?secret=abc#x','unsupported')");assert.equal(r.ok,false);assert.match(r.error,/不支持/)});
test('DataForSEO keyword lookup is a separate single paid call',async()=>{
 const calls=[];chrome.storage.session.get=async()=>({dfsLogin:'fixture',dfsPassword:'test-key'});ctx.fetch=async(input,opts)=>{calls.push({input,body:JSON.parse(opts.body)});return new Response(JSON.stringify({status_code:20000,cost:.01,tasks:[{status_code:20000,result:[{location_code:2840,language_code:'en',total_count:1,items:[{keyword_data:{keyword:'idle games'}}]}]}]}));};
 const r=await run("dataforseo(1,'https://example.com/path?secret=abc#x','keywords',2840,'en')");assert.equal(r.ok,true);assert.equal(r.data.items[0].keyword_data.keyword,'idle games');assert.equal(calls.length,1);assert.match(calls[0].input,/ranked_keywords/);assert.equal(calls[0].body[0].target,'example.com');assert.equal(calls[0].body[0].limit,20);
});
test('DataForSEO does not present other targets as live target data',async()=>{
 chrome.storage.local.get=async()=>({});chrome.storage.session.get=async()=>({dfsLogin:'fixture',dfsPassword:'test-key'});ctx.fetch=async()=>new Response(JSON.stringify({status_code:20000,cost:0.1,tasks:[{status_code:20000,result:[{items:[{target:'wrong-domain.com',metrics:{organic:{etv:999}}}]}]}]}));
 const r=await run("dataforseo(1,'https://example.com/path?secret=abc#x','traffic')");assert.equal(r.ok,true);assert.equal(r.data,null);assert.equal(r.costs[0].cost,.1);
});
test('AdSense reverse lookup uses strict homepage HTML search and exactly one paid request',async()=>{
 const calls=[];chrome.storage.session.get=async()=>({dfsLogin:'fixture',dfsPassword:'test-key'});ctx.fetch=async(input,opts)=>{calls.push({input,body:JSON.parse(opts.body)});return new Response(JSON.stringify({status_code:20000,cost:.02,tasks:[{status_code:20000,result:[{total_count:1,items:[{domain:'candidate.example',title:'A',last_visited:'2026-10-01'}]}]}]}));};
 const r=await run("dataforseo(1,'https://example.com/path?secret=abc#x','adsense',null,null,'pub-1234567890123456')");assert.equal(r.ok,true);assert.equal(calls.length,1);assert.match(calls[0].input,/domains_by_html_terms\/live/);assert.deepEqual(calls[0].body[0].search_terms,['pub-1234567890123456']);assert.equal(calls[0].body[0].mode,'strict_entry');assert.equal(calls[0].body[0].limit,20);assert.equal(r.data.items[0].domain,'candidate.example');assert.equal(r.costs[0].cost,.02);assert.ok(!JSON.stringify(calls[0].body).includes('secret'));
});
test('invalid AdSense publisher ID sends no paid request',async()=>{chrome.storage.session.get=async()=>({dfsLogin:'x',dfsPassword:'y'});ctx.fetch=async()=>{throw Error('must not call')};const r=await run("dataforseo(1,'https://example.com/path?secret=abc#x','adsense',null,null,'bad')");assert.equal(r.ok,false);assert.equal(r.costs.length,0)});
test('Similarweb direct integration is disabled without sending the key',async()=>{let called=false;ctx.fetch=async()=>{called=true;throw Error('unexpected')};const r=await run("similarweb(1,'https://example.com/','2026-10','world')");assert.equal(r.ok,false);assert.match(r.error,/暂不可用/);assert.equal(called,false)});
test('HTTPS fetch rejects initial HTTP and redirects to HTTP',async()=>{let called=0;ctx.fetch=async()=>{called++;return {type:'basic',status:302,headers:{get:()=> 'http://example.com/path'}}};await assert.rejects(run("safeFetch('http://example.com/')"));assert.equal(called,0);await assert.rejects(run("safeFetch('https://example.com/')"));assert.equal(called,1)});
test('custom provider refuses query parameters before network',async()=>{let called=false;chrome.storage.session.get=async()=>({providerUrl:'https://provider.example.net/api?key=secret',providerToken:'secret'});ctx.fetch=async()=>{called=true};const r=await run("providerLookup('example.com','https://example.com/path')");assert.equal(r.ok,false);assert.match(r.error,/query parameters/);assert.equal(called,false)});
test('public files for HTTP page use HTTPS only',async()=>{const calls=[];chrome.tabs.get=async()=>({active:true,url:'http://example.com/page'});ctx.fetch=async(input)=>{calls.push(String(input));const u=new URL(input);if(u.hostname==='cloudflare-dns.com')return new Response(JSON.stringify({Answer:[{type:1,data:'8.8.8.8'}]}));if(u.hostname==='data.iana.org')return new Response(JSON.stringify({services:[]}));return new Response('ok')};try{await run("network(1,'http://example.com/page')");assert.ok(calls.some(x=>x==='https://example.com/robots.txt'));assert.ok(calls.every(x=>x.startsWith('https://')))}finally{chrome.tabs.get=async()=>({active:true,url:'https://example.com/path?secret=abc#x'})}});
