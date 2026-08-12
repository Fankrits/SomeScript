import { expect, test } from "bun:test";
import path from "path";
import { ApiError, apiError, projectDirFor, isUuid, resolveToolProject } from "./authz";

test("apiError maps ApiError to its status and message", async () => {
  const res = apiError(new ApiError(404, "Project not found"));
  expect(res.status).toBe(404);
  expect((await res.json()).error).toBe("Project not found");
});

test("apiError hides internal errors behind a generic 500", async () => {
  // apiError logs unexpected errors via console.error — silence it so this
  // deliberately-passed error does not pollute the test output.
  const original = console.error;
  console.error = () => {};
  try {
    const res = apiError(new Error("ENOENT: /secret/host/path"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Internal server error");
  } finally {
    console.error = original;
  }
});

const WORKSPACE = "org_2abcDEF";
const OTHER_PROJECT = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

test("resolveToolProject rejects a missing projectId with 400", async () => {
  await expect(resolveToolProject(undefined, WORKSPACE)).rejects.toMatchObject({ status: 400 });
  await expect(resolveToolProject("", WORKSPACE)).rejects.toMatchObject({ status: 400 });
});

test("resolveToolProject rejects a non-uuid, non-default id with 404", async () => {
  await expect(resolveToolProject("../../etc/passwd", WORKSPACE)).rejects.toMatchObject({
    status: 404,
  });
  await expect(resolveToolProject("not-a-uuid", WORKSPACE)).rejects.toMatchObject({ status: 404 });
});

test("resolveToolProject allows the default sandbox outside production", async () => {
  // NODE_ENV is not "production" under bun test, so the local sandbox is permitted.
  expect(await resolveToolProject("default", WORKSPACE)).toBe("default");
});

// The tenancy regression this signature exists to prevent: a model that emits a
// well-formed project id it was never given must not reach storage. Before the
// eve channel verified Clerk and put the workspace on the session, an execution
// context without a resolvable workspace fell through to format validation and
// returned the id — so any uuid the model typed was accepted. It must now be a
// hard denial, and it must fail *before* the database is consulted (no pool is
// configured in this test, so reaching the query would throw a different error).
test("resolveToolProject denies a uuid when the session carries no workspace", async () => {
  await expect(resolveToolProject(OTHER_PROJECT, null)).rejects.toMatchObject({ status: 401 });
  await expect(resolveToolProject(OTHER_PROJECT, undefined)).rejects.toMatchObject({ status: 401 });
  await expect(resolveToolProject(OTHER_PROJECT, "")).rejects.toMatchObject({ status: 401 });
});

test("resolveToolProject still guards the default sandbox without a workspace", async () => {
  // "default" has no database row, so it is gated on environment, not ownership.
  expect(await resolveToolProject("default", null)).toBe("default");
});

test("projectDirFor maps default to the sandbox and ids to projects/", () => {
  expect(projectDirFor("default")).toBe(path.join(process.cwd(), "my-new-project"));
  expect(projectDirFor("abc-123")).toBe(path.join(process.cwd(), "projects", "abc-123"));
});

test("isUuid accepts v4 uuids and rejects junk", () => {
  expect(isUuid("f47ac10b-58cc-4372-a567-0e02b2c3d479")).toBe(true);
  expect(isUuid("../../../etc")).toBe(false);
  expect(isUuid("default")).toBe(false);
});
