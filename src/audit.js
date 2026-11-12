/* Independent page analysis. Never treat heuristic scores as search-engine facts. */
const STOP = new Set('a an the and or but of to in for on at by from with is are was were be been as it this that these those into your you we our i he she they them their its can will may not no do does did has have had via which what how when where why who'.split(' '));

export function tokenize(text, lang='en') {
  const normalized = String(text || '').normalize('NFKC').toLocaleLowerCase();
  if (typeof Intl.Segmenter === 'function') {
    try { return [...new Intl.Segmenter(lang || undefined, {granularity:'word'}).segment(normalized)].filter(x=>x.isWordLike).map(x=>x.segment); } catch { /* fallback below */ }
  }
  return normalized.match(/[\p{L}\p{N}]+/gu) || [];
}
export function calculateDensity(text, lang='en', maxN=5) {
  const words = tokenize(text,lang), counts=new Map();
  // Ignore stop words at either boundary, without joining words across them.
  for(let n=1;n<=Math.max(1,Math.min(5,maxN));n++) for(let i=0;i+n<=words.length;i++) {
    const part=words.slice(i,i+n); if(STOP.has(part[0]) || STOP.has(part.at(-1))) continue;
    const term=part.join(' '), k=`${n}\0${term}`; counts.set(k,(counts.get(k)||0)+1);
  }
  const items=[...counts].map(([key,count])=>{const [n,term]=key.split('\0');return {term,count,n:Number(n),density:words.length?Number((100*count/words.length).toFixed(2)):0}}).sort((a,b)=>b.count-a.count||a.term.localeCompare(b.term));
  return {totalWords:words.length,items,scope:'body'};
}
const attr=(el,name)=>el?.getAttribute?.(name) ?? '';
const meta=(doc,name)=>attr(doc.querySelector(`meta[name="${name}"]`),'content');
const all=(doc,sel)=>Array.from(doc.querySelectorAll(sel));
const clean=s=>String(s??'').replace(/\s+/g,' ').trim();

/** Text from visible content, excluding navigation, footer and scripts. Snapshot is not a crawler fetch. */
export function visibleText(root, doc) {
  if(!root) return '';
  const win=doc.defaultView;
  if(!doc.createTreeWalker || !win?.NodeFilter) return clean(root.innerText || root.textContent || '');
  const walker=doc.createTreeWalker(root,win.NodeFilter.SHOW_TEXT); let node; const chunks=[];
  while((node=walker.nextNode())) {
    const p=node.parentElement; if(!p || p.closest('script,style,noscript,template,nav,footer,aside,[hidden],[aria-hidden="true"],input,textarea,select,button')) continue;
    let visible=true;
    for(let el=p;el && el!==root.parentElement;el=el.parentElement) { const style=win.getComputedStyle(el); if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'){visible=false;break;} }
    if(visible && clean(node.nodeValue)) chunks.push(node.nodeValue);
  }
  return clean(chunks.join(' '));
}
export function buildGeoChecks(data) {
  const checks=[]; const add=(name,status,detail)=>checks.push({name,status,detail});
  add('Index directives', /(?:^|[,\s])noindex(?:$|[,\s])/i.test(data.overview.robots)?'warning':'pass', data.overview.robots || 'No meta robots directive found; headers and crawler access were not checked.');
  add('Canonical',data.overview.canonical?'pass':'info',data.overview.canonical||'No canonical link detected in rendered DOM.');
  const h1=data.headings.filter(x=>x.level===1).length;
  add('H1',h1===1?'pass':'info',`${h1} H1 heading(s) in rendered DOM; a count is not a ranking rule.`);
  add('Structured data',data.structured.some(x=>!x.error)?'pass':'info',data.structured.length?`${data.structured.length} JSON-LD block(s) detected; validity and eligibility are not established.`:'No JSON-LD found in rendered DOM.');
  add('Language',data.overview.lang?'pass':'info',data.overview.lang||'No HTML language attribute.');
  add('Content',data.density.totalWords?'pass':'info',`${data.density.totalWords} segmented words in visible ${data.density.scope}; assess usefulness and accuracy manually.`);
  add('Crawler access','unknown','robots.txt, authentication, WAF and real bot requests are not evaluated by this page-only analysis.');
  add('AI citations','unknown','No AI search citations or visibility were measured.');
  // A score would imply unsupported calibration. Report observations only.
  return {score:null,checks,disclaimer:'Heuristic checks only; no AI citation or ranking prediction.'};
}
export function analyzePage(doc=globalThis.document, loc=globalThis.location) {
  if(!doc || !loc) throw new Error('Document and location are required');
  const url=String(loc.href), host=String(loc.hostname), lang=doc.documentElement?.lang||'';
  const root=doc.querySelector('main, article, [role="main"]')||doc.body, scope=root===doc.body?'body':'main';
  const text=visibleText(root,doc), density=calculateDensity(text,lang); density.scope=scope;
  const headings=all(doc,'h1,h2,h3,h4,h5,h6').map(el=>({level:Number(el.tagName.slice(1)),text:clean(el.textContent)}));
  const images=all(doc,'img').map(el=>({src:el.currentSrc||el.src||attr(el,'src'),alt:el.hasAttribute('alt')?attr(el,'alt'):null,title:attr(el,'title')}));
  const links=all(doc,'a[href]').map(el=>{let href='';try{href=new URL(attr(el,'href'),url).href}catch{return null} let target;try{target=new URL(href)}catch{return null} const rel=attr(el,'rel').toLowerCase().split(/\s+/).filter(Boolean);return {href,text:clean(el.innerText||el.textContent),rel,internal:target.hostname===host,nofollow:rel.includes('nofollow')};}).filter(Boolean);
  const social={}; for(const k of ['og:title','og:type','og:image','og:url','og:description','og:site_name','twitter:card','twitter:site','twitter:title','twitter:image','twitter:description']) {let el=doc.querySelector(`meta[property="${k}"]`)||doc.querySelector(`meta[name="${k}"]`);social[k]=attr(el,'content')||null;}
  const hreflangs=all(doc,'link[rel~="alternate"][hreflang]').map(el=>({lang:attr(el,'hreflang'),href:el.href||attr(el,'href')}));
  const structured=all(doc,'script[type="application/ld+json"]').map(el=>{try{const value=JSON.parse(el.textContent);return {type:Array.isArray(value)?'array':value['@type']||'JSON-LD',value,error:null}}catch(e){return {type:'JSON-LD',value:null,error:String(e.message)}}});
  const overview={title:doc.title||'',description:meta(doc,'description'),canonical:doc.querySelector('link[rel~="canonical"]')?.href||'',robots:meta(doc,'robots'),lang,wordCount:density.totalWords};
  const issues=[]; if(!overview.title) issues.push({name:'Title',detail:'No title found.'}); if(!overview.description) issues.push({name:'Description',detail:'No meta description found; search engines may generate snippets from page content.'}); if(!overview.canonical) issues.push({name:'Canonical',detail:'No canonical link detected; determine whether this page needs one.'}); if(/\bnoindex\b/i.test(overview.robots))issues.push({name:'Indexing',detail:'Meta robots contains noindex; verify this is intentional.'}); if(!headings.some(h=>h.level===1))issues.push({name:'H1',detail:'No H1 detected; assess page structure in context.'}); const missing=images.filter(i=>i.alt===null).length; if(missing)issues.push({name:'Images',detail:`${missing} image(s) have no alt attribute; decorative images may use empty alt.`});
  const data={url,overview,headings,images,links,social,hreflangs,structured,density,issues}; data.geo=buildGeoChecks(data); return data;
}
