# Minecraft Formatting Codes Test

## Open the app

Extract the entire folder and open `index.html` in a browser. Keep `css`, `js`,
and `assets` beside it. No build step, package installation, or local server is
required to use the app.

The interface remains in English. The PNG export button is not included.

## Files

```text
minecraft-formatting-test/
├── index.html          Page structure and settings controls
├── css/
│   └── style.css       Theme, layout, controls, and responsive rules
├── js/
│   ├── app.js          Parser, fonts, rendering, camera, and UI behavior
│   └── theme.js        Early theme loading, toggle button, and saved preference
├── assets/
│   ├── chat-1.png      Original background image 1
│   └── chat-2.png      Original background image 2
└── README.md
```

## Editing

Change layout and colors in `css/style.css`. Change labels or add controls in
`index.html`. `js/app.js` is divided into numbered sections for the parser,
font loading, glyph layout, chat camera, rendering, editor, and persistence.

`CHAT_SCENE` contains the screenshot dimensions and chat anchor coordinates.
Background paths are relative to `index.html`. Both images retain their original
bytes and dimensions. Replace them with images of the same dimensions to keep
the existing chat alignment.

## Behavior

The app retains the original legacy-format parser, two chat backgrounds, and
1×–5× camera zoom. At 1× the complete background is visible; higher zooms focus
on the chat. Drag or use arrow keys to pan, and double-click or press Home to
refocus. Formatting and wrapping are not changed by camera zoom.

Copy formats, font settings, project import/export, and browser autosave are
unchanged. Existing version-1 `.mcformat.json` projects can be loaded with
**Settings → Saving & samples → Load project**. Project files and browser
autosave contain settings only; editor text is never stored.

## Light and dark mode

Use the sun/moon button at the top right, beside Settings. The sun switches to
light mode; the moon switches back to dark mode. Dark mode remains the default.
The selected mode is saved in this browser when local storage is available;
otherwise switching still works for the current tab. Theme preference is stored
separately from Color Lab settings storage and is not included in exported projects.

The editor, controls, settings dialog, and status messages follow the selected
mode. Bright syntax tokens get darker inks in the light editor, but the canvas
preview keeps its original Minecraft colors, backgrounds, wrapping, and zoom.

`js/theme.js` loads before the stylesheet to restore the saved theme before the
page is painted. Both JavaScript files and the HTML use four spaces per indent.

## Fonts and network access

Font files are not bundled. The existing font loader downloads the configured
Minecraft assets and caches them in the browser when possible. First-time
font loading requires internet access. When fonts are unavailable, the UI
shows a fallback-font indicator; text shape and metrics may then differ.

The HTML, CSS, JavaScript, and both background images are local files. Your
input text is not uploaded by the app. Local font import remains available.

## Developer checks

Open the browser console and run:

```js
const results = MCColorLab.runSelfTests();
console.table(results);
console.log(`${results.filter((test) => test.ok).length}/${results.length} passed`);
```

The debug API remains available as `window.MCColorLab`. Theme switching changes
the interface only; the existing Minecraft rendering-compatibility scope stays
the same.

Validation for the theme update: all 81 built-in tests and 39 UI/package checks
passed in an in-memory Chromium harness. The checks covered light/dark switching,
keyboard activation, saved-preference restoration and storage events (using test
storage), operation with storage unavailable, unchanged canvas pixels and project
state, both original image files, mobile layouts, and four-space HTML/JS indentation.
Direct file/server navigation is blocked by the test environment's browser policy;
external font downloads were disabled during these UI tests.


## Viewport fit

The page uses the browser viewport height and keeps the editor and preview inside it, so the document itself does not need a vertical scrollbar. Preview areas handle any overflow internally.


## GitHub Pages deployment

Repository path:

```text
E:\Projects\ramistarveris.github.io\minecraft-formatting-test
```

Published URL:

```text
https://ramistarveris.github.io/minecraft-formatting-test/
```
