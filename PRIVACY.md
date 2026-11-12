# ScoutLens SEO Privacy Policy

Effective date: November 12, 2026  
Applies to: ScoutLens SEO Chrome extension version 0.4.0. For the previously uploaded 0.3.0 draft, see the [version 0.3.0 policy](https://github.com/llff9527-blip/scoutlens-seo/blob/38bf9cffdbd47ef76dfda8bc36feb52c42bb670d/PRIVACY.md).

ScoutLens SEO helps users inspect webpages for SEO and GEO signals. This policy describes the extension's data practices. Third-party services have their own privacy policies and retention practices.

## Information the extension handles

- **Current webpage and URL:** After you agree to the in-extension disclosure and while the side panel is open, the extension accesses the active HTTP(S) tab and refreshes its analysis when the active tab changes or the page finishes loading. The analysis reads the page URL and rendered content, including text, metadata, headings, links, images, structured data and advertising publisher identifiers. Page content can include personal or sensitive information. The extension does not need the browser's complete browsing history to perform this analysis.
- **Settings and credentials:** If you choose to configure external services, the extension stores settings and the credentials you provide, such as a DataForSEO API login and password, and a custom provider URL and optional token. A login can include an email address. Sensitive credentials and the custom provider URL are held in Chrome session storage in memory, not saved in persistent local storage; they are cleared on browser restart or extension reload, update or disable. Session storage is not an encrypted password vault and cannot protect against compromised software or browser access. Non-secret settings are stored in Chrome local extension storage. On upgrade, the extension removes legacy credentials from local extension storage.
- **Queries and reports:** The extension handles the domain, URL, publisher ID or selected text needed for the feature you use, as described below. Reports are displayed in the extension and can be copied to the clipboard when you request it.

## Processing and external requests

The on-page analysis is performed in the extension and browser. The packaged extension does not send the full page text to a ScoutLens-operated server. The following features do make external requests or open third-party sites:

- **Public site checks:** When you request network checks, the extension sends the target hostname to Cloudflare DNS and to an applicable domain registry's RDAP service; it also requests the IANA RDAP bootstrap and the target website's robots.txt, sitemap.xml, llms.txt and ads.txt where available. Public file checks use HTTPS even when the analyzed page uses HTTP; they can fail if the site does not support HTTPS. The service receiving a network request can see the requesting device's IP address and may keep logs.
- **DataForSEO:** If configured and you confirm a query, the extension sends your DataForSEO API credentials over HTTPS to DataForSEO. Traffic, keyword and backlink requests contain the target domain and relevant query parameters; reverse AdSense requests contain the publisher ID. The traffic, keyword and backlink requests do not send the page path, query string or fragment. DataForSEO may charge for API requests.
- **Similarweb:** Direct API queries are disabled in version 0.4.0. A shortcut to the Similarweb website remains available.
- **Custom provider:** If you configure and request a lookup from a custom provider, after confirmation the extension sends the provider a JSON POST containing the current hostname and URL origin and path, with the page's query string and fragment removed, plus your optional bearer token in an authorization header. A URL path can still be sensitive. The provider must use HTTPS. The extension also queries Cloudflare DNS for the provider hostname.
- **Third-party shortcuts:** When you use shortcuts or context menus, the browser opens third-party websites such as search engines, Wayback Machine, PageSpeed Insights, Similarweb, Semrush or Ahrefs. Depending on the shortcut, the destination can receive selected text, a domain, or a URL without its query string and fragment; URL paths can contain sensitive information. Review a URL before using a shortcut on a private page.

These external services receive requests directly from your browser, not through a ScoutLens server in the packaged extension. Their use and retention of information are governed by their own policies and your relationship with them. Avoid analyzing private or sensitive pages with external features and use only providers you trust.

## Storage, retention and deletion

Non-secret settings and your consent choice remain in Chrome local extension storage until you clear them or remove the extension. DataForSEO credentials, custom provider URL and custom provider token remain in session memory until cleared or the browser session or extension ends. Settings provide controls to clear credentials and withdraw page-analysis consent. On upgrade, legacy local credentials are removed. Removing the extension removes its local extension storage. Third-party services may retain information under their own policies; contact the relevant provider about data it holds. Protect your browser profile and do not share credentials or network logs.

## Sharing and limitations

The extension sends data to third-party services only as described above to provide the relevant feature; the packaged extension has no ScoutLens-operated analytics or advertising collection endpoint. It does not provide a feature to sell user data, use it for unrelated advertising, or determine creditworthiness. This policy does not control third-party services or what users independently do with copied reports. Inspect the [source code](https://github.com/llff9527-blip/scoutlens-seo) for details.

## Changes and contact

We may update this policy when the extension's data practices change. The effective date at the top will be updated. For questions or deletion requests concerning data handled by the extension developer, open an issue at [ScoutLens SEO GitHub Issues](https://github.com/llff9527-blip/scoutlens-seo/issues). Do not include credentials, sensitive URLs, or private webpage contents in a public issue. For data held by a third-party provider, contact that provider directly.
