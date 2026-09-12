import assert from "node:assert/strict";
import test from "node:test";

import {
    getServerSelectionMessage,
    getServerSelectionStatus,
    selectServersForPlan,
} from "../lib/serverSelection.js";


const servers = [
    { id: 1, name: "Germany" },
    { id: 2, name: "Amsterdam" },
];


test("full plan automatically selects every available server", () => {
    const selected = selectServersForPlan([1], servers, 2);
    const status = getServerSelectionStatus(selected, servers, 2);

    assert.deepEqual(selected, [1, 2]);
    assert.equal(status.isComplete, true);
    assert.equal(status.allServersRequired, true);
    assert.match(getServerSelectionMessage(status), /выбраны автоматически/i);
});


test("single-server plan preserves one valid selection", () => {
    const selected = selectServersForPlan([2], servers, 1);
    const status = getServerSelectionStatus(selected, servers, 1);

    assert.deepEqual(selected, [2]);
    assert.equal(status.isComplete, true);
    assert.equal(status.allServersRequired, false);
});


test("selection reports unavailable capacity", () => {
    const status = getServerSelectionStatus([1], servers.slice(0, 1), 2);

    assert.equal(status.hasEnoughServers, false);
    assert.match(getServerSelectionMessage(status), /Сейчас доступно: 1/);
});
