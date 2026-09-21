# Pixel Art Resizer

ピクセル画像を解像度を下げずにサイズ変更する、ブラウザ完結の静的Webツールです。

## Files

```text
pixel-art-resizer/
├── index.html
├── css/
│   └── style.css
└── js/
    ├── main.js
    └── theme.js
```

画像処理はブラウザ内で行われます。


## Preview

The preview uses the available page width and no longer stops growing at the old 480 px height limit.


- Mobile layout: controls stack below 900px and preview/card widths are constrained to the viewport.

## Responsive layout

Controls keep their natural compact size and wrap only when the available container width is insufficient. The page side margins also shrink fluidly on narrow windows.
