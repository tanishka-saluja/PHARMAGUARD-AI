const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.AWARENESS_FEED_PORT || "8787");
const ADMIN_KEY = process.env.AWARENESS_ADMIN_KEY || "";
const FEED_FILE_PATH = process.env.AWARENESS_FEED_FILE
  ? path.resolve(process.env.AWARENESS_FEED_FILE)
  : path.join(__dirname, "feed.json");

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,x-admin-key",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function ensureFeedFile() {
  if (!fs.existsSync(FEED_FILE_PATH)) {
    const initial = { updatedAt: new Date().toISOString(), posts: [] };
    fs.writeFileSync(FEED_FILE_PATH, JSON.stringify(initial, null, 2));
  }
}

function readFeed() {
  ensureFeedFile();
  const raw = fs.readFileSync(FEED_FILE_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  return {
    updatedAt: String(parsed.updatedAt || new Date().toISOString()),
    posts: Array.isArray(parsed.posts) ? parsed.posts : [],
  };
}

function normalizePost(post, fallbackId) {
  const details = Array.isArray(post?.details)
    ? post.details.map((line) => String(line)).filter((line) => line.trim().length > 0)
    : [];

  const tags = Array.isArray(post?.tags)
    ? post.tags.map((tag) => String(tag)).filter((tag) => tag.trim().length > 0)
    : [];

  return {
    id: String(post?.id || `post-${fallbackId}`),
    title: String(post?.title || "Public safety update"),
    summary: String(post?.summary || "Medicine safety advisory."),
    details,
    action: String(post?.action || "Verify and report suspicious medicines."),
    emergency: Boolean(post?.emergency),
    tags,
    publishedAt: String(post?.publishedAt || new Date().toISOString()),
  };
}

function sortPosts(posts) {
  return [...posts].sort((a, b) => {
    if (a.emergency !== b.emergency) {
      return a.emergency ? -1 : 1;
    }
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

function writeFeed(feed) {
  const normalizedPosts = sortPosts(feed.posts.map((post, idx) => normalizePost(post, idx)));
  const payload = {
    updatedAt: new Date().toISOString(),
    posts: normalizedPosts,
  };
  fs.writeFileSync(FEED_FILE_PATH, JSON.stringify(payload, null, 2));
  return payload;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true, time: new Date().toISOString() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/awareness") {
    sendJson(res, 200, readFeed());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/awareness") {
    if (!ADMIN_KEY) {
      sendJson(res, 503, {
        error: "Server admin key not configured",
        hint: "Set AWARENESS_ADMIN_KEY before accepting write requests.",
      });
      return;
    }

    if (req.headers["x-admin-key"] !== ADMIN_KEY) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    try {
      const body = await parseJsonBody(req);
      const mode = body.mode === "replace" ? "replace" : "append";
      const incomingPosts = Array.isArray(body.posts)
        ? body.posts
        : body.post
          ? [body.post]
          : [];

      if (!incomingPosts.length) {
        sendJson(res, 400, { error: "No posts provided" });
        return;
      }

      const current = readFeed();
      const merged =
        mode === "replace"
          ? incomingPosts
          : [...current.posts, ...incomingPosts];

      const saved = writeFeed({ posts: merged });
      sendJson(res, 200, {
        ok: true,
        mode,
        updatedAt: saved.updatedAt,
        totalPosts: saved.posts.length,
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "Bad request" });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Awareness feed server running on http://0.0.0.0:${PORT}`);
  console.log(`Feed file: ${FEED_FILE_PATH}`);
  if (!ADMIN_KEY) {
    console.log("Warning: AWARENESS_ADMIN_KEY not set. POST writes are disabled.");
  }
});
