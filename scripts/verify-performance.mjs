import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercise production TypeScript with mocked I/O; this is not a live RLS or
// React renderer test. Each load represents a fresh request context.
function load(file, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, URLSearchParams, require(name) {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const { getPage, pageHref, PAGE_SIZE } = load("lib/pagination.ts");
for (const page of [undefined, "0", "-1", "1.5", "oops", "Infinity", "9007199254740991", ["2", "3"]]) {
  assert.equal(getPage({ page }), 1);
}
assert.equal(getPage({ page: "2" }), 2);
assert.equal(PAGE_SIZE, 50);
assert.equal(pageHref("/products", { q: "A&B", tag: ["a", "b"], success: "updated", page: "9" }, 2), "/products?q=A%26B&tag=a&tag=b&success=updated&page=2");
const redirect = (path) => { throw new Error(`redirect:${path}`); };
async function scenario({ user = { id: "user-a" }, active = true, permissions = [], profileError = null, permissionError = null } = {}) {
  const calls = [];
  const supabase = {
    auth: { async getUser() { calls.push("auth"); return { data: { user } }; } },
    from(table) {
      calls.push(table);
      const query = { select() { return query; }, eq(key, value) { assert.equal(value, user.id); return query; },
        async single() { return { data: { id: user.id, is_active: active, branch_id: "branch-a", branch: [{ id: "branch-a", name: "A", code: "A" }], role: [] }, error: profileError }; },
        async maybeSingle() { return { data: null, error: null }; },
      };
      return query;
    },
    async rpc(name) { assert.equal(name, "get_my_permissions"); calls.push(name); return { data: permissions, error: permissionError }; },
  };
  const { getCurrentUserContext } = load("lib/get-user-context.ts", {
    "server-only": {}, react: { cache: (fn) => fn }, "next/navigation": { redirect },
    "@/lib/supabase/server": { createClient: async () => supabase },
  });
  const { requirePermission } = load("lib/require-permission.ts", {
    "next/navigation": { redirect }, "@/lib/get-user-context": { getCurrentUserContext },
  });
  return { requirePermission, calls };
}
for (const permissions of [["inventory.manage_all"], ["inventory.manage_branch"]]) {
  const { requirePermission, calls } = await scenario({ permissions });
  const context = await requirePermission(["inventory.manage_all", "inventory.manage_branch"]);
  assert.equal(context.profile.branch_id, "branch-a");
  assert.equal(context.branch.id, "branch-a");
  assert.deepEqual(calls, ["auth", "profiles", "get_my_permissions", "user_preferences"]);
}
for (const [options, required, message] of [
  [{ user: null }, ["products.view"], "redirect:/auth/login"],
  [{ active: false, permissions: ["products.view"] }, ["products.view"], "redirect:/auth/login"],
  [{ profileError: { message: "failed" } }, ["products.view"], "redirect:/auth/login"],
  [{ permissions: ["pos.use"] }, ["users.view"], "redirect:/unauthorized"],
  [{ permissions: ["products.view"] }, [], "redirect:/unauthorized"],
  [{ permissionError: { message: "failed" } }, ["products.view"], "Failed to load user permissions."],
]) {
  const { requirePermission } = await scenario(options);
  await assert.rejects(() => requirePermission(required), { message });
}
console.log("PASS: pagination validation/URL preservation; any-permission access; branch context; anonymous, inactive, profile-error, unauthorized and permission-error denial.");
