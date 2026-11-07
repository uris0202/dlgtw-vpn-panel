import test from "node:test";
import assert from "node:assert/strict";
import { buildClientDirectory, matchesClientAudit, matchesDirectory, orderServerIds, previewRenewal, formatClientExpiry, renewClientProfiles } from "../lib/clientDirectory.js";

const DAY = 86400000;
const NOW = 1793600000000;
const servers = [{ id: 1, name: "Germany" }, { id: 2, name: "Poland" }];
const snapshot = (clients, state = "ok") => ({ state, data: { clients } });
const profile = (server_id = 1, expiry = NOW + DAY) => ({ email: "Nick", server_id, server_name: `Server ${server_id}`, expiry, enabled: true });

test("audit substring search cannot show a different exact client or entity", () => {
    assert.equal(matchesClientAudit({ entity_type: "client", entity_id: "1:Nick" }, "Nick"), true);
    assert.equal(matchesClientAudit({ entity_type: "client", entity_id: "1:Nick:part" }, "Nick:part"), true);
    for (const entity_id of ["1:nick", "1:Nick2", "1:Nick ", "bad:Nick"]) assert.equal(matchesClientAudit({ entity_type: "client", entity_id }, "Nick"), false);
    assert.equal(matchesClientAudit({ entity_type: "order", entity_id: "1:Nick" }, "Nick"), false);
});

test("groups exact pseudonyms across servers without merging different case or whitespace", () => {
    const result = buildClientDirectory(servers, { 1: snapshot([{ email: "Nick", online: true, traffic: 5 }, { email: "nick", online: false }, { email: "Nick ", online: false }]), 2: snapshot([{ email: "Nick", online: false, traffic: 7 }]) });
    assert.equal(result.length, 3);
    const nick = result.find((client) => client.name === "Nick");
    assert.equal(nick.profiles.length, 2); assert.equal(nick.traffic, 12); assert.equal(nick.onlineCount, 1); assert.equal(nick.presence, "online");
});

test("stale and missing servers cannot claim a client is offline", () => {
    const accounts = [{ client_email: "Nick", account_token: "a", server_ids: [1, 2] }];
    let result = buildClientDirectory(servers, { 1: snapshot([{ email: "Nick", online: false }]) }, accounts)[0];
    assert.equal(result.presence, "unknown"); assert.equal(result.serverCount, 2);
    result = buildClientDirectory(servers, { 1: snapshot([{ email: "Nick", online: true }], "error") }, accounts)[0];
    assert.equal(result.onlineCount, 0); assert.equal(result.profiles[0].online, null);
});

test("confirmed offline requires every linked server to report offline", () => {
    const result = buildClientDirectory(servers, { 1: snapshot([{ email: "Nick", online: false }]), 2: snapshot([{ email: "Nick", online: false }]) })[0];
    assert.equal(result.presence, "offline");
});

test("orders do not grant unpaid or unsuccessfully activated servers", () => {
    assert.deepEqual(orderServerIds({ status: "pending", server_ids: [1, 2] }), []);
    assert.deepEqual(orderServerIds({ status: "canceled", server_ids: [1] }), []);
    assert.deepEqual(orderServerIds({ status: "paid", server_ids: [1, 2], activated_server_ids: [1], activated_at: "date", activation_error: "partial" }), [1]);
    assert.deepEqual(orderServerIds({ status: "paid", server_ids: [1, 2], activated_server_ids: [], activated_at: null }), []);
    assert.deepEqual(orderServerIds({ status: "paid", server_ids: [1], activated_server_ids: [], activated_at: "date" }), [1]);
    assert.deepEqual(orderServerIds({ status: "access", server_id: 2 }), [2]);
});

test("paid and manual grants are distinct and pending-only names are not VPN clients", () => {
    const result = buildClientDirectory(servers, { 1: snapshot([{ email: "Nick", group: "Core", comment: "Family" }]) }, [], [
        { id: 1, client_email: "Nick", status: "paid", server_ids: [1], activated_server_ids: [1] },
        { id: 2, client_email: "Nick", status: "access", server_ids: [2] },
        { id: 3, client_email: "Unpaid", status: "pending", server_ids: [1] },
    ]);
    assert.equal(result.length, 1); assert.deepEqual([...result[0].paidServerIds], [1]); assert.deepEqual([...result[0].manualServerIds], [2]);
    assert.equal(matchesDirectory(result[0], { query: "family", group: "Core" }), true);
    assert.equal(matchesDirectory(result[0], { connection: "online" }), false);
});

test("account-only records and multiple accounts stay visible without auto-selecting a token", () => {
    const result = buildClientDirectory([], {}, [{ client_email: "Nick", account_token: "a", server_ids: [1] }, { client_email: "Nick", account_token: "b", server_ids: [2] }]);
    assert.equal(result.length, 1); assert.equal(result[0].accounts.length, 2); assert.equal(result[0].presence, "unknown");
});

test("renewal previews extend future expiry and expired clients from now", () => {
    assert.equal(previewRenewal(NOW + 10 * DAY, 30, NOW), NOW + 40 * DAY);
    assert.equal(previewRenewal(NOW - 10 * DAY, 30, NOW), NOW + 30 * DAY);
    for (const value of [null, undefined, 0, -DAY, NaN, "bad"]) assert.equal(previewRenewal(value, 30, NOW), null);
    for (const days of [0, -1, 1.5, 3651, NaN]) assert.equal(previewRenewal(NOW, days, NOW), null);
    assert.equal(formatClientExpiry(-DAY), "От первого подключения"); assert.equal(formatClientExpiry(null), "Нет данных");
});

test("preflight expiry changes stop the entire batch before mutations", async () => {
    let writes = 0;
    const result = await renewClientProfiles([profile(1), profile(2)], 30, { read: async (value) => ({ ...value, expiry: value.expiry + DAY }), update: async () => writes++ }, NOW);
    assert.equal(result.changed, true); assert.equal(writes, 0);
});

test("preflight failure never sends a renewal", async () => {
    let writes = 0;
    await assert.rejects(renewClientProfiles([profile()], 30, { read: async () => { throw new Error("Offline"); }, update: async () => writes++ }, NOW), /Offline/);
    assert.equal(writes, 0);
});

test("successful renewal reactivates profiles and verifies expiry", async () => {
    const state = profile(1, NOW - DAY); state.enabled = false;
    const writes = [];
    const result = await renewClientProfiles([{ ...state }], 30, { read: async () => ({ ...state }), update: async (item, payload) => { writes.push(payload); state.expiry = NOW + 30 * DAY; state.enabled = payload.enable; } }, NOW);
    assert.deepEqual(writes, [{ days: 30, enable: true }]); assert.equal(result.results[0].state, "ok");
});

test("partial and ambiguous responses are never retried automatically", async () => {
    const initial = [profile(1), profile(2)]; const state = new Map(initial.map((item) => [item.server_id, { ...item }])); const writes = [];
    const result = await renewClientProfiles(initial, 30, { read: async (item) => ({ ...state.get(item.server_id) }), update: async (item) => { writes.push(item.server_id); if (item.server_id === 1) state.get(1).expiry += 30 * DAY; throw new Error("Timeout"); } }, NOW);
    assert.deepEqual(writes, [1, 2]); assert.equal(result.results[0].state, "ok"); assert.equal(result.results[1].state, "unknown");
});

test("unchanged or disabled result is not called a successful renewal", async () => {
    let calls = 0;
    const result = await renewClientProfiles([profile()], 30, { read: async () => ({ ...profile(), expiry: ++calls === 1 ? profile().expiry : profile().expiry + 30 * DAY, enabled: false }), update: async () => {} }, NOW);
    assert.equal(result.results[0].state, "unknown");
});

test("duplicate server targets and unlimited profiles never send a mutation", async () => {
    const transport = { read: async () => { throw new Error("Should not read"); }, update: async () => { throw new Error("Should not write"); } };
    await assert.rejects(renewClientProfiles([profile(1), profile(1)], 30, transport), /повторяться/);
    await assert.rejects(renewClientProfiles([profile(1, 0)], 30, transport), /Выберите/);
});
