import { describe, expect, it } from "vitest";
import { createProject, createTestDb } from "./helpers";

describe("migrations", () => {
  it("apply cleanly and allow inserting a project", async () => {
    const { db, close } = await createTestDb();
    const project = await createProject(db);
    expect(project.publicKey).toMatch(/^pk_test_/);
    await close();
  });
});
