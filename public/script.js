const socket = io();

const GRID_SIZE = 1000;
const CELL_SIZE = 12;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

const usersEl = document.getElementById("users");
const checkedEl = document.getElementById("checkedCount");
const percentEl = document.getElementById("percent");
const statsWidget = document.getElementById("statsWidget");
const statsToggle = document.getElementById("statsToggle");
const statsPanel = document.getElementById("statsPanel");

const checked = new Set();

function setStatsExpanded(expanded) {
    if (!statsWidget || !statsToggle || !statsPanel) return;

    statsWidget.classList.toggle("collapsed", !expanded);
    statsToggle.setAttribute("aria-expanded", String(expanded));
    statsPanel.setAttribute("aria-hidden", String(!expanded));
}

if (statsToggle) {
    statsToggle.addEventListener("click", () => {
        const expanded = statsToggle.getAttribute("aria-expanded") === "true";
        setStatsExpanded(!expanded);
    });
}

const spacer = document.getElementById("spacer");
spacer.style.width = `${GRID_SIZE * CELL_SIZE}px`;
spacer.style.height = `${GRID_SIZE * CELL_SIZE}px`;

let drawQueued = false;

function updateStats() {
    const count = checked.size;
    if (checkedEl) checkedEl.textContent = count.toLocaleString();
    if (percentEl) {
        percentEl.textContent = `${((count / TOTAL_CELLS) * 100).toFixed(2)}%`;
    }
}

function scheduleDraw() {
    if (drawQueued) return;
    drawQueued = true;

    requestAnimationFrame(() => {
        drawQueued = false;
        draw();
    });
}

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scheduleDraw();
}

function draw() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0, 0, width, height);

    const startCol = Math.max(0, Math.floor(scrollX / CELL_SIZE));
    const endCol = Math.min(
        GRID_SIZE - 1,
        Math.floor((scrollX + width) / CELL_SIZE),
    );

    const startRow = Math.max(0, Math.floor(scrollY / CELL_SIZE));
    const endRow = Math.min(
        GRID_SIZE - 1,
        Math.floor((scrollY + height) / CELL_SIZE),
    );

    for (let row = startRow; row <= endRow; row++) {
        const y = row * CELL_SIZE - scrollY;

        for (let col = startCol; col <= endCol; col++) {
            const x = col * CELL_SIZE - scrollX;
            const index = row * GRID_SIZE + col;

            if (checked.has(index)) {
                ctx.fillStyle = "#22c55e";
                ctx.fillRect(x + 1, y + 1, CELL_SIZE - 2, CELL_SIZE - 2);

                ctx.strokeStyle = "#052e16";
                ctx.strokeRect(x + 0.5, y + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);

                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(x + CELL_SIZE * 0.22, y + CELL_SIZE * 0.52);
                ctx.lineTo(x + CELL_SIZE * 0.42, y + CELL_SIZE * 0.72);
                ctx.lineTo(x + CELL_SIZE * 0.78, y + CELL_SIZE * 0.28);
                ctx.stroke();
            } else {
                ctx.strokeStyle = "#334155";
                ctx.lineWidth = 1;
                ctx.strokeRect(x + 0.5, y + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
            }
        }
    }
}

function setCell(index, value) {
    if (value) {
        checked.add(index);
    } else {
        checked.delete(index);
    }

    updateStats();
    scheduleDraw();
}

canvas.addEventListener("click", (e) => {
    const x = window.scrollX + e.clientX;
    const y = window.scrollY + e.clientY;

    const col = Math.floor(x / CELL_SIZE);
    const row = Math.floor(y / CELL_SIZE);

    if (col < 0 || row < 0 || col >= GRID_SIZE || row >= GRID_SIZE) return;

    const index = row * GRID_SIZE + col;
    const nextValue = !checked.has(index);

    setCell(index, nextValue);
    socket.emit("cell:toggle", index);
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("scroll", scheduleDraw, { passive: true });

socket.on("state:init", ({ checked: initialChecked = [], users }) => {
    checked.clear();
    for (const index of initialChecked) {
        checked.add(index);
    }

    if (usersEl) usersEl.textContent = users;
    updateStats();
    scheduleDraw();
});

socket.on("cell:update", ({ index, checked: value }) => {
    setCell(index, value);
});

socket.on("grid:reset", () => {
    checked.clear();
    updateStats();
    scheduleDraw();
});

socket.on("users:update", (count) => {
    if (usersEl) usersEl.textContent = count;
});

socket.on("stats:update", ({ checkedCount }) => {
    if (checkedEl) checkedEl.textContent = checkedCount.toLocaleString();
    if (percentEl) {
        percentEl.textContent = `${((checkedCount / TOTAL_CELLS) * 100).toFixed(2)}%`;
    }
});

resizeCanvas();
updateStats();
scheduleDraw();
