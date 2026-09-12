"use strict";
const operationIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isOperationId=value=>operationIdPattern.test(String(value||""));
const hasTotpFactor=user=>Boolean(user?.multiFactor?.enrolledFactors?.some(factor=>factor.factorId==="totp"));
const hasTotpSession=token=>token?.email_verified===true&&token?.firebase?.sign_in_second_factor==="totp";
module.exports={isOperationId,hasTotpFactor,hasTotpSession};
