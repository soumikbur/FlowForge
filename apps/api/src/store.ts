import { InMemoryDatabase } from "@flowforge/test-utils";

export * from "@flowforge/test-utils";

// Global singleton database store for the application runtime
export const apiStore = new InMemoryDatabase();
