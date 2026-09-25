import * as Mediabunny from 'https://cdn.jsdelivr.net/npm/mediabunny@1.59.0/dist/bundles/mediabunny.min.mjs';

'use strict';

(() => {
    const MIN_CLIP_SECONDS = 0.05;
    const SNAP_PIXELS = 12;
    const EPSILON = 0.001;
    const SEAMLESS_SOURCE_EPSILON = 0.003;
    const HISTORY_LIMIT = 100;

    const fileInput = document.getElementById('fileInput');
    const imageInput = document.getElementById('imageInput');
    const audioInput = document.getElementById('audioInput');
    const dropZone = document.getElementById('dropZone');
    const uploadPanel = document.getElementById('uploadPanel');
    const editor = document.getElementById('editor');

    const video = document.getElementById('video');
    const videoFrame = document.getElementById('videoFrame');
    const effectCanvas = document.getElementById('effectCanvas');
    const imageOverlayStage = document.getElementById('imageOverlayStage');
    const fileName = document.getElementById('fileName');
    const fileMeta = document.getElementById('fileMeta');
    const replaceButton = document.getElementById('replaceButton');

    const resolutionSelect = document.getElementById('resolutionSelect');
    const customResolution = document.getElementById('customResolution');
    const exportWidthInput = document.getElementById('exportWidthInput');
    const exportHeightInput = document.getElementById('exportHeightInput');
    const fpsSelect = document.getElementById('fpsSelect');
    const snapshotFormat = document.getElementById('snapshotFormat');
    const snapshotButton = document.getElementById('snapshotButton');

    const selectionNote = document.getElementById('selectionNote');
    const videoClipControls = document.getElementById('videoClipControls');
    const startInput = document.getElementById('startInput');
    const endInput = document.getElementById('endInput');
    const setStartButton = document.getElementById('setStartButton');
    const setEndButton = document.getElementById('setEndButton');
    const speedSelect = document.getElementById('speedSelect');
    const filterSelect = document.getElementById('filterSelect');
    const filterStrength = document.getElementById('filterStrength');
    const filterStrengthOutput = document.getElementById('filterStrengthOutput');
    const separateAudioButton = document.getElementById('separateAudioButton');
    const resetRangeButton = document.getElementById('resetRangeButton');
    const previewButton = document.getElementById('previewButton');
    const clipDurationLabel = document.getElementById('clipDuration');

    const timelinePane = document.getElementById('timelinePane');
    const timelineRuler = document.getElementById('timelineRuler');
    const timelineWorkspace = document.getElementById('timelineWorkspace');
    const layerStack = document.getElementById('layerStack');
    const playhead = document.getElementById('playhead');
    const playheadTimeLabel = document.getElementById('playheadTimeLabel');
    const clipCountLabel = document.getElementById('clipCountLabel');
    const cutButton = document.getElementById('cutButton');
    const addImageButton = document.getElementById('addImageButton');
    const addAudioButton = document.getElementById('addAudioButton');

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
    let sourceDuration = 0;
    let sourceWidth = 1920;
    let sourceHeight = 1080;
    let sourceFps = 30;

    let clips = [];
    let imageClips = [];
    let audioClips = [];
    let layers = [];
    let clipIdCounter = 1;
    let assetIdCounter = 1;
    let layerIdCounter = 1;

    let selectedType = 'video';
    let selectedId = null;
    let activeClipId = null;
    let logicalTime = 0;

    let playingTimeline = false;
    let internalSeek = false;
    let draggingPlayhead = false;
    let draggedClipId = null;
    let draggedLayerId = null;
    let transitioningClip = false;
    let playbackFrameCallbackId = null;

    let exportJob = null;
    let cancelledByUser = false;

    let undoStack = [];
    let redoStack = [];

    let sourceAudioBuffer = null;
    let sourceAudioDecodePromise = null;
    let decodeAudioContext = null;
    let previewAudioContext = null;
    let previewAudioNodes = [];

    const assetObjectUrls = new Set();
    let mosaicBufferCanvas = null;

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

        if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);

        const parts = text.split(':').map((part) => part.trim());
        if (
            parts.length < 2
            || parts.length > 3
            || parts.some((part) => part === '' || Number.isNaN(Number(part)))
        ) {
            return NaN;
        }

        if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
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

    function createVideoClip(sourceStart, sourceEnd, options = {}) {
        return {
            id: `clip-${clipIdCounter++}`,
            type: 'video',
            sourceStart,
            sourceEnd,
            muted: Boolean(options.muted),
            audioDetached: Boolean(options.audioDetached),
            speed: Number(options.speed) || 1,
            filter: options.filter || 'none',
            filterStrength: Number.isFinite(options.filterStrength) ? options.filterStrength : 50,
        };
    }

    function createAssetId(prefix) {
        return `${prefix}-${assetIdCounter++}`;
    }

    function createLayer(items = [], { baseVideo = false, atTop = true } = {}) {
        const layer = {
            id: `layer-${layerIdCounter++}`,
            baseVideo,
            items: items.map((item) => ({ ...item })),
        };

        if (atTop) layers.unshift(layer);
        else layers.push(layer);
        return layer;
    }

    function getVideoLayer() {
        return layers.find((layer) => layer.baseVideo) || null;
    }

    function syncVideoLayer() {
        let layer = getVideoLayer();

        if (!layer) {
            layer = createLayer([], { baseVideo: true, atTop: false });
        }

        layer.items = clips.map((clip) => ({ type: 'video', id: clip.id }));
        return layer;
    }

    function addLayerForItem(type, id) {
        return createLayer([{ type, id }], { atTop: true });
    }

    function removeItemFromLayers(type, id) {
        layers.forEach((layer) => {
            layer.items = layer.items.filter((item) => !(item.type === type && item.id === id));
        });

        layers = layers.filter((layer) => layer.baseVideo || layer.items.length > 0);
    }

    function findLayerForItem(type, id) {
        return layers.find((layer) => (
            layer.items.some((item) => item.type === type && item.id === id)
        )) || null;
    }

    function getLayerZIndex(layerId) {
        const index = layers.findIndex((layer) => layer.id === layerId);
        if (index < 0) return 1;
        return (layers.length - index) * 10;
    }

    function getClipDuration(clip) {
        return Math.max(0, clip.sourceEnd - clip.sourceStart) / Math.max(0.01, clip.speed || 1);
    }

    function getTimelineDuration() {
        return clips.reduce((total, clip) => total + getClipDuration(clip), 0);
    }

    function getTimelineSpans() {
        let cursor = 0;
        return clips.map((clip) => {
            const start = cursor;
            cursor += getClipDuration(clip);
            return { clip, start, end: cursor };
        });
    }

    function getSpanByClipId(id) {
        return getTimelineSpans().find((span) => span.clip.id === id) || null;
    }

    function findSpanAtTimelineTime(time) {
        const spans = getTimelineSpans();
        if (!spans.length) return null;

        const total = spans[spans.length - 1].end;
        if (time >= total - EPSILON) return spans[spans.length - 1];

        return (
            spans.find((span) => time >= span.start - EPSILON && time < span.end - EPSILON)
            || spans[0]
        );
    }

    function getSelectedVideoClip() {
        if (selectedType !== 'video') return null;
        return clips.find((clip) => clip.id === selectedId) || null;
    }

    function getSelectedImageClip() {
        if (selectedType !== 'image') return null;
        return imageClips.find((clip) => clip.id === selectedId) || null;
    }

    function getSelectedAudioClip() {
        if (selectedType !== 'audio') return null;
        return audioClips.find((clip) => clip.id === selectedId) || null;
    }

    function captureEditorState() {
        return {
            clips: clips.map((clip) => ({ ...clip })),
            imageClips: imageClips.map((clip) => ({ ...clip })),
            audioClips: audioClips.map((clip) => ({ ...clip })),
            layers: layers.map((layer) => ({
                ...layer,
                items: layer.items.map((item) => ({ ...item })),
            })),
            clipIdCounter,
            assetIdCounter,
            layerIdCounter,
            selectedType,
            selectedId,
            activeClipId,
            logicalTime,
        };
    }

    function pushUndoState() {
        if (exportJob) return;
        undoStack.push(captureEditorState());
        if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
        redoStack = [];
    }

    function restoreEditorState(state) {
        if (!state) return;

        pauseTimelinePlayback();

        clips = state.clips.map((clip) => ({ ...clip }));
        imageClips = state.imageClips.map((clip) => ({ ...clip }));
        audioClips = state.audioClips.map((clip) => ({ ...clip }));
        layers = state.layers.map((layer) => ({
            ...layer,
            items: layer.items.map((item) => ({ ...item })),
        }));
        clipIdCounter = state.clipIdCounter;
        assetIdCounter = state.assetIdCounter;
        layerIdCounter = state.layerIdCounter;
        selectedType = state.selectedType;
        selectedId = state.selectedId;
        activeClipId = state.activeClipId;
        logicalTime = clamp(state.logicalTime, 0, getTimelineDuration());

        if (!clips.length) {
            selectedType = null;
            selectedId = null;
            activeClipId = null;
            logicalTime = 0;
            video.muted = true;
            renderTimeline();
            updateInspector();
            updatePreviewScene();
            return;
        }

        if (
            selectedType === 'video'
            && !clips.some((clip) => clip.id === selectedId)
        ) {
            selectedId = clips[0].id;
        }

        const span = (
            getSpanByClipId(activeClipId)
            || findSpanAtTimelineTime(logicalTime)
            || getTimelineSpans()[0]
        );

        activeClipId = span.clip.id;
        applyActiveVideoClip(span.clip);

        const offset = clamp(logicalTime - span.start, 0, getClipDuration(span.clip));
        seekVideoTo(span.clip.sourceStart + offset * span.clip.speed);

        renderTimeline();
        updateInspector();
        updatePreviewScene();
    }

    function undoEdit() {
        if (exportJob || !undoStack.length) return;
        redoStack.push(captureEditorState());
        restoreEditorState(undoStack.pop());
    }

    function redoEdit() {
        if (exportJob || !redoStack.length) return;
        undoStack.push(captureEditorState());
        restoreEditorState(redoStack.pop());
    }

    function setStatus(message, type = '') {
        statusText.textContent = message;
        statusText.dataset.type = type;
    }

    function setPreviewButtonState(playing) {
        previewButton.innerHTML = playing
            ? '<iconify-icon icon="mdi:pause"></iconify-icon>停止'
            : '<iconify-icon icon="mdi:play"></iconify-icon>タイムライン再生';
    }

    function resetExportUI() {
        progressBlock.hidden = true;
        progressBar.value = 0;
        progressPercent.textContent = '0%';
        progressLabel.textContent = '準備中…';
        cancelButton.hidden = true;
        exportButton.disabled = !currentFile || !clips.length;
        replaceButton.disabled = false;
        setStatus('');
    }

    function getFilterCss(clip) {
        if (!clip || clip.filter === 'none' || clip.filter === 'mosaic') return 'none';

        const amount = clamp((clip.filterStrength || 0) / 100, 0, 1);

        switch (clip.filter) {
            case 'grayscale':
                return `grayscale(${amount})`;
            case 'sepia':
                return `sepia(${amount})`;
            case 'vivid':
                return `saturate(${1 + amount * 2.2}) contrast(${1 + amount * .25})`;
            case 'contrast':
                return `contrast(${1 + amount * 1.4})`;
            case 'blur':
                return `blur(${(amount * 8).toFixed(2)}px)`;
            default:
                return 'none';
        }
    }

    function applyActiveVideoClip(clip) {
        if (!clip) return;
        video.playbackRate = clamp(clip.speed || 1, 0.25, 4);
        video.muted = Boolean(clip.muted || clip.audioDetached);
        video.style.filter = getFilterCss(clip);
    }

    function updateInspector() {
        const videoClip = getSelectedVideoClip();
        const imageClip = getSelectedImageClip();
        const audioClip = getSelectedAudioClip();

        videoClipControls.hidden = !videoClip;
        startInput.disabled = !videoClip;
        endInput.disabled = !videoClip;
        setStartButton.disabled = !videoClip;
        setEndButton.disabled = !videoClip;
        speedSelect.disabled = !videoClip;
        filterSelect.disabled = !videoClip;
        filterStrength.disabled = !videoClip;
        separateAudioButton.disabled = !videoClip;

        if (videoClip) {
            selectionNote.textContent = '動画要素: 速度・フィルター・音声分離を設定できます。';
            startInput.value = formatTime(videoClip.sourceStart);
            endInput.value = formatTime(videoClip.sourceEnd);
            speedSelect.value = String(videoClip.speed);
            filterSelect.value = videoClip.filter;
            filterStrength.value = String(videoClip.filterStrength);
            filterStrengthOutput.value = `${videoClip.filterStrength}%`;
            filterStrengthOutput.textContent = `${videoClip.filterStrength}%`;
            clipDurationLabel.textContent = formatTime(getClipDuration(videoClip));
            separateAudioButton.disabled = videoClip.audioDetached;
            separateAudioButton.innerHTML = videoClip.audioDetached
                ? '<iconify-icon icon="mdi:check"></iconify-icon>音声分離済み'
                : '<iconify-icon icon="mdi:music-note-plus"></iconify-icon>動画と音声を分離';
            return;
        }

        if (imageClip) {
            selectionNote.textContent = `画像要素: ${imageClip.name} · ${formatTime(imageClip.duration)}`;
            clipDurationLabel.textContent = formatTime(imageClip.duration);
            return;
        }

        if (audioClip) {
            selectionNote.textContent = `音声要素: ${audioClip.name} · ${formatTime(audioClip.duration)}`;
            clipDurationLabel.textContent = formatTime(audioClip.duration);
            return;
        }

        selectionNote.textContent = 'タイムラインの要素を選択してください。';
        clipDurationLabel.textContent = '--';
    }

    function renderRuler() {
        const total = getTimelineDuration();
        timelineRuler.replaceChildren();

        if (!total) return;

        for (let i = 0; i <= 4; i++) {
            const ratio = i / 4;
            const label = document.createElement('span');
            label.className = 'ruler-label';
            label.style.left = `${ratio * 100}%`;
            label.textContent = formatTime(total * ratio);
            timelineRuler.appendChild(label);
        }
    }

    function buildWaveformPoints(buffer, sourceStart = 0, sourceEnd = buffer?.duration || 0) {
        if (!buffer || sourceEnd <= sourceStart) return '';

        const points = 80;
        const channel = buffer.getChannelData(0);
        const sampleRate = buffer.sampleRate;
        const start = clamp(Math.floor(sourceStart * sampleRate), 0, channel.length);
        const end = clamp(Math.floor(sourceEnd * sampleRate), start + 1, channel.length);
        const length = Math.max(1, end - start);
        const step = Math.max(1, Math.floor(length / points));
        const values = [];

        for (let i = 0; i < points; i++) {
            const from = start + i * step;
            const to = Math.min(end, from + step);
            let peak = 0;

            for (let j = from; j < to; j += Math.max(1, Math.floor(step / 16))) {
                peak = Math.max(peak, Math.abs(channel[j] || 0));
            }

            values.push(peak);
        }

        const top = values.map((value, index) => (
            `${(index / (points - 1) * 100).toFixed(2)},${(20 - value * 18).toFixed(2)}`
        ));
        const bottom = values.slice().reverse().map((value, reverseIndex) => {
            const index = points - 1 - reverseIndex;
            return `${(index / (points - 1) * 100).toFixed(2)},${(20 + value * 18).toFixed(2)}`;
        });

        return [...top, ...bottom].join(' ');
    }

    function createDeleteButton(className, label, handler) {
        const button = document.createElement('button');
        button.className = className;
        button.type = 'button';
        button.title = label;
        button.setAttribute('aria-label', label);
        button.innerHTML = '<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>';
        button.addEventListener('pointerdown', (event) => event.stopPropagation());
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            handler();
        });
        return button;
    }

    function getReferenceTrack() {
        return layerStack.querySelector('.layer-track');
    }

    function getAssetByType(type, id) {
        if (type === 'image') return imageClips.find((asset) => asset.id === id) || null;
        if (type === 'audio') return audioClips.find((asset) => asset.id === id) || null;
        return clips.find((clip) => clip.id === id) || null;
    }

    function createItemBody(nameText, timeText) {
        const body = document.createElement('div');
        body.className = 'item-body';

        const name = document.createElement('span');
        name.className = 'item-name';
        name.textContent = nameText;

        const time = document.createElement('span');
        time.className = 'item-time';
        time.textContent = timeText;

        body.append(name, time);
        return body;
    }

    function createTrimHandle(edge, asset, element, track) {
        const handle = document.createElement('span');
        handle.className = `item-trim-handle ${edge}`;
        handle.setAttribute('aria-hidden', 'true');

        handle.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
            event.preventDefault();
            beginAssetResize(event, asset, edge, element, track);
        });

        return handle;
    }

    function renderVideoItem(clip, index, track, total) {
        const span = getSpanByClipId(clip.id);
        if (!span || !total) return;

        const element = document.createElement('article');
        element.className = 'layer-item video-item';
        element.dataset.clipId = clip.id;
        element.draggable = true;
        element.style.left = `${span.start / total * 100}%`;
        element.style.width = `${Math.max(.35, getClipDuration(clip) / total * 100)}%`;

        if (selectedType === 'video' && selectedId === clip.id) {
            element.classList.add('is-selected');
        }
        if (clip.muted || clip.audioDetached) {
            element.classList.add('is-muted');
        }

        const audioButton = document.createElement('button');
        audioButton.className = 'item-audio-button';
        audioButton.type = 'button';
        const audioOff = clip.muted || clip.audioDetached;
        audioButton.title = audioOff ? '音声をオン' : '音声をミュート';
        audioButton.innerHTML = `<iconify-icon icon="${audioOff ? 'mdi:volume-off' : 'mdi:volume-high'}"></iconify-icon>`;
        if (clip.audioDetached) {
            audioButton.disabled = true;
            audioButton.title = '音声は分離されています';
        }

        const body = createItemBody(
            `Clip ${index + 1} · ${clip.speed}×`,
            `${formatTime(clip.sourceStart)} – ${formatTime(clip.sourceEnd)}`,
        );

        const deleteButton = createDeleteButton(
            'item-delete-button',
            'クリップを削除',
            () => deleteElement('video', clip.id),
        );

        element.append(audioButton, body, deleteButton);

        audioButton.addEventListener('pointerdown', (event) => event.stopPropagation());
        audioButton.addEventListener('dragstart', (event) => event.preventDefault());
        audioButton.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleClipMute(clip.id);
        });

        element.addEventListener('click', () => selectElement('video', clip.id));

        element.addEventListener('dragstart', (event) => {
            draggedClipId = clip.id;
            element.classList.add('is-dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', clip.id);
        });

        element.addEventListener('dragend', () => {
            draggedClipId = null;
            clearDropIndicators();
            element.classList.remove('is-dragging');
        });

        element.addEventListener('dragover', (event) => {
            if (!draggedClipId || draggedClipId === clip.id) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            clearDropIndicators();

            const rect = element.getBoundingClientRect();
            const before = event.clientX < rect.left + rect.width / 2;
            showDropIndicator(element, before);
        });

        element.addEventListener('drop', (event) => {
            if (!draggedClipId || draggedClipId === clip.id) return;
            event.preventDefault();

            const rect = element.getBoundingClientRect();
            const before = event.clientX < rect.left + rect.width / 2;
            clearDropIndicators();
            reorderClip(draggedClipId, clip.id, before);
        });

        track.appendChild(element);
    }

    function renderAssetItem(asset, type, track, total) {
        if (!total) return;

        const element = document.createElement('article');
        element.className = `layer-item ${type}-item`;
        element.dataset.assetId = asset.id;
        element.style.left = `${clamp(asset.start / total * 100, 0, 100)}%`;
        element.style.width = `${clamp(asset.duration / total * 100, .35, 100)}%`;

        if (selectedType === type && selectedId === asset.id) {
            element.classList.add('is-selected');
        }
        if (asset.muted) {
            element.classList.add('is-muted');
        }

        element.appendChild(createTrimHandle('start', asset, element, track));

        if (type === 'image') {
            const img = document.createElement('img');
            img.className = 'item-thumb';
            img.src = asset.url;
            img.alt = '';
            element.appendChild(img);
        } else {
            const muteButton = document.createElement('button');
            muteButton.className = 'item-mute-button';
            muteButton.type = 'button';
            muteButton.title = asset.muted ? '音声をオン' : '音声をミュート';
            muteButton.innerHTML = `<iconify-icon icon="${asset.muted ? 'mdi:volume-off' : 'mdi:volume-high'}"></iconify-icon>`;
            muteButton.addEventListener('pointerdown', (event) => event.stopPropagation());
            muteButton.addEventListener('click', (event) => {
                event.stopPropagation();
                pushUndoState();
                asset.muted = !asset.muted;
                renderTimeline();
                restartLayerAudioIfPlaying();
            });
            element.appendChild(muteButton);

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.classList.add('waveform');
            svg.setAttribute('viewBox', '0 0 100 40');
            svg.setAttribute('preserveAspectRatio', 'none');

            const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            polyline.setAttribute(
                'points',
                buildWaveformPoints(asset.buffer, asset.sourceStart, asset.sourceEnd),
            );
            svg.appendChild(polyline);
            element.appendChild(svg);
        }

        const body = createItemBody(
            asset.name,
            `${formatTime(asset.start)} – ${formatTime(asset.start + asset.duration)}`,
        );
        element.appendChild(body);

        element.appendChild(createDeleteButton(
            'item-delete-button',
            '要素を削除',
            () => deleteElement(type, asset.id),
        ));

        element.appendChild(createTrimHandle('end', asset, element, track));

        element.addEventListener('pointerdown', (event) => {
            if (
                event.button !== 0
                || event.target.closest('button, .item-trim-handle')
            ) {
                return;
            }

            selectElement(type, asset.id);
            beginAssetDrag(event, asset, element, track);
        });

        track.appendChild(element);
    }

    function renderLayer(layer, index, total) {
        const row = document.createElement('div');
        row.className = 'layer-row';
        row.dataset.layerId = layer.id;

        const label = document.createElement('div');
        label.className = 'layer-label';
        label.draggable = true;
        label.title = 'ドラッグでレイヤー順を変更';
        label.innerHTML = `<iconify-icon icon="mdi:drag"></iconify-icon><span>Layer ${index + 1}</span>`;

        const track = document.createElement('div');
        track.className = 'layer-track';

        if (layer.baseVideo) {
            track.classList.add('video-layer-track');
        }

        layer.items.forEach((item) => {
            if (item.type === 'video') {
                const clip = clips.find((candidate) => candidate.id === item.id);
                if (clip) renderVideoItem(clip, clips.indexOf(clip), track, total);
            } else {
                const asset = getAssetByType(item.type, item.id);
                if (asset) renderAssetItem(asset, item.type, track, total);
            }
        });

        label.addEventListener('dragstart', (event) => {
            draggedLayerId = layer.id;
            row.classList.add('is-layer-dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', layer.id);
        });

        label.addEventListener('dragend', () => {
            draggedLayerId = null;
            clearLayerDropIndicators();
            row.classList.remove('is-layer-dragging');
        });

        row.addEventListener('dragover', (event) => {
            if (!draggedLayerId || draggedLayerId === layer.id || draggedClipId) return;
            event.preventDefault();
            clearLayerDropIndicators();

            const rect = row.getBoundingClientRect();
            const before = event.clientY < rect.top + rect.height / 2;
            row.classList.add(before ? 'is-layer-drop-before' : 'is-layer-drop-after');
        });

        row.addEventListener('drop', (event) => {
            if (!draggedLayerId || draggedLayerId === layer.id || draggedClipId) return;
            event.preventDefault();

            const rect = row.getBoundingClientRect();
            const before = event.clientY < rect.top + rect.height / 2;
            reorderLayer(draggedLayerId, layer.id, before);
        });

        row.append(label, track);
        layerStack.appendChild(row);
    }

    function renderTimeline() {
        const total = getTimelineDuration();
        syncVideoLayer();
        layerStack.replaceChildren();

        layers.forEach((layer, index) => renderLayer(layer, index, total));

        clipCountLabel.textContent = (
            `${layers.length} layers · ${clips.length + imageClips.length + audioClips.length} items · ${formatTime(total)}`
        );
        exportButton.disabled = Boolean(exportJob) || !currentFile || !clips.length;
        renderRuler();
        updateInspector();
        updatePlayheadVisual();
        updatePreviewScene();
    }

    function beginAssetDrag(event, asset, element, track) {
        const rect = track.getBoundingClientRect();
        const total = getTimelineDuration();
        if (!rect.width || !total) return;

        const pointerId = event.pointerId;
        const startX = event.clientX;
        const originalStart = asset.start;
        let changed = false;
        let historyPushed = false;

        element.setPointerCapture(pointerId);

        const move = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            if (Math.abs(dx) < 2 && !changed) return;

            if (!historyPushed) {
                pushUndoState();
                historyPushed = true;
            }

            changed = true;
            const delta = dx / rect.width * total;
            asset.start = clamp(originalStart + delta, 0, Math.max(0, total - asset.duration));
            element.style.left = `${asset.start / total * 100}%`;
            updatePreviewScene();
        };

        const finish = () => {
            element.removeEventListener('pointermove', move);
            element.removeEventListener('pointerup', finish);
            element.removeEventListener('pointercancel', finish);

            if (changed) {
                renderTimeline();
                restartLayerAudioIfPlaying();
            }
        };

        element.addEventListener('pointermove', move);
        element.addEventListener('pointerup', finish);
        element.addEventListener('pointercancel', finish);
    }

    function beginAssetResize(event, asset, edge, element, track) {
        const total = getTimelineDuration();
        const rect = track.getBoundingClientRect();
        if (!total || !rect.width) return;

        const pointerId = event.pointerId;
        const originalStart = asset.start;
        const originalDuration = asset.duration;
        const originalEnd = originalStart + originalDuration;
        const originalSourceStart = asset.sourceStart ?? 0;
        const originalSourceEnd = asset.sourceEnd ?? originalDuration;
        const speed = asset.speed || 1;
        let changed = false;
        let historyPushed = false;

        element.setPointerCapture(pointerId);

        const move = (moveEvent) => {
            const pointerTime = clamp(
                (moveEvent.clientX - rect.left) / rect.width * total,
                0,
                total,
            );

            if (!historyPushed) {
                pushUndoState();
                historyPushed = true;
            }

            changed = true;

            if (edge === 'start') {
                if (asset.type === 'audio') {
                    const maxExtendLeft = originalSourceStart / speed;
                    const minStart = Math.max(0, originalStart - maxExtendLeft);
                    const nextStart = clamp(pointerTime, minStart, originalEnd - MIN_CLIP_SECONDS);
                    const delta = nextStart - originalStart;

                    asset.start = nextStart;
                    asset.sourceStart = clamp(
                        originalSourceStart + delta * speed,
                        0,
                        originalSourceEnd - MIN_CLIP_SECONDS,
                    );
                    asset.duration = originalEnd - nextStart;
                } else {
                    const nextStart = clamp(pointerTime, 0, originalEnd - MIN_CLIP_SECONDS);
                    asset.start = nextStart;
                    asset.duration = originalEnd - nextStart;
                }
            } else if (asset.type === 'audio') {
                const bufferDuration = asset.buffer?.duration ?? originalSourceEnd;
                const maxExtendRight = Math.max(0, bufferDuration - originalSourceEnd) / speed;
                const maxEnd = Math.min(total, originalEnd + maxExtendRight);
                const nextEnd = clamp(pointerTime, originalStart + MIN_CLIP_SECONDS, maxEnd);
                const delta = nextEnd - originalEnd;

                asset.sourceEnd = clamp(
                    originalSourceEnd + delta * speed,
                    originalSourceStart + MIN_CLIP_SECONDS,
                    bufferDuration,
                );
                asset.duration = nextEnd - originalStart;
            } else {
                const nextEnd = clamp(pointerTime, originalStart + MIN_CLIP_SECONDS, total);
                asset.duration = nextEnd - originalStart;
            }

            element.style.left = `${asset.start / total * 100}%`;
            element.style.width = `${Math.max(.35, asset.duration / total * 100)}%`;
            updatePreviewScene();
        };

        const finish = () => {
            element.removeEventListener('pointermove', move);
            element.removeEventListener('pointerup', finish);
            element.removeEventListener('pointercancel', finish);

            if (changed) {
                renderTimeline();
                restartLayerAudioIfPlaying();
            }
        };

        element.addEventListener('pointermove', move);
        element.addEventListener('pointerup', finish);
        element.addEventListener('pointercancel', finish);
    }

    function showDropIndicator(targetElement, before) {
        const track = targetElement.closest('.layer-track');
        if (!track) return;

        const trackRect = track.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();
        const targetX = before
            ? targetRect.left - trackRect.left
            : targetRect.right - trackRect.left;

        track.style.setProperty(
            '--drop-indicator-x',
            `${clamp(targetX, 0, trackRect.width)}px`,
        );
        track.classList.add('is-reorder-target');
    }

    function clearDropIndicators() {
        layerStack.querySelectorAll('.layer-track.is-reorder-target').forEach((track) => {
            track.classList.remove('is-reorder-target');
            track.style.removeProperty('--drop-indicator-x');
        });
    }

    function clearLayerDropIndicators() {
        layerStack.querySelectorAll('.is-layer-drop-before, .is-layer-drop-after').forEach((row) => {
            row.classList.remove('is-layer-drop-before', 'is-layer-drop-after');
        });
    }

    function reorderLayer(movingId, targetId, before) {
        const movingIndex = layers.findIndex((layer) => layer.id === movingId);
        if (movingIndex < 0) return;

        pushUndoState();
        const [moving] = layers.splice(movingIndex, 1);
        let targetIndex = layers.findIndex((layer) => layer.id === targetId);

        if (targetIndex < 0) {
            layers.push(moving);
        } else {
            if (!before) targetIndex += 1;
            layers.splice(targetIndex, 0, moving);
        }

        draggedLayerId = null;
        clearLayerDropIndicators();
        renderTimeline();
    }

    function capturePlayheadAnchor() {
        const clip = clips.find((item) => item.id === activeClipId);
        if (!clip) return null;

        return {
            clipId: clip.id,
            sourceTime: clamp(video.currentTime, clip.sourceStart, clip.sourceEnd),
        };
    }

    function restorePlayheadAnchor(anchor, seekVideo = false) {
        if (!anchor) {
            logicalTime = clamp(logicalTime, 0, getTimelineDuration());
            updatePlayheadVisual();
            return;
        }

        const span = getSpanByClipId(anchor.clipId);
        if (!span) {
            logicalTime = clamp(logicalTime, 0, getTimelineDuration());
            updatePlayheadVisual();
            return;
        }

        const sourceTime = clamp(anchor.sourceTime, span.clip.sourceStart, span.clip.sourceEnd);
        logicalTime = span.start + (sourceTime - span.clip.sourceStart) / span.clip.speed;
        activeClipId = span.clip.id;
        applyActiveVideoClip(span.clip);

        if (seekVideo) seekVideoTo(sourceTime);
        updatePlayheadVisual();
    }

    function reorderClip(movingId, targetId, before) {
        const anchor = capturePlayheadAnchor();
        const movingIndex = clips.findIndex((clip) => clip.id === movingId);
        if (movingIndex < 0) return;

        pushUndoState();

        const [moving] = clips.splice(movingIndex, 1);
        let targetIndex = clips.findIndex((clip) => clip.id === targetId);

        if (targetIndex < 0) {
            clips.push(moving);
        } else {
            if (!before) targetIndex += 1;
            clips.splice(targetIndex, 0, moving);
        }

        selectedType = 'video';
        selectedId = moving.id;
        syncVideoLayer();
        renderTimeline();
        restorePlayheadAnchor(anchor, false);
        restartLayerAudioIfPlaying();
    }

    function selectElement(type, id) {
        selectedType = type;
        selectedId = id;

        if (type === 'video') {
            const span = getSpanByClipId(id);
            if (span) activeClipId = id;
        }

        renderTimeline();
    }

    function toggleClipMute(id) {
        const clip = clips.find((item) => item.id === id);
        if (!clip || clip.audioDetached) return;

        const anchor = capturePlayheadAnchor();
        pushUndoState();
        clip.muted = !clip.muted;

        if (activeClipId === clip.id) applyActiveVideoClip(clip);

        renderTimeline();
        restorePlayheadAnchor(anchor, false);
        restartLayerAudioIfPlaying();
    }

    function deleteElement(type = selectedType, id = selectedId) {
        if (exportJob || !id) return;

        pushUndoState();
        pauseTimelinePlayback();

        if (type === 'video') {
            const index = clips.findIndex((clip) => clip.id === id);
            if (index >= 0) clips.splice(index, 1);
            syncVideoLayer();

            if (!clips.length) {
                selectedType = null;
                selectedId = null;
                activeClipId = null;
                logicalTime = 0;
                renderTimeline();
                return;
            }

            const next = clips[Math.min(index, clips.length - 1)];
            selectedType = 'video';
            selectedId = next.id;
            activeClipId = next.id;

            const span = getSpanByClipId(next.id);
            logicalTime = span?.start || 0;
            applyActiveVideoClip(next);
            seekVideoTo(next.sourceStart);
        } else if (type === 'image') {
            imageClips = imageClips.filter((asset) => asset.id !== id);
            removeItemFromLayers('image', id);
            selectedType = 'video';
            selectedId = activeClipId || clips[0]?.id || null;
        } else if (type === 'audio') {
            audioClips = audioClips.filter((asset) => asset.id !== id);
            removeItemFromLayers('audio', id);
            selectedType = 'video';
            selectedId = activeClipId || clips[0]?.id || null;
        }

        renderTimeline();
    }

    function updatePlayheadVisual() {
        const total = getTimelineDuration();
        const workspaceRect = timelineWorkspace.getBoundingClientRect();
        const referenceTrack = getReferenceTrack();
        const trackRect = referenceTrack?.getBoundingClientRect();

        if (!total || !workspaceRect.width || !trackRect?.width) {
            playhead.style.left = '82px';
            playheadTimeLabel.textContent = '0:00.00';
            updatePreviewScene();
            return;
        }

        const ratio = clamp(logicalTime / total, 0, 1);
        const left = trackRect.left - workspaceRect.left + ratio * trackRect.width;
        playhead.style.left = `${left}px`;
        playheadTimeLabel.textContent = formatTime(logicalTime);
        updatePreviewScene();
    }

    function logicalTimeFromClientX(clientX) {
        const rect = getReferenceTrack()?.getBoundingClientRect();
        const total = getTimelineDuration();
        if (!rect?.width || !total) return 0;
        return clamp((clientX - rect.left) / rect.width, 0, 1) * total;
    }

    function snapLogicalTime(time) {
        const total = getTimelineDuration();
        const rect = getReferenceTrack()?.getBoundingClientRect();

        if (!total || !rect?.width) return { time: 0, snapped: false };

        const threshold = total * SNAP_PIXELS / rect.width;
        const boundaries = [0, total];

        getTimelineSpans().forEach((span, index, spans) => {
            if (index < spans.length - 1) boundaries.push(span.end);
        });

        let nearest = time;
        let distance = Infinity;

        boundaries.forEach((boundary) => {
            const candidate = Math.abs(time - boundary);
            if (candidate < distance) {
                distance = candidate;
                nearest = boundary;
            }
        });

        if (distance <= threshold) return { time: nearest, snapped: true };
        return { time, snapped: false };
    }

    function seekVideoTo(sourceTime) {
        internalSeek = true;
        video.currentTime = clamp(sourceTime, 0, Math.max(0, sourceDuration));
    }

    function seekLogical(time, { snap = true, select = false } = {}) {
        const total = getTimelineDuration();
        if (!total) return;

        const requested = clamp(time, 0, total);
        const snapped = snap ? snapLogicalTime(requested) : { time: requested, snapped: false };

        logicalTime = snapped.time;
        timelinePane.classList.toggle('is-snapping', snapped.snapped);

        const span = findSpanAtTimelineTime(logicalTime);
        if (!span) {
            updatePlayheadVisual();
            return;
        }

        activeClipId = span.clip.id;
        if (select) {
            selectedType = 'video';
            selectedId = span.clip.id;
        }

        const offset = clamp(logicalTime - span.start, 0, getClipDuration(span.clip));
        const sourceTime = span.clip.sourceStart + offset * span.clip.speed;

        applyActiveVideoClip(span.clip);
        seekVideoTo(sourceTime);

        if (select) renderTimeline();
        updatePlayheadVisual();
    }

    function movePlayheadFromPointer(event, cutAfter = false) {
        seekLogical(logicalTimeFromClientX(event.clientX), { snap: true, select: false });
        if (cutAfter) splitAtPlayhead();
    }

    function splitAtPlayhead() {
        const span = findSpanAtTimelineTime(logicalTime);
        if (!span) return;

        const clip = span.clip;
        const sourceCut = clip.sourceStart + (logicalTime - span.start) * clip.speed;

        if (
            sourceCut <= clip.sourceStart + MIN_CLIP_SECONDS
            || sourceCut >= clip.sourceEnd - MIN_CLIP_SECONDS
        ) {
            setStatus('クリップ端ではこれ以上カットできません。');
            return;
        }

        const index = clips.findIndex((item) => item.id === clip.id);
        pushUndoState();

        const left = {
            ...clip,
            sourceEnd: sourceCut,
        };
        const right = createVideoClip(sourceCut, clip.sourceEnd, {
            muted: clip.muted,
            audioDetached: clip.audioDetached,
            speed: clip.speed,
            filter: clip.filter,
            filterStrength: clip.filterStrength,
        });

        clips.splice(index, 1, left, right);
        syncVideoLayer();
        selectedType = 'video';
        selectedId = right.id;
        activeClipId = right.id;
        setStatus('');
        renderTimeline();

        const rightSpan = getSpanByClipId(right.id);
        if (rightSpan) {
            logicalTime = rightSpan.start;
            applyActiveVideoClip(right);
            seekVideoTo(right.sourceStart);
            updatePlayheadVisual();
        }
    }

    function applySelectedClipBoundary(kind, value) {
        const clip = getSelectedVideoClip();
        if (!clip || !Number.isFinite(value)) return;

        const anchor = capturePlayheadAnchor();

        const nextStart = kind === 'start'
            ? clamp(value, 0, clip.sourceEnd - MIN_CLIP_SECONDS)
            : clip.sourceStart;
        const nextEnd = kind === 'end'
            ? clamp(value, clip.sourceStart + MIN_CLIP_SECONDS, sourceDuration)
            : clip.sourceEnd;

        if (
            Math.abs(nextStart - clip.sourceStart) <= EPSILON
            && Math.abs(nextEnd - clip.sourceEnd) <= EPSILON
        ) {
            updateInspector();
            return;
        }

        pushUndoState();
        clip.sourceStart = nextStart;
        clip.sourceEnd = nextEnd;

        renderTimeline();

        if (anchor?.clipId === clip.id) {
            anchor.sourceTime = clamp(anchor.sourceTime, clip.sourceStart, clip.sourceEnd);
        }
        restorePlayheadAnchor(anchor, true);
    }

    function resetClips(seek = true) {
        if (!sourceDuration) return;

        clipIdCounter = 1;
        assetIdCounter = 1;
        layerIdCounter = 1;
        clips = [createVideoClip(0, sourceDuration)];
        imageClips = [];
        audioClips = [];
        layers = [];
        createLayer(
            clips.map((clip) => ({ type: 'video', id: clip.id })),
            { baseVideo: true, atTop: false },
        );
        selectedType = 'video';
        selectedId = clips[0].id;
        activeClipId = clips[0].id;
        logicalTime = 0;
        sourceAudioBuffer = null;
        sourceAudioDecodePromise = null;
        applyActiveVideoClip(clips[0]);
        setStatus('');
        renderTimeline();

        if (seek) seekVideoTo(0);
    }

    function syncLogicalFromVideo() {
        const clip = clips.find((item) => item.id === activeClipId);
        const span = clip ? getSpanByClipId(clip.id) : null;
        if (!clip || !span) return;

        const relative = clamp(
            (video.currentTime - clip.sourceStart) / Math.max(.01, clip.speed),
            0,
            getClipDuration(clip),
        );

        logicalTime = span.start + relative;
        updatePlayheadVisual();
    }

    function cancelPlaybackFrameMonitor() {
        if (
            playbackFrameCallbackId !== null
            && typeof video.cancelVideoFrameCallback === 'function'
        ) {
            video.cancelVideoFrameCallback(playbackFrameCallbackId);
        }

        playbackFrameCallbackId = null;
    }

    function schedulePlaybackFrameMonitor() {
        if (
            !playingTimeline
            || video.paused
            || transitioningClip
            || playbackFrameCallbackId !== null
            || typeof video.requestVideoFrameCallback !== 'function'
        ) {
            return;
        }

        playbackFrameCallbackId = video.requestVideoFrameCallback((_now, metadata) => {
            playbackFrameCallbackId = null;

            if (!playingTimeline || video.paused || transitioningClip) return;

            const clip = clips.find((item) => item.id === activeClipId);
            if (!clip) return;

            const mediaTime = Number.isFinite(metadata?.mediaTime)
                ? metadata.mediaTime
                : video.currentTime;

            if (mediaTime >= clip.sourceEnd - EPSILON) {
                transitioningClip = true;
                advanceToNextClip().finally(() => {
                    transitioningClip = false;
                    schedulePlaybackFrameMonitor();
                });
                return;
            }

            syncLogicalFromVideo();
            renderMosaicPreviewIfNeeded();
            schedulePlaybackFrameMonitor();
        });
    }

    async function advanceToNextClip() {
        const spans = getTimelineSpans();
        const index = spans.findIndex((span) => span.clip.id === activeClipId);

        if (index < 0 || index >= spans.length - 1) {
            pauseTimelinePlayback();
            logicalTime = getTimelineDuration();
            updatePlayheadVisual();
            return;
        }

        const current = spans[index];
        const next = spans[index + 1];
        const sourceIsContinuous = (
            Math.abs(current.clip.sourceEnd - next.clip.sourceStart)
            <= SEAMLESS_SOURCE_EPSILON
        );

        activeClipId = next.clip.id;
        applyActiveVideoClip(next.clip);

        if (sourceIsContinuous) {
            const carriedOffset = clamp(
                (video.currentTime - next.clip.sourceStart) / Math.max(.01, next.clip.speed),
                0,
                getClipDuration(next.clip),
            );
            logicalTime = next.start + carriedOffset;
            updatePlayheadVisual();
            return;
        }

        logicalTime = next.start;
        seekVideoTo(next.clip.sourceStart);
        updatePlayheadVisual();

        if (playingTimeline && video.paused) {
            try {
                await video.play();
            } catch {
                pauseTimelinePlayback();
            }
        }
    }

    async function startTimelinePlayback() {
        const total = getTimelineDuration();
        if (!total) return;

        if (logicalTime >= total - MIN_CLIP_SECONDS) {
            seekLogical(0, { snap: false });
        } else {
            seekLogical(logicalTime, { snap: false });
        }

        playingTimeline = true;
        setPreviewButtonState(true);
        await scheduleLayerAudioPlayback(logicalTime);

        try {
            await video.play();
        } catch {
            pauseTimelinePlayback();
        }
    }

    function pauseTimelinePlayback() {
        playingTimeline = false;
        cancelPlaybackFrameMonitor();
        stopPreviewLayerAudio();
        if (!video.paused) video.pause();
        setPreviewButtonState(false);
    }

    async function loadFile(file) {
        if (
            !file
            || (!file.type.startsWith('video/') && !/\.(mp4|m4v|mov|webm|mkv)$/i.test(file.name))
        ) {
            return;
        }

        if (exportJob) return;

        currentFile = file;
        clips = [];
        imageClips = [];
        audioClips = [];
        layers = [];
        layerIdCounter = 1;
        sourceFps = 30;
        selectedType = null;
        selectedId = null;
        activeClipId = null;
        logicalTime = 0;
        sourceDuration = 0;
        sourceFps = 30;
        resolutionSelect.value = 'source';
        fpsSelect.value = 'source';
        customResolution.hidden = true;
        sourceAudioBuffer = null;
        sourceAudioDecodePromise = null;
        undoStack = [];
        redoStack = [];
        exportButton.disabled = true;

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

    function getDecodeAudioContext() {
        if (!decodeAudioContext) {
            decodeAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return decodeAudioContext;
    }

    async function ensureSourceAudioBuffer() {
        if (sourceAudioBuffer) return sourceAudioBuffer;
        if (sourceAudioDecodePromise) return sourceAudioDecodePromise;
        if (!currentFile) return null;

        sourceAudioDecodePromise = (async () => {
            const {
                Input,
                ALL_FORMATS,
                BlobSource,
                AudioBufferSink,
            } = Mediabunny;

            const input = new Input({
                formats: ALL_FORMATS,
                source: new BlobSource(currentFile),
            });

            try {
                const track = await input.getPrimaryAudioTrack();
                if (!track || !await track.canDecode()) return null;

                const sink = new AudioBufferSink(track);
                const chunks = [];

                for await (const wrapped of sink.buffers()) {
                    chunks.push(wrapped);
                }

                if (!chunks.length) return null;

                const sampleRate = chunks[0].buffer.sampleRate;
                const channels = Math.max(...chunks.map((chunk) => chunk.buffer.numberOfChannels));
                const maxEnd = Math.max(...chunks.map((chunk) => chunk.timestamp + chunk.duration));
                const length = Math.max(1, Math.ceil(maxEnd * sampleRate));
                const merged = getDecodeAudioContext().createBuffer(
                    channels,
                    length,
                    sampleRate,
                );

                chunks.forEach((chunk) => {
                    const offset = Math.max(0, Math.round(chunk.timestamp * sampleRate));

                    for (let channel = 0; channel < channels; channel++) {
                        const sourceChannel = chunk.buffer.getChannelData(
                            Math.min(channel, chunk.buffer.numberOfChannels - 1),
                        );
                        const destination = merged.getChannelData(channel);
                        destination.set(
                            sourceChannel.subarray(0, Math.max(0, destination.length - offset)),
                            offset,
                        );
                    }
                });

                sourceAudioBuffer = merged;
                return merged;
            } finally {
                input.dispose();
                sourceAudioDecodePromise = null;
            }
        })();

        return sourceAudioDecodePromise;
    }

    async function addImageFile(file) {
        if (!file || !file.type.startsWith('image/') || !getTimelineDuration()) return;

        try {
            const bitmap = await createImageBitmap(file);
            const url = URL.createObjectURL(file);
            assetObjectUrls.add(url);

            const total = getTimelineDuration();
            const start = clamp(logicalTime, 0, Math.max(0, total - .1));
            const duration = Math.max(.1, Math.min(5, total - start));

            pushUndoState();

            const asset = {
                id: createAssetId('image'),
                type: 'image',
                name: file.name,
                url,
                bitmap,
                start,
                duration,
                opacity: 1,
                x: 0.5,
                y: 0.5,
                width: 0.38,
            };

            imageClips.push(asset);
            addLayerForItem('image', asset.id);
            selectedType = 'image';
            selectedId = asset.id;
            renderTimeline();
        } catch (error) {
            console.error(error);
            setStatus('画像を読み込めませんでした。', 'error');
        }
    }

    async function decodeExternalAudio(file) {
        const context = getDecodeAudioContext();
        const arrayBuffer = await file.arrayBuffer();
        return context.decodeAudioData(arrayBuffer.slice(0));
    }

    async function addAudioFile(file) {
        if (!file || !getTimelineDuration()) return;

        try {
            const buffer = await decodeExternalAudio(file);
            const total = getTimelineDuration();
            const start = clamp(logicalTime, 0, Math.max(0, total - .1));
            const duration = Math.max(.1, Math.min(buffer.duration, total - start));

            pushUndoState();

            const asset = {
                id: createAssetId('audio'),
                type: 'audio',
                kind: 'external',
                name: file.name,
                buffer,
                start,
                duration,
                sourceStart: 0,
                sourceEnd: Math.min(buffer.duration, duration),
                speed: 1,
                muted: false,
                volume: 1,
            };

            audioClips.push(asset);
            addLayerForItem('audio', asset.id);
            selectedType = 'audio';
            selectedId = asset.id;
            renderTimeline();
        } catch (error) {
            console.error(error);
            setStatus('音声を読み込めませんでした。', 'error');
        }
    }

    async function separateSelectedAudio() {
        const clip = getSelectedVideoClip();
        if (!clip || clip.audioDetached) return;

        separateAudioButton.disabled = true;
        separateAudioButton.textContent = '音声を解析中…';

        try {
            const buffer = await ensureSourceAudioBuffer();
            if (!buffer) {
                setStatus('この動画には分離できる音声トラックがありません。', 'error');
                updateInspector();
                return;
            }

            const span = getSpanByClipId(clip.id);
            if (!span) return;

            pushUndoState();

            clip.audioDetached = true;

            const audioAsset = {
                id: createAssetId('audio'),
                type: 'audio',
                kind: 'detached',
                linkedVideoId: clip.id,
                name: `${fileName.textContent || 'Video'} audio`,
                buffer,
                start: span.start,
                duration: getClipDuration(clip),
                sourceStart: clip.sourceStart,
                sourceEnd: clip.sourceEnd,
                speed: clip.speed,
                muted: false,
                volume: 1,
            };

            audioClips.push(audioAsset);
            addLayerForItem('audio', audioAsset.id);
            applyActiveVideoClip(clip);
            selectedType = 'audio';
            selectedId = audioAsset.id;
            renderTimeline();
            restartLayerAudioIfPlaying();
        } catch (error) {
            console.error(error);
            setStatus('音声分離に失敗しました。', 'error');
        } finally {
            updateInspector();
        }
    }

    function getPreviewAudioContext() {
        if (!previewAudioContext) {
            previewAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return previewAudioContext;
    }

    function stopPreviewLayerAudio() {
        previewAudioNodes.forEach((node) => {
            try { node.stop(); } catch {}
            try { node.disconnect(); } catch {}
        });
        previewAudioNodes = [];
    }

    async function scheduleLayerAudioPlayback(fromTime) {
        stopPreviewLayerAudio();
        if (!audioClips.length) return;

        const context = getPreviewAudioContext();
        if (context.state === 'suspended') await context.resume();

        const now = context.currentTime;

        audioClips.forEach((asset) => {
            if (asset.muted || !asset.buffer) return;

            const assetEnd = asset.start + asset.duration;
            if (assetEnd <= fromTime + EPSILON) return;

            const source = context.createBufferSource();
            source.buffer = asset.buffer;
            source.playbackRate.value = asset.speed || 1;

            const gain = context.createGain();
            gain.gain.value = clamp(asset.volume ?? 1, 0, 2);

            source.connect(gain);
            gain.connect(context.destination);

            const timelineOffset = Math.max(0, fromTime - asset.start);
            const startDelay = Math.max(0, asset.start - fromTime);
            const sourceOffset = asset.sourceStart + timelineOffset * (asset.speed || 1);
            const sourceAvailable = Math.max(0, asset.sourceEnd - sourceOffset);

            if (sourceAvailable <= EPSILON) return;

            try {
                source.start(now + startDelay, sourceOffset, sourceAvailable);
                previewAudioNodes.push(source);
            } catch (error) {
                console.warn('Unable to schedule audio layer', error);
            }
        });
    }

    function restartLayerAudioIfPlaying() {
        if (playingTimeline && !video.paused) {
            scheduleLayerAudioPlayback(logicalTime);
        }
    }

    function beginImageStageTransform(event, asset, mode, wrapper) {
        if (event.button !== 0) return;

        event.preventDefault();
        event.stopPropagation();
        selectElement('image', asset.id);
        pushUndoState();

        const stageRect = imageOverlayStage.getBoundingClientRect();
        if (!stageRect.width || !stageRect.height) return;

        const pointerId = event.pointerId;
        const startX = event.clientX;
        const startY = event.clientY;
        const originalX = asset.x ?? 0.5;
        const originalY = asset.y ?? 0.5;
        const originalWidth = asset.width ?? 0.38;

        wrapper.setPointerCapture(pointerId);

        const move = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;

            if (mode === 'move') {
                asset.x = clamp(originalX + dx / stageRect.width, 0, 1);
                asset.y = clamp(originalY + dy / stageRect.height, 0, 1);
            } else {
                asset.width = clamp(
                    originalWidth + dx / stageRect.width * 1.6,
                    0.05,
                    1.5,
                );
            }

            wrapper.style.left = `${asset.x * 100}%`;
            wrapper.style.top = `${asset.y * 100}%`;
            wrapper.style.width = `${asset.width * 100}%`;
        };

        const finish = () => {
            wrapper.removeEventListener('pointermove', move);
            wrapper.removeEventListener('pointerup', finish);
            wrapper.removeEventListener('pointercancel', finish);
            updatePreviewScene();
        };

        wrapper.addEventListener('pointermove', move);
        wrapper.addEventListener('pointerup', finish);
        wrapper.addEventListener('pointercancel', finish);
    }

    function renderImageOverlays() {
        imageOverlayStage.replaceChildren();

        imageClips
            .filter((asset) => (
                logicalTime >= asset.start - EPSILON
                && logicalTime < asset.start + asset.duration - EPSILON
            ))
            .forEach((asset) => {
                const layer = findLayerForItem('image', asset.id);
                const wrapper = document.createElement('div');
                wrapper.className = 'scene-image-wrapper';
                wrapper.style.left = `${(asset.x ?? .5) * 100}%`;
                wrapper.style.top = `${(asset.y ?? .5) * 100}%`;
                wrapper.style.width = `${(asset.width ?? .38) * 100}%`;
                wrapper.style.zIndex = String(getLayerZIndex(layer?.id));

                if (selectedType === 'image' && selectedId === asset.id) {
                    wrapper.classList.add('is-selected');
                }

                const img = document.createElement('img');
                img.className = 'scene-image';
                img.src = asset.url;
                img.alt = '';
                img.style.opacity = String(asset.opacity ?? 1);
                wrapper.appendChild(img);

                wrapper.addEventListener('pointerdown', (event) => {
                    if (event.target.closest('.scene-image-resize')) return;
                    beginImageStageTransform(event, asset, 'move', wrapper);
                });

                if (selectedType === 'image' && selectedId === asset.id) {
                    const resize = document.createElement('span');
                    resize.className = 'scene-image-resize';
                    resize.title = 'ドラッグでリサイズ';
                    resize.addEventListener('pointerdown', (event) => {
                        beginImageStageTransform(event, asset, 'resize', wrapper);
                    });
                    wrapper.appendChild(resize);
                }

                imageOverlayStage.appendChild(wrapper);
            });
    }

    function renderMosaicPreviewIfNeeded() {
        const span = findSpanAtTimelineTime(logicalTime);
        const clip = span?.clip;

        if (!clip || clip.filter !== 'mosaic' || !video.videoWidth || !video.videoHeight) {
            effectCanvas.hidden = true;
            return;
        }

        const strength = clamp((clip.filterStrength || 50) / 100, 0, 1);
        const blockSize = Math.max(3, Math.round(4 + strength * 38));
        const width = video.videoWidth;
        const height = video.videoHeight;

        effectCanvas.width = width;
        effectCanvas.height = height;

        if (!mosaicBufferCanvas) mosaicBufferCanvas = document.createElement('canvas');

        const smallWidth = Math.max(1, Math.round(width / blockSize));
        const smallHeight = Math.max(1, Math.round(height / blockSize));

        mosaicBufferCanvas.width = smallWidth;
        mosaicBufferCanvas.height = smallHeight;

        const smallCtx = mosaicBufferCanvas.getContext('2d');
        const ctx = effectCanvas.getContext('2d');

        smallCtx.clearRect(0, 0, smallWidth, smallHeight);
        smallCtx.drawImage(video, 0, 0, smallWidth, smallHeight);

        ctx.clearRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(mosaicBufferCanvas, 0, 0, width, height);
        ctx.imageSmoothingEnabled = true;
        effectCanvas.hidden = false;
    }

    function updatePreviewScene() {
        const span = findSpanAtTimelineTime(logicalTime);
        const clip = span?.clip;
        const videoLayer = clip ? findLayerForItem('video', clip.id) : getVideoLayer();
        const videoZ = getLayerZIndex(videoLayer?.id);

        video.style.zIndex = String(videoZ);
        effectCanvas.style.zIndex = String(videoZ + 1);

        if (clip) applyActiveVideoClip(clip);
        renderImageOverlays();
        renderMosaicPreviewIfNeeded();
    }

    function getExportSize() {
        if (resolutionSelect.value === 'source') {
            return {
                width: Math.max(16, sourceWidth),
                height: Math.max(16, sourceHeight),
            };
        }

        if (resolutionSelect.value === 'custom') {
            return {
                width: clamp(Math.round(Number(exportWidthInput.value) || 1920), 16, 7680),
                height: clamp(Math.round(Number(exportHeightInput.value) || 1080), 16, 4320),
            };
        }

        const [width, height] = resolutionSelect.value.split('x').map(Number);
        return { width, height };
    }

    function getExportFps() {
        if (fpsSelect.value === 'source') {
            return clamp(sourceFps || 30, 1, 120);
        }

        return clamp(Number(fpsSelect.value) || sourceFps || 30, 1, 120);
    }

    function formatFps(value) {
        const rounded = Math.round(value * 100) / 100;
        return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
    }

    function updateSourceOutputLabels() {
        const sourceOption = fpsSelect.querySelector('option[value="source"]');
        if (sourceOption) {
            sourceOption.textContent = `元動画 (${formatFps(sourceFps)} fps)`;
        }

        fileMeta.textContent = (
            `${formatBytes(currentFile?.size || 0)} · ${sourceWidth}×${sourceHeight} · ${formatFps(sourceFps)}fps · ${formatTime(sourceDuration)}`
        );
    }

    async function detectSourceFrameRate(file) {
        if (!file) return;

        const {
            Input,
            ALL_FORMATS,
            BlobSource,
        } = Mediabunny;

        const input = new Input({
            formats: ALL_FORMATS,
            source: new BlobSource(file),
        });

        try {
            const track = await input.getPrimaryVideoTrack();
            if (!track) return;

            const metrics = await track.computeFrameRateMetrics({
                targetPacketCount: 256,
            });

            if (Number.isFinite(metrics.bestGuessFrameRate) && metrics.bestGuessFrameRate > 0) {
                sourceFps = clamp(metrics.bestGuessFrameRate, 1, 120);
            }
        } catch (error) {
            console.warn('Unable to detect source frame rate', error);
        } finally {
            input.dispose();
            updateSourceOutputLabels();
        }
    }

    async function yieldToBrowser() {
        if (globalThis.scheduler?.yield) {
            await globalThis.scheduler.yield();
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    function drawContained(source, context, width, height) {
        const sourceWidth = source.videoWidth || source.width || source.displayWidth || width;
        const sourceHeight = source.videoHeight || source.height || source.displayHeight || height;
        const scale = Math.min(width / sourceWidth, height / sourceHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;
        const x = (width - drawWidth) / 2;
        const y = (height - drawHeight) / 2;

        context.drawImage(source, x, y, drawWidth, drawHeight);
    }

    function drawMosaicSource(source, context, width, height, strength) {
        const blockSize = Math.max(3, Math.round(4 + strength * 38));
        const smallWidth = Math.max(1, Math.round(width / blockSize));
        const smallHeight = Math.max(1, Math.round(height / blockSize));
        const small = typeof OffscreenCanvas === 'function'
            ? new OffscreenCanvas(smallWidth, smallHeight)
            : document.createElement('canvas');

        small.width = smallWidth;
        small.height = smallHeight;
        const smallContext = small.getContext('2d');

        smallContext.fillStyle = '#000';
        smallContext.fillRect(0, 0, smallWidth, smallHeight);
        drawContained(source, smallContext, smallWidth, smallHeight);

        context.imageSmoothingEnabled = false;
        context.drawImage(small, 0, 0, width, height);
        context.imageSmoothingEnabled = true;
    }

    function drawImageAssetsAt(context, time, width, height) {
        imageClips
            .filter((asset) => time >= asset.start && time < asset.start + asset.duration)
            .forEach((asset) => {
                const bitmap = asset.bitmap;
                if (!bitmap) return;

                const maxWidth = width * .38;
                const maxHeight = height * .65;
                const scale = Math.min(maxWidth / bitmap.width, maxHeight / bitmap.height);
                const drawWidth = bitmap.width * scale;
                const drawHeight = bitmap.height * scale;

                context.globalAlpha = asset.opacity ?? 1;
                context.drawImage(
                    bitmap,
                    (width - drawWidth) / 2,
                    (height - drawHeight) / 2,
                    drawWidth,
                    drawHeight,
                );
                context.globalAlpha = 1;
            });
    }

    async function saveSnapshot() {
        if (!currentFile || !video.videoWidth) return;

        const { width, height } = getExportSize();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        const span = findSpanAtTimelineTime(logicalTime);
        const clip = span?.clip;

        context.fillStyle = '#000';
        context.fillRect(0, 0, width, height);

        if (clip?.filter === 'mosaic') {
            drawMosaicSource(
                video,
                context,
                width,
                height,
                clamp((clip.filterStrength || 50) / 100, 0, 1),
            );
        } else {
            context.filter = getFilterCss(clip);
            drawContained(video, context, width, height);
            context.filter = 'none';
        }

        drawImageAssetsAt(context, logicalTime, width, height);

        const mimeType = snapshotFormat.value === 'jpeg' ? 'image/jpeg' : 'image/png';
        const extension = snapshotFormat.value === 'jpeg' ? 'jpg' : 'png';

        canvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `scene-${formatTime(logicalTime).replace(/[:.]/g, '-') }.${extension}`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
        }, mimeType, .95);
    }

    async function chooseExportPreset(hasAudio) {
        const {
            getFirstEncodableVideoCodec,
            getFirstEncodableAudioCodec,
            Mp4OutputFormat,
            WebMOutputFormat,
        } = Mediabunny;

        const avc = await getFirstEncodableVideoCodec(['avc']);
        const aac = hasAudio ? await getFirstEncodableAudioCodec(['aac']) : 'aac';

        if (avc && aac) {
            return {
                format: new Mp4OutputFormat(),
                extension: 'mp4',
                mimeType: 'video/mp4',
                videoCodec: avc,
                audioCodec: hasAudio ? aac : null,
            };
        }

        const vp = await getFirstEncodableVideoCodec(['vp9', 'vp8']);
        const opus = hasAudio ? await getFirstEncodableAudioCodec(['opus']) : 'opus';

        if (vp && opus) {
            return {
                format: new WebMOutputFormat(),
                extension: 'webm',
                mimeType: 'video/webm',
                videoCodec: vp,
                audioCodec: hasAudio ? opus : null,
            };
        }

        throw new Error('このブラウザで利用可能な動画エンコーダーが見つかりません。');
    }

    async function renderProjectAudio(totalDuration) {
        const needsSourceAudio = clips.some((clip) => !clip.muted && !clip.audioDetached);
        let originalAudio = null;

        if (needsSourceAudio) originalAudio = await ensureSourceAudioBuffer();

        const hasLayerAudio = audioClips.some((asset) => !asset.muted && asset.buffer);
        if (!originalAudio && !hasLayerAudio) return null;

        const sampleRate = 48000;
        const length = Math.max(1, Math.ceil(totalDuration * sampleRate));
        const context = new OfflineAudioContext(2, length, sampleRate);

        const scheduleBuffer = ({
            buffer,
            when,
            sourceStart,
            sourceEnd,
            speed = 1,
            volume = 1,
        }) => {
            if (!buffer || sourceEnd <= sourceStart || when >= totalDuration) return;

            const source = context.createBufferSource();
            source.buffer = buffer;
            source.playbackRate.value = Math.max(.01, speed);

            const gain = context.createGain();
            gain.gain.value = clamp(volume, 0, 2);

            source.connect(gain);
            gain.connect(context.destination);

            try {
                source.start(
                    Math.max(0, when),
                    Math.max(0, sourceStart),
                    Math.max(0, sourceEnd - sourceStart),
                );
            } catch (error) {
                console.warn('Unable to schedule export audio', error);
            }
        };

        const spans = getTimelineSpans();

        if (originalAudio) {
            spans.forEach((span) => {
                const clip = span.clip;
                if (clip.muted || clip.audioDetached) return;

                scheduleBuffer({
                    buffer: originalAudio,
                    when: span.start,
                    sourceStart: clip.sourceStart,
                    sourceEnd: clip.sourceEnd,
                    speed: clip.speed,
                    volume: 1,
                });
            });
        }

        audioClips.forEach((asset) => {
            if (asset.muted) return;

            scheduleBuffer({
                buffer: asset.buffer,
                when: asset.start,
                sourceStart: asset.sourceStart,
                sourceEnd: asset.sourceEnd,
                speed: asset.speed,
                volume: asset.volume,
            });
        });

        return context.startRendering();
    }

    function createExportFrameProcessor(width, height) {
        let canvas = null;
        let context = null;

        return (sample) => {
            if (!canvas) {
                canvas = typeof OffscreenCanvas === 'function'
                    ? new OffscreenCanvas(width, height)
                    : document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                context = canvas.getContext('2d');
            }

            const span = findSpanAtTimelineTime(sample.timestamp);
            const clip = span?.clip;

            context.filter = 'none';
            context.globalAlpha = 1;
            context.fillStyle = '#000';
            context.fillRect(0, 0, width, height);

            if (clip?.filter === 'mosaic') {
                drawMosaicSource(
                    sample.toCanvasImageSource(),
                    context,
                    width,
                    height,
                    clamp((clip.filterStrength || 50) / 100, 0, 1),
                );
            } else {
                context.filter = getFilterCss(clip);
                sample.drawWithFit(context, { fit: 'contain' });
                context.filter = 'none';
            }

            drawImageAssetsAt(context, sample.timestamp, width, height);
            return canvas;
        };
    }

    async function exportEditedTimeline() {
        if (!currentFile || !clips.length || !getTimelineDuration()) return;

        const {
            Input,
            ALL_FORMATS,
            BlobSource,
            Output,
            BufferTarget,
            VideoSampleSink,
            VideoSampleSource,
            AudioBufferSource,
            Quality,
        } = Mediabunny;

        exportButton.disabled = true;
        replaceButton.disabled = true;
        cancelButton.hidden = false;
        progressBlock.hidden = false;
        formatBadge.hidden = false;
        progressBar.value = 0;
        progressPercent.textContent = '0%';
        progressLabel.textContent = 'メディアを解析中…';
        setStatus('');
        cancelledByUser = false;

        const input = new Input({
            formats: ALL_FORMATS,
            source: new BlobSource(currentFile),
        });

        let output = null;
        let videoSource = null;
        let audioSource = null;

        try {
            const videoTrack = await input.getPrimaryVideoTrack();
            if (!videoTrack || !await videoTrack.canDecode()) {
                throw new Error('動画トラックをデコードできません。');
            }

            const total = getTimelineDuration();
            const mixedAudio = await renderProjectAudio(total);
            const preset = await chooseExportPreset(Boolean(mixedAudio));
            const { width, height } = getExportSize();
            const fps = clamp(Number(fpsSelect.value) || 30, 1, 120);
            const processFrame = createExportFrameProcessor(width, height);

            formatBadge.textContent = `${preset.extension.toUpperCase()} · ${width}×${height} · ${fps}fps`;

            const target = new BufferTarget();
            output = new Output({
                format: preset.format,
                target,
            });

            videoSource = new VideoSampleSource({
                codec: preset.videoCodec,
                quality: new Quality('high'),
                keyFrameInterval: 1,
                transform: {
                    frameRate: fps,
                    process: processFrame,
                    force: true,
                },
            });
            output.addVideoTrack(videoSource, { frameRate: fps });

            if (mixedAudio && preset.audioCodec) {
                audioSource = new AudioBufferSource({
                    codec: preset.audioCodec,
                    quality: new Quality('high'),
                });
                output.addAudioTrack(audioSource);
            }

            exportJob = {
                cancel: async () => {
                    cancelledByUser = true;
                    input.dispose();
                    if (output && (output.state === 'pending' || output.state === 'started')) {
                        await output.cancel();
                    }
                },
            };

            await output.start();

            const audioPromise = mixedAudio && audioSource
                ? audioSource.add(mixedAudio).then(() => audioSource.close())
                : Promise.resolve();

            const videoSink = new VideoSampleSink(videoTrack);
            let outputOffset = 0;
            progressLabel.textContent = 'タイムラインを書き出し中…';

            for (const clip of clips) {
                if (cancelledByUser) throw new Error('canceled');

                const iterator = videoSink.samples(
                    clip.sourceStart,
                    clip.sourceEnd,
                )[Symbol.asyncIterator]();

                let result = await iterator.next();
                let firstVideoSample = true;

                while (!result.done) {
                    if (cancelledByUser) throw new Error('canceled');

                    const sample = result.value;
                    const overlapStart = Math.max(sample.timestamp, clip.sourceStart);
                    const overlapEnd = Math.min(sample.timestamp + sample.duration, clip.sourceEnd);

                    if (overlapEnd > overlapStart + EPSILON) {
                        sample.setTimestamp(
                            outputOffset + (overlapStart - clip.sourceStart) / clip.speed,
                        );
                        sample.setDuration((overlapEnd - overlapStart) / clip.speed);

                        await videoSource.add(sample, { keyFrame: firstVideoSample });
                        firstVideoSample = false;

                        const progress = clamp(
                            (outputOffset + (overlapEnd - clip.sourceStart) / clip.speed) / total,
                            0,
                            1,
                        );
                        progressBar.value = progress;
                        progressPercent.textContent = `${Math.round(progress * 100)}%`;
                    }

                    sample.close();
                    result = await iterator.next();
                }

                outputOffset += getClipDuration(clip);
            }

            videoSource.close();
            await audioPromise;
            await output.finalize();

            if (cancelledByUser) return;

            progressBar.value = 1;
            progressPercent.textContent = '100%';
            progressLabel.textContent = 'ダウンロードを準備中…';

            const baseName = currentFile.name.replace(/\.[^.]+$/, '') || 'video';
            const blob = new Blob([target.buffer], { type: preset.mimeType });
            const downloadUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = downloadUrl;
            anchor.download = `${baseName}-edited-${width}x${height}-${fps}fps.${preset.extension}`;
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
            exportJob = null;
            cancelButton.hidden = true;
            exportButton.disabled = !currentFile || !clips.length;
            replaceButton.disabled = false;

            try {
                if (output && output.state === 'started') await output.cancel();
            } catch {}

            try { input.dispose(); } catch {}
        }
    }

    fileInput.addEventListener('change', () => {
        const [file] = fileInput.files || [];
        if (file) loadFile(file);
        fileInput.value = '';
    });

    imageInput.addEventListener('change', () => {
        const [file] = imageInput.files || [];
        if (file) addImageFile(file);
        imageInput.value = '';
    });

    audioInput.addEventListener('change', () => {
        const [file] = audioInput.files || [];
        if (file) addAudioFile(file);
        audioInput.value = '';
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
    addImageButton.addEventListener('click', () => imageInput.click());
    addAudioButton.addEventListener('click', () => audioInput.click());

    resolutionSelect.addEventListener('change', () => {
        customResolution.hidden = resolutionSelect.value !== 'custom';

        if (resolutionSelect.value === 'source') {
            exportWidthInput.value = String(sourceWidth);
            exportHeightInput.value = String(sourceHeight);
        }
    });

    snapshotButton.addEventListener('click', saveSnapshot);

    video.addEventListener('loadedmetadata', () => {
        sourceDuration = Number.isFinite(video.duration) ? video.duration : 0;
        sourceWidth = video.videoWidth || 1920;
        sourceHeight = video.videoHeight || 1080;
        sourceFps = 30;

        resolutionSelect.value = 'source';
        fpsSelect.value = 'source';
        customResolution.hidden = true;
        exportWidthInput.value = String(sourceWidth);
        exportHeightInput.value = String(sourceHeight);
        updateSourceOutputLabels();

        formatBadge.textContent = 'MP4';
        undoStack = [];
        redoStack = [];
        resetClips(false);
        seekVideoTo(0);
        detectSourceFrameRate(currentFile);
    });

    video.addEventListener('error', () => {
        fileMeta.textContent = `${formatBytes(currentFile?.size || 0)} · プレビュー非対応`;
        setStatus('このブラウザでは動画をプレビューできません。', 'error');
    });

    video.addEventListener('seeked', () => {
        internalSeek = false;
        updatePreviewScene();

        if (playingTimeline && !video.paused) {
            scheduleLayerAudioPlayback(logicalTime);
        }
    });

    video.addEventListener('seeking', () => {
        if (internalSeek) return;

        stopPreviewLayerAudio();

        const current = video.currentTime;
        const selectedClip = getSelectedVideoClip();
        const matching = (
            selectedClip
            && current >= selectedClip.sourceStart - EPSILON
            && current <= selectedClip.sourceEnd + EPSILON
                ? selectedClip
                : clips.find((clip) => (
                    current >= clip.sourceStart - EPSILON
                    && current <= clip.sourceEnd + EPSILON
                ))
        );

        if (!matching) return;

        activeClipId = matching.id;
        const span = getSpanByClipId(matching.id);
        if (!span) return;

        logicalTime = span.start + (
            clamp(current - matching.sourceStart, 0, matching.sourceEnd - matching.sourceStart)
            / matching.speed
        );

        applyActiveVideoClip(matching);
        updatePlayheadVisual();
    });

    video.addEventListener('play', () => {
        playingTimeline = true;
        setPreviewButtonState(true);
        scheduleLayerAudioPlayback(logicalTime);
        schedulePlaybackFrameMonitor();
    });

    video.addEventListener('pause', () => {
        cancelPlaybackFrameMonitor();
        stopPreviewLayerAudio();

        if (!video.ended) {
            playingTimeline = false;
            setPreviewButtonState(false);
        }
    });

    video.addEventListener('timeupdate', () => {
        const clip = clips.find((item) => item.id === activeClipId);
        if (!clip) return;

        if (
            playingTimeline
            && typeof video.requestVideoFrameCallback !== 'function'
            && !transitioningClip
            && video.currentTime >= clip.sourceEnd - .012
        ) {
            transitioningClip = true;
            advanceToNextClip().finally(() => {
                transitioningClip = false;
            });
            return;
        }

        syncLogicalFromVideo();
        renderMosaicPreviewIfNeeded();
    });

    video.addEventListener('ended', () => {
        if (playingTimeline) advanceToNextClip();
    });

    startInput.addEventListener('change', () => {
        const parsed = parseTime(startInput.value);
        if (Number.isFinite(parsed)) applySelectedClipBoundary('start', parsed);
        else updateInspector();
    });

    endInput.addEventListener('change', () => {
        const parsed = parseTime(endInput.value);
        if (Number.isFinite(parsed)) applySelectedClipBoundary('end', parsed);
        else updateInspector();
    });

    setStartButton.addEventListener('click', () => {
        applySelectedClipBoundary('start', video.currentTime);
    });

    setEndButton.addEventListener('click', () => {
        applySelectedClipBoundary('end', video.currentTime);
    });

    speedSelect.addEventListener('change', () => {
        const clip = getSelectedVideoClip();
        if (!clip) return;

        const nextSpeed = clamp(Number(speedSelect.value) || 1, .25, 4);
        if (Math.abs(nextSpeed - clip.speed) <= EPSILON) return;

        const anchor = capturePlayheadAnchor();
        pushUndoState();
        clip.speed = nextSpeed;

        audioClips
            .filter((asset) => asset.kind === 'detached' && asset.linkedVideoId === clip.id)
            .forEach((asset) => {
                asset.speed = nextSpeed;
                asset.duration = (asset.sourceEnd - asset.sourceStart) / nextSpeed;
            });

        renderTimeline();
        restorePlayheadAnchor(anchor, true);
        restartLayerAudioIfPlaying();
    });

    filterSelect.addEventListener('change', () => {
        const clip = getSelectedVideoClip();
        if (!clip) return;

        pushUndoState();
        clip.filter = filterSelect.value;
        renderTimeline();
        updatePreviewScene();
    });

    filterStrength.addEventListener('input', () => {
        const clip = getSelectedVideoClip();
        if (!clip) return;

        clip.filterStrength = clamp(Number(filterStrength.value) || 0, 0, 100);
        filterStrengthOutput.value = `${clip.filterStrength}%`;
        filterStrengthOutput.textContent = `${clip.filterStrength}%`;
        updatePreviewScene();
    });

    filterStrength.addEventListener('change', () => {
        const clip = getSelectedVideoClip();
        if (!clip) return;
        renderTimeline();
    });

    separateAudioButton.addEventListener('click', separateSelectedAudio);

    resetRangeButton.addEventListener('click', () => {
        if (!sourceDuration || exportJob) return;

        pushUndoState();
        pauseTimelinePlayback();
        resetClips(true);
    });

    previewButton.addEventListener('click', async () => {
        if (playingTimeline && !video.paused) {
            pauseTimelinePlayback();
            return;
        }

        await startTimelinePlayback();
    });

    cutButton.addEventListener('click', splitAtPlayhead);

    playhead.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;

        event.preventDefault();
        draggingPlayhead = true;
        pauseTimelinePlayback();
        playhead.setPointerCapture(event.pointerId);
        movePlayheadFromPointer(event, false);
    });

    playhead.addEventListener('pointermove', (event) => {
        if (!draggingPlayhead) return;
        movePlayheadFromPointer(event, false);
    });

    playhead.addEventListener('pointerup', (event) => {
        if (!draggingPlayhead) return;

        draggingPlayhead = false;
        timelinePane.classList.remove('is-snapping');
        playhead.releasePointerCapture(event.pointerId);
    });

    timelineWorkspace.addEventListener('pointerdown', (event) => {
        if (
            event.button !== 0
            || event.target.closest(
                '.clip-audio-button, .clip-delete-button, .asset-delete, .asset-mute, .asset-clip',
            )
        ) {
            return;
        }

        if (event.ctrlKey) {
            event.preventDefault();
            pauseTimelinePlayback();
            movePlayheadFromPointer(event, true);
            return;
        }

        const clipElement = event.target.closest('.timeline-clip');
        if (clipElement) {
            selectElement('video', clipElement.dataset.clipId);
            return;
        }

        pauseTimelinePlayback();
        movePlayheadFromPointer(event, false);
    });

    timelineRuler.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;

        event.preventDefault();
        pauseTimelinePlayback();

        const rect = timelineRuler.getBoundingClientRect();
        const total = getTimelineDuration();
        if (!total || !rect.width) return;

        seekLogical(
            clamp((event.clientX - rect.left) / rect.width, 0, 1) * total,
            { snap: true },
        );
    });

    document.addEventListener('keydown', async (event) => {
        const target = event.target;
        const typing = (
            target instanceof HTMLInputElement
            || target instanceof HTMLTextAreaElement
            || target instanceof HTMLSelectElement
            || target?.isContentEditable
        );

        const key = event.key.toLowerCase();

        if (!typing && event.ctrlKey && !event.shiftKey && key === 'z') {
            event.preventDefault();
            undoEdit();
            return;
        }

        if (!typing && event.ctrlKey && key === 'y') {
            event.preventDefault();
            redoEdit();
            return;
        }

        if (!typing && event.key === 'Delete') {
            event.preventDefault();
            deleteElement();
            return;
        }

        if (!typing && event.ctrlKey && event.key === 'ArrowLeft') {
            event.preventDefault();
            splitAtPlayhead();
            return;
        }

        if (
            !typing
            && event.code === 'Space'
            && !event.ctrlKey
            && !event.metaKey
            && !event.altKey
        ) {
            event.preventDefault();
            if (event.repeat || !currentFile || !getTimelineDuration()) return;

            if (!video.paused) pauseTimelinePlayback();
            else await startTimelinePlayback();
        }
    });

    exportButton.addEventListener('click', exportEditedTimeline);

    cancelButton.addEventListener('click', async () => {
        if (!exportJob) return;

        cancelledByUser = true;
        cancelButton.disabled = true;
        progressLabel.textContent = 'キャンセル中…';

        try {
            await exportJob.cancel();
            setStatus('書き出しをキャンセルしました。');
            progressLabel.textContent = 'キャンセル済み';
        } catch (error) {
            console.error(error);
        } finally {
            cancelButton.disabled = false;
        }
    });

    window.addEventListener('resize', updatePlayheadVisual);

    window.addEventListener('beforeunload', () => {
        cancelPlaybackFrameMonitor();
        stopPreviewLayerAudio();

        if (objectUrl) URL.revokeObjectURL(objectUrl);
        assetObjectUrls.forEach((url) => URL.revokeObjectURL(url));

        try { decodeAudioContext?.close(); } catch {}
        try { previewAudioContext?.close(); } catch {}
    });
})();
