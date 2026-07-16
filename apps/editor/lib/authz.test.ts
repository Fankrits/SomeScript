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

test("resolveToolProject rejects a missing projectId with 400", async () => {
  await expect(resolveToolProject(undefined)).rejects.toMatchObject({ status: 400 });
  await expect(resolveToolProject("")).rejects.toMatchObject({ status: 400 });
});

test("resolveToolProject rejects a non-uuid, non-default id with 404", async () => {
  await expect(resolveToolProject("../../etc/passwd")).rejects.toMatchObject({ status: 404 });
  await expect(resolveToolProject("not-a-uuid")).rejects.toMatchObject({ status: 404 });
});

test("resolveToolProject allows the default sandbox outside production", async () => {
  // NODE_ENV is not "production" under bun test, so the local sandbox is permitted.
  expect(await resolveToolProject("default")).toBe("default");
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
