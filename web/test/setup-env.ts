// Runs in every test worker before the test files: gives app modules imported by tests
// (for example the Job follower) the same configuration the app server was started with.
import { inject } from "vitest";

Object.assign(process.env, inject("env"));
