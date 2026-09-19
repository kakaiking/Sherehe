import { afterEach } from "vitest";
import { resetLocalCache } from "./cache/queryCache";

afterEach(() => {
  resetLocalCache();
  localStorage.clear();
});
