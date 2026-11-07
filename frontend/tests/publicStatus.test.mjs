import test from "node:test";
import assert from "node:assert/strict";
import { sessionLabel, statusDate, statusIsFresh, visibleStatus } from "../lib/publicStatus.js";

const now = 1793600000000;
const data = { checked_at: now / 1000, interval_seconds: 3600, fresh: true, state: "ok" };

test("fresh infrastructure status is not reused after a refresh error", () => {
    assert.equal(visibleStatus(data, false, now), "ok");
    assert.equal(visibleStatus(data, true, now), "unknown");
});
test("old future malformed and explicitly stale responses never stay green", () => {
    for (const value of [{ ...data, checked_at: now / 1000 - 4501 }, { ...data, checked_at: now / 1000 + 1 }, { ...data, fresh: false }, { ...data, checked_at: Infinity }, { ...data, interval_seconds: "3600" }, null]) assert.equal(statusIsFresh(value, now), false);
    assert.equal(visibleStatus({ ...data, state: "unexpected" }, false, now), "unknown");
});
test("time labels do not manufacture epoch or invalid dates", () => {
    for (const value of [null, 0, -1, undefined, "bad", Infinity, 1e25]) assert.equal(statusDate(value), "Нет данных");
    assert.notEqual(statusDate(now / 1000), "Нет данных");
});

test("VPN HTTPS result is separate from a listening TCP port", () => {
    assert.equal(sessionLabel("up"), "HTTPS через VPN прошёл");
    assert.equal(sessionLabel("down"), "Запрос не прошёл");
    assert.equal(sessionLabel("not_configured"), "Не настроена");
    assert.equal(sessionLabel(undefined), "Нет данных");
});
