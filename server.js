require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);

const isProduction = process.env.NODE_ENV === "production";
const DOMAIN = process.env.DOMAIN || "http://localhost:3000";

const io = new Server(server, {
    cors: {
        origin: isProduction ? "https://tickgame-websocket.vercel.app" : "*",
        methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
});

const BASE_PORT = Number(process.env.PORT) || 3000;
let activePort = BASE_PORT;
const GRID_SIZE = 1000;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;

// Sparse state: only checked cells are stored
const checked = new Set();

function getBaseUrl() {
    if (isProduction) return DOMAIN;
    return `http://localhost:${activePort}`;
}

// Middleware
app.use(
    express.static("public", {
        maxAge: "1h",
        etag: false,
    }),
);

// SEO Routes
app.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(`User-agent: *
Allow: /
Sitemap: ${getBaseUrl()}/sitemap.xml`);
});

app.get("/sitemap.xml", (req, res) => {
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${getBaseUrl()}/</loc>
        <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
</urlset>`);
});

// Security headers
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
        "Permissions-Policy",
        "geolocation=(), microphone=(), camera=()",
    );
    next();
});

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

function startServer(port, attemptsLeft = 10) {
    activePort = port;

    const onError = (err) => {
        if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
            console.warn(`Port ${port} is busy, trying ${port + 1}...`);
            startServer(port + 1, attemptsLeft - 1);
            return;
        }

        throw err;
    };

    server.once("error", onError);

    server.listen(port, () => {
        server.removeListener("error", onError);
        console.log(`Server running on http://localhost:${port}`);
    });
}

startServer(BASE_PORT);
