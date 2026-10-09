import assert from "node:assert/strict";
import { suiteTable, runSuite } from "../src/lib/solomon/suite.ts";

const rows = runSuite();
const failed = rows.filter((r) => !r.pass);
console.log(suiteTable(rows));
assert.equal(failed.length, 0, failed.map((r) => `${r.check}: expected ${r.expected} got ${r.actual}`).join("\n"));
