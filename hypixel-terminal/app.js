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
  const sizeRange = document.getElementById('sizeRange');
  const sizeValue = document.getElementById('sizeValue');
  const backButton = document.getElementById('backButton');

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
  let hoveredInput = null;

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

  function applySize(value) {
    const size = Math.max(70, Math.min(200, Number(value) || 100));
    sizeRange.value = String(size);
    sizeValue.textContent = size + '%';
    grid.style.setProperty('--scale', String(size / 100));
    localStorage.setItem('p3solver:size', String(size));
  }

  function showSelection() {
    state = null;
    gameScreen.classList.add('hidden');
    gameScreen.classList.remove('complete');
    selectionScreen.classList.remove('hidden');
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
    const slots = [10,11,12,13,14,19,20,21,22,23];
    const values = shuffle(Array.from({ length: 10 }, (_, i) => i + 1));
    const cells = {};
    slots.forEach((slot, index) => {
      cells[slot] = { number: values[index], solved: false };
    });
    return { cols: 5, rows: 2, slots, cells };
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
    const slots = [10,11,12,13,14,15,16,19,20,21,22,23,24,25,28,29,30,31,32,33,34,37,38,39,40,41,42,43];
    const targets = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'brown', 'orange', 'purple', 'light gray'];
    const target = pick(targets);
    const matching = ALL_COLOR_ITEMS.filter(name => matchesColor(name, target));
    const others = ALL_COLOR_ITEMS.filter(name => !matchesColor(name, target));
    const chosen = [];

    shuffle(matching).slice(0, Math.min(rand(5, 8), matching.length)).forEach(name => chosen.push(name));
    while (chosen.length < slots.length) chosen.push(pick(others));

    const cells = {};
    shuffle(chosen).forEach((name, index) => {
      cells[slots[index]] = {
        target: matchesColor(name, target),
        solved: false
      };
    });

    return { cols: 7, rows: 4, slots, cells };
  }

  function generateStartsWith() {
    const slots = [10,11,12,13,14,15,16,19,20,21,22,23,24,25,28,29,30,31,32,33,34,37,38,39,40,41,42,43];
    const letters = Array.from(new Set(ITEM_POOL.map(name => name[0].toUpperCase())))
      .filter(letter => ITEM_POOL.filter(name => name[0].toUpperCase() === letter).length >= 3);
    const letter = pick(letters);
    const matching = ITEM_POOL.filter(name => name[0].toUpperCase() === letter);
    const others = ITEM_POOL.filter(name => name[0].toUpperCase() !== letter);
    const chosen = [];

    shuffle(matching).slice(0, Math.min(rand(4, 7), matching.length)).forEach(name => chosen.push(name));
    while (chosen.length < slots.length) chosen.push(pick(others));

    const cells = {};
    shuffle(chosen).forEach((name, index) => {
      cells[slots[index]] = {
        target: name[0].toUpperCase() === letter,
        solved: false
      };
    });

    return { cols: 7, rows: 4, slots, cells };
  }

  function generateRedGreen() {
    const slots = [11,12,13,14,15,20,21,22,23,24,29,30,31,32,33];
    const redCount = rand(6, 11);
    const redFlags = shuffle(slots.map((_, index) => index < redCount));
    const cells = {};

    slots.forEach((slot, index) => {
      cells[slot] = { red: redFlags[index] };
    });

    return { cols: 5, rows: 3, slots, cells };
  }

  function generateRubix() {
    const slots = [12,13,14,21,22,23,30,31,32];
    let values;

    do {
      values = slots.map(() => rand(0, 4));
    } while (values.every(value => value === values[0]));

    const cells = {};
    slots.forEach((slot, index) => {
      cells[slot] = { color: values[index] };
    });

    return { cols: 3, rows: 3, slots, cells };
  }

  function generateMelody() {
    return {
      cols: 6,
      rows: 4,
      target: rand(0, 4),
      stage: 0,
      current: rand(0, 4),
      phaseStartedAt: performance.now() - rand(0, 5) * 230,
      stepMs: 350,
      lastStep: -1
    };
  }

  function remainingNumbers() {
    return Object.entries(state.puzzle.cells)
      .filter(([, cell]) => !cell.solved)
      .sort((a, b) => a[1].number - b[1].number)
      .map(([slot]) => Number(slot));
  }

  function rubixSolution() {
    const costs = [0, 0, 0, 0, 0];

    for (let target = 0; target < 5; target++) {
      state.puzzle.slots.forEach(slot => {
        const current = state.puzzle.cells[slot].color;
        const distance = Math.abs(target - current);
        costs[target] += Math.min(distance, 5 - distance);
      });
    }

    let target = 0;
    for (let i = 1; i < 5; i++) {
      if (costs[i] < costs[target]) target = i;
    }

    const diffs = {};
    state.puzzle.slots.forEach(slot => {
      const current = state.puzzle.cells[slot].color;
      let diff = target - current;
      if (diff > 2) diff -= 5;
      if (diff < -2) diff += 5;
      diffs[slot] = diff;
    });

    return diffs;
  }

  function makeCell() {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'solver-cell';
    return cell;
  }

  function showSolverCell(cell, className, label) {
    cell.classList.add('visible');
    if (className) cell.classList.add(className);

    if (label !== undefined && label !== null) {
      const text = document.createElement('span');
      text.className = 'solver-label';
      text.textContent = String(label);
      cell.appendChild(text);
    }
  }

  function armCell(cell, leftAction, rightAction = leftAction) {
    cell.addEventListener('mouseenter', () => {
      hoveredInput = { leftAction, rightAction, cell };
    });
    cell.addEventListener('mouseleave', () => {
      if (hoveredInput?.cell === cell) hoveredInput = null;
    });
    cell.addEventListener('click', event => {
      if (event.shiftKey && rightAction !== leftAction) rightAction();
      else leftAction();
    });
    cell.addEventListener('contextmenu', event => {
      event.preventDefault();
      rightAction();
    });
  }

  function render() {
    if (!state) return;

    hoveredInput = null;
    grid.innerHTML = '';
    grid.style.setProperty('--cols', String(state.puzzle.cols));

    if (state.type === 'melody') {
      renderMelody();
      return;
    }

    const numberOrder = state.type === 'numbers' ? remainingNumbers() : [];
    const rubixDiffs = state.type === 'rubix' ? rubixSolution() : null;

    state.puzzle.slots.forEach(slot => {
      const cell = makeCell();

      if (!state.finished) {
        if (state.type === 'numbers') {
          const order = numberOrder.indexOf(slot);
          if (order >= 0 && order < 3) {
            showSolverCell(cell, 'order-' + (order + 1), state.puzzle.cells[slot].number);
            armCell(cell, () => handleNumbers(slot));
          }
        }

        else if (state.type === 'colors' || state.type === 'startswith') {
          const data = state.puzzle.cells[slot];
          if (data.target && !data.solved) {
            showSolverCell(cell);
            armCell(cell, () => handleTarget(slot));
          }
        }

        else if (state.type === 'redgreen') {
          if (state.puzzle.cells[slot].red) {
            showSolverCell(cell);
            armCell(cell, () => handleRedGreen(slot));
          }
        }

        else if (state.type === 'rubix') {
          const diff = rubixDiffs[slot];
          if (diff !== 0) {
            showSolverCell(cell, diff < 0 ? 'negative' : '', diff);
            armCell(cell, () => handleRubix(slot, 0), () => handleRubix(slot, 1));
          }
        }
      }

      grid.appendChild(cell);
    });
  }

  function renderMelody() {
    const p = state.puzzle;

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        const cell = makeCell();

        if (col === p.target) {
          cell.classList.add('column');
        }

        if (row === p.stage && col === p.target) {
          const target = document.createElement('span');
          target.className = 'melody-target';
          cell.appendChild(target);
        }

        if (!state.finished && row === p.stage && col === p.current) {
          const runner = document.createElement('span');
          runner.className = 'melody-runner';
          cell.appendChild(runner);
        }

        if (!state.finished && col === 5 && row === p.stage) {
          showSolverCell(cell);
          armCell(cell, () => handleMelody(row));
        }

        grid.appendChild(cell);
      }
    }
  }

  function handleNumbers(slot) {
    if (!state || state.finished) return;
    const order = remainingNumbers();
    if (slot !== order[0]) return;

    state.puzzle.cells[slot].solved = true;
    if (remainingNumbers().length === 0) finish();
    else render();
  }

  function handleTarget(slot) {
    if (!state || state.finished) return;
    const data = state.puzzle.cells[slot];
    if (!data || !data.target || data.solved) return;

    data.solved = true;
    const hasRemaining = state.puzzle.slots.some(id => {
      const item = state.puzzle.cells[id];
      return item.target && !item.solved;
    });

    if (!hasRemaining) finish();
    else render();
  }

  function handleRedGreen(slot) {
    if (!state || state.finished) return;
    const data = state.puzzle.cells[slot];
    if (!data || !data.red) return;

    data.red = false;
    if (state.puzzle.slots.every(id => !state.puzzle.cells[id].red)) finish();
    else render();
  }

  function handleRubix(slot, button) {
    if (!state || state.finished) return;
    const data = state.puzzle.cells[slot];
    if (!data) return;

    data.color = button === 0
      ? (data.color + 1) % 5
      : (data.color + 4) % 5;

    const first = state.puzzle.cells[state.puzzle.slots[0]].color;
    if (state.puzzle.slots.every(id => state.puzzle.cells[id].color === first)) finish();
    else render();
  }

  function handleMelody(row) {
    if (!state || state.finished) return;
    const p = state.puzzle;

    if (row !== p.stage || p.current !== p.target) return;

    p.stage += 1;
    if (p.stage >= 4) {
      finish();
      return;
    }

    p.phaseStartedAt = performance.now() - rand(0, 3) * p.stepMs;
    p.lastStep = -1;
    render();
  }

  function updateMelody(now) {
    if (!state || state.type !== 'melody' || state.finished) return;

    const p = state.puzzle;
    const step = Math.floor((now - p.phaseStartedAt) / p.stepMs);
    if (step === p.lastStep) return;

    p.lastStep = step;
    const sequence = [0, 1, 2, 3, 4, 3, 2, 1];
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

  sizeRange.addEventListener('input', () => applySize(sizeRange.value));
  backButton.addEventListener('click', showSelection);
  gameScreen.addEventListener('contextmenu', event => event.preventDefault());

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state) {
      event.preventDefault();
      showSelection();
      return;
    }

    if (state && event.key.toLowerCase() === 'q' && hoveredInput) {
      event.preventDefault();
      hoveredInput.leftAction();
    }
  });

  applySize(localStorage.getItem('p3solver:size') || 100);
})();
