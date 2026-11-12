import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenize,calculateDensity,buildGeoChecks,analyzePage} from '../src/audit.js';
test('English count, denominator and stop words',()=>{const d=calculateDensity('Game game and idle game','en',2);assert.equal(d.totalWords,5);assert.deepEqual(d.items.find(x=>x.term==='game'),{term:'game',count:3,n:1,density:60});assert.equal(d.items.some(x=>x.term==='and'),false);assert.equal(d.items.some(x=>x.term==='game idle'),false);});
test('Chinese uses word segmentation, not isolated characters',()=>{const t=tokenize('搜索引擎优化可以提高网站排名','zh');assert.ok(t.includes('搜索'));assert.ok(t.includes('引擎'));assert.ok(!t.includes('链'));});
test('GEO unknown does not claim crawler access or prediction',()=>{const geo=buildGeoChecks({overview:{robots:'noindex',canonical:'',lang:'en'},headings:[],structured:[],density:{totalWords:10,scope:'main'}});assert.equal(geo.score,null);assert.equal(geo.checks.find(x=>x.name==='Index directives').status,'warning');assert.equal(geo.checks.find(x=>x.name==='Crawler access').status,'unknown');});
test('minimal empty page extraction does not crash',()=>{const body={innerText:'Hello hello world'};const doc={title:'Sample',documentElement:{lang:'en'},body,querySelector(){return null},querySelectorAll(){return []}};const d=analyzePage(doc,{href:'https://example.com/',hostname:'example.com'});assert.equal(d.density.totalWords,3);assert.equal(d.density.items.find(x=>x.term==='hello').count,2);assert.equal(d.geo.score,null);});
test('AdSense detection requires publisher markers and aggregates evidence',async()=>{
 const {detectAdsenseIds}=await import('../src/audit.js');
 const e=(attrs,text='')=>({getAttribute:n=>attrs[n]||'',textContent:text});
 const doc={baseURI:'https://example.com/',querySelectorAll:s=>({
  '[data-ad-client]':[e({'data-ad-client':'ca-pub-1234567890123456'})],
  'meta[name="google-adsense-account"]':[e({content:'ca-pub-1234567890123456'})],
  script:[e({src:'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456'}),e({},'google_ad_client = "ca-pub-1234567890123456";'),e({src:'https://attacker.example/?client=ca-pub-9999999999999999'}),e({},'const unrelated = "ca-pub-9999999999999999";')]
 }[s]||[])};
 const ids=detectAdsenseIds(doc); assert.equal(ids.length,1);assert.equal(ids[0].id,'pub-1234567890123456');assert.equal(ids[0].evidence.length,4);
});
test('Chinese singleton segmentation fallback never crosses punctuation',()=>{
 const old=Intl.Segmenter;
 try {Intl.Segmenter=class {segment(input){return [...input].map((ch,i)=>({segment:ch,index:i,isWordLike:/[\p{L}\p{N}]/u.test(ch)}));}};
   assert.deepEqual(tokenize('链接 优化，测试','zh'),['链接','优化','测试']);
 } finally {Intl.Segmenter=old;}
});
