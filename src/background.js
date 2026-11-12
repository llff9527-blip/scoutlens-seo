/* ScoutLens SEO background. Remote lookups are explicit; no bundled data or credentials. */
const RDAP_BOOTSTRAP = 'https://data.iana.org/rdap/dns.json';
const DNS_BASE = 'https://cloudflare-dns.com/dns-query';
const TIMEOUT_MS = 12000;

function publicHost(host) {
  const h = host.toLowerCase().replace(/\.$/, '');
  // Reject IP literals, local names, mDNS and special-use internal suffixes.
  return h.length <= 253 && h.includes('.') && !/[:\[\]]/.test(h) && !/^[\d.]+$/.test(h) &&
    !/(^|\.)(localhost|local|internal|home|lan|test|invalid|onion)$/.test(h) &&
    h.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}
function safeUrl(value, httpsOnly = false) {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || (httpsOnly && u.protocol !== 'https:') ||
      u.username || u.password || !publicHost(u.hostname)) throw new Error('Only public HTTP(S) domains are supported');
  return u;
}
const MAX_RESPONSE_BYTES = 2_000_000;
async function safeFetch(value, options = {}, limit = 3) {
  let url = safeUrl(value);
  for (let n = 0; n <= limit; n++) {
    const response = await fetch(url.href, {...options, credentials:'omit', redirect:'manual'});
    if (response.type === 'opaqueredirect') throw new Error('Redirect could not be safely inspected');
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect without location');
      url = safeUrl(new URL(location, url).href);
      continue;
    }
    return response;
  }
  throw new Error('Too many redirects');
}
async function readLimited(response) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error('Response exceeds 2 MB limit');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error('Response exceeds 2 MB limit'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk,offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(all);
}
async function responseData(url, mode = 'text', options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await safeFetch(url, {...options,signal:controller.signal});
    if (!r.ok) return {ok:false, status:r.status, error:`HTTP ${r.status}`};
    const raw = await readLimited(r);
    return {ok:true, status:r.status, data:mode === 'json' ? JSON.parse(raw) : raw};
  } catch (e) { return {ok:false, error:e?.message || String(e)}; }
  finally { clearTimeout(timer); }
}
async function currentTab(tabId, url) {
  if (!Number.isInteger(tabId)) throw new Error('Missing tab ID');
  const tab = await chrome.tabs.get(tabId);
  if (!tab.active || !tab.url) throw new Error('Target tab must be active');
  const actual = safeUrl(tab.url);
  if (url && actual.href !== new URL(url).href) throw new Error('The active URL changed; refresh the report');
  return {tab, actual};
}
async function analyze(tabId) {
  await currentTab(tabId);
  const result = await chrome.scripting.executeScript({target:{tabId}, func: async () => {
    const mod = await import(chrome.runtime.getURL('src/audit.js'));
    return mod.analyzePage(document, location);
  }});
  return {data:result[0]?.result ?? null};
}
async function providerLookup(hostname, url) {
  const cfg = await chrome.storage.local.get(['providerUrl','providerToken']);
  if (!cfg.providerUrl) return {ok:false,error:'No provider configured'};
  try {
    const endpoint = safeUrl(cfg.providerUrl, true);
    const resolutions = await Promise.all(['A','AAAA'].map(type => responseData(`${DNS_BASE}?name=${encodeURIComponent(endpoint.hostname)}&type=${type}`, 'json', {headers:{Accept:'application/dns-json'}})));
    const addresses = resolutions.flatMap(r => r.data?.Answer || []).filter(a => a.type===1 || a.type===28).map(a=>a.data);
    if (!addresses.length || !addresses.every(publicAddress)) throw new Error('Provider does not resolve exclusively to public IP addresses');
    endpoint.searchParams.set('domain', hostname);
    endpoint.searchParams.set('url', url);
    const headers = {'Accept':'application/json'};
    if (cfg.providerToken) headers.Authorization = `Bearer ${cfg.providerToken}`;
    // Do not follow redirects: prevents transmitting the token to another origin.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(endpoint.href, {headers, credentials:'omit', redirect:'error', signal:controller.signal});
      if (!r.ok) return {ok:false,status:r.status,error:`Provider HTTP ${r.status}`};
      const raw = await readLimited(r);
      const data = JSON.parse(raw);
      return {ok:true, source:endpoint.origin, data};
    } finally { clearTimeout(timer); }
  } catch(e) { return {ok:false,error:e?.message || String(e)}; }
}
function publicAddress(ip) {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    return !(/^(::|::1|f[cd]|fe[89ab]|ff)/.test(v) || v.includes('::ffff:'));
  }
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  const [a,b] = octets;
  return !(a===0 || a===10 || a===127 || a>=224 || (a===169 && b===254) ||
    (a===172 && b>=16 && b<=31) || (a===192 && b===168) || (a===100 && b>=64 && b<=127) ||
    (a===198 && (b===18 || b===19)));
}
async function rdapLookup(hostname) {
  const bootstrap = await responseData(RDAP_BOOTSTRAP, 'json');
  if (!bootstrap.ok) return bootstrap;
  const tld = hostname.split('.').pop().toLowerCase();
  const entry = bootstrap.data?.services?.find(([suffixes]) => suffixes.includes(tld));
  const base = entry?.[1]?.find(x => x.startsWith('https://'));
  if (!base) return {ok:false,error:'No HTTPS RDAP service for this TLD'};
  // Exact host, never guessed registrable domain. Some registries do not accept subdomains.
  try { return await responseData(new URL('domain/'+encodeURIComponent(hostname), safeUrl(base,true)).href, 'json'); }
  catch (e) { return {ok:false,error:e.message}; }
}
async function network(tabId, url) {
  const {actual} = await currentTab(tabId, url);
  const origin = actual.origin, hostname = actual.hostname;
  // DNS and RDAP receive only the host; third-party provider receives host + URL only upon explicit request.
  const types = ['A','AAAA','CNAME','MX','NS','TXT'];
  const dnsRecords = await Promise.all(types.map(type => responseData(`${DNS_BASE}?name=${encodeURIComponent(hostname)}&type=${type}`, 'json', {headers:{Accept:'application/dns-json'}})));
  const dns = Object.fromEntries(types.map((t,i) => [t,dnsRecords[i]]));
  const addresses = [...(dns.A.data?.Answer || []), ...(dns.AAAA.data?.Answer || [])].filter(a => a.type === 1 || a.type === 28).map(a => a.data);
  const publicResolution = addresses.length > 0 && addresses.every(publicAddress);
  const unavailable = {ok:false,error:'Site requests skipped: public DNS did not resolve exclusively to public addresses'};
  const [robots,sitemap,llms,rdap] = await Promise.all([
    publicResolution ? responseData(origin + '/robots.txt') : unavailable,
    publicResolution ? responseData(origin + '/sitemap.xml') : unavailable,
    publicResolution ? responseData(origin + '/llms.txt') : unavailable,
    rdapLookup(hostname)
  ]);
  const data = {hostname, robots, sitemap, llms, rdap, dns};
  return data;
}
function trustedSender(sender) {
  return sender.id === chrome.runtime.id && typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''));
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!trustedSender(sender)) return false;
  (async () => {
    try {
      if (message?.type === 'ANALYZE') return await analyze(message.tabId);
      if (message?.type === 'NETWORK') return await network(message.tabId, message.url);
      if (message?.type === 'PROVIDER') {
        const {actual} = await currentTab(message.tabId, message.url);
        return {provider:await providerLookup(actual.hostname, actual.origin + actual.pathname)};
      }
      return {error:'Unknown request'};
    } catch (e) { return {error:e?.message || String(e)}; }
  })().then(sendResponse);
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(() => {});
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({id:'scout-parent', title:'ScoutLens SEO', contexts:['page','selection','link']});
    chrome.contextMenus.create({id:'scout-open', parentId:'scout-parent', title:'Open SEO panel', contexts:['page','selection','link']});
    chrome.contextMenus.create({id:'scout-archive', parentId:'scout-parent', title:'Open in Wayback Machine', contexts:['page','link']});
    chrome.contextMenus.create({id:'scout-pagespeed', parentId:'scout-parent', title:'Check with PageSpeed Insights', contexts:['page','link']});
    chrome.contextMenus.create({id:'scout-search', parentId:'scout-parent', title:'Search selection on Google', contexts:['selection']});
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id || !tab.windowId) return;
  const target = info.linkUrl || info.pageUrl;
  if (info.menuItemId === 'scout-open') { chrome.sidePanel.open({windowId:tab.windowId}).catch(()=>{}); return; }
  if (info.menuItemId === 'scout-search' && info.selectionText) { chrome.tabs.create({url:'https://www.google.com/search?q='+encodeURIComponent(info.selectionText)}); return; }
  try {
    const u = safeUrl(target);
    if (info.menuItemId === 'scout-archive') chrome.tabs.create({url:'https://web.archive.org/web/*/'+u.href});
    if (info.menuItemId === 'scout-pagespeed') chrome.tabs.create({url:'https://pagespeed.web.dev/analysis?url='+encodeURIComponent(u.href)});
  } catch (_) {}
});
chrome.commands.onCommand.addListener(async command => {
  const [tab] = await chrome.tabs.query({active:true,lastFocusedWindow:true});
  if (!tab?.url || !tab.windowId) return;
  try {
    const u = safeUrl(tab.url);
    if (command === 'open-panel') await chrome.sidePanel.open({windowId:tab.windowId});
    else if (command === 'similarweb') await chrome.tabs.create({url:'https://www.similarweb.com/website/'+encodeURIComponent(u.hostname)});
    else if (command === 'semrush') await chrome.tabs.create({url:'https://www.semrush.com/analytics/overview/?searchType=domain&q='+encodeURIComponent(u.href)});
  } catch (_) {}
});
