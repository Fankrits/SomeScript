import { expect, test } from "bun:test";
import path from "path";
import { ApiError, apiError, projectDirFor, isUuid } from "./authz";

test("apiError maps ApiError to its status and message", async () => {
  const res = apiError(new ApiError(404, "Project not found"));
  expect(res.status).toBe(404);
  expect((await res.json()).error).toBe("Project not found");
});

test("apiError hides internal errors behind a generic 500", async () => {
  const res = apiError(new Error("ENOENT: /secret/host/path"));
  expect(res.status).toBe(500);
  expect((await res.json()).error).toBe("Internal server error");
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
