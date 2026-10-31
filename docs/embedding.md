# Embedding a presenter on your website

Every presenter has a share link (`/d/<slug>`) and a one-line widget for your own site. The
widget adds a launcher button in the corner of the page; the live session opens in a panel on
the same page, so visitors never leave your site.

## The snippet

Copy it from the presenter's overview page in the dashboard. It looks like this:

```html
<script src="https://YOUR-HOST/embed.js" data-presenter="your-presenter-slug" async></script>
```

`YOUR-HOST` is the dashboard's public origin (`PUBLIC_BASE_URL` if set, otherwise the host you
opened the dashboard on). The script is `apps/web/public/embed.js`: plain JavaScript, no
dependencies, rendered inside a Shadow DOM so your site's CSS doesn't leak in.

## Options

Set them as `data-*` attributes on the script tag:

| Attribute        | Default             | Meaning                                                   |
| ---------------- | ------------------- | --------------------------------------------------------- |
| `data-presenter` | required            | The presenter's slug.                                     |
| `data-label`     | `Watch a live demo` | Launcher text.                                            |
| `data-color`     | `#636bff`           | Accent colour of the launcher.                            |
| `data-position`  | `right`             | `right` or `left` corner.                                 |
| `data-name`      | empty               | Visitor name to prefill, e.g. your signed-in user's name. |
| `data-open`      | not set             | `true` opens the panel on page load.                      |

## JavaScript API

```js
window.OnboardAI.open({ name: 'Dana' }); // open the panel, optionally prefilling the name
window.OnboardAI.close(); // minimize (the call keeps running)
window.OnboardAI.toggle();
```

The script loads once per page; a second copy is ignored.

## How it behaves

- Clicking the launcher opens a compact join panel. The panel loads `/embed/<slug>` in an
  iframe; that page is the same join form as `/d/<slug>`, without the site chrome.
- When the call goes live, the panel grows into a large, centred stage so the shared screen is
  readable. On screens narrower than 640px it fills the viewport.
- Minimizing (the button, the backdrop or Escape) never ends the call: the iframe and the audio
  stay alive and the launcher reads "Return to live demo".
- The iframe reports its state (`form`, `joining`, `live`, `ended`) to the widget with
  `postMessage`. The widget only accepts messages from its own iframe and origin.

## Requirements

- **HTTPS.** Browsers only grant microphone access on secure origins (or `localhost`). Serve
  both your site and the dashboard over HTTPS.
- **Microphone permission.** The iframe's `allow` attribute is
  `microphone; camera; autoplay; display-capture; fullscreen; clipboard-write`. If your site
  sends a `Permissions-Policy` header that blocks the microphone for embedded frames, allow it
  for the dashboard's origin.
- **A joinable presenter.** If the presenter is paused or has no goal, `/embed/<slug>` returns
  404 and the panel shows the not-found page.

Each widget join goes through the same rate limits as the share link
([configuration](configuration.md#abuse-limits)).

## Preview

The dashboard's widget preview (`/dashboard/preview/<id>`, linked from the presenter page) is a
stand-in website with the snippet installed exactly as above. Use it to try the launcher before
adding it to your site.
