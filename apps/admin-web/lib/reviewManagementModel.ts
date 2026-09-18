import type { ReviewReportStatus, ReviewVisibility } from "@hungrie/domain";

export const normalizeAdminNote=(value:string)=>value.normalize("NFC").replace(/^ +| +$/g,"");
const checked=(value:string,required:boolean)=>{const normalized=normalizeAdminNote(value);if((required&&!normalized)||Array.from(normalized).length>500||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized))throw new Error("validation");return normalized;};
export const validateResolutionNote=(value:string)=>checked(value,false);
export const validateModerationReason=(value:string)=>checked(value,true);
export const legalReportTargets=(status:ReviewReportStatus):ReviewReportStatus[]=>status==="open"?["resolved","dismissed"]:["open"];

export class StableAdminOperation {
  private entries=new Map<string,{signature:string;operationId:string}>();
  prepare(key:string,parts:unknown[]){const signature=JSON.stringify(parts);let entry=this.entries.get(key);if(!entry||entry.signature!==signature){entry={signature,operationId:crypto.randomUUID()};this.entries.set(key,entry);}return entry.operationId;}
  clear(key:string){this.entries.delete(key);}
}

export const visibilityAction=(status:ReviewVisibility):ReviewVisibility=>status==="published"?"hidden":"published";
