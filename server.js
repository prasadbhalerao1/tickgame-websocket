require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const isVercel = Boolean(process.env.VERCEL);
const server = isVercel ? null : http.createServer(app);

const isProduction = process.env.NODE_ENV === "production";
const DOMAIN = process.env.DOMAIN || "http://localhost:3000";

const io =
    server == null
        ? null
        : new Server(server, {
              cors: {
                  origin: isProduction
                      ? "https://tickgame-websocket.vercel.app"
                      : "*",
                  methods: ["GET", "POST"],
              },
              transports: ["websocket", "polling"],
          });

const BASE_PORT = Number(process.env.PORT) || 3000;
let activePort = BASE_PORT;
const GRID_SIZE = 1000;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const KV_SET_KEY = "tickgame:checked";
const KV_VERSION_KEY = "tickgame:version";

// Sparse state: only checked cells are stored
const checked = new Set();
let version = 0;

const hasRedisEnv = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);
const hasKvEnv = Boolean(
    process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
);
let redis = null;
let kv = null;

if (hasRedisEnv) {
    try {
        const { Redis } = require("@upstash/redis");
        redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
        console.log("Upstash Redis enabled for persistent game state.");
    } catch {
        console.warn(
            "Redis env vars found but @upstash/redis missing; checking KV fallback.",
        );
    }
}

if (!redis && hasKvEnv) {
    try {
        ({ kv } = require("@vercel/kv"));
        console.log("Vercel KV enabled (legacy fallback).");
    } catch {
        console.warn(
            "KV env vars found but @vercel/kv missing; using in-memory fallback.",
        );
    }
}

const useRedis = Boolean(redis);
const useKv = Boolean(kv);
const usePersistentStore = useRedis || useKv;

function getBaseUrl() {
    if (isProduction) return DOMAIN;
    return `http://localhost:${activePort}`;
}

// Middleware
app.use(express.json());
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

async function getCurrentVersion() {
    if (!usePersistentStore) return version;
    const value = useRedis
        ? await redis.get(KV_VERSION_KEY)
        : await kv.get(KV_VERSION_KEY);
    return Number(value) || 0;
}

async function getCheckedCount() {
    if (!usePersistentStore) return checked.size;
    const count = useRedis
        ? await redis.scard(KV_SET_KEY)
        : await kv.scard(KV_SET_KEY);
    return Number(count) || 0;
}

async function getCheckedSnapshot() {
    if (!usePersistentStore) return checkedSnapshot();
    const members = useRedis
        ? await redis.smembers(KV_SET_KEY)
        : await kv.smembers(KV_SET_KEY);
    return members.map((entry) => Number(entry));
}

function statePayload(changed = true) {
    return {
        changed,
        version,
        checked: changed ? checkedSnapshot() : undefined,
        checkedCount: checked.size,
        totalCells: TOTAL_CELLS,
        users: io ? io.engine.clientsCount : null,
    };
}

function broadcastStats() {
    if (!io) return;

    io.emit("stats:update", {
        checkedCount: checked.size,
        totalCells: TOTAL_CELLS,
        users: io.engine.clientsCount,
    });
}

app.get("/api/state", async (req, res) => {
    try {
        const since = Number(req.query.since);
        const currentVersion = await getCurrentVersion();
        const checkedCount = await getCheckedCount();

        if (Number.isInteger(since) && since === currentVersion) {
            res.setHeader("Cache-Control", "no-store");
            return res.json({
                changed: false,
                version: currentVersion,
                checkedCount,
                totalCells: TOTAL_CELLS,
                users: io ? io.engine.clientsCount : null,
            });
        }

        const fullChecked = await getCheckedSnapshot();
        res.setHeader("Cache-Control", "no-store");
        return res.json({
            changed: true,
            version: currentVersion,
            checked: fullChecked,
            checkedCount,
            totalCells: TOTAL_CELLS,
            users: io ? io.engine.clientsCount : null,
        });
    } catch {
        return res.status(500).json({ error: "Failed to fetch state" });
    }
});

app.post("/api/toggle", async (req, res) => {
    try {
        const index = Number(req.body?.index);
        if (!Number.isInteger(index) || index < 0 || index >= TOTAL_CELLS) {
            return res.status(400).json({ error: "Invalid index" });
        }

        let nextValue;
        let nextVersion;
        let checkedCount;

        if (usePersistentStore) {
            const member = useRedis
                ? await redis.sismember(KV_SET_KEY, String(index))
                : await kv.sismember(KV_SET_KEY, String(index));
            if (member) {
                if (useRedis) {
                    await redis.srem(KV_SET_KEY, String(index));
                } else {
                    await kv.srem(KV_SET_KEY, String(index));
                }
                nextValue = false;
            } else {
                if (useRedis) {
                    await redis.sadd(KV_SET_KEY, String(index));
                } else {
                    await kv.sadd(KV_SET_KEY, String(index));
                }
                nextValue = true;
            }

            nextVersion = Number(
                useRedis
                    ? await redis.incr(KV_VERSION_KEY)
                    : await kv.incr(KV_VERSION_KEY),
            );
            checkedCount =
                Number(
                    useRedis
                        ? await redis.scard(KV_SET_KEY)
                        : await kv.scard(KV_SET_KEY),
                ) || 0;
            version = nextVersion;

            if (nextValue) {
                checked.add(index);
            } else {
                checked.delete(index);
            }
        } else {
            nextValue = !checked.has(index);
            if (nextValue) {
                checked.add(index);
            } else {
                checked.delete(index);
            }
            version += 1;
            nextVersion = version;
            checkedCount = checked.size;
        }

        if (io) {
            io.emit("cell:update", { index, checked: nextValue });
            broadcastStats();
        }

        return res.json({
            changed: false,
            version: nextVersion,
            checkedCount,
            totalCells: TOTAL_CELLS,
            users: io ? io.engine.clientsCount : null,
            index,
            checked: nextValue,
        });
    } catch {
        return res.status(500).json({ error: "Failed to toggle cell" });
    }
});

if (io) {
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
            version += 1;

            io.emit("cell:update", {
                index,
                checked: nextValue,
            });

            broadcastStats();
        });

        socket.on("grid:reset", () => {
            checked.clear();
            version += 1;
            io.emit("grid:reset");
            broadcastStats();
        });

        socket.on("disconnect", () => {
            broadcastStats();
        });
    });
}

function startServer(port, attemptsLeft = 10) {
    if (!server) return;
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

if (isVercel) {
    module.exports = app;
} else {
    startServer(BASE_PORT);
}
