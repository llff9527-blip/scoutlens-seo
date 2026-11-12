# ScoutLens SEO

ScoutLens SEO is an independently implemented Chrome Manifest V3 extension for inspecting the current page's technical SEO, content, structured data and GEO readiness. It is not affiliated with AITDK. Signals and recommendations are heuristics, not search-engine rules or proof of ranking or AI citations.

## Install locally

1. Clone this repository or download its source.
2. Open `chrome://extensions` in Chrome 116 or later, enable **Developer mode** and choose **Load unpacked**.
3. Select this repository's directory (the directory containing `manifest.json`). Pin ScoutLens SEO and click its icon on an HTTP(S) page. Chrome's internal pages are not supported.
4. Use the side panel to analyze the active page. For pre-existing tabs, reload if necessary. Shortcuts can be changed in `chrome://extensions/shortcuts`.

## Feature and data boundaries

- **On-page**: title, description, canonical, robots metadata, headings, links, images, social metadata, hreflang, JSON-LD, keyword density and a lightweight issue/GEO checklist. Results reflect the DOM visible to the extension at scan time. For density, check scope, language segmentation, dynamic content and repeated navigation; no universal optimal density exists. GEO is an indicative checklist, not a measure of AI citations.
- **Network checks**: the extension queries the site's robots.txt, sitemap.xml, llms.txt and ads.txt from its origin; DNS uses Cloudflare DNS-over-HTTPS, and RDAP uses the IANA bootstrap and the registry's HTTPS RDAP server. Network failures, blocks, redirects and unrecognized hostnames are reported as unknown, not zero. RDAP uses the exact hostname, not an estimated registrable domain; subdomains may not resolve. robots.txt cannot establish real crawler access through firewalls or prove indexing.
- **Traffic and external backlinks** are available using separately configured DataForSEO credentials. Traffic is estimated Google search traffic for the selected country and language, not total visits. Backlinks include a paid summary and up to 20 rows; DataForSEO rank is not Ahrefs DR. Reverse AdSense candidates can be searched with the DataForSEO Domains by HTML Terms index; this searches indexed homepage HTML only, not every page or ads.txt. The extension also detects public publisher IDs and ads.txt locally. Results are leads, not proof of current use or shared ownership. A generic compatible provider can also be configured. Third-party tool shortcuts navigate to the third-party website and may require separate accounts/subscriptions.
- Google result injection / overlay behavior, full parity with proprietary data, exact backlink indexes and AI visibility measurements are not guaranteed by this project. See the interface for current implemented controls and explicit unavailable states.

## DataForSEO setup (optional)

In Settings enter your DataForSEO **API login and API password** (not your website login password), location code and language code. Credentials remain in `chrome.storage.local`, which is not encrypted against software with local profile access. Choose Sandbox first: it is free for registered users and returns **dummy** results. Production requests are paid; each report requires explicit confirmation. Traffic, ranked keywords and reverse publisher-ID lookup make one request each; backlink summary and list make two. Actual cost is returned by the API when available, and a failure or timeout does not prove no charge. Review current vendor prices and account balance before use.

DataForSEO receives only the target hostname, not the page path, query or fragment. Organic ETV is an estimate based on search rankings for the selected market; it is not Similarweb total visits, analytics data, or page views. Paid ETV is reported separately. API data may be incomplete or missing, not zero. DataForSEO credentials are not included in the repository. A successful authenticated sandbox or live API call requires the user to configure their credentials and has not been independently verified in this release.

## Optional Similarweb total visits

DataForSEO search traffic estimates do not cover all acquisition channels. For a separately authorized Similarweb API account, configure its API key in Settings, then select a month and country or `world` in Traffic and explicitly confirm the request. The official Total Visits API estimates desktop and mobile visits; an eligible paid plan may be needed, and one request may consume a hit or credit. It is an estimate, not the site's analytics. No TabAPI service is used.

Similarweb requires the key in the HTTPS query string. Although the extension suppresses it from its own output, the URL can appear in developer tools, local logs, proxies or other network inspection. Do not share network logs or screenshots containing it. Chrome extension storage is not an encrypted vault.

## Optional data provider

Configure an HTTPS endpoint and optional bearer token in the panel. On an explicit lookup the extension requests the configured endpoint with `domain` and `url` query parameters and, when provided, an `Authorization: Bearer …` header. The endpoint should return JSON:

```json
{
  "traffic": {"monthlyVisits": 1000, "source": "example", "period": "2026-10"},
  "backlinks": {"total": 42, "referringDomains": 8, "items": []},
  "adsense": {"publisherIds": [], "relatedSites": []}
}
```

No provider is configured by default, and the fixture values above are not live results. An adapter or provider may be needed to normalize an API's actual schema. Provider calls occur only when explicitly requested; configured endpoints may charge fees. Treat all provider data as estimates or historical observations and independently verify individual backlinks and status.

## Privacy, permissions and security

The extension needs access to HTTP(S) pages to inspect the selected page and check its origin, plus `scripting`, `tabs`, `storage`, `sidePanel`, and `contextMenus`. Page scans are local to the extension. Network checks send the domain to Cloudflare and an RDAP registry/IANA, and request public origin files. An explicit provider lookup sends the current URL origin and path (query string and fragment removed) and hostname to the configured provider; Paths can still contain sensitive data. Avoid running provider lookups on private URLs. Credentials are stored in Chrome local extension storage, not encrypted against other software with local profile access; never commit them to a public repository.

Requests reject literal IPs, local hostnames and DNS answers identifying private IPs; redirects are conservatively rejected when they cannot be inspected and provider requests never follow redirects. This is defense in depth, not protection from DNS rebinding or every network exposure. Do not use on sensitive/internal systems without reviewing permissions and threat model.

## Development and verification

The extension requires no build step. Run `node --check src/background.js` and the repository's automated tests where present. Verify manually on local test fixtures and real pages using an unpacked extension; the extension must be reloaded after editing the manifest or service worker. Browser, provider and origin behavior can vary, so report only observed results.

## Verification in this release

Run `node --test tests/*.test.*`. Automated tests mock the DataForSEO API and do not establish live account access or data accuracy. A browser test analyzed example.com, idlegamecompass.com and aitdk.com; a separate isolated Chromium fixture exercised Chinese segmentation and AdSense signals. Live DataForSEO and reverse-index lookups require user credentials/services and remain unverified.

## Verification for 0.3.0

The DataForSEO reverse-ID and Similarweb integrations are covered by mocked request/response tests, not a real authenticated transaction. Successful API access, account entitlements, pricing, and live data accuracy remain unverified until the user configures valid credentials and explicitly runs a lookup. Do not interpret Sandbox data as production observations.
