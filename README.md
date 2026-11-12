# ScoutLens SEO

ScoutLens SEO is an independently implemented Chrome Manifest V3 extension for inspecting the current page's technical SEO, content, structured data and GEO readiness. It is not affiliated with AITDK. Signals and recommendations are heuristics, not search-engine rules or proof of ranking or AI citations.

## Install locally

1. Clone this repository or download its source.
2. Open `chrome://extensions` in Chrome 116 or later, enable **Developer mode** and choose **Load unpacked**.
3. Select this repository's directory (the directory containing `manifest.json`). Pin ScoutLens SEO and click its icon on an HTTP(S) page. Chrome's internal pages are not supported.
4. Use the side panel to analyze the active page. For pre-existing tabs, reload if necessary. Shortcuts can be changed in `chrome://extensions/shortcuts`.

## Feature and data boundaries

- **On-page**: title, description, canonical, robots metadata, headings, links, images, social metadata, hreflang, JSON-LD, keyword density and a lightweight issue/GEO checklist. Results reflect the DOM visible to the extension at scan time. For density, check scope, language segmentation, dynamic content and repeated navigation; no universal optimal density exists. GEO is an indicative checklist, not a measure of AI citations.
- **Network checks**: the extension queries the site's robots.txt, sitemap.xml and llms.txt from its origin; DNS uses Cloudflare DNS-over-HTTPS, and RDAP uses the IANA bootstrap and the registry's HTTPS RDAP server. Network failures, blocks, redirects and unrecognized hostnames are reported as unknown, not zero. RDAP uses the exact hostname, not an estimated registrable domain; subdomains may not resolve. robots.txt cannot establish real crawler access through firewalls or prove indexing.
- **Traffic, external backlinks and reverse AdSense** require an independent dataset. This extension does not include one, fabricate numbers, scrape a competitor's private service, or claim Ahrefs data. You can connect a compatible provider in Settings. Without one, these reports are unavailable. Third-party tool shortcuts navigate to the third-party website and may require separate accounts/subscriptions.
- Google result injection / overlay behavior, full parity with proprietary data, exact backlink indexes and AI visibility measurements are not guaranteed by this project. See the interface for current implemented controls and explicit unavailable states.

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
