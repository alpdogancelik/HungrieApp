"use strict";
const test=require("node:test");const assert=require("node:assert/strict");const{isOperationId,hasTotpFactor,hasTotpSession,accountStatusFailureReason}=require("./phase4AdminLogic");
test("accepts only UUID operation identifiers",()=>{assert.equal(isOperationId("44444444-4444-4444-8444-444444444444"),true);assert.equal(isOperationId("not-an-operation"),false)});
test("requires a TOTP enrollment rather than another factor",()=>{assert.equal(hasTotpFactor({multiFactor:{enrolledFactors:[{factorId:"totp"}]}}),true);assert.equal(hasTotpFactor({multiFactor:{enrolledFactors:[{factorId:"phone"}]}}),false)});
test("requires verified email and current TOTP sign-in",()=>{assert.equal(hasTotpSession({email_verified:true,firebase:{sign_in_second_factor:"totp"}}),true);assert.equal(hasTotpSession({email_verified:false,firebase:{sign_in_second_factor:"totp"}}),false)});
test("returns a safe reason only for the exact last-owner and last-super-admin constraints",()=>{
    assert.equal(accountStatusFailureReason({code:"23514",message:"Last active Restaurant owner protected"}),"last_restaurant_owner");
    assert.equal(accountStatusFailureReason({code:"23514",message:"Last MFA-ready super-admin protected"}),"last_super_admin");
    assert.equal(accountStatusFailureReason({code:"23514",message:"Other constraint failed"}),null);
    assert.equal(accountStatusFailureReason({code:"42501",message:"Last active Restaurant owner protected"}),null);
});
