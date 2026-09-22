import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const webBuild = path.join(repositoryRoot, "apps", "web", "dist");
const sitesBuild = path.join(repositoryRoot, "dist");
const workerEntrypoint = path.join(webBuild, "server", "index.js");

await access(workerEntrypoint);
await rm(sitesBuild, { recursive: true, force: true });
await cp(webBuild, sitesBuild, { recursive: true });

const hostingSource = path.join(repositoryRoot, ".openai", "hosting.json");
const hostingTarget = path.join(sitesBuild, ".openai", "hosting.json");
await mkdir(path.dirname(hostingTarget), { recursive: true });
await writeFile(hostingTarget, await readFile(hostingSource));

console.log("Prepared the Quorum web build for Sites.");
