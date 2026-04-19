const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const GRID_SIZE = 1000;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

// Sparse state: only checked cells are stored
const checked = new Set();

app.use(express.static("public"));

function checkedSnapshot() {
    return Array.from(checked);
}

function broadcastStats() {
    io.emit("stats:update", {
        checkedCount: checked.size,
        totalCells: TOTAL_CELLS,
        users: io.engine.clientsCount,
    });
}

io.on("connection", (socket) => {
    socket.emit("state:init", {
        checked: checkedSnapshot(),
        totalCells: TOTAL_CELLS,
        users: io.engine.clientsCount,
    });

    broadcastStats();

    socket.on("cell:toggle", (rawIndex) => {
        const index = Number(rawIndex);

        if (!Number.isInteger(index) || index < 0 || index >= TOTAL_CELLS) {
            return;
        }

        const nextValue = !checked.has(index);

        if (nextValue) {
            checked.add(index);
        } else {
            checked.delete(index);
        }

        io.emit("cell:update", {
            index,
            checked: nextValue,
        });

        broadcastStats();
    });

    socket.on("grid:reset", () => {
        checked.clear();
        io.emit("grid:reset");
        broadcastStats();
    });

    socket.on("disconnect", () => {
        broadcastStats();
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
