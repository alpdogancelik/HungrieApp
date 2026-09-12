"use strict";
const test=require("node:test");const assert=require("node:assert/strict");const{isOperationId,hasTotpFactor,hasTotpSession}=require("./phase4AdminLogic");
test("accepts only UUID operation identifiers",()=>{assert.equal(isOperationId("44444444-4444-4444-8444-444444444444"),true);assert.equal(isOperationId("not-an-operation"),false)});
test("requires a TOTP enrollment rather than another factor",()=>{assert.equal(hasTotpFactor({multiFactor:{enrolledFactors:[{factorId:"totp"}]}}),true);assert.equal(hasTotpFactor({multiFactor:{enrolledFactors:[{factorId:"phone"}]}}),false)});
test("requires verified email and current TOTP sign-in",()=>{assert.equal(hasTotpSession({email_verified:true,firebase:{sign_in_second_factor:"totp"}}),true);assert.equal(hasTotpSession({email_verified:false,firebase:{sign_in_second_factor:"totp"}}),false)});
