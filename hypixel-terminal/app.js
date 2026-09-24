(() => {
  'use strict';

  const TYPES = ['numbers', 'colors', 'startswith', 'redgreen', 'rubix', 'melody'];
  const TYPE_META = {
    numbers: {
      name: 'Numbers',
      prompt: 'Click in order!',
      instruction: '赤いペインの数字を小さい順にクリック。Solver ON では次の3手を緑 → 黄 → オレンジで表示します。'
    },
    colors: {
      name: 'Colors',
      prompt: '',
      instruction: '指定された色に一致するアイテムをすべて選択。別名（Lapis / Rose / Cactus など）も含めた判定です。'
    },
    startswith: {
      name: 'Starts With',
      prompt: '',
      instruction: '指定された文字から始まるアイテムをすべて選択。アイテム名はスロット内とホバーで確認できます。'
    },
    redgreen: {
      name: 'Red / Green',
      prompt: 'Correct all the panes!',
      instruction: '赤いペインを全部クリックして緑にします。Solver ON では未処理の赤ペインを強調します。'
    },
    rubix: {
      name: 'Rubix',
      prompt: 'Change all to same color!',
      instruction: '9枚のペインを同じ色にそろえます。左クリックで色を1つ進め、右クリック（または Shift + 左クリック）で1つ戻します。'
    },
    melody: {
      name: 'Melody',
      prompt: 'Click the button on time!',
      instruction: '動く緑ペインがマゼンタの列に重なった瞬間、右側の現在行のボタンをクリック。4段階クリアで完了です。'
    }
  };

  const COLOR_CYCLE = [
    { key: 'red', hex: '#d94a3c' },
    { key: 'orange', hex: '#e68a31' },
    { key: 'yellow', hex: '#d7ba39' },
    { key: 'green', hex: '#4fa44b' },
    { key: 'blue', hex: '#3c64b8' }
  ];

  const ITEM_POOL = [
    'Acacia Boat', 'Anvil', 'Apple', 'Arrow', 'Azure Bluet',
    'Birch Log', 'Blaze Rod', 'Blue Orchid', 'Blue Wool', 'Bone', 'Book', 'Bow', 'Brown Mushroom', 'Brown Wool',
    'Cactus', 'Carrot', 'Chest', 'Clay', 'Coal', 'Cobblestone', 'Cocoa Beans', 'Compass', 'Crafting Table',
    'Dandelion', 'Diamond', 'Diamond Axe', 'Diamond Block', 'Diamond Boots', 'Diamond Chestplate', 'Dirt', 'Dispenser', 'Dropper',
    'Emerald', 'Emerald Block', 'Ender Pearl', 'End Stone',
    'Feather', 'Fishing Rod', 'Flint', 'Flower Pot',
    'Glass', 'Glowstone', 'Gold Ingot', 'Golden Apple', 'Grass Block', 'Green Wool',
    'Hopper', 'Ice', 'Ink Sac', 'Iron Axe', 'Iron Block', 'Iron Ingot', 'Item Frame',
    'Lapis Lazuli', 'Lava Bucket', 'Leather', 'Lever', 'Light Gray Wool',
    'Magma Cream', 'Melon', 'Milk Bucket', 'Minecart', 'Mushroom Stew',
    'Nether Brick', 'Nether Star', 'Oak Log', 'Obsidian', 'Orange Wool',
    'Paper', 'Piston', 'Potato', 'Prismarine', 'Pumpkin', 'Purple Wool',
    'Quartz', 'Red Mushroom', 'Red Wool', 'Redstone', 'Redstone Block', 'Rose Red',
    'Sand', 'Shears', 'Slimeball', 'Snowball', 'Spider Eye', 'Stick', 'Stone', 'String', 'Sugar',
    'Torch', 'Water Bucket', 'White Wool', 'Wool', 'Yellow Wool'
  ];

  const COLOR_NAMES = {
    red: ['Red Wool', 'Red Mushroom', 'Redstone', 'Redstone Block', 'Rose Red'],
    blue: ['Blue Wool', 'Blue Orchid', 'Lapis Lazuli'],
    green: ['Green Wool', 'Cactus'],
    yellow: ['Yellow Wool', 'Dandelion'],
    black: ['Black Wool', 'Ink Sac'],
    white: ['White Wool', 'Wool', 'Bone'],
    brown: ['Brown Wool', 'Brown Mushroom', 'Cocoa Beans'],
    orange: ['Orange Wool', 'Orange Tulip'],
    purple: ['Purple Wool', 'Purple Dye'],
    'light gray': ['Light Gray Wool', 'Silverfish']
  };

  const COLOR_SWATCH = {
    red: '#cf4e42',
    blue: '#4775c9',
    green: '#4e9f55',
    yellow: '#d8bd45',
    black: '#30343d',
    white: '#d9dde2',
    brown: '#805438',
    orange: '#dd8438',
    purple: '#8b56bd',
    'light gray': '#9ca0a6'
  };

  const dom = {
    solverToggle: document.getElementById('solverToggle'),
    autoNextToggle: document.getElementById('autoNextToggle'),
    timeValue: document.getElementById('timeValue'),
    pbValue: document.getElementById('pbValue'),
    mistakeValue: document.getElementById('mistakeValue'),
    streakValue: document.getElementById('streakValue'),
    solvedValue: document.getElementById('solvedValue'),
    terminalCard: document.getElementById('terminalCard'),
    terminalName: document.getElementById('terminalName'),
    roundState: document.getElementById('roundState'),
    prompt: document.getElementById('prompt'),
    grid: document.getElementById('grid'),
    progressText: document.getElementById('progressText'),
    inputHint: document.getElementById('inputHint'),
    instructionTitle: document.getElementById('instructionTitle'),
    instructionText: document.getElementById('instructionText'),
    solverLegend: document.getElementById('solverLegend'),
    flashLayer: document.getElementById('flashLayer'),
    restartBtn: document.getElementById('restartBtn'),
    nextBtn: document.getElementById('nextBtn'),
    toast: document.getElementById('toast')
  };

  let selectedMode = 'random';
  let state = null;
  let roundSerial = 0;
  let solvedCount = Number(localStorage.getItem('f7trainer:solved') || 0);
  let cleanStreak = Number(localStorage.getItem('f7trainer:streak') || 0);
  let solverEnabled = localStorage.getItem('f7trainer:solver') !== '0';
  let autoNext = localStorage.getItem('f7trainer:autoNext') !== '0';
  let toastTimer = null;
  let lastRandomType = null;

  dom.solverToggle.checked = solverEnabled;
  dom.autoNextToggle.checked = autoNext;
  dom.solvedValue.textContent = solvedCount;
  dom.streakValue.textContent = cleanStreak;

  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function shuffle(input) {
    const arr = input.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function formatTime(ms) {
    if (!Number.isFinite(ms)) return '--';
    return (ms / 1000).toFixed(3);
  }

  function pbKey(type) {
    return 'f7trainer:pb:' + type;
  }

  function getPB(type) {
    const value = Number(localStorage.getItem(pbKey(type)));
    return value > 0 ? value : null;
  }

  function setPB(type, ms) {
    const current = getPB(type);
    if (current === null || ms < current) {
      localStorage.setItem(pbKey(type), String(ms));
      return true;
    }
    return false;
  }

  function chooseRandomType() {
    const candidates = TYPES.filter(type => type !== lastRandomType);
    const chosen = pick(candidates.length ? candidates : TYPES);
    lastRandomType = chosen;
    return chosen;
  }

  function currentTypeForNewRound() {
    return selectedMode === 'random' ? chooseRandomType() : selectedMode;
  }

  function baseState(type) {
    return {
      id: ++roundSerial,
      type,
      startedAt: performance.now(),
      finished: false,
      finalTime: null,
      mistakes: 0,
      flashToken: 0,
      puzzle: null
    };
  }

  function startRound(type) {
    const next = baseState(type || currentTypeForNewRound());
    next.puzzle = generatePuzzle(next.type);
    state = next;
    dom.terminalCard.classList.remove('complete');
    dom.roundState.className = 'round-state';
    dom.roundState.textContent = 'RUNNING';
    dom.mistakeValue.textContent = '0';
    updateStaticUI();
    renderGrid();
    updateProgress();
    requestAnimationFrame(tick);
  }

  function restartRound() {
    if (!state) return;
    startRound(state.type);
  }

  function generatePuzzle(type) {
    if (type === 'numbers') return generateNumbers();
    if (type === 'colors') return generateColors();
    if (type === 'startswith') return generateStartsWith();
    if (type === 'redgreen') return generateRedGreen();
    if (type === 'rubix') return generateRubix();
    return generateMelody();
  }

  function generateNumbers() {
    const allowed = [10,11,12,13,14,15,16,19,20,21,22,23,24,25];
    const numbers = shuffle(Array.from({ length: 14 }, (_, i) => i + 1));
    const cells = {};
    allowed.forEach((slot, index) => {
      cells[slot] = { kind: 'pane', color: 'red', number: numbers[index], solved: false };
    });
    return { rows: 4, allowed, cells };
  }

  function colorPrefixes(target) {
    const special = {
      black: ['black', 'ink'],
      blue: ['blue', 'lapis'],
      brown: ['brown', 'cocoa'],
      white: ['white', 'bone', 'wool'],
      green: ['green', 'cactus'],
      red: ['red', 'rose'],
      yellow: ['yellow', 'dandelion'],
      'light gray': ['silver', 'light gray']
    };
    return special[target] || [target];
  }

  function matchesColor(name, target) {
    const lower = name.toLowerCase();
    return colorPrefixes(target).some(prefix => lower.startsWith(prefix));
  }

  function allColorItems() {
    const extras = [
      'Black Wool', 'Orange Tulip', 'Purple Dye', 'Silverfish',
      'Rose Bush', 'Lapis Block', 'Cocoa Beans', 'Dandelion Yellow'
    ];
    return Array.from(new Set(ITEM_POOL.concat(extras)));
  }

  function generateColors() {
    const allowed = [10,11,12,13,14,15,16,19,20,21,22,23,24,25,28,29,30,31,32,33,34,37,38,39,40,41,42,43];
    const target = pick(Object.keys(COLOR_NAMES));
    const targetPool = allColorItems().filter(name => matchesColor(name, target));
    const otherPool = allColorItems().filter(name => !matchesColor(name, target));
    const selected = [];

    const guaranteedCount = clamp(rand(5, 8), 1, targetPool.length || 1);
    for (let i = 0; i < guaranteedCount; i++) selected.push(pick(targetPool));
    while (selected.length < allowed.length) selected.push(pick(otherPool));

    const names = shuffle(selected);
    const cells = {};
    allowed.forEach((slot, index) => {
      const name = names[index];
      cells[slot] = {
        kind: 'item',
        name,
        target: matchesColor(name, target),
        solved: false,
        color: targetColorForItem(name)
      };
    });
    return { rows: 6, allowed, cells, target };
  }

  function generateStartsWith() {
    const allowed = [10,11,12,13,14,15,16,19,20,21,22,23,24,25,28,29,30,31,32,33,34,37,38,39,40,41,42,43];
    const letters = Array.from(new Set(ITEM_POOL.map(name => name[0].toUpperCase()))).filter(letter => {
      return ITEM_POOL.filter(name => name[0].toUpperCase() === letter).length >= 3;
    });
    const letter = pick(letters);
    const matching = ITEM_POOL.filter(name => name[0].toUpperCase() === letter);
    const others = ITEM_POOL.filter(name => name[0].toUpperCase() !== letter);
    const selected = [];

    const targetCount = Math.min(rand(4, 7), matching.length);
    shuffle(matching).slice(0, targetCount).forEach(name => selected.push(name));
    while (selected.length < allowed.length) selected.push(pick(others));

    const names = shuffle(selected);
    const cells = {};
    allowed.forEach((slot, index) => {
      const name = names[index];
      cells[slot] = {
        kind: 'item',
        name,
        target: name[0].toUpperCase() === letter,
        solved: false,
        color: hashColor(name)
      };
    });
    return { rows: 5, allowed, cells, letter };
  }

  function generateRedGreen() {
    const allowed = [11,12,13,14,15,20,21,22,23,24,29,30,31,32,33];
    const redCount = rand(6, 11);
    const flags = shuffle(allowed.map((_, index) => index < redCount));
    const cells = {};
    allowed.forEach((slot, index) => {
      cells[slot] = { kind: 'pane', color: flags[index] ? 'red' : 'green', solved: false };
    });
    return { rows: 5, allowed, cells };
  }

  function generateRubix() {
    const allowed = [12,13,14,21,22,23,30,31,32];
    let colors;
    do {
      colors = allowed.map(() => rand(0, COLOR_CYCLE.length - 1));
    } while (colors.every(value => value === colors[0]));

    const cells = {};
    allowed.forEach((slot, index) => {
      cells[slot] = { kind: 'rubix', colorIndex: colors[index] };
    });
    return { rows: 5, allowed, cells };
  }

  function generateMelody() {
    return {
      rows: 6,
      target: rand(0, 4),
      stage: 0,
      current: rand(0, 4),
      phaseStartedAt: performance.now() - rand(0, 7) * 230,
      stepMs: 230,
      lastStep: -1
    };
  }

  function targetColorForItem(name) {
    const lower = name.toLowerCase();
    const keys = Object.keys(COLOR_SWATCH);
    for (const key of keys) {
      if (matchesColor(name, key)) return COLOR_SWATCH[key];
    }
    if (lower.includes('diamond')) return '#5dd7d6';
    if (lower.includes('emerald')) return '#49bb6b';
    if (lower.includes('gold')) return '#d9b84f';
    if (lower.includes('iron')) return '#b9c0c7';
    return hashColor(name);
  }

  function hashColor(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    const hue = Math.abs(hash) % 360;
    return 'hsl(' + hue + ' 36% 49%)';
  }

  function paneHex(color) {
    if (color === 'red') return '#c43f3f';
    if (color === 'green') return '#4caa4f';
    return '#777';
  }

  function updateStaticUI() {
    const meta = TYPE_META[state.type];
    dom.terminalName.textContent = meta.name;
    dom.instructionTitle.textContent = meta.name;
    dom.instructionText.textContent = meta.instruction;
    dom.prompt.textContent = promptForState();
    dom.pbValue.textContent = formatTime(getPB(state.type));
    dom.inputHint.textContent = state.type === 'rubix'
      ? 'Left = +1 · Right / Shift = -1'
      : state.type === 'melody'
        ? 'Click the active row button'
        : 'Left click';
    renderLegend();
  }

  function promptForState() {
    if (state.type === 'colors') return 'Select all the ' + state.puzzle.target.toUpperCase() + ' items!';
    if (state.type === 'startswith') return "What starts with: '" + state.puzzle.letter + "'?";
    return TYPE_META[state.type].prompt;
  }

  function renderLegend() {
    if (!solverEnabled) {
      dom.solverLegend.innerHTML = '<p>Solver OFF。通常の見た目だけで解きます。</p>';
      return;
    }

    if (state.type === 'numbers') {
      dom.solverLegend.innerHTML =
        '<div class="legend-row"><span class="legend-swatch"></span><span>次にクリック</span></div>' +
        '<div class="legend-row"><span class="legend-swatch second"></span><span>2手目</span></div>' +
        '<div class="legend-row"><span class="legend-swatch third"></span><span>3手目</span></div>';
      return;
    }

    if (state.type === 'rubix') {
      dom.solverLegend.innerHTML =
        '<div class="legend-row"><span class="legend-swatch"></span><span>正数 = 左クリック</span></div>' +
        '<div class="legend-row"><span class="legend-swatch right"></span><span>負数 = 右クリック</span></div>';
      return;
    }

    if (state.type === 'melody') {
      dom.solverLegend.innerHTML =
        '<div class="legend-row"><span class="legend-swatch"></span><span>今押すボタン</span></div>' +
        '<div class="legend-row"><span class="legend-swatch" style="border-color:#ff62d7"></span><span>正解列</span></div>';
      return;
    }

    dom.solverLegend.innerHTML =
      '<div class="legend-row"><span class="legend-swatch"></span><span>クリック対象</span></div>';
  }

  function renderGrid() {
    const rows = state.puzzle.rows;
    dom.grid.style.setProperty('--rows', rows);
    dom.grid.innerHTML = '';

    const rubixSolution = state.type === 'rubix' ? calcRubixSolution() : null;
    const numberSolution = state.type === 'numbers' ? remainingNumbers() : null;

    for (let slot = 0; slot < rows * 9; slot++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot';
      button.dataset.slot = String(slot);
      button.setAttribute('role', 'gridcell');

      if (state.type === 'melody') {
        renderMelodySlot(button, slot);
      } else {
        const cell = state.puzzle.cells[slot];
        if (cell) renderPuzzleCell(button, slot, cell, numberSolution, rubixSolution);
      }

      if (!state.finished && isInteractiveSlot(slot)) {
        button.classList.add('interactive');
        button.addEventListener('click', event => {
          const rightLike = state.type === 'rubix' && event.shiftKey;
          handleSlot(slot, rightLike ? 1 : 0);
        });
        button.addEventListener('contextmenu', event => {
          if (state.type !== 'rubix') return;
          event.preventDefault();
          handleSlot(slot, 1);
        });
      }

      dom.grid.appendChild(button);
    }
  }

  function renderPuzzleCell(button, slot, cell, numberSolution, rubixSolution) {
    if (cell.solved) button.classList.add('solved');

    if (cell.kind === 'pane') {
      const pane = document.createElement('span');
      pane.className = 'pane';
      pane.style.setProperty('--pane-color', paneHex(cell.color));
      button.appendChild(pane);
      if (typeof cell.number === 'number') {
        const count = document.createElement('span');
        count.className = 'slot-count';
        count.textContent = String(cell.number);
        button.appendChild(count);
      }
    }

    if (cell.kind === 'item') {
      const icon = document.createElement('span');
      icon.className = 'item-icon';
      icon.style.setProperty('--item-color', cell.color);
      button.appendChild(icon);

      const initials = document.createElement('span');
      initials.className = 'item-initials';
      initials.textContent = itemInitials(cell.name);
      button.appendChild(initials);

      const name = document.createElement('span');
      name.className = 'item-name';
      name.textContent = cell.name;
      button.appendChild(name);
      button.title = cell.name;
    }

    if (cell.kind === 'rubix') {
      const pane = document.createElement('span');
      pane.className = 'pane';
      pane.style.setProperty('--pane-color', COLOR_CYCLE[cell.colorIndex].hex);
      button.appendChild(pane);
    }

    if (!solverEnabled || cell.solved) return;

    if (state.type === 'numbers') {
      const index = numberSolution.indexOf(slot);
      if (index >= 0 && index < 3) button.classList.add('solver-' + (index + 1));
      return;
    }

    if (state.type === 'colors' || state.type === 'startswith') {
      if (cell.target) button.classList.add('solver-target');
      return;
    }

    if (state.type === 'redgreen') {
      if (cell.color === 'red') button.classList.add('solver-target');
      return;
    }

    if (state.type === 'rubix') {
      const diff = rubixSolution.diffs[slot];
      if (!diff) return;
      button.classList.add(diff > 0 ? 'solver-positive' : 'solver-negative');
      const label = document.createElement('span');
      label.className = 'solver-number';
      label.textContent = String(diff);
      button.appendChild(label);
    }
  }

  function itemInitials(name) {
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return words.slice(0, 2).map(word => word[0]).join('').toUpperCase();
  }

  function renderMelodySlot(button, slot) {
    const puzzle = state.puzzle;
    const row = Math.floor(slot / 9);
    const col = slot % 9;
    const trackCol = col - 1;

    if (solverEnabled && row >= 1 && row <= 4 && trackCol === puzzle.target) {
      button.classList.add('melody-column');
    }

    if (row === 0 && trackCol === puzzle.target) {
      const marker = document.createElement('span');
      marker.className = 'melody-marker';
      button.appendChild(marker);
    }

    if (row === puzzle.stage + 1 && trackCol === puzzle.current) {
      const runner = document.createElement('span');
      runner.className = 'melody-runner';
      button.appendChild(runner);
    }

    if (col === 7 && row >= 1 && row <= 4) {
      const melodyButton = document.createElement('span');
      melodyButton.className = 'melody-button';
      if (row === puzzle.stage + 1) melodyButton.classList.add('active');
      button.appendChild(melodyButton);
      if (solverEnabled && row === puzzle.stage + 1) button.classList.add('solver-target');
    }
  }

  function isInteractiveSlot(slot) {
    if (state.type === 'melody') {
      const row = Math.floor(slot / 9);
      const col = slot % 9;
      return col === 7 && row >= 1 && row <= 4;
    }
    return Boolean(state.puzzle.cells[slot]);
  }

  function remainingNumbers() {
    return Object.entries(state.puzzle.cells)
      .filter(([, cell]) => !cell.solved)
      .sort((a, b) => a[1].number - b[1].number)
      .map(([slot]) => Number(slot));
  }

  function calcRubixSolution() {
    const cells = state.puzzle.cells;
    const costs = [0,0,0,0,0];

    for (let target = 0; target < 5; target++) {
      state.puzzle.allowed.forEach(slot => {
        const current = cells[slot].colorIndex;
        const distance = Math.abs(target - current);
        costs[target] += Math.min(distance, 5 - distance);
      });
    }

    let target = 0;
    for (let i = 1; i < costs.length; i++) {
      if (costs[i] < costs[target]) target = i;
    }

    const diffs = {};
    state.puzzle.allowed.forEach(slot => {
      const current = cells[slot].colorIndex;
      let diff = target - current;
      if (diff > 2) diff -= 5;
      if (diff < -2) diff += 5;
      diffs[slot] = diff;
    });

    return { target, diffs, cost: costs[target] };
  }

  function handleSlot(slot, button) {
    if (!state || state.finished) return;

    if (state.type === 'numbers') clickNumbers(slot);
    else if (state.type === 'colors' || state.type === 'startswith') clickTargets(slot);
    else if (state.type === 'redgreen') clickRedGreen(slot);
    else if (state.type === 'rubix') clickRubix(slot, button);
    else if (state.type === 'melody') clickMelody(slot);

    if (!state.finished) {
      renderGrid();
      updateProgress();
    }
  }

  function clickNumbers(slot) {
    const order = remainingNumbers();
    if (slot !== order[0]) {
      registerMistake();
      return;
    }
    state.puzzle.cells[slot].solved = true;
    flash('good');
    if (remainingNumbers().length === 0) finishRound();
  }

  function clickTargets(slot) {
    const cell = state.puzzle.cells[slot];
    if (!cell || !cell.target || cell.solved) {
      registerMistake();
      return;
    }
    cell.solved = true;
    flash('good');
    const remaining = state.puzzle.allowed.filter(id => {
      const candidate = state.puzzle.cells[id];
      return candidate.target && !candidate.solved;
    });
    if (remaining.length === 0) finishRound();
  }

  function clickRedGreen(slot) {
    const cell = state.puzzle.cells[slot];
    if (!cell || cell.color !== 'red') {
      registerMistake();
      return;
    }
    cell.color = 'green';
    flash('good');
    if (state.puzzle.allowed.every(id => state.puzzle.cells[id].color === 'green')) finishRound();
  }

  function clickRubix(slot, button) {
    const cell = state.puzzle.cells[slot];
    if (!cell) return;

    if (solverEnabled) {
      const solution = calcRubixSolution();
      const diff = solution.diffs[slot];
      const wantedButton = diff > 0 ? 0 : diff < 0 ? 1 : null;
      if (wantedButton !== null && button !== wantedButton) registerMistake(false);
    }

    cell.colorIndex = button === 0
      ? (cell.colorIndex + 1) % 5
      : (cell.colorIndex + 4) % 5;

    const first = state.puzzle.cells[state.puzzle.allowed[0]].colorIndex;
    if (state.puzzle.allowed.every(id => state.puzzle.cells[id].colorIndex === first)) {
      flash('good');
      finishRound();
    }
  }

  function clickMelody(slot) {
    const row = Math.floor(slot / 9);
    const activeRow = state.puzzle.stage + 1;
    if (row !== activeRow || state.puzzle.current !== state.puzzle.target) {
      registerMistake();
      return;
    }

    flash('good');
    state.puzzle.stage += 1;
    if (state.puzzle.stage >= 4) {
      finishRound();
      return;
    }
    state.puzzle.phaseStartedAt = performance.now() - rand(0, 3) * state.puzzle.stepMs;
    state.puzzle.lastStep = -1;
  }

  function registerMistake(doFlash = true) {
    state.mistakes += 1;
    dom.mistakeValue.textContent = String(state.mistakes);
    if (doFlash) flash('bad');
  }

  function flash(kind) {
    dom.flashLayer.classList.remove('bad', 'good');
    void dom.flashLayer.offsetWidth;
    dom.flashLayer.classList.add(kind);
  }

  function finishRound() {
    if (state.finished) return;
    state.finished = true;
    state.finalTime = performance.now() - state.startedAt;

    const isPB = setPB(state.type, state.finalTime);
    solvedCount += 1;
    localStorage.setItem('f7trainer:solved', String(solvedCount));
    dom.solvedValue.textContent = String(solvedCount);

    if (state.mistakes === 0) cleanStreak += 1;
    else cleanStreak = 0;
    localStorage.setItem('f7trainer:streak', String(cleanStreak));
    dom.streakValue.textContent = String(cleanStreak);

    dom.timeValue.textContent = formatTime(state.finalTime);
    dom.pbValue.textContent = formatTime(getPB(state.type));
    dom.terminalCard.classList.add('complete');
    dom.roundState.className = 'round-state done';
    dom.roundState.textContent = isPB ? 'NEW PB' : 'COMPLETE';
    renderGrid();
    updateProgress();

    showToast((isPB ? 'NEW PB · ' : 'CLEAR · ') + formatTime(state.finalTime) + 's');

    const finishedId = state.id;
    if (autoNext) {
      window.setTimeout(() => {
        if (state && state.id === finishedId && state.finished) startRound(currentTypeForNewRound());
      }, 900);
    }
  }

  function updateProgress() {
    if (!state) return;
    if (state.type === 'numbers') {
      const total = state.puzzle.allowed.length;
      dom.progressText.textContent = (total - remainingNumbers().length) + ' / ' + total;
      return;
    }

    if (state.type === 'colors' || state.type === 'startswith') {
      const targets = state.puzzle.allowed.filter(id => state.puzzle.cells[id].target);
      const done = targets.filter(id => state.puzzle.cells[id].solved).length;
      dom.progressText.textContent = done + ' / ' + targets.length;
      return;
    }

    if (state.type === 'redgreen') {
      const remaining = state.puzzle.allowed.filter(id => state.puzzle.cells[id].color === 'red').length;
      dom.progressText.textContent = remaining + ' red remaining';
      return;
    }

    if (state.type === 'rubix') {
      const solution = calcRubixSolution();
      dom.progressText.textContent = solution.cost + ' optimal clicks';
      return;
    }

    dom.progressText.textContent = Math.min(state.puzzle.stage, 4) + ' / 4';
  }

  function updateMelody(now) {
    if (!state || state.type !== 'melody' || state.finished) return;
    const puzzle = state.puzzle;
    const elapsed = now - puzzle.phaseStartedAt;
    const step = Math.floor(elapsed / puzzle.stepMs);
    if (step === puzzle.lastStep) return;

    puzzle.lastStep = step;
    const sequence = [0,1,2,3,4,3,2,1];
    puzzle.current = sequence[((step % sequence.length) + sequence.length) % sequence.length];
    renderGrid();
  }

  function tick(now) {
    if (!state) return;
    const serial = state.id;
    if (!state.finished) {
      dom.timeValue.textContent = formatTime(now - state.startedAt);
      updateMelody(now);
      requestAnimationFrame(nextNow => {
        if (state && state.id === serial) tick(nextNow);
      });
    }
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 1300);
  }

  function syncModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(button => {
      button.classList.toggle('active', button.dataset.mode === selectedMode);
    });
  }

  document.querySelectorAll('.mode-btn').forEach(button => {
    button.addEventListener('click', () => {
      selectedMode = button.dataset.mode;
      syncModeButtons();
      startRound(currentTypeForNewRound());
    });
  });

  dom.solverToggle.addEventListener('change', () => {
    solverEnabled = dom.solverToggle.checked;
    localStorage.setItem('f7trainer:solver', solverEnabled ? '1' : '0');
    if (state) {
      renderLegend();
      renderGrid();
    }
    showToast('Solver ' + (solverEnabled ? 'ON' : 'OFF'));
  });

  dom.autoNextToggle.addEventListener('change', () => {
    autoNext = dom.autoNextToggle.checked;
    localStorage.setItem('f7trainer:autoNext', autoNext ? '1' : '0');
  });

  dom.restartBtn.addEventListener('click', restartRound);
  dom.nextBtn.addEventListener('click', () => startRound(currentTypeForNewRound()));

  window.addEventListener('keydown', event => {
    if (event.repeat) return;
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

    if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      restartRound();
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      startRound(currentTypeForNewRound());
    } else if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      solverEnabled = !solverEnabled;
      dom.solverToggle.checked = solverEnabled;
      localStorage.setItem('f7trainer:solver', solverEnabled ? '1' : '0');
      renderLegend();
      renderGrid();
      showToast('Solver ' + (solverEnabled ? 'ON' : 'OFF'));
    }
  });

  syncModeButtons();
  startRound(currentTypeForNewRound());
})();
