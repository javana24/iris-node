// Servidor local que imita las funciones de Vercel: `npm run dev` → http://localhost:3001
// Lee las variables de entorno de un fichero .env si existe.
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 3001);

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
}

const routes = {
  "/api/chat": () => import("../api/chat.js"),
  "/api/analyze": () => import("../api/analyze.js"),
  "/api/health": () => import("../api/health.js"),
  "/api/models": () => import("../api/models.js")
};

function adaptResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
    return res;
  };
  return res;
}

createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname.replace(/\/+$/, "");
  const loader = routes[path];
  adaptResponse(res);

  if (!loader) {
    return res.status(404).json({ error: "Not found" });
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  req.body = chunks.length ? Buffer.concat(chunks).toString("utf8") : undefined;

  const { default: handler } = await loader();
  await handler(req, res);
}).listen(PORT, () => {
  console.log(`IRIS API local en http://localhost:${PORT} (proveedores: ${process.env.AI_PROVIDERS || "ollama,groq"})`);
});
