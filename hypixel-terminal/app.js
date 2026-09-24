(() => {
  'use strict';

  const TYPES = {
    numbers: 'Numbers',
    colors: 'Colors',
    startswith: 'Starts With',
    redgreen: 'Red / Green',
    rubix: 'Rubix',
    melody: 'Melody'
  };

  const selectionScreen = document.getElementById('selectionScreen');
  const gameScreen = document.getElementById('gameScreen');
  const gameTitle = document.getElementById('gameTitle');
  const grid = document.getElementById('grid');
  const timer = document.getElementById('timer');

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

  const ALL_COLOR_ITEMS = Array.from(new Set(ITEM_POOL.concat([
    'Black Wool', 'Orange Tulip', 'Purple Dye', 'Silverfish',
    'Rose Bush', 'Lapis Block', 'Dandelion Yellow'
  ])));

  let state = null;
  let serial = 0;

  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = list => list[Math.floor(Math.random() * list.length)];

  function shuffle(input) {
    const list = input.slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function showSelection() {
    state = null;
    selectionScreen.classList.remove('hidden');
    gameScreen.classList.add('hidden');
    gameScreen.classList.remove('complete');
  }

  function startGame(type) {
    state = {
      id: ++serial,
      type,
      startedAt: performance.now(),
      finished: false,
      finalTime: 0,
      puzzle: generatePuzzle(type)
    };

    selectionScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden', 'complete');
    gameTitle.textContent = TYPES[type];
    timer.textContent = '0.000';
    render();
    requestAnimationFrame(tick);
  }

  function restart() {
    if (state) startGame(state.type);
  }

  function finish() {
    if (!state || state.finished) return;
    state.finished = true;
    state.finalTime = performance.now() - state.startedAt;
    timer.textContent = (state.finalTime / 1000).toFixed(3);
    gameScreen.classList.add('complete');
    render();
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
    const values = shuffle(Array.from({ length: 14 }, (_, i) => i + 1));
    const cells = {};
    allowed.forEach((slot, i) => {
      cells[slot] = { kind: 'pane', color: 'red', number: values[i], solved: false };
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

  function generateColors() {
    const allowed = [10,11,12,13,14,15,16,19,20,21,22,23,24,25,28,29,30,31,32,33,34,37,38,39,40,41,42,43];
    const targets = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'brown', 'orange', 'purple', 'light gray'];
    const target = pick(targets);
    const matching = ALL_COLOR_ITEMS.filter(name => matchesColor(name, target));
    const others = ALL_COLOR_ITEMS.filter(name => !matchesColor(name, target));

    const chosen = [];
    const targetCount = Math.min(rand(5, 8), matching.length);
    shuffle(matching).slice(0, targetCount).forEach(name => chosen.push(name));
    while (chosen.length < allowed.length) chosen.push(pick(others));

    const cells = {};
    shuffle(chosen).forEach((name, i) => {
      cells[allowed[i]] = {
        kind: 'item',
        name,
        target: matchesColor(name, target),
        solved: false,
        color: hashColor(name)
      };
    });

    return { rows: 6, allowed, cells };
  }

  function generateStartsWith() {
    const allowed = [10,11,12,13,14,15,16,19,20,21,22,23,24,25,28,29,30,31,32,33,34,37,38,39,40,41,42,43];
    const letters = Array.from(new Set(ITEM_POOL.map(name => name[0].toUpperCase())))
      .filter(letter => ITEM_POOL.filter(name => name[0].toUpperCase() === letter).length >= 3);
    const letter = pick(letters);
    const matching = ITEM_POOL.filter(name => name[0].toUpperCase() === letter);
    const others = ITEM_POOL.filter(name => name[0].toUpperCase() !== letter);

    const chosen = [];
    shuffle(matching).slice(0, Math.min(rand(4, 7), matching.length)).forEach(name => chosen.push(name));
    while (chosen.length < allowed.length) chosen.push(pick(others));

    const cells = {};
    shuffle(chosen).forEach((name, i) => {
      cells[allowed[i]] = {
        kind: 'item',
        name,
        target: name[0].toUpperCase() === letter,
        solved: false,
        color: hashColor(name)
      };
    });

    return { rows: 5, allowed, cells };
  }

  function generateRedGreen() {
    const allowed = [11,12,13,14,15,20,21,22,23,24,29,30,31,32,33];
    const redCount = rand(6, 11);
    const flags = shuffle(allowed.map((_, i) => i < redCount));
    const cells = {};
    allowed.forEach((slot, i) => {
      cells[slot] = { kind: 'pane', color: flags[i] ? 'red' : 'green' };
    });
    return { rows: 5, allowed, cells };
  }

  function generateRubix() {
    const allowed = [12,13,14,21,22,23,30,31,32];
    let colors;
    do {
      colors = allowed.map(() => rand(0, 4));
    } while (colors.every(value => value === colors[0]));

    const cells = {};
    allowed.forEach((slot, i) => {
      cells[slot] = { kind: 'rubix', colorIndex: colors[i] };
    });

    return { rows: 5, allowed, cells };
  }

  function generateMelody() {
    return {
      rows: 6,
      target: rand(0, 4),
      stage: 0,
      current: rand(0, 4),
      phaseStartedAt: performance.now() - rand(0, 5) * 230,
      stepMs: 230,
      lastStep: -1
    };
  }

  function hashColor(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return 'hsl(' + (Math.abs(hash) % 360) + ' 38% 48%)';
  }

  function paneColor(name) {
    if (name === 'red') return '#c43f3f';
    if (name === 'green') return '#4caa4f';
    return '#777';
  }

  function render() {
    if (!state) return;
    grid.innerHTML = '';

    const rows = state.puzzle.rows;
    const numberOrder = state.type === 'numbers' ? remainingNumbers() : [];
    const rubix = state.type === 'rubix' ? rubixSolution() : null;

    for (let slot = 0; slot < rows * 9; slot++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot';

      if (state.type === 'melody') {
        renderMelody(button, slot);
      } else {
        const cell = state.puzzle.cells[slot];
        if (cell) renderCell(button, slot, cell, numberOrder, rubix);
      }

      if (!state.finished && isInteractive(slot)) {
        button.classList.add('interactive');

        button.addEventListener('click', event => {
          handleSlot(slot, state.type === 'rubix' && event.shiftKey ? 1 : 0);
        });

        button.addEventListener('contextmenu', event => {
          if (state.type !== 'rubix') return;
          event.preventDefault();
          handleSlot(slot, 1);
        });
      }

      grid.appendChild(button);
    }
  }

  function renderCell(button, slot, cell, numberOrder, rubix) {
    if (cell.solved) button.classList.add('solved');

    if (cell.kind === 'pane') {
      const pane = document.createElement('span');
      pane.className = 'pane';
      pane.style.setProperty('--pane-color', paneColor(cell.color));
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
      initials.textContent = initialsFor(cell.name);
      button.appendChild(initials);

      const label = document.createElement('span');
      label.className = 'item-name';
      label.textContent = cell.name;
      button.appendChild(label);
      button.title = cell.name;
    }

    if (cell.kind === 'rubix') {
      const pane = document.createElement('span');
      pane.className = 'pane';
      pane.style.setProperty('--pane-color', COLOR_CYCLE[cell.colorIndex].hex);
      button.appendChild(pane);
    }

    if (cell.solved) return;

    if (state.type === 'numbers') {
      const index = numberOrder.indexOf(slot);
      if (index >= 0 && index < 3) button.classList.add('solver-' + (index + 1));
    } else if (state.type === 'colors' || state.type === 'startswith') {
      if (cell.target) button.classList.add('solver-target');
    } else if (state.type === 'redgreen') {
      if (cell.color === 'red') button.classList.add('solver-target');
    } else if (state.type === 'rubix') {
      const diff = rubix.diffs[slot];
      if (diff) {
        button.classList.add(diff > 0 ? 'solver-positive' : 'solver-negative');
        const number = document.createElement('span');
        number.className = 'solver-number';
        number.textContent = String(diff);
        button.appendChild(number);
      }
    }
  }

  function renderMelody(button, slot) {
    const p = state.puzzle;
    const row = Math.floor(slot / 9);
    const col = slot % 9;
    const trackCol = col - 1;

    if (row >= 1 && row <= 4 && trackCol === p.target) {
      button.classList.add('melody-column');
    }

    if (row === 0 && trackCol === p.target) {
      const marker = document.createElement('span');
      marker.className = 'melody-marker';
      button.appendChild(marker);
    }

    if (row === p.stage + 1 && trackCol === p.current) {
      const runner = document.createElement('span');
      runner.className = 'melody-runner';
      button.appendChild(runner);
    }

    if (col === 7 && row >= 1 && row <= 4) {
      const control = document.createElement('span');
      control.className = 'melody-button';
      if (row === p.stage + 1) control.classList.add('active');
      button.appendChild(control);

      if (row === p.stage + 1) button.classList.add('solver-target');
    }
  }

  function initialsFor(name) {
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return words.slice(0, 2).map(word => word[0]).join('').toUpperCase();
  }

  function isInteractive(slot) {
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

  function rubixSolution() {
    const costs = [0,0,0,0,0];

    for (let target = 0; target < 5; target++) {
      state.puzzle.allowed.forEach(slot => {
        const current = state.puzzle.cells[slot].colorIndex;
        const distance = Math.abs(target - current);
        costs[target] += Math.min(distance, 5 - distance);
      });
    }

    let target = 0;
    for (let i = 1; i < 5; i++) {
      if (costs[i] < costs[target]) target = i;
    }

    const diffs = {};
    state.puzzle.allowed.forEach(slot => {
      const current = state.puzzle.cells[slot].colorIndex;
      let diff = target - current;
      if (diff > 2) diff -= 5;
      if (diff < -2) diff += 5;
      diffs[slot] = diff;
    });

    return { target, diffs };
  }

  function handleSlot(slot, mouseButton) {
    if (!state || state.finished) return;

    if (state.type === 'numbers') {
      const order = remainingNumbers();
      if (slot !== order[0]) return;
      state.puzzle.cells[slot].solved = true;
      if (remainingNumbers().length === 0) finish();
    }

    else if (state.type === 'colors' || state.type === 'startswith') {
      const cell = state.puzzle.cells[slot];
      if (!cell || !cell.target || cell.solved) return;
      cell.solved = true;

      const left = state.puzzle.allowed.some(id => {
        const candidate = state.puzzle.cells[id];
        return candidate.target && !candidate.solved;
      });

      if (!left) finish();
    }

    else if (state.type === 'redgreen') {
      const cell = state.puzzle.cells[slot];
      if (!cell || cell.color !== 'red') return;
      cell.color = 'green';

      if (state.puzzle.allowed.every(id => state.puzzle.cells[id].color === 'green')) {
        finish();
      }
    }

    else if (state.type === 'rubix') {
      const cell = state.puzzle.cells[slot];
      if (!cell) return;

      cell.colorIndex = mouseButton === 0
        ? (cell.colorIndex + 1) % 5
        : (cell.colorIndex + 4) % 5;

      const first = state.puzzle.cells[state.puzzle.allowed[0]].colorIndex;
      if (state.puzzle.allowed.every(id => state.puzzle.cells[id].colorIndex === first)) {
        finish();
      }
    }

    else if (state.type === 'melody') {
      const row = Math.floor(slot / 9);
      const activeRow = state.puzzle.stage + 1;

      if (row !== activeRow || state.puzzle.current !== state.puzzle.target) return;

      state.puzzle.stage += 1;
      if (state.puzzle.stage >= 4) {
        finish();
      } else {
        state.puzzle.phaseStartedAt = performance.now() - rand(0, 3) * state.puzzle.stepMs;
        state.puzzle.lastStep = -1;
      }
    }

    if (state && !state.finished) render();
  }

  function updateMelody(now) {
    if (!state || state.type !== 'melody' || state.finished) return;

    const p = state.puzzle;
    const step = Math.floor((now - p.phaseStartedAt) / p.stepMs);
    if (step === p.lastStep) return;

    p.lastStep = step;
    const sequence = [0,1,2,3,4,3,2,1];
    p.current = sequence[((step % sequence.length) + sequence.length) % sequence.length];
    render();
  }

  function tick(now) {
    if (!state) return;
    const id = state.id;

    if (!state.finished) {
      timer.textContent = ((now - state.startedAt) / 1000).toFixed(3);
      updateMelody(now);

      requestAnimationFrame(next => {
        if (state && state.id === id) tick(next);
      });
    }
  }

  document.querySelectorAll('[data-type]').forEach(button => {
    button.addEventListener('click', () => startGame(button.dataset.type));
  });

  gameTitle.addEventListener('click', showSelection);

  window.addEventListener('keydown', event => {
    if (event.repeat) return;

    if (event.key === 'Escape') {
      showSelection();
      return;
    }

    if (!state) return;

    if (event.key.toLowerCase() === 'r') {
      restart();
    } else if (event.key === 'Enter' && state.finished) {
      restart();
    }
  });
})();
