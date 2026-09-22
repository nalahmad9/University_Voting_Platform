import { app } from "./app.js";
import { env } from "./config/env.js";
import { disconnectPrisma } from "./lib/prisma.js";

const server = app.listen(env.PORT, () => {
  console.log(`Quorum API listening on port ${env.PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received; closing Quorum API`);
  server.close(async () => {
    await disconnectPrisma();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
