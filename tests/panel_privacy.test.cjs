const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('src/panel.js','utf8');
function setup(){
  const elements=[];
  class Element { constructor(tag){this.tag=tag;this.children=[];this.events={};this.style={};this.value='';elements.push(this)} append(x){this.children.push(x)} replaceChildren(...xs){this.children=xs} addEventListener(n,f){this.events[n]=f} setAttribute(){} }
  const ids=Object.fromEntries(['main','nav','status','site','refresh','copy'].map(id=>['#'+id,new Element('div')]));
  const saved={dfsLogin:'old@example.com',dfsPassword:'secret',providerToken:'old-token',similarwebKey:'old-key',providerUrl:'https://old.example/?token=secret'};
  const sess={}; const calls=[]; let activated,updated;
  const area=(store)=>({async get(keys){return Object.fromEntries(keys.filter(k=>k in store).map(k=>[k,store[k]]))},async set(o){Object.assign(store,o)},async remove(keys){for(const k of [].concat(keys))delete store[k]}});
  const chrome={storage:{local:area(saved),session:area(sess)},tabs:{async query(){calls.push('query');return [{id:1,url:'https://example.com/'}]},onActivated:{addListener(fn){activated=fn}},onUpdated:{addListener(fn){updated=fn}}},runtime:{async sendMessage(msg){calls.push(msg.type);return {data:{overview:{},headings:[],images:[],links:[]}}}}};
  vm.runInNewContext(source,{chrome,document:{querySelector:s=>ids[s],createElement:t=>new Element(t)},navigator:{clipboard:{writeText:async()=>{}}},URL,confirm:()=>true,setTimeout,console});
  return {elements,ids,saved,sess,calls,activate:()=>activated(),update:()=>updated(1,{status:'complete'})};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('consent gates page access, clears legacy secrets, and allows analysis only after explicit click',async()=>{
  const x=setup();await tick();assert.deepEqual(x.calls,[]);for(const k of ['dfsLogin','dfsPassword','providerToken','similarwebKey','providerUrl'])assert.equal(x.saved[k],undefined);
  x.activate();x.update();await tick();assert.deepEqual(x.calls,[]);
  const agree=x.elements.find(e=>e.textContent==='同意并开始分析');assert.ok(agree);await agree.events.click();await tick();assert.equal(x.saved.pageAnalysisConsentV1,true);assert.deepEqual(x.calls,['query','ANALYZE']);
});
test('sensitive credentials cannot be persisted with local storage',()=>{
  assert.doesNotMatch(source,/chrome\.storage\.local\.set\(\{[^}]*\b(?:dfsLogin|dfsPassword|providerToken|similarwebKey|providerUrl)\b/);
  assert.match(source,/chrome\.storage\.session\.set\(\{dfsLogin:/);
  assert.match(source,/chrome\.storage\.session\.set\(\{providerUrl:/);
});
