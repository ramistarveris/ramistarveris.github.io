'use strict';
// No font binaries are bundled. Fonts are resolved on the user's device.
(() => {
    // ==========================================================================
    // 1. DOM helper, color codes, sample text, and scene assets
    // ==========================================================================
    const $ = id => document.getElementById(id);
    const COLOR_LIST = [
        ['0', 'Black', '#000000'],
        ['1', 'Dark Blue', '#0000aa'],
        ['2', 'Dark Green', '#00aa00'],
        ['3', 'Dark Aqua', '#00aaaa'],
        ['4', 'Dark Red', '#aa0000'],
        ['5', 'Dark Purple', '#aa00aa'],
        ['6', 'Gold', '#ffaa00'],
        ['7', 'Gray', '#aaaaaa'],
        ['8', 'Dark Gray', '#555555'],
        ['9', 'Blue', '#5555ff'],
        ['a', 'Green', '#55ff55'],
        ['b', 'Aqua', '#55ffff'],
        ['c', 'Red', '#ff5555'],
        ['d', 'Light Purple', '#ff55ff'],
        ['e', 'Yellow', '#ffff55'],
        ['f', 'White', '#ffffff']
    ];
    const COLORS = Object.fromEntries(COLOR_LIST.map(([c, n, h]) => [c, h]));
    // Editor-only inks keep bright codes readable on white. The renderer uses COLORS.
    const LIGHT_CODE_INKS = {
        '0': '#17202a',
        '1': '#0000aa',
        '2': '#007000',
        '3': '#006b6b',
        '4': '#aa0000',
        '5': '#aa00aa',
        '6': '#8d4f00',
        '7': '#60656f',
        '8': '#555555',
        '9': '#3d49c6',
        a: '#1f7423',
        b: '#007175',
        c: '#b72e33',
        d: '#ad267d',
        e: '#796000',
        f: '#60656f'
    };
    const FLAGS = ['bold', 'italic', 'underlined', 'strikethrough', 'obfuscated'];
    const FORMATS = {
        k: 'obfuscated',
        l: 'bold',
        m: 'strikethrough',
        n: 'underlined',
        o: 'italic'
    };
    const FLAG_NAMES = {
        bold: "Bold",
        italic: "Italic",
        underlined: "Underline",
        strikethrough: "Strikethrough",
        obfuscated: "Obfuscated"
    };
    const FLAG_CODES = {
        bold: 'l',
        italic: 'o',
        underlined: 'n',
        strikethrough: 'm',
        obfuscated: 'k'
    };
    const VALID = /^[0-9a-fk-or]$/i;
    const MAX_TEXT = 40000;
    const SAMPLES = {
        chumu: '&9[&bChumu&9] &b&lUpdate Available!&r\n               &31.1.5 &b➡ 1.1.7\n             &b&n[Github Release]&r',
        order: '&l&aABC &r  <- &l then color: normal\n&a&lABC &r  <- color then &l: bold\n\n&b&nUnderlined &bNormal again\n&c&lBold &lStill bold &rDefault',
        all: COLOR_LIST.map(([c, n], i) => '&' + c + c + ' ' + n + (i % 4 === 3 ? '\n' : '   ')).join('').trimEnd() + '&r',
        formats: '&fNormal &lBold&r &oItalic&r\n&nUnderline&r &mStrike&r\n&b&l&nBold + Underline&r\n&d&l&o&m&nAll decorations&r\n&6&kSecret 12345&r <- obfuscated\n&cRed &rBack to default',
        newline: '&a&lFirst line: green + bold\nSecond line: inherited\n&rThird line: reset\n\n&bLong text automatically wraps without losing the active color or formatting. &nUnderlining continues too.',
        invalid: '&a&uUnderline? &r  <- &u is not valid\n&b&nCorrect underline&r\n&c&lA§zB&r  <- unknown §z is consumed\n&a&lA&zB&r  <- unknown &z stays visible\n&gJava does not support this color&r\n&&aX&r  <- not an && escape\nTrailing ampersand: &\nTrailing section sign: §',
        jp: "&b&lJapanese glyph test&r\n&fNormal &aGreen &6&lBold&r &d&oItalic&r\n&b&nUnderlined link&r\n&c&mStrikethrough&r  &e★ &a✔ &c❤ &b➡\n&7Japanese: &f日本語 あいうえお カタカナ 漢字",
        rgb: '&#78e6c6RGB custom color&r\n&x&8&d&a&e&f&fBungee-style RGB&r\n&#ff9988&lRGB + bold&r\n\n&7Enable the RGB extension in Settings to preview these codes.'
    };
    // Background paths are relative to index.html, not to this script.
    const CHAT_SCENE = {
        width: 1920,
        height: 1009,
        guiScale: 2,
        x: 2,
        bottom: 422,
        marginY: 4,
        bg: './assets/chat-1.png'
    };
    const chatSceneImage = new Image();
    chatSceneImage.decoding = 'async';
    chatSceneImage.src = CHAT_SCENE.bg;
    chatSceneImage.addEventListener('load', () => {
        if (scene === 'chat')
            scheduleRender();
    });
    const CHAT_SCENE_BG2 = './assets/chat-2.png';
    const chatSceneImage2 = new Image();
    chatSceneImage2.decoding = 'async';
    chatSceneImage2.src = CHAT_SCENE_BG2;
    chatSceneImage2.addEventListener('load', () => {
        if (scene === 'chat' && chatImageVariant === '2')
            scheduleRender();
    });
    let chatImageVariant = '1';
    // ==========================================================================
    // 2. Legacy color-code parsing and text export
    // ==========================================================================
    const copyStyle = s => ({ ...s });

    function baseStyle(options = {}) {
        return {
            color: options.baseColor || '#ffffff',
            bold: !!options.baseBold,
            italic: !!options.baseItalic,
            underlined: !!options.baseUnderlined,
            strikethrough: !!options.baseStrikethrough,
            obfuscated: !!options.baseObfuscated
        };
    }

    function sameStyle(a, b) {
        return a.color === b.color && FLAGS.every(f => a[f] === b[f]);
    }

    function decodeUnits(text, decode) {
        const units = [];
        for (let i = 0; i < text.length;) {
            let start = i, c = text[i++];
            if (c === '\r') {
                if (text[i] === '\n')
                    i++;
                c = '\n';
            }
            else if (decode && c === '\\' && i < text.length) {
                const n = text[i], m = text.slice(start).match(/^\\u00[aA]7/);
                if (m) {
                    c = '§';
                    i = start + 6;
                }
                else if (n === 'n' || n === 'r' || n === 't' || n === '\\') {
                    c = {
                        n: '\n',
                        r: '\r',
                        t: '\t',
                        '\\': '\\'
                    }[n];
                    i++;
                }
            }
            units.push({ c, start, end: i });
        }
        // Decoded CRLF and CR are normalized just like a textarea's physical newlines.
        const clean = [];
        for (let i = 0; i < units.length; i++) {
            const u = units[i];
            if (u.c === '\r') {
                if (units[i + 1]?.c === '\n') {
                    clean.push({ ...u, c: '\n', end: units[++i].end });
                }
                else
                    clean.push({ ...u, c: '\n' });
            }
            else
                clean.push(u);
        }
        return clean;
    }
    /** One-pass legacy interpretation; offsets always refer to the original UTF-16 source. */

    function parse(text, options = {}) {
        text = String(text);
        const o = {
            ampMode: 'valid',
            escapes: false,
            lineReset: false,
            rgb: false,
            ...options
        };
        const units = decodeUnits(text, o.escapes), u = units.map(x => x.c).join('');
        const glyphs = [], events = [], runs = [], initial = baseStyle(o);
        let state = copyStyle(initial), normalized = '';
        const emit = (ch, start, end) => {
            const s = copyStyle(state);
            glyphs.push({
                ch,
                start,
                end,
                style: s
            });
            const last = runs[runs.length - 1];
            if (last && sameStyle(last.style, s))
                last.text += ch;
            else
                runs.push({ text: ch, style: s });
        };
        const event = (i, n, kind, code, before, note, extra = {}) => {
            const start = units[i].start, end = units[i + n - 1].end;
            const e = {
                start,
                end,
                raw: text.slice(start, end),
                kind,
                code,
                before,
                after: copyStyle(state),
                note,
                ...extra
            };
            events.push(e);
            return e;
        };
        for (let i = 0; i < units.length;) {
            const t = units[i], prefix = t.c, next = units[i + 1]?.c, lower = next?.toLowerCase();
            const ampEnabled = prefix === '&' && o.ampMode !== 'section';
            if ((prefix === '§' || ampEnabled) && o.rgb) {
                const rest = u.slice(i), literal = prefix === '&' ? '&' : '§';
                const short = rest.match(new RegExp('^' + literal + '#([0-9a-fA-F]{6})'));
                const long = rest.match(new RegExp('^' + literal + '[xX](?:' + literal + '[0-9a-fA-F]){6}'));
                const m = short || long;
                if (m) {
                    const hex = (short ? short[1] : long[0].slice(2).split(literal).join('')).toLowerCase();
                    const before = copyStyle(state);
                    state = { ...baseStyle(), color: '#' + hex };
                    const n = m[0].length;
                    normalized += '§x' + [...hex].map(c => '§' + c).join('');
                    event(i, n, 'rgb', '#' + hex, before, "Set RGB color and clear formatting [plugin preprocessing]", { dropped: FLAGS.filter(f => before[f]) });
                    i += n;
                    continue;
                }
            }
            const isCode = prefix === '§' || (ampEnabled && (o.ampMode === 'all' || (next && VALID.test(next))));
            if (isCode) {
                const before = copyStyle(state);
                normalized += '§' + (next === undefined ? '' : prefix === '&' && VALID.test(next) ? lower : next);
                if (next === undefined) {
                    event(i, 1, 'invalid', '', before, "A trailing § is not rendered.");
                    i++;
                    continue;
                }
                if (COLORS[lower]) {
                    state = { ...baseStyle(), color: COLORS[lower] };
                    const dropped = FLAGS.filter(f => before[f]);
                    event(i, 2, 'color', lower, before, dropped.length ? "Set color. " + dropped.map(f => FLAG_NAMES[f]).join(", ") + " cleared" : "Set color (all formatting off)", { dropped });
                }
                else if (FORMATS[lower]) {
                    const f = FORMATS[lower], was = state[f];
                    state = { ...state, [f]: true };
                    event(i, 2, 'format', lower, before, FLAG_NAMES[f] + (was ? " is already on (not a toggle)" : " on"));
                }
                else if (lower === 'r') {
                    state = copyStyle(initial);
                    event(i, 2, 'reset', 'r', before, "Restore the base color and formatting");
                }
                else
                    event(i, 2, 'invalid', lower, before, "Consume the unknown § code and keep the current formatting.");
                i += 2;
                continue;
            }
            if (prefix === '&' && o.ampMode === 'valid' && next && /^[a-zA-Z#]$/.test(next))
                event(i, 2, 'literal', lower, copyStyle(state), lower === 'u' ? "Java uses &n for underline. &u stays visible." : "Not a valid code; display as literal text.");
            let ch = prefix, n = 1;
            const cu = prefix.charCodeAt(0);
            if (cu >= 0xd800 && cu <= 0xdbff && i + 1 < units.length) {
                const cl = units[i + 1].c.charCodeAt(0);
                if (cl >= 0xdc00 && cl <= 0xdfff) {
                    ch += units[i + 1].c;
                    n = 2;
                }
                else
                    ch = '\ufffd';
            }
            else if (cu >= 0xd800 && cu <= 0xdfff)
                ch = '\ufffd';
            normalized += prefix + (n === 2 ? units[i + 1].c : '');
            emit(ch, t.start, units[i + n - 1].end);
            if (ch === '\n' && o.lineReset) {
                const before = copyStyle(state);
                state = copyStyle(initial);
                event(i, 1, 'line', 'newline', before, "Separate messages: restore the base style at each new line");
            }
            i += n;
        }
        return {
            glyphs,
            events,
            runs,
            plain: glyphs.map(g => g.ch).join(''),
            normalized,
            initial,
            final: copyStyle(state)
        };
    }

    function propertiesValue(text) {
        return text.replace(/\\/g, '\\\\').replace(/§/g, '\\u00A7').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/^ /, '\\ ');
    }

    function jsonComponents(parsed) {
        return {
            text: '',
            extra: parsed.runs.map(r => ({ text: r.text, color: r.style.color, ...Object.fromEntries(FLAGS.map(f => [f, r.style[f]])) }))
        };
    }

    function caretStyle(parsed, pos) {
        let s = copyStyle(parsed.initial);
        for (const e of parsed.events)
            if (e.end <= pos && e.kind !== 'literal')
                s = copyStyle(e.after);
        return s;
    }
    // ==========================================================================
    // 3. Font assets, cache, providers, and glyph metrics
    // ==========================================================================
    const ASSET_VERSION = '26.1.2';
    const ASSET_ROOTS = [
        `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/${ASSET_VERSION}/assets/`,
        `https://cdn.jsdelivr.net/gh/InventivetalentDev/minecraft-assets@${ASSET_VERSION}/assets/`
    ];
    const ASCII_CHARS = Array.from({ length: 16 }, (_, r) => Array.from({ length: 16 }, (_, c) => {
        const n = r * 16 + c;
        return n >= 32 && n <= 126 ? String.fromCharCode(n) : '\0';
    }).join(''));
    ASCII_CHARS[9] = '\0'.repeat(12) + '£\0\0ƒ';
    ASCII_CHARS[10] = '\0'.repeat(6) + 'ªº\0\0¬\0\0\0«»';
    ASCII_CHARS[11] = '░▒▓│┤╡╢╖╕╣║╗╝╜╛┐';
    ASCII_CHARS[12] = '└┴┬├─┼╞╟╚╔╩╦╠═╬╧';
    ASCII_CHARS[13] = '╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀';
    ASCII_CHARS[14] = '\0'.repeat(13) + '∅∈\0';
    ASCII_CHARS[15] = '≡±≥≤⌠⌡÷≈°∙\0√ⁿ²■\0';
    const ASCII_DEF = {
        type: 'bitmap',
        file: 'minecraft:font/ascii.png',
        height: 8,
        ascent: 7,
        chars: ASCII_CHARS
    };
    const SPACE_MAP = new Map([
        [32, {
                kind: 'space',
                advance: 4,
                boldOffset: 1,
                shadowOffset: 1
            }],
        [0x200c, {
                kind: 'space',
                advance: 0,
                boldOffset: 1,
                shadowOffset: 1
            }]
    ]);
    const DEFAULT_OVERRIDES = [
        [0x3001, 0x30ff, 0, 15],
        [0x3200, 0x9fff, 0, 15],
        [0x1100, 0x11ff, 0, 15],
        [0x3130, 0x318f, 0, 15],
        [0xa960, 0xa97f, 0, 15],
        [0xd7b0, 0xd7ff, 0, 15],
        [0xac00, 0xd7af, 1, 15],
        [0xf900, 0xfaff, 0, 15],
        [0xff01, 0xff5e, 0, 15]
    ].map(([a, b, left, right]) => ({
        from: String.fromCodePoint(a),
        to: String.fromCodePoint(b),
        left,
        right
    }));
    let standardProviders = [{ map: SPACE_MAP }], localProviders = [], activeGlyphs = new Map(SPACE_MAP), glyphPools = new Map();
    let fullUnicode = false, fontLoading = false, fontErrors = [], fontSession = 0, localFontName = '', cacheHits = 0, fontRevision = 0;
    let tintedCache = new Map(), hexCanvasCache = new Map(), fallbackCache = new Map(), nextAtlas = 1;
    const inMemoryAssets = new Map();
    let dbPromise = null;

    function openDB() {
        if (dbPromise)
            return dbPromise;
        dbPromise = new Promise(resolve => {
            try {
                const r = indexedDB.open('mc-color-lab-assets-v1', 1);
                const timeout = setTimeout(() => resolve(null), 1500);
                r.onupgradeneeded = () => r.result.createObjectStore('assets');
                r.onsuccess = () => {
                    clearTimeout(timeout);
                    resolve(r.result);
                };
                r.onerror = r.onblocked = () => {
                    clearTimeout(timeout);
                    resolve(null);
                };
            }
            catch {
                resolve(null);
            }
        });
        return dbPromise;
    }

    async function assetCacheGet(key) {
        const db = await openDB();
        if (!db)
            return null;
        return new Promise(resolve => {
            try {
                const r = db.transaction('assets', 'readonly').objectStore('assets').get(key);
                r.onsuccess = () => resolve(r.result || null);
                r.onerror = () => resolve(null);
            }
            catch {
                resolve(null);
            }
        });
    }

    async function assetCachePut(key, value) {
        const db = await openDB();
        if (!db)
            return;
        try {
            const tx = db.transaction('assets', 'readwrite');
            tx.objectStore('assets').put(value, key);
            tx.onerror = () => {
            };
        }
        catch {
            /* Storage may be denied for file: URLs. */
        }
    }

    async function fetchAsset(path) {
        if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.split('/').includes('..'))
            throw Error("Invalid resource path");
        const key = ASSET_VERSION + '/' + path;
        if (inMemoryAssets.has(key))
            return inMemoryAssets.get(key);
        const cached = await assetCacheGet(key);
        if (cached instanceof ArrayBuffer) {
            cacheHits++;
            inMemoryAssets.set(key, cached);
            return cached;
        }
        if (!$('onlineFonts').checked)
            throw Error("Font downloads are disabled and no cached copy is available.");
        let error;
        for (const root of ASSET_ROOTS) {
            const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
            try {
                const r = await fetch(root + path, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
                if (!r.ok)
                    throw Error('HTTP ' + r.status);
                const data = await r.arrayBuffer();
                if (data.byteLength > 80 * 1024 * 1024)
                    throw Error("Asset exceeds the size limit");
                if (new TextDecoder().decode(data.slice(0, 50)).startsWith('version https://git-lfs'))
                    throw Error("Received an LFS pointer instead of font data");
                inMemoryAssets.set(key, data);
                void assetCachePut(key, data);
                return data;
            }
            catch (e) {
                error = e;
            }
            finally {
                clearTimeout(timer);
            }
        }
        throw Error(path.split('/').pop() + ': ' + (error?.message || "Download failed"));
    }

    function resourcePath(location, type = '') {
        const s = location.includes(':') ? location.split(':') : ['minecraft', location];
        if (s.length !== 2 || !s.every(p => /^[a-z0-9_./-]+$/.test(p)) || s.some(p => p.split('/').includes('..')))
            throw Error("Invalid resource location");
        return s[0] + '/' + type + s[1];
    }

    async function imageFromBytes(bytes) {
        const blob = new Blob([bytes], { type: 'image/png' });
        if (typeof createImageBitmap === 'function')
            return await createImageBitmap(blob);
        return await new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob), img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(Error("Failed to load PNG"));
            };
            img.src = url;
        });
    }

    async function loadBitmap(def, get = fetchAsset) {
        if (!Array.isArray(def.chars) || !def.chars.length)
            throw Error("Missing bitmap.chars");
        const grid = def.chars.map(row => Array.from(row)), cols = grid[0].length;
        if (!cols || grid.some(row => row.length !== cols))
            throw Error("Inconsistent column counts in bitmap.chars");
        const img = await imageFromBytes(await get(resourcePath(def.file, 'textures/')));
        if (img.width % cols || img.height % grid.length || img.width * img.height > 16777216)
            throw Error("Invalid bitmap dimensions");
        const atlas = document.createElement('canvas');
        atlas.width = img.width;
        atlas.height = img.height;
        const c = atlas.getContext('2d', { willReadFrequently: true });
        c.drawImage(img, 0, 0);
        img.close?.();
        const pixels = c.getImageData(0, 0, atlas.width, atlas.height).data, sw = atlas.width / cols, sh = atlas.height / grid.length, scale = (def.height ?? 8) / sh, top = 7 - def.ascent, map = new Map(), atlasId = nextAtlas++;
        if (!Number.isFinite(scale) || scale <= 0 || scale > 32 || !Number.isFinite(top))
            throw Error("Invalid bitmap height or ascent");
        grid.forEach((row, ry) => row.forEach((ch, rx) => {
            const cp = ch.codePointAt(0);
            if (!cp)
                return;
            let last = -1;
            outer: for (let x = sw - 1; x >= 0; x--)
                for (let y = 0; y < sh; y++)
                    if (pixels[((ry * sh + y) * atlas.width + rx * sw + x) * 4 + 3] !== 0) {
                        last = x;
                        break outer;
                    }
            map.set(cp, {
                kind: 'bitmap',
                atlas,
                atlasId,
                sx: rx * sw,
                sy: ry * sh,
                sw,
                sh,
                scale,
                top,
                advance: Math.floor((last + 1) * scale + .5) + 1,
                boldOffset: 1,
                shadowOffset: 1
            });
        }));
        return { map, filter: def.filter || {}, label: def.file };
    }
    /** Reads bounded ZIP central directory entries; supports stored/deflate, not ZIP64. */
    class ZipArchive {
        constructor(bytes) {
            this.bytes = bytes;
            this.view = new DataView(bytes);
            this.entries = new Map();
            this.extracted = 0;
            const v = this.view;
            let e = -1;
            for (let i = bytes.byteLength - 22; i >= Math.max(0, bytes.byteLength - 65557); i--)
                if (v.getUint32(i, true) === 0x06054b50 && i + 22 + v.getUint16(i + 20, true) === bytes.byteLength) {
                    e = i;
                    break;
                }
            if (e < 0)
                throw Error("ZIP end-of-central-directory record not found");
            if (v.getUint16(e + 4, true) || v.getUint16(e + 6, true))
                throw Error("Split ZIP archives are not supported");
            const count = v.getUint16(e + 10, true);
            let p = v.getUint32(e + 16, true);
            if (count === 65535 || p === 0xffffffff)
                throw Error("ZIP64 is not supported");
            const dec = new TextDecoder();
            for (let i = 0; i < count; i++) {
                if (p + 46 > bytes.byteLength || v.getUint32(p, true) !== 0x02014b50)
                    throw Error("Corrupt ZIP central directory");
                const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), compressed = v.getUint32(p + 20, true), size = v.getUint32(p + 24, true), n = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true), offset = v.getUint32(p + 42, true);
                if (p + 46 + n + extra + comment > bytes.byteLength)
                    throw Error("ZIP data is out of bounds");
                const name = dec.decode(new Uint8Array(bytes, p + 46, n)).replace(/\\/g, '/');
                if (!name.split('/').includes('..') && !name.startsWith('/'))
                    this.entries.set(name, {
                        name,
                        flags,
                        method,
                        compressed,
                        size,
                        offset
                    });
                p += 46 + n + extra + comment;
            }
        }
        async read(name) {
            const e = this.entries.get(name);
            if (!e)
                throw Error("Not found in ZIP: " + name);
            if (e.flags & 1)
                throw Error("Encrypted ZIP archives are not supported");
            if (e.size > 80 * 1024 * 1024 || this.extracted + e.size > 200 * 1024 * 1024)
                throw Error("ZIP extraction size limit exceeded");
            const v = this.view;
            if (e.offset + 30 > this.bytes.byteLength || v.getUint32(e.offset, true) !== 0x04034b50)
                throw Error("Invalid ZIP entry");
            const start = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
            if (start + e.compressed > this.bytes.byteLength)
                throw Error("ZIP entry is out of bounds");
            const data = this.bytes.slice(start, start + e.compressed);
            this.extracted += e.size;
            let out;
            if (e.method === 0)
                out = data;
            else if (e.method === 8) {
                if (typeof DecompressionStream === 'undefined')
                    throw Error("This browser cannot extract ZIP files. Use a newer version of Chrome, Edge, or Firefox.");
                const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
                const reader = stream.getReader(), chunks = [];
                let size = 0;
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    size += value.byteLength;
                    if (size > e.size || size > 80 * 1024 * 1024) {
                        await reader.cancel();
                        throw Error("Extracted ZIP data exceeds the declared size");
                    }
                    chunks.push(value);
                }
                const arr = new Uint8Array(size);
                let at = 0;
                for (const chunk of chunks) {
                    arr.set(chunk, at);
                    at += chunk.length;
                }
                out = arr.buffer;
            }
            else
                throw Error("Unsupported ZIP compression method");
            if (out.byteLength !== e.size)
                throw Error("Extracted ZIP size does not match the declared size");
            return out;
        }
    }

    function parseHex(text, overrides = []) {
        const map = new Map(), ranges = overrides.map(r => ({ ...r, a: r.from.codePointAt(0), b: r.to.codePointAt(0) }));
        let count = 0;
        for (const line of text.split(/\r?\n/)) {
            if (!line || line.startsWith('#'))
                continue;
            const m = line.match(/^([0-9a-fA-F]{4,6}):([0-9a-fA-F]+)\s*$/);
            if (!m)
                continue;
            const cp = parseInt(m[1], 16), hex = m[2], bitWidth = hex.length / 4;
            if (cp > 0x10ffff || ![8, 16, 24, 32].includes(bitWidth))
                continue;
            let mask = 0;
            const digits = bitWidth / 4;
            for (let r = 0; r < 16; r++)
                mask |= (parseInt(hex.slice(r * digits, (r + 1) * digits), 16) << (32 - bitWidth));
            let left = mask ? Math.clz32(mask) : 0, right = mask ? 31 - Math.clz32((mask & -mask) >>> 0) : bitWidth;
            // right is the last set pixel measured from the left edge of a 32-bit row.
            if (mask) {
                let trailing = 0;
                let n = mask >>> 0;
                while ((n & 1) === 0) {
                    trailing++;
                    n >>>= 1;
                }
                right = 31 - trailing;
            }
            const range = ranges.find(r => cp >= r.a && cp <= r.b);
            if (range) {
                left = range.left;
                right = range.right;
            }
            const width = right - left + 1;
            if (width < 0 || width > 64)
                continue;
            map.set(cp, {
                kind: 'hex',
                hex,
                bitWidth,
                left,
                right,
                sw: width,
                sh: 16,
                scale: .5,
                top: 0,
                advance: Math.floor(width / 2) + 1,
                boldOffset: .5,
                shadowOffset: .5
            });
            if (++count > 250000)
                throw Error("Unihex glyph count limit exceeded");
        }
        if (!map.size)
            throw Error("No valid unihex glyphs found");
        return map;
    }

    async function loadUnihex(def, get = fetchAsset) {
        const zip = new ZipArchive(await get(resourcePath(def.hex_file))), map = new Map();
        for (const name of zip.entries.keys())
            if (name.endsWith('.hex')) {
                const chunk = parseHex(new TextDecoder().decode(await zip.read(name)), def.size_overrides || []);
                for (const [cp, g] of chunk)
                    map.set(cp, g);
            }
        if (!map.size)
            throw Error("No .hex files found in ZIP");
        return {
            map,
            filter: def.filter || {},
            label: def.hex_file,
            unicode: true
        };
    }

    function providerEnabled(p) {
        const f = p.filter || {};
        return (!('uniform' in f) || f.uniform === $('uniform').checked) && (!('jp' in f) || f.jp === $('jpGlyphs').checked);
    }

    function rebuildFonts() {
        fullUnicode = standardProviders.some(p => p?.unicode && !p.filter?.jp && providerEnabled(p));
        activeGlyphs = new Map();
        const all = [...localProviders, ...standardProviders];
        for (const p of all)
            if (p && providerEnabled(p))
                for (const [cp, g] of p.map)
                    if (!activeGlyphs.has(cp))
                        activeGlyphs.set(cp, g);
        for (const [cp, g] of SPACE_MAP)
            if (!activeGlyphs.has(cp))
                activeGlyphs.set(cp, g);
        glyphPools = new Map();
        for (const [cp, g] of activeGlyphs) {
            const key = Math.ceil(g.advance);
            if (!glyphPools.has(key))
                glyphPools.set(key, []);
            glyphPools.get(key).push(cp);
        }
        tintedCache.clear();
        hexCanvasCache.clear();
        fallbackCache.clear();
        fontRevision++;
        scheduleRender();
        updateFontStatus();
    }

    async function loadStandardFonts() {
        const session = ++fontSession;
        fontLoading = true;
        fontErrors = [];
        cacheHits = 0;
        updateFontStatus();
        const existingSpace = standardProviders[0] || { map: SPACE_MAP };
        const next = [existingSpace];
        let defaultDef, uniDef;
        try {
            defaultDef = JSON.parse(new TextDecoder().decode(await fetchAsset('minecraft/font/include/default.json')));
        }
        catch (e) {
            fontErrors.push(e.message);
            defaultDef = { providers: [ASCII_DEF] };
        }
        if (session !== fontSession)
            return;
        const bitmapDefs = (defaultDef.providers || []).filter(p => p.type === 'bitmap');
        const jobs = bitmapDefs.map(async (def, index) => {
            try {
                const p = await loadBitmap({ ...def, filter: { ...def.filter, uniform: false } });
                if (session !== fontSession)
                    return;
                next[index + 1] = p;
                standardProviders = next;
                rebuildFonts();
            }
            catch (e) {
                if (session === fontSession)
                    fontErrors.push(e.message);
            }
        });
        const uniJob = (async () => {
            try {
                uniDef = JSON.parse(new TextDecoder().decode(await fetchAsset('minecraft/font/include/unifont.json')));
                const defs = (uniDef.providers || []).filter(p => p.type === 'unihex');
                await Promise.all(defs.map(async (def, index) => {
                    try {
                        const p = await loadUnihex(def);
                        if (session !== fontSession)
                            return;
                        next[bitmapDefs.length + 1 + index] = p;
                        standardProviders = next;
                        rebuildFonts();
                    }
                    catch (e) {
                        if (session === fontSession)
                            fontErrors.push(e.message);
                    }
                }));
            }
            catch (e) {
                if (session === fontSession)
                    fontErrors.push(e.message);
            }
        })();
        await Promise.all([...jobs, uniJob]);
        if (session !== fontSession)
            return;
        fontLoading = false;
        standardProviders = next;
        rebuildFonts();
    }

    async function importLocalFont(file) {
        if (file.size > 256 * 1024 * 1024)
            throw Error("Files larger than 256 MB cannot be opened");
        const bytes = await file.arrayBuffer(), ext = file.name.split('.').pop().toLowerCase();
        let providers = [];
        const warnings = [];
        if (ext === 'png') {
            providers = [{ map: SPACE_MAP }, await loadBitmap(ASCII_DEF, async () => bytes)];
        }
        else if (ext === 'hex') {
            providers = [{ map: SPACE_MAP }, { map: parseHex(new TextDecoder().decode(bytes), DEFAULT_OVERRIDES), unicode: true }];
        }
        else if (ext === 'zip' || ext === 'jar') {
            const zip = new ZipArchive(bytes);
            const rootName = [...zip.entries.keys()].find(n => n.endsWith('assets/minecraft/font/default.json'));
            if (rootName) {
                const prefix = rootName.slice(0, -'assets/minecraft/font/default.json'.length);
                const get = async (path) => {
                    const full = prefix + 'assets/' + path;
                    return zip.entries.has(full) ? zip.read(full) : fetchAsset(path);
                };
                const walk = async (location, filter = {}, stack = []) => {
                    if (stack.includes(location) || stack.length > 20)
                        throw Error("Circular or excessively nested font reference");
                    const path = resourcePath(location, 'font/') + '.json', def = JSON.parse(new TextDecoder().decode(await get(path)));
                    if (!Array.isArray(def.providers) || def.providers.length > 100)
                        throw Error("Invalid font providers");
                    const out = [];
                    for (const p of def.providers) {
                        const f = { ...filter, ...p.filter };
                        try {
                            if (p.type === 'reference')
                                out.push(...await walk(p.id, f, [...stack, location]));
                            else if (p.type === 'bitmap')
                                out.push(await loadBitmap({ ...p, filter: f }, get));
                            else if (p.type === 'unihex')
                                out.push(await loadUnihex({ ...p, filter: f }, get));
                            else if (p.type === 'space') {
                                const map = new Map();
                                for (const [ch, advance] of Object.entries(p.advances || {}))
                                    if (Number.isFinite(advance) && Math.abs(advance) <= 256)
                                        map.set(ch.codePointAt(0), {
                                            kind: 'space',
                                            advance,
                                            boldOffset: 1,
                                            shadowOffset: 1
                                        });
                                out.push({ map, filter: f });
                            }
                            else
                                warnings.push("Unsupported provider: " + p.type);
                        }
                        catch (e) {
                            warnings.push(e.message);
                        }
                    }
                    return out;
                };
                providers = await walk('minecraft:default');
            }
            else {
                const hexNames = [...zip.entries.keys()].filter(n => n.endsWith('.hex'));
                if (hexNames.length) {
                    const map = new Map();
                    for (const name of hexNames)
                        for (const [cp, g] of parseHex(new TextDecoder().decode(await zip.read(name)), DEFAULT_OVERRIDES))
                            map.set(cp, g);
                    providers = [{ map: SPACE_MAP }, { map, unicode: true }];
                }
                else {
                    const name = [...zip.entries.keys()].find(n => n.endsWith('textures/font/ascii.png') || n === 'ascii.png');
                    if (name)
                        providers = [{ map: SPACE_MAP }, await loadBitmap(ASCII_DEF, async () => zip.read(name))];
                    else
                        throw Error("No default.json, ascii.png, or .hex files found");
                }
            }
        }
        else
            throw Error("Supported formats: PNG / HEX / ZIP / JAR");
        if (!providers.length)
            throw Error("No supported font providers found");
        localProviders = providers;
        localFontName = file.name;
        rebuildFonts();
        $('fontDetail').textContent = file.name + (warnings.length ? " (partially supported)" : '');
        $('fontDetail').title = warnings.join(' / ');
        toast("Local font loaded" + (warnings.length ? " (with warnings)" : ''));
    }

    function glyphFor(cp) {
        const g = activeGlyphs.get(cp);
        if (g)
            return g;
        if (fullUnicode && !fontLoading)
            return {
                kind: 'missing',
                advance: 6,
                boldOffset: 1,
                shadowOffset: 1
            };
        if (fallbackCache.has(cp))
            return fallbackCache.get(cp);
        const f = {
            kind: 'fallback',
            ch: String.fromCodePoint(cp),
            advance: cp < 128 ? 6 : 9,
            boldOffset: 1,
            shadowOffset: 1
        };
        fallbackCache.set(cp, f);
        return f;
    }

    function glyphAdvance(g, style) {
        return g.advance + (style.bold ? g.boldOffset : 0);
    }

    function getTinted(g, color) {
        const key = g.atlasId + '|' + color;
        if (tintedCache.has(key))
            return tintedCache.get(key);
        const c = document.createElement('canvas');
        c.width = g.atlas.width;
        c.height = g.atlas.height;
        const x = c.getContext('2d');
        x.drawImage(g.atlas, 0, 0);
        x.globalCompositeOperation = 'multiply';
        x.fillStyle = color;
        x.fillRect(0, 0, c.width, c.height);
        x.globalCompositeOperation = 'destination-in';
        x.drawImage(g.atlas, 0, 0);
        if (tintedCache.size >= 80)
            tintedCache.delete(tintedCache.keys().next().value);
        tintedCache.set(key, c);
        return c;
    }

    function hexCanvas(g) {
        if (hexCanvasCache.has(g))
            return hexCanvasCache.get(g);
        const c = document.createElement('canvas');
        c.width = Math.max(1, g.sw);
        c.height = 16;
        const x = c.getContext('2d');
        x.fillStyle = '#fff';
        const digits = g.bitWidth / 4;
        for (let y = 0; y < 16; y++) {
            const row = parseInt(g.hex.slice(y * digits, (y + 1) * digits), 16) >>> 0;
            for (let px = g.left; px <= g.right; px++)
                if (px >= 0 && px < g.bitWidth && ((row >>> (g.bitWidth - 1 - px)) & 1))
                    x.fillRect(px - g.left, y, 1, 1);
        }
        g.atlas = c;
        g.atlasId = nextAtlas++;
        g.sx = g.sy = 0;
        if (hexCanvasCache.size > 1500)
            hexCanvasCache.clear();
        hexCanvasCache.set(g, c);
        return c;
    }

    function shadowColor(hex) {
        const n = parseInt(hex.slice(1), 16);
        return '#' + [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.floor(v * .25).toString(16).padStart(2, '0')).join('');
    }
    // ==========================================================================
    // 4. Glyph drawing and line layout
    // ==========================================================================

    function drawGlyph(ctx, g, x, y, color, italic, bold, boldOffset) {
        if (g.kind === 'space')
            return;
        const draw = (dx) => {
            ctx.save();
            ctx.translate(x + dx, y);
            if (italic)
                ctx.transform(1, 0, -.25, 1, 1, 0);
            if (g.kind === 'bitmap' || g.kind === 'hex') {
                if (g.kind === 'hex')
                    hexCanvas(g);
                ctx.drawImage(getTinted(g, color), g.sx, g.sy, g.sw, g.sh, 0, g.top, g.sw * g.scale, g.sh * g.scale);
            }
            else if (g.kind === 'missing') {
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, 5, 1);
                ctx.fillRect(0, 7, 5, 1);
                ctx.fillRect(0, 1, 1, 6);
                ctx.fillRect(4, 1, 1, 6);
            }
            else {
                ctx.fillStyle = color;
                ctx.font = '8px "Noto Sans JP", Meiryo, monospace';
                ctx.textBaseline = 'top';
                ctx.fillText(g.ch, 0, -.5, g.advance);
            }
            ctx.restore();
        };
        draw(0);
        if (bold)
            draw(boldOffset);
    }
    // Line wrapping preserves style per code point, and breaks at the last ASCII space.

    function layoutGlyphs(glyphs, width, wrap, resolve = glyphFor) {
        const lines = [];
        let line = [], advance = 0, lastSpace = -1;
        const finish = (items) => lines.push({ items, width: items.reduce((n, g) => n + g.advance, 0) });
        for (const raw of glyphs) {
            if (raw.ch === '\n') {
                finish(line);
                line = [];
                advance = 0;
                lastSpace = -1;
                continue;
            }
            const metric = resolve(raw.ch.codePointAt(0)), item = { ...raw, metric, advance: glyphAdvance(metric, raw.style) };
            if (wrap && line.length && advance + item.advance > width) {
                if (raw.ch === ' ') {
                    finish(line);
                    line = [];
                    advance = 0;
                    lastSpace = -1;
                    continue;
                }
                if (lastSpace >= 0) {
                    finish(line.slice(0, lastSpace));
                    line = line.slice(lastSpace + 1);
                    advance = line.reduce((n, g) => n + g.advance, 0);
                    lastSpace = -1;
                }
                if (line.length && advance + item.advance > width) {
                    finish(line);
                    line = [];
                    advance = 0;
                    lastSpace = -1;
                }
            }
            line.push(item);
            advance += item.advance;
            if (raw.ch === ' ')
                lastSpace = line.length - 1;
        }
        finish(line);
        return lines;
    }
    // ==========================================================================
    // 5. Render state and obfuscated glyph selection
    // ==========================================================================
    let scene = 'chat', currentOptions = {}, parsed = null, layout = [], frame = 0, lastAnimTime = 0, renderPending = false, animationRequest = 0;
    let renderTruncated = false, previewLayoutKey = '';

    function optionsFromUI() {
        const auto = $('autoColor').checked, base = auto ? (scene === 'book' ? '#000000' : '#ffffff') : $('baseColor').value;
        return {
            ampMode: $('ampMode').value,
            escapes: $('escapes').checked,
            lineReset: $('lineReset').checked,
            rgb: $('rgb').checked,
            baseColor: base,
            ...Object.fromEntries(FLAGS.map(f => ['base' + f[0].toUpperCase() + f.slice(1), $('base' + f[0].toUpperCase() + f.slice(1)).checked]))
        };
    }

    function hash(n) {
        n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
        n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
        return (n ^ (n >>> 16)) >>> 0;
    }

    function obfuscatedGlyph(item, index) {
        const cp = item.ch.codePointAt(0);
        if (!item.style.obfuscated || cp === 32)
            return item.metric;
        const pool = glyphPools.get(Math.ceil(item.metric.advance));
        if (pool?.length)
            return glyphFor(pool[hash(frame * 2654435761 + index * 374761393) % pool.length]);
        return item.metric;
    }
    // Scene-space camera. The full screenshot remains visible at 1x. Higher zooms
    // center on readable chat content, favoring the newest rows for a tall history.
    // ==========================================================================
    // 6. Chat camera: focus, zoom, dragging, and keyboard controls
    // ==========================================================================
    const chatCamera = {
        key: '',
        zoom: 1,
        view: null,
        transition: null,
        drag: null
    };
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    function calculateChatView(zoom, bounds) {
        const z = clamp(Number(zoom) || 1, 1, 5), width = CHAT_SCENE.width / z, height = CHAT_SCENE.height / z;
        const focusWidth = Math.min(Math.max(1, bounds.right - bounds.left), width * .9);
        const focusHeight = Math.min(Math.max(1, bounds.bottom - bounds.top), height * .75);
        const focusX = bounds.left + focusWidth / 2, focusY = bounds.bottom - focusHeight / 2;
        return {
            x: clamp(focusX - width / 2, 0, CHAT_SCENE.width - width),
            y: clamp(focusY - height / 2, 0, CHAT_SCENE.height - height),
            width,
            height
        };
    }

    function currentChatView(now = performance.now()) {
        const t = chatCamera.transition;
        if (!t)
            return chatCamera.view;
        const progress = clamp((now - t.started) / 200, 0, 1), ease = 1 - Math.pow(1 - progress, 3);
        if (progress === 1) {
            chatCamera.transition = null;
            return chatCamera.view;
        }
        return Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, t.from[k] + (chatCamera.view[k] - t.from[k]) * ease]));
    }

    function prepareChatView(zoom, bounds) {
        const key = [zoom, bounds.left, bounds.top, bounds.right, bounds.bottom].join(':');
        if (chatCamera.key !== key) {
            const previous = currentChatView(), zoomChanged = chatCamera.zoom !== zoom;
            chatCamera.view = calculateChatView(zoom, bounds);
            chatCamera.key = key;
            chatCamera.zoom = zoom;
            chatCamera.transition = previous && zoomChanged && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches
                ? { from: previous, started: performance.now() } : null;
            endChatDrag();
        }
        return currentChatView();
    }

    function resetChatCamera() {
        endChatDrag();
        chatCamera.key = '';
        chatCamera.view = null;
        chatCamera.transition = null;
    }

    function panChat(dx, dy) {
        if (!chatCamera.view)
            return;
        chatCamera.transition = null;
        const v = chatCamera.view;
        v.x = clamp(v.x + dx, 0, CHAT_SCENE.width - v.width);
        v.y = clamp(v.y + dy, 0, CHAT_SCENE.height - v.height);
        drawPreview();
    }

    function endChatDrag() {
        const drag = chatCamera.drag;
        chatCamera.drag = null;
        const canvas = $('preview');
        delete canvas.dataset.dragging;
        if (drag && canvas.hasPointerCapture?.(drag.id))
            canvas.releasePointerCapture(drag.id);
    }

    function bindChatCamera() {
        const canvas = $('preview');
        canvas.addEventListener('pointerdown', e => {
            if (scene !== 'chat' || Number($('scale').value) <= 1 || !e.isPrimary || e.button !== 0 || !chatCamera.view)
                return;
            // Finish a pending zoom before a drag so the chosen scale remains exact.
            chatCamera.transition = null;
            drawPreview();
            chatCamera.drag = {
                id: e.pointerId,
                x: e.clientX,
                y: e.clientY,
                view: { ...chatCamera.view },
                rect: canvas.getBoundingClientRect()
            };
            canvas.dataset.dragging = 'true';
            canvas.setPointerCapture(e.pointerId);
            canvas.focus({ preventScroll: true });
        });
        canvas.addEventListener('pointermove', e => {
            const drag = chatCamera.drag;
            if (!drag || drag.id !== e.pointerId || !drag.rect.width || !drag.rect.height)
                return;
            const v = chatCamera.view;
            v.x = clamp(drag.view.x - (e.clientX - drag.x) * drag.view.width / drag.rect.width, 0, CHAT_SCENE.width - v.width);
            v.y = clamp(drag.view.y - (e.clientY - drag.y) * drag.view.height / drag.rect.height, 0, CHAT_SCENE.height - v.height);
            drawPreview();
        });
        for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
            canvas.addEventListener(name, endChatDrag);
        const refocus = () => {
            resetChatCamera();
            drawPreview();
            startAnimation();
        };
        canvas.addEventListener('dblclick', () => {
            if (scene === 'chat')
                refocus();
        });
        canvas.addEventListener('keydown', e => {
            if (scene !== 'chat' || Number($('scale').value) <= 1 || e.altKey || e.ctrlKey || e.metaKey)
                return;
            if (e.key === 'Home') {
                e.preventDefault();
                refocus();
                return;
            }
            const direction = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1]
            }[e.key];
            if (!direction || !chatCamera.view)
                return;
            e.preventDefault();
            const v = chatCamera.view, step = e.shiftKey ? .25 : .08;
            panChat(direction[0] * v.width * step, direction[1] * v.height * step);
        });
    }
    // ==========================================================================
    // 7. Preview rendering and animation scheduling
    // ==========================================================================

    function drawPreview() {
        const target = $('preview');
        if (!parsed)
            return;
        const scale = Math.max(1, Math.min(5, Number($('scale').value) || 2)), lineHeight = Math.max(9, Math.min(30, Number($('lineHeight').value) || 9));
        const limit = Math.max(40, Math.min(1600, Number($('wrapWidth').value) || 300));
        const wrap = $('wrap').checked, shadow = $('shadow').checked;
        const maxWidth = Math.max(0, ...layout.map(l => l.width));
        const width = wrap ? limit : Math.min(1600, Math.max(40, maxWidth));
        const padding = 7;
        if (scene === 'chat') {
            const sceneGuiW = CHAT_SCENE.width / CHAT_SCENE.guiScale;
            const maxLines = Math.max(1, Math.floor((CHAT_SCENE.bottom - CHAT_SCENE.marginY * 2) / lineHeight));
            const shown = layout.slice(Math.max(0, layout.length - maxLines));
            renderTruncated = layout.length > maxLines || (!wrap && maxWidth > width);
            if (target.width !== CHAT_SCENE.width)
                target.width = CHAT_SCENE.width;
            if (target.height !== CHAT_SCENE.height)
                target.height = CHAT_SCENE.height;
            target.style.width = '100%';
            target.style.maxWidth = '960px';
            target.style.height = 'auto';
            target.style.aspectRatio = CHAT_SCENE.width + ' / ' + CHAT_SCENE.height;
            target.dataset.zoomed = String(scale > 1);
            const top = Math.max(CHAT_SCENE.marginY, CHAT_SCENE.bottom - shown.length * lineHeight);
            const guiW = Math.min(width + padding * 2 + 2, sceneGuiW - CHAT_SCENE.x - padding);
            const guiH = Math.max(lineHeight + padding * 2, shown.length * lineHeight + padding * 2);
            const unit = CHAT_SCENE.guiScale;
            // Focus follows the actual text, not the center of the world screenshot.
            // Zoom does not re-wrap the text or change its position relative to the world.
            const visibleWidth = Math.min(Math.max(1, ...shown.map(l => l.width)), Math.max(1, guiW - padding));
            const bounds = {
                left: (CHAT_SCENE.x + padding) * unit,
                top: top * unit,
                right: (CHAT_SCENE.x + padding + visibleWidth) * unit,
                bottom: (top + (shown.length - 1) * lineHeight + 9) * unit
            };
            const view = prepareChatView(scale, bounds);
            const ctx = target.getContext('2d');
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, target.width, target.height);
            ctx.imageSmoothingEnabled = false;
            ctx.save();
            ctx.scale(CHAT_SCENE.width / view.width, CHAT_SCENE.height / view.height);
            ctx.translate(-view.x, -view.y);
            const activeChatImage = chatImageVariant === '2' ? chatSceneImage2 : chatSceneImage;
            if (activeChatImage.complete && activeChatImage.naturalWidth > 0)
                ctx.drawImage(activeChatImage, 0, 0, CHAT_SCENE.width, CHAT_SCENE.height);
            ctx.scale(unit, unit);
            const opacity = Math.max(0, Math.min(1, Number($('bgOpacity').value) / 100));
            ctx.fillStyle = 'rgba(0,0,0,' + opacity + ')';
            ctx.fillRect(CHAT_SCENE.x, Math.max(0, top - padding), guiW, guiH);
            const draws = [];
            let index = 0;
            shown.forEach((line, ly) => {
                let x = CHAT_SCENE.x + padding;
                for (const item of line.items) {
                    draws.push({
                        item,
                        g: obfuscatedGlyph(item, index++),
                        x,
                        y: top + ly * lineHeight
                    });
                    x += item.advance;
                }
            });
            ctx.beginPath();
            ctx.rect(CHAT_SCENE.x, Math.max(0, top - padding), guiW, guiH);
            ctx.clip();
            const renderPass = isShadow => {
                for (const { item, g, x, y } of draws) {
                    if (x > sceneGuiW + 20 || x + item.advance < 0)
                        continue;
                    const color = isShadow ? shadowColor(item.style.color) : item.style.color, offset = isShadow ? item.metric.shadowOffset : 0;
                    drawGlyph(ctx, g, x + offset, y + offset, color, item.style.italic, item.style.bold, item.metric.boldOffset);
                }
                for (const { item, x, y } of draws) {
                    const s = item.style;
                    if (!s.underlined && !s.strikethrough)
                        continue;
                    ctx.fillStyle = isShadow ? shadowColor(s.color) : s.color;
                    const off = isShadow ? 1 : 0;
                    if (s.strikethrough)
                        ctx.fillRect(x + off - 1, y + off + 3.5, item.advance + 1, 1);
                    if (s.underlined)
                        ctx.fillRect(x + off - 1, y + off + 8, item.advance + 1, 1);
                }
            };
            if (shadow)
                renderPass(true);
            renderPass(false);
            ctx.restore();
            target.title = scale + '× · ' + shown.length + ' / ' + layout.length + ' lines' + (scale > 1 ? ' · Drag or use arrow keys to pan. Double-click or press Home to refocus.' : ' · Zoom to focus on chat.');
            return;
        }
        delete target.dataset.zoomed;
        const guiW = Math.ceil(width + padding * 2 + 2);
        const dpr = Math.min(window.devicePixelRatio || 1, 2), factor = Math.min(scale * dpr, 8192 / guiW), maxLines = Math.min(120, Math.max(1, Math.floor((8192 / factor - padding * 2) / lineHeight))), shown = layout.slice(0, maxLines);
        const guiH = Math.max(lineHeight + padding * 2, shown.length * lineHeight + padding * 2);
        renderTruncated = layout.length > maxLines || (!wrap && maxWidth > width);
        const cw = Math.ceil(guiW * factor), ch = Math.ceil(guiH * factor);
        if (target.width !== cw)
            target.width = cw;
        if (target.height !== ch)
            target.height = ch;
        target.style.width = (guiW * scale) + 'px';
        target.style.maxWidth = 'none';
        target.style.height = (guiH * scale) + 'px';
        target.style.aspectRatio = 'auto';
        const ctx = target.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        ctx.scale(factor, factor);
        ctx.imageSmoothingEnabled = false;
        {
            const opacity = Math.max(0, Math.min(1, Number($('bgOpacity').value) / 100));
            if (scene === 'tooltip') {
                ctx.fillStyle = '#100010';
                ctx.globalAlpha = Math.max(.8, opacity);
                ctx.fillRect(0, 0, guiW, guiH);
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#5000aa';
                ctx.fillRect(1, 1, guiW - 2, 1);
                ctx.fillRect(1, 1, 1, guiH - 2);
                ctx.fillStyle = '#280055';
                ctx.fillRect(1, guiH - 2, guiW - 2, 1);
                ctx.fillRect(guiW - 2, 1, 1, guiH - 2);
            }
            else if (scene === 'book') {
                ctx.fillStyle = '#dbc9a4';
                ctx.fillRect(0, 0, guiW, guiH);
                ctx.fillStyle = '#f5e9cf';
                ctx.fillRect(3, 3, guiW - 6, guiH - 6);
            }
            else if (scene === 'solid') {
                ctx.fillStyle = $('bgColor').value;
                ctx.fillRect(0, 0, guiW, guiH);
            }
        }
        const draws = [];
        let index = 0;
        shown.forEach((line, ly) => {
            let x = padding;
            for (const item of line.items) {
                draws.push({
                    item,
                    g: obfuscatedGlyph(item, index++),
                    x,
                    y: padding + ly * lineHeight
                });
                x += item.advance;
            }
        });
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, guiW, guiH);
        ctx.clip();
        const renderPass = isShadow => {
            for (const { item, g, x, y } of draws) {
                if (x > guiW + 20 || x + item.advance < 0)
                    continue;
                const color = isShadow ? shadowColor(item.style.color) : item.style.color, offset = isShadow ? item.metric.shadowOffset : 0;
                drawGlyph(ctx, g, x + offset, y + offset, color, item.style.italic, item.style.bold, item.metric.boldOffset);
            }
            for (const { item, x, y } of draws) {
                const s = item.style;
                if (!s.underlined && !s.strikethrough)
                    continue;
                ctx.fillStyle = isShadow ? shadowColor(s.color) : s.color;
                const off = isShadow ? 1 : 0;
                if (s.strikethrough)
                    ctx.fillRect(x + off - 1, y + off + 3.5, item.advance + 1, 1);
                if (s.underlined)
                    ctx.fillRect(x + off - 1, y + off + 8, item.advance + 1, 1);
            }
        };
        if (shadow)
            renderPass(true);
        renderPass(false);
        ctx.restore();
        if (target === $('preview'))
            target.title = layout.length + " lines · " + formatNumber(maxWidth) + ' GUI px';
    }

    function formatNumber(n) {
        return Number.isInteger(n) ? String(n) : n.toFixed(1);
    }

    function scheduleRender() {
        if (renderPending)
            return;
        renderPending = true;
        requestAnimationFrame(() => {
            renderPending = false;
            render();
        });
    }

    function render() {
        if (!parsed)
            return;
        layout = layoutGlyphs(parsed.glyphs, Math.max(40, Math.min(1600, Number($('wrapWidth').value) || 300)), $('wrap').checked);
        drawPreview();
        updateFontCoverage();
        updateDiagnostics();
        startAnimation();
    }

    function startAnimation() {
        if (animationRequest)
            cancelAnimationFrame(animationRequest);
        animationRequest = 0;
        const obfuscated = $('animate').checked && parsed?.glyphs.some(g => g.style.obfuscated);
        const zooming = () => scene === 'chat' && !!chatCamera.transition;
        if (document.hidden || (!obfuscated && !zooming()))
            return;
        const step = now => {
            animationRequest = 0;
            if (document.hidden)
                return;
            const changeGlyph = obfuscated && now - lastAnimTime >= 32;
            if (changeGlyph) {
                frame++;
                lastAnimTime = now;
            }
            if (changeGlyph || zooming())
                drawPreview();
            if (obfuscated || zooming())
                animationRequest = requestAnimationFrame(step);
        };
        animationRequest = requestAnimationFrame(step);
    }
    // ==========================================================================
    // 8. Font availability and status messages
    // ==========================================================================

    function updateFontCoverage() {
        if (!parsed)
            return;
        let fallback = 0, missing = 0;
        for (const item of parsed.glyphs) {
            if (item.ch === '\n')
                continue;
            const kind = glyphFor(item.ch.codePointAt(0)).kind;
            if (kind === 'fallback')
                fallback++;
            else if (kind === 'missing')
                missing++;
        }
        const badge = $('fontBadge');
        badge.hidden = !fontLoading && !fallback && !missing;
        badge.textContent = fontLoading ? "Loading fonts" : fallback ? "Fallback font" : missing ? "Missing glyphs" : '';
        badge.classList.toggle('warning', !!(fallback || missing) && !fontLoading);
        badge.title = fontLoading ? "Downloading fonts. Characters not yet loaded use a fallback font." : fallback ? fallback + " characters use a browser fallback font. Click to open font settings." : missing ? missing + " characters have no matching glyph. Click to open font settings." : '';
    }

    function updateFontStatus() {
        const loaded = [...activeGlyphs.values()].some(g => g.kind === 'bitmap' || g.kind === 'hex');
        const text = fontLoading ? "Loading…" : localFontName ? localFontName : loaded ? "Default fonts · " + ASSET_VERSION : "Not loaded · using a browser fallback font";
        $('fontStatusText').textContent = text;
        $('fontStatusText').title = fontErrors.join('\n');
        $('clearFont').disabled = !localProviders.length;
        updateFontCoverage();
    }
    // ==========================================================================
    // 9. Editor controls, history, settings, and persistence
    // ==========================================================================
    const SETTING_IDS = [
        'ampMode',
        'escapes',
        'lineReset',
        'rgb',
        'autoColor',
        'baseColor',
        'baseBold',
        'baseItalic',
        'baseUnderlined',
        'baseStrikethrough',
        'baseObfuscated',
        'lineHeight',
        'bgOpacity',
        'bgColor',
        'onlineFonts',
        'jpGlyphs',
        'uniform',
        'autosave',
        'scale',
        'wrapWidth',
        'wrap',
        'shadow',
        'animate',
        'exportKind'
    ];
    let undoStack = [], historyIndex = -1, saveTimer = 0, toastTimer = 0, composing = false, selection = { start: 0, end: 0 };

    function createEl(tag, text, cls) {
        const element = document.createElement(tag);
        if (text !== undefined)
            element.textContent = text;
        if (cls)
            element.className = cls;
        return element;
    }

    function toast(message) {
        const el = $('toast');
        el.textContent = message;
        el.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.hidden = true, 2500);
    }

    function updateCaret() {
        const input = $('source');
        selection = { start: input.selectionStart, end: input.selectionEnd };
        const item = undoStack[historyIndex];
        if (item && item.value === input.value) {
            item.start = selection.start;
            item.end = selection.end;
        }
    }

    function recordHistory() {
        const value = $('source').value;
        if (undoStack[historyIndex]?.value === value) {
            updateCaret();
            return;
        }
        undoStack = undoStack.slice(0, historyIndex + 1);
        undoStack.push({ value, start: $('source').selectionStart, end: $('source').selectionEnd });
        if (undoStack.length > 120)
            undoStack.shift();
        historyIndex = undoStack.length - 1;
    }

    function travelHistory(delta) {
        const next = historyIndex + delta;
        if (next < 0 || next >= undoStack.length)
            return;
        historyIndex = next;
        const h = undoStack[next];
        $('source').value = h.value;
        $('source').focus();
        $('source').setSelectionRange(h.start, h.end);
        processInput(false);
    }

    function replaceSource(value, start = 0, end = start) {
        const input = $('source');
        input.value = String(value).slice(0, MAX_TEXT);
        input.setSelectionRange(Math.min(start, MAX_TEXT), Math.min(end, MAX_TEXT));
        recordHistory();
        processInput(false);
    }

    function insertCode(code) {
        const input = $('source'), pos = selection.start, end = selection.end, prefix = $('ampMode').value === 'section' ? '§' : '&', added = prefix + code;
        if (input.value.length + added.length > MAX_TEXT) {
            toast("Input is limited to 40,000 characters");
            return;
        }
        replaceSource(input.value.slice(0, pos) + added + input.value.slice(pos), pos + 2, end > pos ? end + 2 : pos + 2);
        input.focus();
        updateCaret();
    }

    function buildButtons() {
        for (const [code, name, hex] of COLOR_LIST) {
            const b = createEl('button', undefined, 'color-btn'), n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, bl = n & 255;
            const linear = c => {
                c /= 255;
                return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
            };
            const luminance = .2126 * linear(r) + .7152 * linear(g) + .0722 * linear(bl);
            b.type = 'button';
            b.style.setProperty('--swatch', hex);
            b.style.setProperty('--ink', luminance > .179 ? '#141619' : '#ffffff');
            b.dataset.code = code;
            b.title = '&' + code + ' · ' + name + ' · ' + hex.toUpperCase();
            b.setAttribute('aria-label', b.title);
            b.append(createEl('span', '&' + code));
            b.addEventListener('click', () => insertCode(code));
            $('palette').append(b);
        }
        for (const [code, title] of [
            ['l', "Bold"],
            ['n', "Underline"],
            ['o', "Italic"],
            ['m', "Strikethrough"],
            ['k', "Obfuscated"],
            ['r', "Reset"]
        ]) {
            const b = createEl('button', '&' + code, 'format-btn');
            b.type = 'button';
            b.dataset.code = code;
            b.title = '&' + code + ' · ' + title;
            b.setAttribute('aria-label', b.title);
            b.addEventListener('click', () => insertCode(code));
            $('formats').append(b);
        }
    }

    function highlightInput(result = parsed) {
        const text = $('source').value, frag = document.createDocumentFragment();
        let pos = 0;
        for (const e of result.events) {
            if (e.start < pos || e.kind === 'line')
                continue;
            frag.append(document.createTextNode(text.slice(pos, e.start)));
            const classes = {
                color: 'color-code',
                format: 'format-code',
                reset: 'format-code',
                invalid: 'invalid-code',
                literal: 'invalid-code',
                rgb: 'extension-code'
            };
            const span = createEl('span', text.slice(e.start, e.end), classes[e.kind] || '');
            if (e.kind === 'color') {
                span.style.setProperty('--code-dark', COLORS[e.code] === '#000000' ? '#89919d' : COLORS[e.code]);
                span.style.setProperty('--code-light', LIGHT_CODE_INKS[e.code]);
            }
            frag.append(span);
            pos = e.end;
        }
        frag.append(document.createTextNode(text.slice(pos) + '\n'));
        $('highlight').replaceChildren(frag);
        syncScroll();
    }

    function syncScroll() {
        $('highlight').scrollTop = $('source').scrollTop;
        $('highlight').scrollLeft = $('source').scrollLeft;
    }

    function updateDiagnostics() {
        if (!parsed)
            return;
        const invalid = parsed.events.filter(e => e.kind === 'literal' || e.kind === 'invalid');
        $('source').title = invalid.length ? invalid.slice(0, 8).map(e => e.raw + ' — ' + e.note).join('\n') : '';
        const notice = $('previewNotice');
        const notes = [];
        if (scene === 'chat')
            notes.push("Chat background: Image " + chatImageVariant);
        if (renderTruncated)
            notes.push(scene === 'chat' ? "Only the lines that fit in the chat area are shown." : "Part of the preview has been clipped.");
        notice.hidden = !notes.length;
        notice.textContent = notes.join(' / ');
    }

    function exportValue() {
        const kind = $('exportKind').value;
        if (kind === 'source')
            return $('source').value;
        if (kind === 'section')
            return parsed.normalized;
        if (kind === 'amp')
            return parsed.normalized.replace(/§/g, '&');
        if (kind === 'properties')
            return propertiesValue(parsed.normalized);
        if (kind === 'json')
            return JSON.stringify(jsonComponents(parsed), null, 2);
        return parsed.plain;
    }

    function updateCopyLabel() {
        const names = {
            source: "Copy",
            amp: "Copy & codes",
            section: "Copy § codes",
            properties: 'properties',
            json: "Copy JSON",
            plain: "Copy text"
        };
        const kind = $('exportKind').value;
        $('copyLabel').textContent = names[kind] || "Copy";
        $('copySource').title = 'Copy: ' + $('exportKind').selectedOptions[0].textContent;
    }

    function processInput(record = true) {
        currentOptions = optionsFromUI();
        parsed = parse($('source').value, currentOptions);
        if (record)
            recordHistory();
        $('baseColor').disabled = $('autoColor').checked;
        $('bgOpacityOut').textContent = $('bgOpacity').value + '%';
        $('accessiblePreview').textContent = parsed.plain;
        $('preview').setAttribute('aria-label', parsed.plain.slice(0, 2000) || "Preview (empty)");
        highlightInput();
        updateCaret();
        updateCopyLabel();
        scheduleRender();
        scheduleSave();
    }

    function snapshot() {
        return {
            format: 'minecraft-color-lab',
            version: 1,
            scene,
            chatImageVariant,
            settings: Object.fromEntries(SETTING_IDS.map(id => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value]))
        };
    }

    function flushSave() {
        clearTimeout(saveTimer);
        try {
            if ($('autosave').checked) {
                localStorage.setItem('mc-color-lab-project-v1', JSON.stringify(snapshot()));
                localStorage.removeItem('mc-color-lab-no-autosave');
                $('saveStatus').textContent = "Settings saved. Text is never stored.";
            }
            else {
                localStorage.removeItem('mc-color-lab-project-v1');
                localStorage.setItem('mc-color-lab-no-autosave', '1');
                $('saveStatus').textContent = "Settings storage is off. Text is never stored.";
            }
        }
        catch {
            $('saveStatus').textContent = "Browser storage is unavailable. Text is never stored.";
        }
    }

    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(flushSave, 350);
    }

    function applyProject(data, { startup = false } = {}) {
        if (!data || typeof data !== 'object' || data.format !== 'minecraft-color-lab' || data.version !== 1)
            throw Error("Not a supported project file");
        const settings = data.settings || {};
        for (const id of SETTING_IDS) {
            if (!(id in settings))
                continue;
            const e = $(id), value = settings[id];
            if (e.type === 'checkbox') {
                if (typeof value === 'boolean')
                    e.checked = value;
            }
            else if (e.type === 'color') {
                if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value))
                    e.value = value;
            }
            else if (e.type === 'range' || e.type === 'number') {
                const n = Number(value);
                if (Number.isFinite(n))
                    e.value = String(Math.max(Number(e.min), Math.min(Number(e.max), n)));
            }
            else if (e.tagName === 'SELECT' && [...e.options].some(o => o.value === String(value)))
                e.value = String(value);
        }
        if (['chat', 'tooltip', 'book', 'solid', 'transparent'].includes(data.scene))
            scene = data.scene;
        if (data.chatImageVariant === '1' || data.chatImageVariant === '2')
            chatImageVariant = data.chatImageVariant;
        // User-entered text is intentionally never restored from project data.
        // Older project files may still contain a source field; it is ignored.
        $('source').setSelectionRange(0, 0);
        syncScene();
        if (!startup) {
            recordHistory();
            rebuildFonts();
            processInput(false);
            void loadStandardFonts();
        }
    }

    function syncScene() {
        $('sceneSelect').value = scene;
        const show = scene === 'chat', viewport = $('previewViewport');
        if (viewport.dataset.scene !== scene) {
            resetChatCamera();
            viewport.scrollLeft = 0;
            viewport.scrollTop = 0;
        }
        viewport.dataset.scene = scene;
        $('chatImageSelect').hidden = !show;
        $('solidColorControl').hidden = scene !== 'solid';
        if (show)
            $('chatImageSelect').value = chatImageVariant;
        $('preview').tabIndex = show ? 0 : -1;
        $('scale').setAttribute('aria-label', show ? 'Chat zoom' : 'Preview scale');
        $('scale').title = show ? 'Zoom toward the chat area' : 'Preview scale';
    }

    async function copyText(text) {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                toast("Copied");
                return;
            }
        }
        catch {
            /* Fallback for local HTML and restricted clipboard contexts. */
        }
        const active = document.activeElement, saved = { ...selection }, temp = document.createElement('textarea');
        temp.value = text;
        temp.className = 'clipboard-helper';
        document.body.append(temp);
        temp.select();
        let ok = false;
        try {
            ok = document.execCommand('copy');
        }
        catch {
        }
        temp.remove();
        active?.focus({ preventScroll: true });
        $('source').setSelectionRange(saved.start, saved.end);
        toast(ok ? "Copied" : "Copy failed. Select the input and press Ctrl+A, then Ctrl+C.");
    }

    function downloadBlob(blob, name) {
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    function openSettings(section) {
        if (section)
            $(section).open = true;
        if (!$('settings').open)
            $('settings').showModal();
        if (section)
            $(section).scrollIntoView({ block: 'nearest' });
    }
    // ==========================================================================
    // 10. UI event bindings
    // ==========================================================================

    function bindUI() {
        const source = $('source');
        source.addEventListener('input', e => {
            if (composing || e.isComposing) {
                highlightInput(parse(source.value, optionsFromUI()));
            }
            else
                processInput();
        });
        source.addEventListener('compositionstart', () => composing = true);
        source.addEventListener('compositionend', () => {
            composing = false;
            processInput();
        });
        for (const type of ['click', 'keyup', 'select', 'focus'])
            source.addEventListener(type, updateCaret);
        source.addEventListener('scroll', syncScroll);
        source.addEventListener('keydown', e => {
            if (e.isComposing)
                return;
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                travelHistory(e.shiftKey ? 1 : -1);
            }
            else if (mod && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                travelHistory(1);
            }
            else if (e.key === 'Tab' && !e.shiftKey && !mod && !e.altKey) {
                e.preventDefault();
                const start = source.selectionStart, end = source.selectionEnd;
                if (source.value.length - (end - start) + 4 > MAX_TEXT) {
                    toast("Input is limited to 40,000 characters");
                    return;
                }
                replaceSource(source.value.slice(0, start) + '    ' + source.value.slice(end), start + 4);
            }
        });
        for (const id of SETTING_IDS) {
            const e = $(id), event = e.type === 'range' || e.type === 'color' || e.type === 'number' ? 'input' : 'change';
            e.addEventListener(event, () => {
                if (['uniform', 'jpGlyphs'].includes(id))
                    rebuildFonts();
                processInput(false);
                if (id === 'onlineFonts')
                    void loadStandardFonts();
            });
        }
        $('sceneSelect').addEventListener('change', () => {
            scene = $('sceneSelect').value;
            syncScene();
            processInput(false);
        });
        $('chatImageSelect').addEventListener('change', () => {
            chatImageVariant = $('chatImageSelect').value;
            processInput(false);
        });
        $('openSettings').addEventListener('click', () => openSettings());
        $('closeSettings').addEventListener('click', () => $('settings').close());
        $('settings').addEventListener('click', e => {
            if (e.target !== $('settings'))
                return;
            const r = e.target.getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
                e.target.close();
        });
        $('fontBadge').addEventListener('click', () => openSettings('fontSettings'));
        $('copySource').addEventListener('click', () => copyText(exportValue()));
        $('saveProject').addEventListener('click', () => {
            downloadBlob(new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' }), 'minecraft-formatting-test.mcformat.json');
            toast("Project saved");
        });
        $('loadProject').addEventListener('click', () => $('projectFile').click());
        $('projectFile').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file)
                return;
            try {
                if (file.size > 2 * 1024 * 1024)
                    throw Error("Project file is too large");
                applyProject(JSON.parse(await file.text()));
                toast("Project loaded");
            }
            catch (err) {
                toast(err.message);
            }
            finally {
                e.target.value = '';
            }
        });
        $('presets').addEventListener('change', e => {
            const text = SAMPLES[e.target.value];
            if (text !== undefined) {
                replaceSource(text);
                $('settings').close();
                source.focus();
            }
            e.target.value = '';
        });
        $('importFont').addEventListener('click', () => $('fontFile').click());
        $('fontFile').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file)
                return;
            try {
                await importLocalFont(file);
            }
            catch (err) {
                toast("Failed to load font: " + err.message);
            }
            finally {
                e.target.value = '';
            }
        });
        $('clearFont').addEventListener('click', () => {
            localProviders = [];
            localFontName = '';
            $('fontDetail').textContent = 'PNG / HEX / ZIP / JAR';
            $('fontDetail').removeAttribute('title');
            rebuildFonts();
            toast("Local font cleared");
        });
        $('reloadFonts').addEventListener('click', () => void loadStandardFonts());
        document.addEventListener('visibilitychange', () => {
            startAnimation();
            if (document.hidden)
                flushSave();
        });
        window.addEventListener('pagehide', flushSave);
        window.addEventListener('resize', scheduleRender);
    }
    // ==========================================================================
    // 11. Regression tests (available from the browser console)
    // ==========================================================================

    function runSelfTests() {
        const out = [];
        const assert = (v, m = 'assertion failed') => {
            if (!v)
                throw Error(m);
        };
        const test = (name, fn) => {
            try {
                fn();
                out.push({ name, ok: true });
            }
            catch (e) {
                out.push({ name, ok: false, error: e.message });
            }
        };
        const p = (s, o) => parse(s, o), last = r => r.glyphs[r.glyphs.length - 1];
        for (const [c, n, hex] of COLOR_LIST)
            test('Color &' + c + ' / ' + n, () => assert(last(p('&' + c + 'X')).style.color === hex));
        test('Format stacking', () => {
            const s = last(p('&c&l&o&m&n&kX')).style;
            assert(s.color === COLORS.c && FLAGS.every(f => s[f]));
        });
        test('Color clears all decorations', () => assert(FLAGS.every(f => !last(p('&l&o&m&n&k&aX')).style[f])));
        test('Color then bold remains bold', () => assert(last(p('&a&lX')).style.bold));
        test('Same color clears decorations', () => assert(!last(p('&a&l&aX')).style.bold));
        test('Duplicate format is not a toggle', () => assert(last(p('&l&lX')).style.bold));
        test('Formatting preserves color', () => assert(last(p('&c&oX')).style.color === COLORS.c));
        test('Reset defaults to white', () => {
            const s = last(p('&c&lX&rY')).style;
            assert(s.color === '#ffffff' && !s.bold);
        });
        test('Reset restores caller base style', () => {
            const s = last(p('&cX&rY', { baseColor: '#333333', baseItalic: true })).style;
            assert(s.color === '#333333' && s.italic);
        });
        test('Color clears even caller base styles', () => assert(!last(p('&aX', { baseItalic: true })).style.italic));
        test('Case-insensitive & and § codes', () => assert(last(p('&A§LX')).style.color === COLORS.a && last(p('&A§LX')).style.bold));
        test('Valid amp conversion lowercases', () => assert(p('&AX').normalized === '§aX'));
        test('Unknown amp stays literal', () => assert(p('&a&zX').plain === '&zX' && last(p('&a&zX')).style.color === COLORS.a));
        test('Unknown section is consumed', () => assert(p('§a§zX').plain === 'X' && last(p('§a§zX')).style.color === COLORS.a));
        test('Unknown section preserves bold', () => assert(last(p('&l§uX')).style.bold));
        test('&u is not underline', () => assert(p('&uX').plain === '&uX' && !last(p('&uX')).style.underlined));
        test('Trailing § is not rendered', () => assert(p('ABC§').plain === 'ABC'));
        test('Trailing & stays literal', () => assert(p('ABC&').plain === 'ABC&'));
        test('Double & is not an escape', () => assert(p('&&aX').plain === '&X' && last(p('&&aX')).style.color === COLORS.a));
        test('Double § consumes the second §', () => assert(p('§§aX').plain === 'aX'));
        test('§-only leaves amp codes untouched', () => assert(p('&aX§cY', { ampMode: 'section' }).plain === '&aXY'));
        test('All-amp replacement consumes unknown', () => assert(p('A&zB', { ampMode: 'all' }).plain === 'AB'));
        test('Newline inherits format', () => assert(last(p('&a&lA\nB')).style.bold && last(p('&a&lA\nB')).style.color === COLORS.a));
        test('Independent lines reset style', () => assert(!last(p('&a&lA\nB', { lineReset: true })).style.bold));
        test('Independent lines restore custom base', () => assert(last(p('&cA\nB', { lineReset: true, baseColor: '#123456', baseItalic: true })).style.color === '#123456' && last(p('&cA\nB', { lineReset: true, baseItalic: true })).style.italic));
        test('Section followed by newline consumes newline', () => assert(p('A§\nB').plain === 'AB'));
        test('CRLF normalized', () => assert(p('A\r\nB').plain === 'A\nB'));
        test('Escapes disabled by default', () => assert(p('\\n').plain === '\\n'));
        test('Escaped section and newline decoded', () => assert(p('\\u00A7aA\\nB', { escapes: true }).plain === 'A\nB' && last(p('\\u00A7aX', { escapes: true })).style.color === COLORS.a));
        test('Double slash stays literal', () => assert(p('\\\\n', { escapes: true }).plain === '\\n'));
        test('Unknown escape is preserved', () => assert(p('\\q', { escapes: true }).plain === '\\q'));
        test('Escaped offsets refer to original source', () => {
            const e = p('\\u00A7aX', { escapes: true }).events[0];
            assert(e.start === 0 && e.end === 7 && e.raw === '\\u00A7a');
        });
        test('RGB disabled by default', () => assert(p('&#123456X').plain === '&#123456X'));
        test('Short RGB extension', () => assert(last(p('&#123456X', { rgb: true })).style.color === '#123456'));
        test('Section RGB extension', () => assert(last(p('§#abcdefX', { rgb: true, ampMode: 'section' })).style.color === '#abcdef'));
        test('Bungee RGB extension', () => assert(last(p('&x&1&2&a&B&0&FX', { rgb: true })).style.color === '#12ab0f'));
        test('RGB clears prior formatting', () => assert(!last(p('&l&#123456X', { rgb: true })).style.bold));
        test('RGB followed by formatting', () => assert(last(p('&#123456&lX', { rgb: true })).style.bold));
        test('RGB amp ignored in §-only mode', () => assert(p('&#123456X', { rgb: true, ampMode: 'section' }).plain === '&#123456X'));
        test('Invalid RGB not silently accepted', () => assert(p('&#12345ZX', { rgb: true }).plain === '&#12345ZX'));
        test('RGB normalized to six § digits', () => assert(p('&#abcdefX', { rgb: true }).normalized === '§x§a§b§c§d§e§fX'));
        test('Unicode surrogate pair is one glyph', () => assert(p('&a😀').glyphs.length === 1));
        test('Unpaired high surrogate replaced', () => assert(p('\ud800X').plain === '\ufffdX'));
        test('Unpaired low surrogate replaced', () => assert(p('\udc00').plain === '\ufffd'));
        test('HTML is always literal text', () => assert(p('<img src=x onerror=alert(1)>').plain === '<img src=x onerror=alert(1)>'));
        test('Blank input has no glyphs', () => assert(p('').glyphs.length === 0));
        test('Codes alone produce no glyphs', () => assert(p('&a&l&r').glyphs.length === 0));
        test('Space and indentation are preserved', () => assert(p('&a  A  B  ').plain === '  A  B  '));
        test('Properties escaping', () => assert(propertiesValue('§aA\n\\x') === '\\u00A7aA\\n\\\\x'));
        test('JSON has explicit style booleans', () => {
            const j = jsonComponents(p('&lA&aB'));
            assert(j.extra[0].bold && j.extra[1].bold === false && j.extra[1].color === COLORS.a);
        });
        test('Caret state before and after code', () => {
            const r = p('&aX');
            assert(caretStyle(r, 1).color === '#ffffff' && caretStyle(r, 2).color === COLORS.a);
        });
        const resolver = cp => ({
            advance: cp === 32 ? 4 : 6,
            boldOffset: 1,
            shadowOffset: 1,
            kind: 'test'
        });
        test('Wrap at last space', () => {
            const l = layoutGlyphs(p('&aAA BB').glyphs, 17, true, resolver);
            assert(l.length === 2 && l[0].items.map(g => g.ch).join('') === 'AA' && l[1].items.map(g => g.ch).join('') === 'BB');
        });
        test('Wrap preserves active style', () => {
            const l = layoutGlyphs(p('&a&lAAAA').glyphs, 14, true, resolver);
            assert(l.length === 2 && l[1].items[0].style.bold && l[1].items[0].style.color === COLORS.a);
        });
        test('Bold increases advance', () => {
            const l = layoutGlyphs(p('&lAB').glyphs, 100, true, resolver);
            assert(l[0].width === 14);
        });
        test('Trailing newline creates empty line', () => assert(layoutGlyphs(p('A\n').glyphs, 100, true, resolver).length === 2));
        test('Unihex full-width override', () => {
            const m = parseHex('3042:' + '00'.repeat(32), DEFAULT_OVERRIDES);
            assert(m.get(0x3042).advance === 9 && m.get(0x3042).boldOffset === .5);
        });
        test('Unihex trims horizontal margins', () => {
            const m = parseHex('0041:' + '18'.repeat(16));
            assert(m.get(65).left === 3 && m.get(65).right === 4 && m.get(65).advance === 2);
        });
        test('Shadow intensity is one quarter', () => assert(shadowColor('#55ffff') === '#153f3f'));
        const chatBounds = {
            left: 18,
            top: 790,
            right: 360,
            bottom: 844
        };
        test('Chat 1x shows the full screenshot', () => {
            const v = calculateChatView(1, chatBounds);
            assert(v.x === 0 && v.y === 0 && v.width === 1920 && v.height === 1009);
        });
        for (let z = 2; z <= 5; z++)
            test('Chat ' + z + 'x focuses inside the screenshot', () => {
                const v = calculateChatView(z, chatBounds);
                assert(v.width === 1920 / z && v.height === 1009 / z);
                assert(v.x >= 0 && v.y >= 0 && v.x + v.width <= 1920.000001 && v.y + v.height <= 1009.000001);
                assert(v.y > 0 && chatBounds.left >= v.x && chatBounds.bottom <= v.y + v.height);
            });
        test('Chat zoom preserves aspect ratio', () => {
            const v = calculateChatView(4, chatBounds);
            assert(Math.abs(v.width / v.height - 1920 / 1009) < 1e-10);
        });
        test('Tall chat focuses on the newest rows', () => {
            const v = calculateChatView(5, { ...chatBounds, top: 16 });
            assert(v.y > 500 && v.y + v.height >= chatBounds.bottom);
        });
        test('Zoom clamps unsupported values', () => {
            assert(calculateChatView(99, chatBounds).width === 384);
            assert(calculateChatView(-10, chatBounds).width === 1920);
            assert(calculateChatView('invalid', chatBounds).width === 1920);
        });
        return out;
    }
    // Exposed for tests and integrations; no test panels in the interface.
    // ==========================================================================
    // 12. Public debug API and application startup
    // ==========================================================================
    window.MCColorLab = {
        parse,
        baseStyle,
        caretStyle,
        layoutGlyphs,
        propertiesValue,
        jsonComponents,
        parseHex,
        ZipArchive,
        runSelfTests,
        loadBitmap,
        importLocalFont,
        ASSET_VERSION,
        calculateChatView,
        get state() {
            return {
                parsed,
                layout,
                currentOptions,
                scene,
                fontLoading,
                fontErrors,
                localFontName,
                activeGlyphCount: activeGlyphs.size,
                fontRevision,
                chatView: scene === 'chat' && currentChatView() ? { ...currentChatView() } : null
            };
        },
        setSource: (text) => replaceSource(text),
        getSnapshot: snapshot,
        applyProject
    };
    buildButtons();
    bindUI();
    bindChatCamera();
    $('source').value = SAMPLES.chumu;
    try {
        const raw = localStorage.getItem('mc-color-lab-project-v1');
        if (raw) {
            applyProject(JSON.parse(raw), { startup: true });
            localStorage.setItem('mc-color-lab-project-v1', JSON.stringify(snapshot()));
        }
        else if (localStorage.getItem('mc-color-lab-no-autosave') === '1')
            $('autosave').checked = false;
    }
    catch {
        /* Local storage is optional. */
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches)
        $('animate').checked = false;
    $('source').setSelectionRange(0, 0);
    recordHistory();
    syncScene();
    processInput(false);
    void loadStandardFonts();
})();
