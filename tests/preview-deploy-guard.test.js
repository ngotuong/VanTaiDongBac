const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "scripts/deploy-preview.mjs"), "utf8");
const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const identity = JSON.parse(fs.readFileSync(path.join(root, "config/environment-identity.json"), "utf8"));

test("preview deploy is pinned to the guarded project and stable alias", () => {
  assert.equal(packageJson.scripts["deploy:preview"], "node scripts/deploy-preview.mjs");
  assert.equal(identity.vercel.projectId, "prj_ksh9aZZowziqFw2G2tWJzbnwtSOG");
  assert.equal(identity.vercel.previewAlias, "vantaidongbac-preview.vercel.app");
  assert.equal(identity.vercel.productionAlias, "dongbac.vercel.app");
  assert.match(script, /environment-identity\.json/);
  assert.match(script, /identity\.vercel\.projectId/);
  assert.match(script, /--skip-domain/);
  assert.match(script, /productionAfter !== productionBefore/);
  assert.match(script, /attempt <= 10/);
  assert.match(script, /alias propagation retries/);
  assert.match(script, /\/api\/app\?action=health/);
  assert.match(script, /healthPayload\.ok !== true/);
  assert.match(script, /API health HTTP/);
});

test("agent instructions retire the mutable C3 preview workflow", () => {
  assert.match(agents, /Chỉ chạy `npm run deploy:preview`/);
  assert.match(agents, /vantaidongbac-c3-preview\.vercel\.app` là alias đã nghỉ/);
  assert.match(agents, /Tuyệt đối không đổi alias `dongbac\.vercel\.app`/);
});
