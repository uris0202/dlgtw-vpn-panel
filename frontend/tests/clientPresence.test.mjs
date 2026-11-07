import assert from "node:assert/strict";
import test from "node:test";
import { clientPresence, matchesConnection, formatLastOnline } from "../lib/clientPresence.js";

test("presence does not conflate access enabled with an online connection", () => {
    assert.equal(clientPresence({ enabled: true, online: false }), "offline");
    assert.equal(clientPresence({ enabled: false, online: true }), "online");
});

test("missing and malformed presence is unknown, never offline", () => {
    for (const online of [undefined, null, 0, 1, "false", "true"]) {
        assert.equal(clientPresence({ online }), "unknown");
    }
});

test("connection filters keep unknown separate and compose with all", () => {
    assert.equal(matchesConnection({ online: true }, "online"), true);
    assert.equal(matchesConnection({ online: false }, "online"), false);
    assert.equal(matchesConnection({ online: null }, "offline"), false);
    assert.equal(matchesConnection({}, "unknown"), true);
    assert.equal(matchesConnection({}, "all"), true);
});

test("last activity never invents a date for absent or invalid values", () => {
    for (const value of [null, undefined, 0, -1, Infinity, "not-a-date"]) assert.equal(formatLastOnline(value), null);
    assert.ok(formatLastOnline(1793552400000));
});
