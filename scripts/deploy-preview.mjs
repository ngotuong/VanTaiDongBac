import { spawnSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";

const identity = JSON.parse(fs.readFileSync(new URL("../config/environment-identity.json", import.meta.url), "utf8"));
const PROJECT_ID = identity.vercel.projectId;
const PROJECT_NAME = identity.vercel.projectName;
const TEAM_SLUG = identity.vercel.teamSlug;
const PREVIEW_ALIAS = identity.vercel.previewAlias;
const PRODUCTION_ALIAS = identity.vercel.productionAlias;
const PREVIEW_APPS_SCRIPT_URL =
  `https://script.google.com/macros/s/${identity.appsScript.previewDeploymentId}/exec`;

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      VERCEL_ORG_ID: "team_1BMzW3A2mFKTuGEyw1Z868Nx",
      VERCEL_PROJECT_ID: PROJECT_ID,
    },
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (capture && result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
  return capture ? result.stdout.trim() : "";
}

function readJson(command, args) {
  const output = run(command, args, { capture: true });
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`Expected JSON from ${command} ${args.join(" ")}`);
  }
}

function readAliasDeployment(alias) {
  const payload = readJson("vercel", [
    "api",
    `/v4/aliases/${alias}`,
    "--scope",
    TEAM_SLUG,
    "--raw",
  ]);
  if (!payload.deploymentId) {
    throw new Error(`Alias ${alias} has no deploymentId`);
  }
  return payload.deploymentId;
}

function readDeployment(output) {
  try {
    const payload = JSON.parse(output);
    const url = payload.url || payload.deployment?.url;
    const id = payload.id || payload.deployment?.id;
    if (url) {
      return {
        id: id || "unknown",
        url: url.startsWith("http") ? url : `https://${url}`,
      };
    }
  } catch {
    // Fall through to the URL parser for older CLI output.
  }

  const url = output.match(/https:\/\/[a-z0-9.-]+\.vercel\.app/i)?.[0];
  if (!url) {
    throw new Error("Vercel deploy did not return a deployment URL");
  }
  return { id: "unknown", url };
}

async function smokePreview() {
  let lastError = "unknown";
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const response = await fetch(`https://${PREVIEW_ALIAS}/`, {
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      const html = await response.text();
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
      } else if (response.url.includes("vercel.com/login") || html.includes("Login – Vercel")) {
        lastError = "redirected to Vercel Login";
      } else if (!html.includes("<title>Vận tải Đông Bắc")) {
        lastError = "missing the expected application title";
      } else {
        const healthResponse = await fetch(
          `https://${PREVIEW_ALIAS}/api/app?action=health`,
          {
            cache: "no-store",
            redirect: "follow",
            signal: AbortSignal.timeout(30_000),
          },
        );
        const healthPayload = await healthResponse.json().catch(() => ({}));
        if (!healthResponse.ok) {
          lastError = `API health HTTP ${healthResponse.status}: ${healthPayload.error || "unknown error"}`;
        } else if (healthPayload.ok !== true) {
          lastError = `API health failed: ${healthPayload.error || "invalid payload"}`;
        } else {
          return;
        }
      }
    } catch (error) {
      lastError = error.message;
    }

    if (attempt < 10) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw new Error(`Preview smoke failed after alias propagation retries: ${lastError}`);
}

async function main() {
  run("npm", ["run", "check:identity"]);
  const project = readJson("vercel", [
    "api",
    `/v9/projects/${PROJECT_NAME}`,
    "--scope",
    TEAM_SLUG,
    "--raw",
  ]);
  if (project.id !== PROJECT_ID) {
    throw new Error(`Project guard failed: expected ${PROJECT_ID}, received ${project.id}`);
  }

  const productionBefore = readAliasDeployment(PRODUCTION_ALIAS);

  run("npm", ["test"]);
  run("npm", ["run", "lint"]);
  run("npm", ["run", "typecheck"]);
  run("npm", ["run", "build"]);
  run("git", ["diff", "--check"]);

  const deploymentOutput = run(
    "vercel",
    [
      "deploy",
      "--prod",
      "--skip-domain",
      "--yes",
      "--force",
      "--format",
      "json",
      "--project",
      PROJECT_ID,
      "--scope",
      TEAM_SLUG,
      "--env",
      `APPS_SCRIPT_URL=${PREVIEW_APPS_SCRIPT_URL}`,
      "--env",
      "BUSINESS_WRITES_PAUSED=true",
    ],
    { capture: true },
  );
  const deployment = readDeployment(deploymentOutput);

  run("vercel", [
    "alias",
    "set",
    deployment.url,
    PREVIEW_ALIAS,
    "--scope",
    TEAM_SLUG,
  ]);

  await smokePreview();

  const productionAfter = readAliasDeployment(PRODUCTION_ALIAS);
  if (productionAfter !== productionBefore) {
    throw new Error(
      `Production guard failed: ${PRODUCTION_ALIAS} moved from ${productionBefore} to ${productionAfter}`,
    );
  }

  process.stdout.write(
    [
      "Preview deploy READY",
      `URL: https://${PREVIEW_ALIAS}`,
      `Deployment: ${deployment.id}`,
      `Production unchanged: ${productionAfter}`,
      "",
    ].join("\n"),
  );
}

main().catch((error) => {
  process.stderr.write(`Preview deploy failed: ${error.message}\n`);
  process.exitCode = 1;
});
