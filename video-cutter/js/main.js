import * as Mediabunny from 'https://cdn.jsdelivr.net/npm/mediabunny@1.59.0/dist/bundles/mediabunny.min.mjs';

'use strict';

(() => {
    const MIN_CLIP_SECONDS = 0.05;

    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const uploadPanel = document.getElementById('uploadPanel');
    const editor = document.getElementById('editor');
    const video = document.getElementById('video');
    const fileName = document.getElementById('fileName');
    const fileMeta = document.getElementById('fileMeta');
    const replaceButton = document.getElementById('replaceButton');
    const startRange = document.getElementById('startRange');
    const endRange = document.getElementById('endRange');
    const startInput = document.getElementById('startInput');
    const endInput = document.getElementById('endInput');
    const setStartButton = document.getElementById('setStartButton');
    const setEndButton = document.getElementById('setEndButton');
    const resetRangeButton = document.getElementById('resetRangeButton');
    const previewButton = document.getElementById('previewButton');
    const clipDuration = document.getElementById('clipDuration');
    const timelineSelection = document.getElementById('timelineSelection');
    const playhead = document.getElementById('playhead');
    const formatBadge = document.getElementById('formatBadge');
    const exportButton = document.getElementById('exportButton');
    const cancelButton = document.getElementById('cancelButton');
    const progressBlock = document.getElementById('progressBlock');
    const progressLabel = document.getElementById('progressLabel');
    const progressPercent = document.getElementById('progressPercent');
    const progressBar = document.getElementById('progressBar');
    const statusText = document.getElementById('statusText');

    let currentFile = null;
    let objectUrl = null;
    let duration = 0;
    let trimStart = 0;
    let trimEnd = 0;
    let previewingSelection = false;
    let activeConversion = null;
    let cancelledByUser = false;

    function formatTime(seconds) {
        const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
        const minutes = Math.floor(safe / 60);
        const remaining = safe - minutes * 60;
        const wholeSeconds = Math.floor(remaining);
        const hundredths = Math.floor((remaining - wholeSeconds) * 100 + 1e-6);
        return `${minutes}:${String(wholeSeconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
    }

    function parseTime(value) {
        const text = String(value).trim();
        if (!text) return NaN;

        if (/^\d+(?:\.\d+)?$/.test(text)) {
            return Number(text);
        }

        const parts = text.split(':').map((part) => part.trim());
        if (parts.length < 2 || parts.length > 3 || parts.some((part) => part === '' || Number.isNaN(Number(part)))) {
            return NaN;
        }

        if (parts.length === 2) {
            return Number(parts[0]) * 60 + Number(parts[1]);
        }

        return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
    }

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / (1024 ** index);
        return `${value.toFixed(index === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[index]}`;
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function setStatus(message, type = '') {
        statusText.textContent = message;
        statusText.dataset.type = type;
    }

    function updateTimeline() {
        if (!duration) return;
        const startPercent = (trimStart / duration) * 100;
        const endPercent = (trimEnd / duration) * 100;
        const playheadPercent = clamp((video.currentTime / duration) * 100, 0, 100);

        timelineSelection.style.left = `${startPercent}%`;
        timelineSelection.style.width = `${Math.max(0, endPercent - startPercent)}%`;
        playhead.style.left = `${playheadPercent}%`;
    }

    function updateRangeUI({ keepInputFocus = true } = {}) {
        startRange.value = String(trimStart);
        endRange.value = String(trimEnd);

        if (!keepInputFocus || document.activeElement !== startInput) {
            startInput.value = formatTime(trimStart);
        }
        if (!keepInputFocus || document.activeElement !== endInput) {
            endInput.value = formatTime(trimEnd);
        }

        clipDuration.textContent = formatTime(Math.max(0, trimEnd - trimStart));
        updateTimeline();
    }

    function setStart(value, seek = false) {
        trimStart = clamp(value, 0, Math.max(0, trimEnd - MIN_CLIP_SECONDS));
        if (seek) video.currentTime = trimStart;
        updateRangeUI();
    }

    function setEnd(value, seek = false) {
        trimEnd = clamp(value, Math.min(duration, trimStart + MIN_CLIP_SECONDS), duration);
        if (seek) video.currentTime = trimEnd;
        updateRangeUI();
    }

    function resetRange() {
        trimStart = 0;
        trimEnd = duration;
        previewingSelection = false;
        updateRangeUI({ keepInputFocus: false });
    }

    function resetExportUI() {
        progressBlock.hidden = true;
        progressBar.value = 0;
        progressPercent.textContent = '0%';
        progressLabel.textContent = '準備中…';
        cancelButton.hidden = true;
        exportButton.disabled = false;
        replaceButton.disabled = false;
        setStatus('');
    }

    async function loadFile(file) {
        if (!file || (!file.type.startsWith('video/') && !/\.(mp4|m4v|mov|webm|mkv)$/i.test(file.name))) {
            setStatus('動画ファイルを選択してください。', 'error');
            return;
        }

        if (activeConversion) return;

        currentFile = file;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(file);

        video.src = objectUrl;
        video.load();
        fileName.textContent = file.name;
        fileMeta.textContent = `${formatBytes(file.size)} · 読み込み中…`;
        uploadPanel.hidden = true;
        editor.hidden = false;
        resetExportUI();
    }

    async function exportClip() {
        if (!currentFile || !duration || trimEnd - trimStart < MIN_CLIP_SECONDS) return;

        const { Input, ALL_FORMATS, BlobSource, Output, BufferTarget, Mp4OutputFormat, WebMOutputFormat, Conversion } = Mediabunny;

        exportButton.disabled = true;
        replaceButton.disabled = true;
        cancelButton.hidden = false;
        progressBlock.hidden = false;
        progressBar.value = 0;
        progressPercent.textContent = '0%';
        progressLabel.textContent = '準備中…';
        setStatus('');
        cancelledByUser = false;

        async function createConversion(OutputFormat, extension, mimeType) {
            const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(currentFile) });
            const target = new BufferTarget();
            const output = new Output({ format: new OutputFormat(), target });
            const conversion = await Conversion.init({
                input,
                output,
                tracks: 'primary',
                trim: { start: trimStart, end: trimEnd },
                showWarnings: false,
            });
            return { input, target, conversion, extension, mimeType };
        }

        let job = null;

        try {
            progressLabel.textContent = '形式を確認中…';
            job = await createConversion(Mp4OutputFormat, 'mp4', 'video/mp4');

            if (!job.conversion.isValid && WebMOutputFormat) {
                try { job.input.dispose?.(); } catch {}
                job = await createConversion(WebMOutputFormat, 'webm', 'video/webm');
            }

            if (!job.conversion.isValid) {
                throw new Error('この動画はブラウザ上で書き出せないコーデックを含んでいます。');
            }

            activeConversion = job.conversion;
            formatBadge.textContent = job.extension.toUpperCase();
            progressLabel.textContent = '動画を書き出し中…';

            job.conversion.onProgress = (progress) => {
                const safeProgress = clamp(Number(progress) || 0, 0, 1);
                progressBar.value = safeProgress;
                progressPercent.textContent = `${Math.round(safeProgress * 100)}%`;
            };

            await job.conversion.execute();
            if (cancelledByUser) return;

            progressBar.value = 1;
            progressPercent.textContent = '100%';
            progressLabel.textContent = 'ダウンロードを準備中…';

            const baseName = currentFile.name.replace(/\.[^.]+$/, '') || 'video';
            const blob = new Blob([job.target.buffer], { type: job.mimeType });
            const downloadUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = downloadUrl;
            anchor.download = `${baseName}-cut-${formatTime(trimStart).replace(/[:.]/g, '-')}-${formatTime(trimEnd).replace(/[:.]/g, '-')}.${job.extension}`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);

            setStatus(`書き出し完了 · ${formatBytes(blob.size)}`, 'success');
            progressLabel.textContent = '完了';
        } catch (error) {
            if (!cancelledByUser) {
                console.error(error);
                const message = error instanceof Error ? error.message : String(error);
                setStatus(`書き出しに失敗しました: ${message}`, 'error');
                progressLabel.textContent = '失敗';
            }
        } finally {
            activeConversion = null;
            cancelButton.hidden = true;
            exportButton.disabled = false;
            replaceButton.disabled = false;
            try { job?.input?.dispose?.(); } catch {}
        }
    }

    fileInput.addEventListener('change', () => {
        const [file] = fileInput.files || [];
        if (file) loadFile(file);
        fileInput.value = '';
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropZone.classList.add('is-dragging');
        });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
        dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropZone.classList.remove('is-dragging');
        });
    });

    dropZone.addEventListener('drop', (event) => {
        const [file] = event.dataTransfer?.files || [];
        if (file) loadFile(file);
    });

    replaceButton.addEventListener('click', () => fileInput.click());

    video.addEventListener('loadedmetadata', () => {
        duration = Number.isFinite(video.duration) ? video.duration : 0;
        trimStart = 0;
        trimEnd = duration;
        startRange.max = String(duration);
        endRange.max = String(duration);
        endRange.value = String(duration);

        const dimensions = video.videoWidth && video.videoHeight ? `${video.videoWidth}×${video.videoHeight}` : '解像度不明';
        fileMeta.textContent = `${formatBytes(currentFile?.size || 0)} · ${dimensions} · ${formatTime(duration)}`;
        formatBadge.textContent = 'MP4';
        updateRangeUI({ keepInputFocus: false });
        video.currentTime = 0;
    });

    video.addEventListener('error', () => {
        fileMeta.textContent = `${formatBytes(currentFile?.size || 0)} · プレビュー非対応`;
        setStatus('このブラウザでは動画をプレビューできません。別形式の動画を試してください。', 'error');
    });

    video.addEventListener('timeupdate', () => {
        updateTimeline();
        if (previewingSelection && video.currentTime >= trimEnd - 0.02) {
            video.pause();
            video.currentTime = trimStart;
            previewingSelection = false;
            previewButton.textContent = '選択範囲を再生';
        }
    });

    video.addEventListener('pause', () => {
        if (previewingSelection && video.currentTime < trimEnd - 0.02) {
            previewingSelection = false;
            previewButton.textContent = '選択範囲を再生';
        }
    });

    startRange.addEventListener('input', () => setStart(Number(startRange.value), true));
    endRange.addEventListener('input', () => setEnd(Number(endRange.value), true));

    startInput.addEventListener('change', () => {
        const parsed = parseTime(startInput.value);
        if (Number.isFinite(parsed)) setStart(parsed, true);
        updateRangeUI({ keepInputFocus: false });
    });

    endInput.addEventListener('change', () => {
        const parsed = parseTime(endInput.value);
        if (Number.isFinite(parsed)) setEnd(parsed, true);
        updateRangeUI({ keepInputFocus: false });
    });

    setStartButton.addEventListener('click', () => setStart(video.currentTime));
    setEndButton.addEventListener('click', () => setEnd(video.currentTime));
    resetRangeButton.addEventListener('click', resetRange);

    previewButton.addEventListener('click', async () => {
        if (!duration) return;
        if (previewingSelection) {
            video.pause();
            previewingSelection = false;
            previewButton.textContent = '選択範囲を再生';
            return;
        }
        video.currentTime = trimStart;
        previewingSelection = true;
        previewButton.textContent = '停止';
        try {
            await video.play();
        } catch {
            previewingSelection = false;
            previewButton.textContent = '選択範囲を再生';
        }
    });

    exportButton.addEventListener('click', exportClip);

    cancelButton.addEventListener('click', async () => {
        if (!activeConversion) return;
        cancelledByUser = true;
        cancelButton.disabled = true;
        progressLabel.textContent = 'キャンセル中…';
        try {
            await activeConversion.cancel();
            setStatus('書き出しをキャンセルしました。');
            progressLabel.textContent = 'キャンセル済み';
        } catch (error) {
            console.error(error);
        } finally {
            cancelButton.disabled = false;
        }
    });

    window.addEventListener('beforeunload', () => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
})();
