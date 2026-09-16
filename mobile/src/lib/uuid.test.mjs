/* eslint-disable import/namespace */
import assert from "node:assert/strict";
import test from "node:test";

import { createUuidFromSources, isUsableUuid } from "./uuid.ts";

test("native UUID generation uses Expo Crypto when browser crypto is absent", () => {
    const values = [
        "6fe35e62-cd44-40de-9878-4e45e0306637",
        "b4976054-9478-4a96-a9ea-cc2f1af9ac2c",
    ];
    const generated = values.map((value) => createUuidFromSources({
        platform: "ios",
        nativeRandomUuid: () => value,
    }));

    assert.deepEqual(generated, values);
    assert.notEqual(generated[0], generated[1]);
});

test("UUID generation rejects nil and malformed values", () => {
    assert.equal(isUsableUuid("00000000-0000-0000-0000-000000000000"), false);
    assert.throws(() => createUuidFromSources({ platform: "ios", nativeRandomUuid: () => "" }), /secure UUID/i);
});

test("web UUID generation uses browser crypto", () => {
    const value = "ef671535-3657-45cc-a377-766c9c33cb4d";
    assert.equal(createUuidFromSources({ platform: "web", browserRandomUuid: () => value }), value);
});
