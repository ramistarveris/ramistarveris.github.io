import * as Mediabunny from 'https://cdn.jsdelivr.net/npm/mediabunny@1.59.0/dist/bundles/mediabunny.min.mjs';

'use strict';

(() => {
    const MIN_CLIP_SECONDS = 0.05;
    const SNAP_PIXELS = 12;
    const EPSILON = 0.001;
    const HISTORY_LIMIT = 100;

    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');
    const uploadPanel = document.getElementById('uploadPanel');
    const editor = document.getElementById('editor');
    const video = document.getElementById('video');
    const fileName = document.getElementById('fileName');
    const fileMeta = document.getElementById('fileMeta');
    const replaceButton = document.getElementById('replaceButton');

    const startInput = document.getElementById('startInput');
    const endInput = document.getElementById('endInput');
    const setStartButton = document.getElementById('setStartButton');
    const setEndButton = document.getElementById('setEndButton');
    const resetRangeButton = document.getElementById('resetRangeButton');
    const previewButton = document.getElementById('previewButton');
    const clipDurationLabel = document.getElementById('clipDuration');

    const timelinePane = document.getElementById('timelinePane');
    const timelineRuler = document.getElementById('timelineRuler');
    const timelineWorkspace = document.getElementById('timelineWorkspace');
    const clipTrack = document.getElementById('clipTrack');
    const playhead = document.getElementById('playhead');
    const playheadTimeLabel = document.getElementById('playheadTimeLabel');
    const clipCountLabel = document.getElementById('clipCountLabel');
    const cutButton = document.getElementById('cutButton');

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
    let clips = [];
    let clipIdCounter = 1;
    let selectedClipId = null;
    let activeClipId = null;
    let logicalTime = 0;
    let playingTimeline = false;
    let internalSeek = false;
    let draggingPlayhead = false;
    let draggedClipId = null;
    let exportJob = null;
    let cancelledByUser = false;
    let undoStack = [];
    let redoStack = [];

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

    function createClip(sourceStart, sourceEnd, muted = false) {
        return {
            id: `clip-${clipIdCounter++}`,
            sourceStart,
            sourceEnd,
            muted,
        };
    }

    function captureEditorState() {
        return {
            clips: clips.map((clip) => ({ ...clip })),
            clipIdCounter,
            selectedClipId,
            activeClipId,
            logicalTime,
        };
    }

    function pushUndoState() {
        if (exportJob) return;
        undoStack.push(captureEditorState());
        if (undoStack.length > HISTORY_LIMIT) {
            undoStack.shift();
        }
        redoStack = [];
    }

    function restoreEditorState(state) {
        if (!state) return;

        video.pause();
        playingTimeline = false;
        setPreviewButtonState(false);

        clips = state.clips.map((clip) => ({ ...clip }));
        clipIdCounter = state.clipIdCounter;
        logicalTime = clamp(state.logicalTime, 0, getTimelineDuration());

        selectedClipId = clips.some((clip) => clip.id === state.selectedClipId)
            ? state.selectedClipId
            : clips[0]?.id ?? null;
        activeClipId = clips.some((clip) => clip.id === state.activeClipId)
            ? state.activeClipId
            : selectedClipId;

        setStatus('');
        renderTimeline();

        if (!clips.length) {
            selectedClipId = null;
            activeClipId = null;
            logicalTime = 0;
            video.muted = false;
            exportButton.disabled = true;
            updateControlPanel();
            updatePlayheadVisual();
            return;
        }

        const span = getSpanByClipId(activeClipId)
            || findSpanAtTimelineTime(logicalTime)
            || getTimelineSpans()[0];

        activeClipId = span.clip.id;
        video.muted = span.clip.muted;

        const offset = clamp(logicalTime - span.start, 0, getClipDuration(span.clip));
        const sourceTime = span.clip.sourceStart + offset;
        seekVideoTo(sourceTime);
        updatePlayheadVisual();
    }

    function undoEdit() {
        if (exportJob || !undoStack.length) return;
        redoStack.push(captureEditorState());
        const state = undoStack.pop();
        restoreEditorState(state);
    }

    function redoEdit() {
        if (exportJob || !redoStack.length) return;
        undoStack.push(captureEditorState());
        const state = redoStack.pop();
        restoreEditorState(state);
    }

    function getClipDuration(clip) {
        return Math.max(0, clip.sourceEnd - clip.sourceStart);
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
        if (time >= total - EPSILON) {
            return spans[spans.length - 1];
        }

        return spans.find((span) => time >= span.start - EPSILON && time < span.end - EPSILON) || spans[0];
    }

    function getSelectedClip() {
        return clips.find((clip) => clip.id === selectedClipId) || null;
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
        exportButton.disabled = !currentFile || !sourceDuration || !clips.length;
        replaceButton.disabled = false;
        setStatus('');
    }

    function updateControlPanel() {
        const clip = getSelectedClip();
        const disabled = !clip;

        startInput.disabled = disabled;
        endInput.disabled = disabled;
        setStartButton.disabled = disabled;
        setEndButton.disabled = disabled;

        if (!clip) {
            startInput.value = '--';
            endInput.value = '--';
            clipDurationLabel.textContent = '--';
            return;
        }

        startInput.value = formatTime(clip.sourceStart);
        endInput.value = formatTime(clip.sourceEnd);
        clipDurationLabel.textContent = formatTime(getClipDuration(clip));
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

    function renderTimeline() {
        const total = getTimelineDuration();
        clipTrack.replaceChildren();

        clips.forEach((clip, index) => {
            const clipElement = document.createElement('article');
            clipElement.className = 'timeline-clip';
            clipElement.dataset.clipId = clip.id;
            clipElement.draggable = true;
            clipElement.style.flexGrow = String(Math.max(getClipDuration(clip), MIN_CLIP_SECONDS));
            clipElement.style.flexBasis = '0';

            if (clip.id === selectedClipId) {
                clipElement.classList.add('is-selected');
            }
            if (clip.muted) {
                clipElement.classList.add('is-muted');
            }

            const audioButton = document.createElement('button');
            audioButton.className = 'clip-audio-button';
            audioButton.type = 'button';
            audioButton.title = clip.muted ? '音声をオン' : '音声をミュート';
            audioButton.setAttribute('aria-label', audioButton.title);
            audioButton.innerHTML = `<iconify-icon icon="${clip.muted ? 'mdi:volume-off' : 'mdi:volume-high'}"></iconify-icon>`;

            const body = document.createElement('div');
            body.className = 'clip-body';

            const name = document.createElement('span');
            name.className = 'clip-name';
            name.textContent = `Clip ${index + 1}`;

            const time = document.createElement('span');
            time.className = 'clip-time';
            time.textContent = `${formatTime(clip.sourceStart)} – ${formatTime(clip.sourceEnd)}`;

            const deleteButton = document.createElement('button');
            deleteButton.className = 'clip-delete-button';
            deleteButton.type = 'button';
            deleteButton.title = 'クリップを削除';
            deleteButton.setAttribute('aria-label', deleteButton.title);
            deleteButton.innerHTML = '<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>';

            body.append(name, time);
            clipElement.append(audioButton, body, deleteButton);

            audioButton.addEventListener('pointerdown', (event) => event.stopPropagation());
            audioButton.addEventListener('dragstart', (event) => event.preventDefault());
            audioButton.addEventListener('click', (event) => {
                event.stopPropagation();
                toggleClipMute(clip.id);
            });

            deleteButton.addEventListener('pointerdown', (event) => event.stopPropagation());
            deleteButton.addEventListener('dragstart', (event) => event.preventDefault());
            deleteButton.addEventListener('click', (event) => {
                event.stopPropagation();
                deleteClip(clip.id);
            });

            clipElement.addEventListener('click', () => {
                selectClip(clip.id, false);
            });

            clipElement.addEventListener('dragstart', (event) => {
                draggedClipId = clip.id;
                clipElement.classList.add('is-dragging');
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', clip.id);
            });

            clipElement.addEventListener('dragend', () => {
                draggedClipId = null;
                clearDropIndicators();
                clipElement.classList.remove('is-dragging');
            });

            clipElement.addEventListener('dragover', (event) => {
                if (!draggedClipId || draggedClipId === clip.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                clearDropIndicators();
                const rect = clipElement.getBoundingClientRect();
                const before = event.clientX < rect.left + rect.width / 2;
                showDropIndicator(clipElement, before);
            });

            clipElement.addEventListener('drop', (event) => {
                if (!draggedClipId || draggedClipId === clip.id) return;
                event.preventDefault();
                const rect = clipElement.getBoundingClientRect();
                const before = event.clientX < rect.left + rect.width / 2;
                clearDropIndicators();
                reorderClip(draggedClipId, clip.id, before);
            });

            clipTrack.appendChild(clipElement);
        });

        clipCountLabel.textContent = `${clips.length} clip${clips.length === 1 ? '' : 's'} · ${formatTime(total)}`;
        exportButton.disabled = Boolean(exportJob) || !currentFile || !clips.length;
        renderRuler();
        updateControlPanel();
        updatePlayheadVisual();
    }

    function showDropIndicator(targetElement, before) {
        const trackRect = clipTrack.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();
        const targetX = before
            ? targetRect.left - trackRect.left
            : targetRect.right - trackRect.left;

        clipTrack.style.setProperty(
            '--drop-indicator-x',
            `${clamp(targetX, 0, trackRect.width)}px`,
        );
        clipTrack.classList.add('is-reorder-target');
    }

    function clearDropIndicators() {
        clipTrack.classList.remove('is-reorder-target');
        clipTrack.style.removeProperty('--drop-indicator-x');
        clipTrack.querySelectorAll('.is-drop-before, .is-drop-after').forEach((element) => {
            element.classList.remove('is-drop-before', 'is-drop-after');
        });
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
        logicalTime = span.start + (sourceTime - span.clip.sourceStart);
        activeClipId = span.clip.id;
        video.muted = span.clip.muted;

        if (seekVideo) {
            seekVideoTo(sourceTime);
        }

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

        selectedClipId = moving.id;
        renderTimeline();
        restorePlayheadAnchor(anchor, false);
    }

    function selectClip(id, seekToStart = false) {
        if (!clips.some((clip) => clip.id === id)) return;
        selectedClipId = id;

        clipTrack.querySelectorAll('.timeline-clip').forEach((element) => {
            element.classList.toggle('is-selected', element.dataset.clipId === id);
        });

        updateControlPanel();

        if (seekToStart) {
            const span = getSpanByClipId(id);
            if (span) seekLogical(span.start, { snap: false });
        }
    }

    function toggleClipMute(id) {
        const clip = clips.find((item) => item.id === id);
        if (!clip) return;

        const anchor = capturePlayheadAnchor();
        pushUndoState();
        clip.muted = !clip.muted;

        if (activeClipId === clip.id) {
            video.muted = clip.muted;
        }

        renderTimeline();
        restorePlayheadAnchor(anchor, false);
    }

    function deleteClip(id = selectedClipId) {
        if (exportJob || !id) return;

        const index = clips.findIndex((clip) => clip.id === id);
        if (index < 0) return;

        pushUndoState();
        video.pause();
        clips.splice(index, 1);

        if (!clips.length) {
            selectedClipId = null;
            activeClipId = null;
            logicalTime = 0;
            video.muted = false;
            setStatus('');
            renderTimeline();
            updatePlayheadVisual();
            return;
        }

        const nextClip = clips[Math.min(index, clips.length - 1)];
        selectedClipId = nextClip.id;
        activeClipId = nextClip.id;
        setStatus('');
        renderTimeline();

        const span = getSpanByClipId(nextClip.id);
        if (span) {
            logicalTime = span.start;
            video.muted = nextClip.muted;
            seekVideoTo(nextClip.sourceStart);
            updatePlayheadVisual();
        }
    }

    function updatePlayheadVisual() {
        const total = getTimelineDuration();
        const workspaceRect = timelineWorkspace.getBoundingClientRect();
        const trackRect = clipTrack.getBoundingClientRect();

        if (!total || !workspaceRect.width || !trackRect.width) {
            playhead.style.left = `${Math.max(0, trackRect.left - workspaceRect.left)}px`;
            playheadTimeLabel.textContent = '0:00.00';
            return;
        }

        const ratio = clamp(logicalTime / total, 0, 1);
        const left = trackRect.left - workspaceRect.left + ratio * trackRect.width;
        playhead.style.left = `${left}px`;
        playheadTimeLabel.textContent = formatTime(logicalTime);
    }

    function logicalTimeFromClientX(clientX) {
        const rect = clipTrack.getBoundingClientRect();
        const total = getTimelineDuration();
        if (!rect.width || !total) return 0;
        return clamp((clientX - rect.left) / rect.width, 0, 1) * total;
    }

    function snapLogicalTime(time) {
        const total = getTimelineDuration();
        const rect = clipTrack.getBoundingClientRect();
        if (!total || !rect.width) {
            return { time: 0, snapped: false };
        }

        const threshold = total * SNAP_PIXELS / rect.width;
        const boundaries = [0, total];

        getTimelineSpans().forEach((span, index, spans) => {
            if (index < spans.length - 1) boundaries.push(span.end);
        });

        let nearest = time;
        let distance = Infinity;

        boundaries.forEach((boundary) => {
            const candidateDistance = Math.abs(time - boundary);
            if (candidateDistance < distance) {
                distance = candidateDistance;
                nearest = boundary;
            }
        });

        if (distance <= threshold) {
            return { time: nearest, snapped: true };
        }

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
        if (select) selectedClipId = span.clip.id;

        const offset = clamp(logicalTime - span.start, 0, getClipDuration(span.clip));
        const sourceTime = span.clip.sourceStart + offset;
        video.muted = span.clip.muted;
        seekVideoTo(sourceTime);

        if (select) {
            selectClip(span.clip.id, false);
        }

        updatePlayheadVisual();
    }

    function movePlayheadFromPointer(event, cutAfter = false) {
        const raw = logicalTimeFromClientX(event.clientX);
        seekLogical(raw, { snap: true, select: false });
        if (cutAfter) splitAtPlayhead();
    }

    function splitAtPlayhead() {
        const span = findSpanAtTimelineTime(logicalTime);
        if (!span) return;

        const clip = span.clip;
        const sourceCut = clip.sourceStart + (logicalTime - span.start);

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
        const right = createClip(sourceCut, clip.sourceEnd, clip.muted);

        clips.splice(index, 1, left, right);
        selectedClipId = right.id;
        activeClipId = right.id;
        setStatus('');
        renderTimeline();

        const rightSpan = getSpanByClipId(right.id);
        if (rightSpan) {
            logicalTime = rightSpan.start;
            video.muted = right.muted;
            seekVideoTo(right.sourceStart);
            updatePlayheadVisual();
        }
    }

    function applySelectedClipBoundary(kind, value) {
        const clip = getSelectedClip();
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
            updateControlPanel();
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
        clips = [createClip(0, sourceDuration, false)];
        selectedClipId = clips[0].id;
        activeClipId = clips[0].id;
        logicalTime = 0;
        video.muted = false;
        setStatus('');
        renderTimeline();

        if (seek) {
            seekVideoTo(0);
        }
    }

    function syncLogicalFromVideo() {
        const clip = clips.find((item) => item.id === activeClipId);
        const span = clip ? getSpanByClipId(clip.id) : null;
        if (!clip || !span) return;

        const relative = clamp(video.currentTime - clip.sourceStart, 0, getClipDuration(clip));
        logicalTime = span.start + relative;
        updatePlayheadVisual();
    }

    async function advanceToNextClip() {
        const spans = getTimelineSpans();
        const index = spans.findIndex((span) => span.clip.id === activeClipId);

        if (index < 0 || index >= spans.length - 1) {
            playingTimeline = false;
            logicalTime = getTimelineDuration();
            video.pause();
            setPreviewButtonState(false);
            updatePlayheadVisual();
            return;
        }

        const next = spans[index + 1];
        activeClipId = next.clip.id;
        logicalTime = next.start;
        video.muted = next.clip.muted;
        seekVideoTo(next.clip.sourceStart);
        updatePlayheadVisual();

        if (playingTimeline) {
            try {
                await video.play();
            } catch {
                playingTimeline = false;
                setPreviewButtonState(false);
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

        try {
            await video.play();
        } catch {
            playingTimeline = false;
            setPreviewButtonState(false);
        }
    }

    async function loadFile(file) {
        if (!file || (!file.type.startsWith('video/') && !/\.(mp4|m4v|mov|webm|mkv)$/i.test(file.name))) {
            return;
        }

        if (exportJob) return;

        currentFile = file;
        clips = [];
        selectedClipId = null;
        activeClipId = null;
        logicalTime = 0;
        sourceDuration = 0;
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

        const vp9 = await getFirstEncodableVideoCodec(['vp9', 'vp8']);
        const opus = hasAudio ? await getFirstEncodableAudioCodec(['opus']) : 'opus';

        if (vp9 && opus) {
            return {
                format: new WebMOutputFormat(),
                extension: 'webm',
                mimeType: 'video/webm',
                videoCodec: vp9,
                audioCodec: hasAudio ? opus : null,
            };
        }

        throw new Error('このブラウザで利用可能な動画エンコーダーが見つかりません。');
    }

    function trimAudioSampleToRange(sample, start, end) {
        const overlapStart = Math.max(sample.timestamp, start);
        const overlapEnd = Math.min(sample.timestamp + sample.duration, end);

        if (overlapEnd <= overlapStart + EPSILON) {
            sample.close();
            return null;
        }

        const needsTrim = (
            overlapStart > sample.timestamp + EPSILON
            || overlapEnd < sample.timestamp + sample.duration - EPSILON
        );

        if (!needsTrim) return sample;

        const startFrame = clamp(
            Math.ceil((overlapStart - sample.timestamp) * sample.sampleRate),
            0,
            sample.numberOfFrames,
        );
        const endFrame = clamp(
            Math.floor((overlapEnd - sample.timestamp) * sample.sampleRate),
            startFrame,
            sample.numberOfFrames,
        );

        if (endFrame <= startFrame) {
            sample.close();
            return null;
        }

        const trimmed = sample.trim(startFrame, endFrame);
        sample.close();
        return trimmed;
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
            AudioSampleSink,
            VideoSampleSource,
            AudioSampleSource,
            Quality,
        } = Mediabunny;

        exportButton.disabled = true;
        replaceButton.disabled = true;
        cancelButton.hidden = false;
        progressBlock.hidden = false;
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
            if (!videoTrack) {
                throw new Error('動画トラックが見つかりません。');
            }
            if (!await videoTrack.canDecode()) {
                throw new Error('この動画コーデックをブラウザでデコードできません。');
            }

            const audioTrack = await input.getPrimaryAudioTrack();
            const includeAudio = Boolean(
                audioTrack
                && clips.some((clip) => !clip.muted)
                && await audioTrack.canDecode()
            );

            const preset = await chooseExportPreset(includeAudio);
            formatBadge.textContent = preset.extension.toUpperCase();

            const target = new BufferTarget();
            output = new Output({
                format: preset.format,
                target,
            });

            videoSource = new VideoSampleSource({
                codec: preset.videoCodec,
                quality: new Quality('high'),
                keyFrameInterval: 1,
            });
            output.addVideoTrack(videoSource);

            if (includeAudio && preset.audioCodec) {
                audioSource = new AudioSampleSource({
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

            const videoSink = new VideoSampleSink(videoTrack);
            const audioSink = includeAudio ? new AudioSampleSink(audioTrack) : null;
            const total = getTimelineDuration();
            let outputOffset = 0;

            const updateProgress = (time) => {
                const progress = clamp(time / total, 0, 1);
                progressBar.value = progress;
                progressPercent.textContent = `${Math.round(progress * 100)}%`;
            };

            progressLabel.textContent = 'タイムラインを書き出し中…';

            for (const clip of clips) {
                if (cancelledByUser) throw new Error('canceled');

                const clipDuration = getClipDuration(clip);
                const videoIterator = videoSink.samples(clip.sourceStart, clip.sourceEnd)[Symbol.asyncIterator]();
                const audioIterator = (
                    audioSink && audioSource && !clip.muted
                        ? audioSink.samples(clip.sourceStart, clip.sourceEnd)[Symbol.asyncIterator]()
                        : null
                );

                let videoResult = await videoIterator.next();
                let audioResult = audioIterator ? await audioIterator.next() : { done: true, value: null };
                let firstVideoSample = true;

                while (!videoResult.done || !audioResult.done) {
                    if (cancelledByUser) throw new Error('canceled');

                    const takeVideo = (
                        audioResult.done
                        || (
                            !videoResult.done
                            && videoResult.value.timestamp <= audioResult.value.timestamp
                        )
                    );

                    if (takeVideo) {
                        const sample = videoResult.value;
                        const overlapStart = Math.max(sample.timestamp, clip.sourceStart);
                        const overlapEnd = Math.min(sample.timestamp + sample.duration, clip.sourceEnd);

                        if (overlapEnd > overlapStart + EPSILON) {
                            sample.setTimestamp(outputOffset + Math.max(0, overlapStart - clip.sourceStart));
                            sample.setDuration(overlapEnd - overlapStart);
                            await videoSource.add(sample, { keyFrame: firstVideoSample });
                            firstVideoSample = false;
                            updateProgress(outputOffset + Math.min(clipDuration, overlapEnd - clip.sourceStart));
                        }

                        sample.close();
                        videoResult = await videoIterator.next();
                    } else {
                        let sample = audioResult.value;
                        sample = trimAudioSampleToRange(sample, clip.sourceStart, clip.sourceEnd);

                        if (sample) {
                            sample.setTimestamp(outputOffset + Math.max(0, sample.timestamp - clip.sourceStart));
                            await audioSource.add(sample);
                            sample.close();
                        }

                        audioResult = await audioIterator.next();
                    }
                }

                outputOffset += clipDuration;
                updateProgress(outputOffset);
            }

            videoSource.close();
            audioSource?.close();
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
            anchor.download = `${baseName}-edited.${preset.extension}`;
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
            exportButton.disabled = false;
            replaceButton.disabled = false;

            try {
                if (output && output.state === 'started') {
                    await output.cancel();
                }
            } catch {
                // Already finalized or canceled.
            }

            try {
                input.dispose();
            } catch {
                // Already disposed.
            }
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
        sourceDuration = Number.isFinite(video.duration) ? video.duration : 0;
        const dimensions = video.videoWidth && video.videoHeight
            ? `${video.videoWidth}×${video.videoHeight}`
            : '解像度不明';

        fileMeta.textContent = `${formatBytes(currentFile?.size || 0)} · ${dimensions} · ${formatTime(sourceDuration)}`;
        formatBadge.textContent = 'MP4';
        undoStack = [];
        redoStack = [];
        resetClips(false);
        seekVideoTo(0);
    });

    video.addEventListener('error', () => {
        fileMeta.textContent = `${formatBytes(currentFile?.size || 0)} · プレビュー非対応`;
        setStatus('このブラウザでは動画をプレビューできません。別形式の動画を試してください。', 'error');
    });

    video.addEventListener('seeked', () => {
        internalSeek = false;
    });

    video.addEventListener('seeking', () => {
        if (internalSeek) return;

        const current = video.currentTime;
        const selected = getSelectedClip();
        const matching = (
            selected
            && current >= selected.sourceStart - EPSILON
            && current <= selected.sourceEnd + EPSILON
                ? selected
                : clips.find((clip) => (
                    current >= clip.sourceStart - EPSILON
                    && current <= clip.sourceEnd + EPSILON
                ))
        );

        if (!matching) return;

        activeClipId = matching.id;
        const span = getSpanByClipId(matching.id);
        if (!span) return;

        logicalTime = span.start + clamp(current - matching.sourceStart, 0, getClipDuration(matching));
        video.muted = matching.muted;
        updatePlayheadVisual();
    });

    video.addEventListener('play', () => {
        playingTimeline = true;
        setPreviewButtonState(true);
    });

    video.addEventListener('pause', () => {
        if (!video.ended) {
            playingTimeline = false;
            setPreviewButtonState(false);
        }
    });

    video.addEventListener('timeupdate', () => {
        const clip = clips.find((item) => item.id === activeClipId);
        if (!clip) return;

        if (playingTimeline && video.currentTime >= clip.sourceEnd - 0.035) {
            advanceToNextClip();
            return;
        }

        syncLogicalFromVideo();
    });

    video.addEventListener('ended', () => {
        if (playingTimeline) {
            advanceToNextClip();
        }
    });

    startInput.addEventListener('change', () => {
        const parsed = parseTime(startInput.value);
        if (Number.isFinite(parsed)) {
            applySelectedClipBoundary('start', parsed);
        } else {
            updateControlPanel();
        }
    });

    endInput.addEventListener('change', () => {
        const parsed = parseTime(endInput.value);
        if (Number.isFinite(parsed)) {
            applySelectedClipBoundary('end', parsed);
        } else {
            updateControlPanel();
        }
    });

    setStartButton.addEventListener('click', () => {
        applySelectedClipBoundary('start', video.currentTime);
    });

    setEndButton.addEventListener('click', () => {
        applySelectedClipBoundary('end', video.currentTime);
    });

    resetRangeButton.addEventListener('click', () => {
        if (!sourceDuration || exportJob) return;
        pushUndoState();
        video.pause();
        playingTimeline = false;
        setPreviewButtonState(false);
        resetClips(true);
    });

    previewButton.addEventListener('click', async () => {
        if (playingTimeline && !video.paused) {
            video.pause();
            return;
        }
        await startTimelinePlayback();
    });

    cutButton.addEventListener('click', splitAtPlayhead);

    playhead.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        draggingPlayhead = true;
        video.pause();
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
        if (event.button !== 0 || event.target.closest('.clip-audio-button, .clip-delete-button')) return;

        if (event.ctrlKey) {
            event.preventDefault();
            video.pause();
            movePlayheadFromPointer(event, true);
            return;
        }

        const clipElement = event.target.closest('.timeline-clip');
        if (clipElement) {
            selectClip(clipElement.dataset.clipId, false);
            return;
        }

        video.pause();
        movePlayheadFromPointer(event, false);
    });

    timelineRuler.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        video.pause();
        const rect = timelineRuler.getBoundingClientRect();
        const total = getTimelineDuration();
        if (!total || !rect.width) return;
        const time = clamp((event.clientX - rect.left) / rect.width, 0, 1) * total;
        seekLogical(time, { snap: true });
    });

    document.addEventListener('keydown', async (event) => {
        const target = event.target;
        const typing = (
            target instanceof HTMLInputElement
            || target instanceof HTMLTextAreaElement
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
            deleteClip();
            return;
        }

        if (!typing && event.ctrlKey && event.key === 'ArrowLeft') {
            event.preventDefault();
            splitAtPlayhead();
            return;
        }

        const plainSpace = (
            !typing
            && event.code === 'Space'
            && !event.ctrlKey
            && !event.metaKey
            && !event.altKey
        );

        if (plainSpace) {
            event.preventDefault();
            if (event.repeat || !currentFile || !getTimelineDuration()) return;

            if (!video.paused) {
                video.pause();
            } else {
                await startTimelinePlayback();
            }
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
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
})();
