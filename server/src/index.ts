import express from "express";
import { GRID_SIZE } from "@steel-horizon/shared";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", gridSize: GRID_SIZE });
});

const port = Number(process.env.PORT) || 3001;

app.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});
