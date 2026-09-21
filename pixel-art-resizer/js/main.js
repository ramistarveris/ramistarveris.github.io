const SCALE_PRESETS = createScalePresets();
const MAX_CANVAS_DIMENSION = 16384;
const MAX_CANVAS_PIXELS = 67_108_864;
const MAX_PREVIEW_DIMENSION = 2048;
const MAX_PREVIEW_PIXELS = 4_000_000;

const fileInput = document.querySelector("#file-input");
const dropZone = document.querySelector("#drop-zone");
const batchScaleSelect = document.querySelector("#batch-scale");
const applyBatchButton = document.querySelector("#apply-batch");
const downloadAllButton = document.querySelector("#download-all");
const clearAllButton = document.querySelector("#clear-all");
const statusText = document.querySelector("#status-text");
const galleryTitle = document.querySelector("#gallery-title");
const galleryNote = document.querySelector("#gallery-note");
const emptyState = document.querySelector("#empty-state");
const gallery = document.querySelector("#gallery");
const cardTemplate = document.querySelector("#card-template");

const items = [];

initialize();

function initialize() {
    populateBatchScaleSelect();
    bindEvents();
    syncUi();
}

function bindEvents() {
    fileInput.addEventListener("change", async (event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        await handleFiles(files);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropZone.classList.add("is-active");
        });
    });

    ["dragleave", "dragend", "drop"].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();

            if (eventName !== "drop") {
                dropZone.classList.remove("is-active");
            }
        });
    });

    dropZone.addEventListener("drop", async (event) => {
        dropZone.classList.remove("is-active");
        const files = Array.from(event.dataTransfer?.files ?? []);
        await handleFiles(files);
    });

    applyBatchButton.addEventListener("click", () => {
        if (!items.length) {
            return;
        }

        const targetScale = Number(batchScaleSelect.value);
        let cappedCount = 0;

        for (const item of items) {
            if (item.supportedScales.includes(targetScale)) {
                item.scale = targetScale;
            } else {
                item.scale = item.supportedScales[item.supportedScales.length - 1];
                cappedCount += 1;
            }
        }

        renderGallery();

        if (cappedCount > 0) {
            setStatus(`一括適用しました。${cappedCount} 件は出力上限に収まる倍率へ調整しました。`);
        } else {
            setStatus(`全 ${items.length} 件に x${formatScale(targetScale)} を適用しました。`);
        }
    });

    downloadAllButton.addEventListener("click", async () => {
        if (!items.length) {
            return;
        }

        downloadAllButton.disabled = true;
        setStatus(`${items.length} 件の PNG を保存しています...`);

        let saved = 0;
        let failed = 0;

        for (const item of items) {
            try {
                await downloadItem(item);
                saved += 1;
                await delay(120);
            } catch (error) {
                console.error(error);
                failed += 1;
            }
        }

        syncUi();
        setStatus(failed ? `${saved} 件保存 / ${failed} 件失敗` : `${saved} 件の保存を開始しました。`);
    });

    clearAllButton.addEventListener("click", () => {
        clearItems();
        renderGallery();
        setStatus("画像をすべてクリアしました。");
    });

    gallery.addEventListener("change", (event) => {
        const select = event.target.closest(".scale-select");

        if (!select) {
            return;
        }

        const item = items.find((entry) => entry.id === select.dataset.id);

        if (!item) {
            return;
        }

        item.scale = Number(select.value);
        renderGallery();

        const output = getOutputSize(item);
        setStatus(`${item.file.name} → x${formatScale(item.scale)} (${output.width} x ${output.height})`);
    });

    gallery.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");

        if (!button) {
            return;
        }

        const card = button.closest(".image-card");
        const item = items.find((entry) => entry.id === card?.dataset.id);

        if (!item) {
            return;
        }

        if (button.dataset.action === "download") {
            button.disabled = true;

            try {
                await downloadItem(item);
                setStatus(`${item.file.name} の保存を開始しました。`);
            } catch (error) {
                console.error(error);
                setStatus(`${item.file.name} の保存に失敗しました。`);
            } finally {
                button.disabled = false;
            }

            return;
        }

        if (button.dataset.action === "remove") {
            removeItem(item);
            renderGallery();
            setStatus(`${item.file.name} をリストから外しました。`);
        }
    });

    window.addEventListener("pagehide", clearItems);
}

async function handleFiles(files) {
    if (!files.length) {
        setStatus("画像ファイルを追加してください。");
        return;
    }

    const imageFiles = files.filter(isImageFile);
    const skippedCount = files.length - imageFiles.length;

    if (!imageFiles.length) {
        setStatus("画像ファイルを指定してください。");
        return;
    }

    setStatus(`${imageFiles.length} 件の画像を読み込み中...`);

    const results = await Promise.allSettled(imageFiles.map(createItemFromFile));
    let addedCount = 0;
    let failedCount = 0;

    for (const result of results) {
        if (result.status === "fulfilled") {
            items.push(result.value);
            addedCount += 1;
        } else {
            console.error(result.reason);
            failedCount += 1;
        }
    }

    renderGallery();

    const messages = [];

    if (addedCount > 0) {
        messages.push(`${addedCount} 件追加`);
    }

    if (skippedCount > 0) {
        messages.push(`${skippedCount} 件除外`);
    }

    if (failedCount > 0) {
        messages.push(`${failedCount} 件失敗`);
    }

    setStatus(messages.join(" / "));
}

function isImageFile(file) {
    return file.type.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(file.name);
}

async function createItemFromFile(file) {
    const objectUrl = URL.createObjectURL(file);

    try {
        const image = await loadImage(objectUrl);
        const supportedScales = getSupportedScales(image.naturalWidth, image.naturalHeight);

        return {
            id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
            file,
            image,
            objectUrl,
            scale: pickInitialScale(supportedScales),
            supportedScales,
            width: image.naturalWidth,
            height: image.naturalHeight
        };
    } catch (error) {
        URL.revokeObjectURL(objectUrl);
        throw error;
    }
}

function loadImage(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Image load failed"));
        image.src = source;
    });
}

function renderGallery() {
    gallery.replaceChildren();

    for (const item of items) {
        const fragment = cardTemplate.content.cloneNode(true);
        const card = fragment.querySelector(".image-card");
        const name = fragment.querySelector(".card-name");
        const info = fragment.querySelector(".card-info");
        const select = fragment.querySelector(".scale-select");
        const sourceSize = fragment.querySelector(".source-size");
        const outputSize = fragment.querySelector(".output-size");
        const canvas = fragment.querySelector(".preview-canvas");
        const output = getOutputSize(item);

        card.dataset.id = item.id;
        name.textContent = item.file.name;
        info.textContent = `${getExtensionLabel(item.file.name)} / ${formatFileSize(item.file.size)}`;
        sourceSize.textContent = `${item.width} x ${item.height}`;
        outputSize.textContent = `${output.width} x ${output.height}`;
        select.dataset.id = item.id;

        populateScaleSelect(select, item.supportedScales, item.width, item.height, item.scale);
        drawPreview(canvas, item.image, output.width, output.height);
        gallery.append(fragment);
    }

    syncUi();
}

function populateBatchScaleSelect() {
    batchScaleSelect.replaceChildren();

    for (const scale of SCALE_PRESETS) {
        const option = document.createElement("option");
        option.value = String(scale);
        option.textContent = `x${formatScale(scale)}`;
        batchScaleSelect.append(option);
    }

    batchScaleSelect.value = "4";
}

function populateScaleSelect(select, scales, width, height, selectedScale) {
    select.replaceChildren();

    for (const scale of scales) {
        const option = document.createElement("option");
        const outputWidth = Math.round(width * scale);
        const outputHeight = Math.round(height * scale);

        option.value = String(scale);
        option.textContent = `x${formatScale(scale)} (${outputWidth} x ${outputHeight})`;
        option.selected = scale === selectedScale;
        select.append(option);
    }
}

function drawPreview(canvas, image, outputWidth, outputHeight) {
    const preview = fitPreviewSize(outputWidth, outputHeight);
    const context = canvas.getContext("2d");

    canvas.width = preview.width;
    canvas.height = preview.height;
    context.clearRect(0, 0, preview.width, preview.height);
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, preview.width, preview.height);
}

function fitPreviewSize(width, height) {
    const dimensionScale = Math.min(1, MAX_PREVIEW_DIMENSION / Math.max(width, height));
    const pixelScale = Math.min(1, Math.sqrt(MAX_PREVIEW_PIXELS / (width * height)));
    const scale = Math.min(dimensionScale, pixelScale);

    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
    };
}

function syncUi() {
    const hasItems = items.length > 0;

    emptyState.hidden = hasItems;
    downloadAllButton.disabled = !hasItems;
    clearAllButton.disabled = !hasItems;
    applyBatchButton.disabled = !hasItems;
    batchScaleSelect.disabled = !hasItems;

    if (!hasItems) {
        galleryTitle.textContent = "画像なし";
        galleryNote.textContent = "";
        return;
    }

    galleryTitle.textContent = `${items.length} 件`;
    galleryNote.textContent = "PNG";
}

function getSupportedScales(width, height) {
    const supported = SCALE_PRESETS.filter((scale) => {
        const targetWidth = Math.round(width * scale);
        const targetHeight = Math.round(height * scale);

        return (
            targetWidth <= MAX_CANVAS_DIMENSION &&
            targetHeight <= MAX_CANVAS_DIMENSION &&
            targetWidth * targetHeight <= MAX_CANVAS_PIXELS
        );
    });

    return supported.length ? supported : [1];
}

function pickInitialScale(scales) {
    return scales.includes(4) ? 4 : scales[Math.min(scales.length - 1, 1)];
}

function getOutputSize(item) {
    return {
        width: Math.round(item.width * item.scale),
        height: Math.round(item.height * item.scale)
    };
}

async function downloadItem(item) {
    const output = getOutputSize(item);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = output.width;
    canvas.height = output.height;
    context.imageSmoothingEnabled = false;
    context.drawImage(item.image, 0, 0, output.width, output.height);

    const blob = await canvasToBlob(canvas, "image/png");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = item.file.name.replace(/\.[^.]+$/, "");

    link.href = url;
    link.download = `${safeName}@x${formatScale(item.scale)}_${output.width}x${output.height}.png`;
    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    canvas.width = 1;
    canvas.height = 1;
}

function canvasToBlob(canvas, type) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error("PNG encoding failed"));
            }
        }, type);
    });
}

function removeItem(item) {
    const index = items.findIndex((entry) => entry.id === item.id);

    if (index < 0) {
        return;
    }

    URL.revokeObjectURL(item.objectUrl);
    items.splice(index, 1);
}

function clearItems() {
    for (const item of items) {
        URL.revokeObjectURL(item.objectUrl);
    }

    items.length = 0;
}

function getExtensionLabel(fileName) {
    const match = fileName.match(/\.([^.]+)$/);
    return match ? match[1].toUpperCase() : "IMAGE";
}

function formatFileSize(size) {
    if (size < 1024) {
        return `${size} B`;
    }

    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function createScalePresets() {
    const values = [];

    for (let scale = 1; scale <= 10; scale += 0.5) {
        values.push(Number(scale.toFixed(1)));
    }

    values.push(12, 16, 20, 24, 32, 48, 64, 80, 100);
    return [...new Set(values)].sort((left, right) => left - right);
}

function formatScale(scale) {
    return Number.isInteger(scale) ? String(scale) : scale.toFixed(1).replace(/\.0$/, "");
}

function setStatus(message) {
    statusText.textContent = message;
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
