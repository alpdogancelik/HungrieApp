import type { ReviewReportReason, ReviewReportStatus, ReviewVisibility } from "@hungrie/domain";

export const REPORT_REASONS: readonly ReviewReportReason[] = ["spam","abusive_content","personal_information","not_related_to_order","suspected_fraud","other"];
export const normalizeManagementNote = (value:string) => value.normalize("NFC").replace(/^ +| +$/g, "");
export const validateOptionalNote = (value:string) => {
  const normalized=normalizeManagementNote(value);
  if(Array.from(normalized).length>500||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized))throw new Error("validation");
  return normalized;
};
export type RestaurantReviewFilter={visibility:ReviewVisibility|null;reportStatus:ReviewReportStatus|null};

export class StableReportOperation {
  private signature:string|null=null;
  private operationId:string|null=null;
  prepare(reviewId:string,reason:ReviewReportReason,note:string){
    const normalized=validateOptionalNote(note),signature=JSON.stringify([reviewId,reason,normalized]);
    if(signature!==this.signature){this.signature=signature;this.operationId=crypto.randomUUID();}
    return {reviewId,reason,internalNote:normalized,operationId:this.operationId!};
  }
  clear(){this.signature=null;this.operationId=null;}
}

export class CursorGate {
  private generation=0;
  private inFlight=new Set<string>();
  private seen=new Set<string>();
  reset(){this.generation+=1;this.inFlight.clear();this.seen.clear();return this.generation;}
  begin(cursor:string|null){const key=cursor??"__first__";if(this.inFlight.has(key)||this.seen.has(key))return null;this.inFlight.add(key);return{generation:this.generation,key};}
  finish(token:{generation:number;key:string},_nextCursor:string|null){this.inFlight.delete(token.key);if(token.generation!==this.generation)return false;this.seen.add(token.key);return true;}
  fail(token:{generation:number;key:string}){this.inFlight.delete(token.key);return token.generation===this.generation;}
}
