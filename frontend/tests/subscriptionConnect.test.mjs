import test from "node:test";
import assert from "node:assert/strict";
import { getV2raytunImportUrl } from "../lib/subscriptionConnect.js";

test("native import uses the unified HTTPS subscription directly", () => {
    const url = "https://dlgtw.example/api/public/subscriptions/12/test-signature";
    assert.equal(getV2raytunImportUrl(url), `v2raytun://import/${url}`);
});

test("signed query strings and encoded characters are preserved exactly", () => {
    const url = "https://vpn.example:8443/subs/test%2Fvalue?signature=a%2Bb%3D&x=1";
    assert.equal(getV2raytunImportUrl(url), `v2raytun://import/${url}`);
});

test("unsupported schemes credentials fragments and malformed URLs cannot become launch links", () => {
    for (const value of [null, undefined, {}, 12, "", "http://vpn.example/sub", "javascript:alert(1)",
        "data:text/plain,test", "vless://user@host:443", "v2raytun://import/test", "//vpn.example/sub",
        "https://", "https://user:pass@vpn.example/sub", "https://user@vpn.example/sub",
        "https://vpn.example/sub#title", "https://vpn.example/\\evil", " https://vpn.example/sub",
        "https://vpn.example/sub\n", "https://vpn.example/sub\t", "https://vpn.example/sub\u0000",
        "https://vpn.example/" + "x".repeat(4096)]) {
        assert.equal(getV2raytunImportUrl(value), null, String(value));
    }
});

test("native import does not expose the subscription to a web redirect service", () => {
    const url = "https://vpn.example/sub/test-signature";
    const link = getV2raytunImportUrl(url);
    assert.equal(new URL(link).protocol, "v2raytun:");
    assert.equal(link.slice("v2raytun://import/".length), url);
});
