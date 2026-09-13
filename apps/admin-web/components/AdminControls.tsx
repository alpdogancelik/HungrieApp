"use client";

import { FormEvent, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useLocale } from "@/components/AdminProviders";
import { adminFunctionNames, auth, functions } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";

type Kind = "restaurants" | "accounts" | "orders" | "incidents";
const invitationToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
const requireRecentAuth = async () => {
  const token = await auth.currentUser?.getIdTokenResult();
  const authenticatedAt = Date.parse(token?.authTime || "");
  if (!Number.isFinite(authenticatedAt) || Date.now() - authenticatedAt > 4 * 60 * 1000) throw new Error("RECENT_AUTH_REQUIRED");
};

export function AdminControls({ kind, onDone }: { kind: Kind; onDone: () => void }) {
  const { locale } = useLocale();
  const tr = locale === "tr";
  const labels = {
    action: tr ? "Yönetici işlemi" : "Admin action", createRestaurant: tr ? "Restoran oluştur" : "Create restaurant",
    lifecycle: tr ? "Yaşam döngüsü durumu" : "Lifecycle status", inviteRestaurant: tr ? "Restoran hesabı davet et" : "Invite restaurant account",
    restaurantName: tr ? "Restoran adı" : "Restaurant name", restaurantId: tr ? "Restoran kimliği" : "Restaurant ID",
    profileId: tr ? "Profil kimliği" : "Profile ID", orderId: tr ? "Sipariş kimliği" : "Order ID", incidentId: tr ? "Olay kimliği" : "Incident UUID",
    reasonCode: tr ? "Neden kodu" : "Reason code", reason: tr ? "Neden" : "Reason", resolutionNote: tr ? "Çözüm notu" : "Resolution note",
    inviteAdmin: tr ? "Yönetici davet et" : "Invite Admin", accountStatus: tr ? "Hesap durumu" : "Account status",
    adminRole: tr ? "Yönetici rolü" : "Admin role", reassign: tr ? "Restoran atamasını değiştir" : "Restaurant reassignment", recovery: tr ? "MFA kurtarma" : "MFA recovery",
    pending: tr ? "Bekliyor" : "Pending", active: tr ? "Etkin" : "Active", suspended: tr ? "Askıya alınmış" : "Suspended", revoked: tr ? "İptal edilmiş" : "Revoked", closed: tr ? "Kapalı" : "Closed",
    manager: tr ? "Müdür" : "Manager", owner: tr ? "Sahip" : "Owner", superAdmin: tr ? "Süper Yönetici" : "Super Admin",
    cancel: tr ? "İptal et" : "Cancel", delivered: tr ? "Teslim edildiğini doğrula" : "Confirm delivered",
    acknowledge: tr ? "Kabul et" : "Acknowledge", resolve: tr ? "Çöz" : "Resolve", confirm: tr ? "Onayla" : "Confirm",
    confirmPrompt: tr ? "Bu yetkili işlemi onaylıyor musunuz?" : "Confirm this privileged operation?",
    completed: tr ? "Tamamlandı" : "Completed", failed: tr ? "İşlem tamamlanamadı" : "Operation failed", recentAuth: tr ? "Bu işlem için çıkış yapın, tekrar giriş yapın ve beş dakika içinde yeniden deneyin" : "Sign out, sign in again, and retry within five minutes for this operation", lastRestaurantOwner: tr ? "Bu restoranın tek etkin sahibi bu hesap. Askıya almadan veya erişimini iptal etmeden önce başka bir sahibi etkinleştirin." : "This is the restaurant's only active owner. Activate another owner before suspending or revoking this account.", lastSuperAdmin: tr ? "En az bir etkin, MFA'ya hazır süper yönetici kalmalıdır." : "At least one active, MFA-ready super-admin must remain.", copyLink: tr ? "Bağlantıyı kopyala" : "Copy link", inviteReady: tr ? "Davet oluşturuldu" : "Invitation created", copyBeforeLeaving: tr ? "Bu sayfadan ayrılmadan önce bağlantıyı kopyalayın. Daha sonra tekrar gösterilemez." : "Copy this link before leaving the page. It cannot be shown again later.", evidence: tr ? "vaka:referans" : "case:reference",
  };
  const [values, setValues] = useState<Record<string, string>>({
    restaurantStatus: "suspended",
    status: "suspended",
    role: "admin",
    restaurantRole: "manager",
    resolution: "cancel",
    state: "acknowledged",
  });
  const [message, setMessage] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirm(labels.confirmPrompt)) return;
    setBusy(true); setMessage(""); setInviteUrl("");
    try {
      if (kind !== "incidents") await requireRecentAuth();
      const operationId = crypto.randomUUID();
      let result: { error?: unknown; data?: unknown } | undefined;
      let oneTimeUrl = "";
      if (kind === "restaurants" && (values.restaurantAction || "create") === "create") result = await supabase.rpc("admin_create_restaurant_v1" as never, { p_name: values.name, p_operation_id: operationId } as never);
      if (kind === "restaurants" && values.restaurantAction === "status") result = await supabase.rpc("admin_set_restaurant_status_v1" as never, { p_restaurant_id: values.restaurantId, p_status: values.restaurantStatus, p_reason_code: values.reason, p_operation_id: operationId } as never);
      if (kind === "restaurants" && values.restaurantAction === "invite") {
        const plainToken = invitationToken();
        result = await supabase.rpc("admin_invite_restaurant_account_v1" as never, { p_email: values.email, p_restaurant_id: values.restaurantId, p_restaurant_role: values.restaurantRole || "manager", p_token_digest: await sha256(plainToken), p_operation_id: operationId } as never);
        if (!result.error) oneTimeUrl = `${process.env.NEXT_PUBLIC_RESTAURANT_PORTAL_URL || location.origin}/invite?token=${encodeURIComponent(plainToken)}`;
      }
      if (kind === "accounts" && (values.action || "invite") === "invite") {
        const plainToken = invitationToken();
        result = await supabase.rpc("admin_invite_admin_account_v1" as never, { p_email: values.email, p_admin_role: values.role || "admin", p_token_digest: await sha256(plainToken), p_operation_id: operationId } as never);
        if (!result.error) oneTimeUrl = `${location.origin}/invite/${plainToken}`;
      }
      if (kind === "accounts" && values.action === "status") {
        const callable = httpsCallable(functions, adminFunctionNames.setAccountStatus);
        result = { data: (await callable({ profileId: values.profileId, status: values.status, reasonCode: values.reason || "operator_requested", operationId })).data };
      }
      if (kind === "accounts" && values.action === "role") result = await supabase.rpc("admin_change_admin_role_v1" as never, { p_profile_id: values.profileId, p_admin_role: values.role, p_operation_id: operationId } as never);
      if (kind === "accounts" && values.action === "reassign") result = await supabase.rpc("admin_reassign_restaurant_account_v1" as never, { p_profile_id: values.profileId, p_restaurant_id: values.restaurantId, p_restaurant_role: values.restaurantRole || "manager", p_operation_id: operationId } as never);
      if (kind === "accounts" && values.action === "recovery") {
        const callable = httpsCallable(functions, adminFunctionNames.recoverMfa);
        result = { data: (await callable({ profileId: values.profileId, evidenceReference: values.evidence, operationId })).data };
      }
      if (kind === "orders") result = await supabase.rpc("admin_resolve_order_v1" as never, { p_order_id: values.orderId, p_resolution: values.resolution || "cancel", p_reason: values.reason, p_operation_id: operationId } as never);
      if (kind === "incidents") result = await supabase.rpc("admin_set_incident_state_v1" as never, { p_incident_id: values.incidentId, p_state: values.state || "acknowledged", p_resolution_note: values.note || null, p_operation_id: operationId } as never);
      if (result?.error) throw result.error;
      setInviteUrl(oneTimeUrl); setMessage(oneTimeUrl ? "" : labels.completed); onDone();
    } catch (value) {
      const detail = typeof value === "object" && value && "message" in value ? String(value.message) : "";
      const details = typeof value === "object" && value && "details" in value ? value.details : null;
      const reason = typeof details === "object" && details && "reason" in details ? details.reason : null;
      setMessage(reason === "last_restaurant_owner" ? labels.lastRestaurantOwner
        : reason === "last_super_admin" ? labels.lastSuperAdmin
        : detail.includes("Recent authentication required") || detail.includes("RECENT_AUTH_REQUIRED") ? labels.recentAuth
        : `${labels.failed}. Ref: ${crypto.randomUUID()}`);
    } finally { setBusy(false); }
  }

  return <><details className="controls"><summary>{kind === "restaurants" ? labels.createRestaurant : labels.action}</summary><form onSubmit={submit}>
    {kind === "restaurants" && <><select value={values.restaurantAction || "create"} onChange={set("restaurantAction")}><option value="create">{labels.createRestaurant}</option><option value="status">{labels.lifecycle}</option><option value="invite">{labels.inviteRestaurant}</option></select>
      {(values.restaurantAction || "create") === "create" ? <input required value={values.name || ""} onChange={set("name")} placeholder={labels.restaurantName} /> : values.restaurantAction === "status" ? <><input required placeholder={labels.restaurantId} value={values.restaurantId || ""} onChange={set("restaurantId")} /><select value={values.restaurantStatus || "suspended"} onChange={set("restaurantStatus")}><option value="pending">{labels.pending}</option><option value="active">{labels.active}</option><option value="suspended">{labels.suspended}</option><option value="closed">{labels.closed}</option></select><input required placeholder={labels.reasonCode} value={values.reason || ""} onChange={set("reason")} /></> : <><input required placeholder={labels.restaurantId} value={values.restaurantId || ""} onChange={set("restaurantId")} /><input type="email" required placeholder="Email" value={values.email || ""} onChange={set("email")} /><select value={values.restaurantRole || "manager"} onChange={set("restaurantRole")}><option value="manager">{labels.manager}</option><option value="owner">{labels.owner}</option></select></>}
    </>}
    {kind === "accounts" && <><select value={values.action || "invite"} onChange={set("action")}><option value="invite">{labels.inviteAdmin}</option><option value="status">{labels.accountStatus}</option><option value="role">{labels.adminRole}</option><option value="reassign">{labels.reassign}</option><option value="recovery">{labels.recovery}</option></select>
      {(values.action || "invite") === "invite" ? <><input type="email" required placeholder="Email" value={values.email || ""} onChange={set("email")} /><select value={values.role || "admin"} onChange={set("role")}><option value="admin">Admin</option><option value="super_admin">{labels.superAdmin}</option></select></> : values.action === "status" ? <><input required placeholder={labels.profileId} value={values.profileId || ""} onChange={set("profileId")} /><select value={values.status || "suspended"} onChange={set("status")}><option value="active">{labels.active}</option><option value="suspended">{labels.suspended}</option><option value="revoked">{labels.revoked}</option></select><input required placeholder={labels.reasonCode} value={values.reason || ""} onChange={set("reason")} /></> : values.action === "role" ? <><input required placeholder={labels.profileId} value={values.profileId || ""} onChange={set("profileId")} /><select value={values.role || "admin"} onChange={set("role")}><option value="admin">Admin</option><option value="super_admin">{labels.superAdmin}</option></select></> : values.action === "reassign" ? <><input required placeholder={labels.profileId} value={values.profileId || ""} onChange={set("profileId")} /><input required placeholder={labels.restaurantId} value={values.restaurantId || ""} onChange={set("restaurantId")} /><select value={values.restaurantRole || "manager"} onChange={set("restaurantRole")}><option value="manager">{labels.manager}</option><option value="owner">{labels.owner}</option></select></> : <><input required placeholder={labels.profileId} value={values.profileId || ""} onChange={set("profileId")} /><input required placeholder={labels.evidence} value={values.evidence || ""} onChange={set("evidence")} /></>}
    </>}
    {kind === "orders" && <><input required placeholder={labels.orderId} value={values.orderId || ""} onChange={set("orderId")} /><select value={values.resolution || "cancel"} onChange={set("resolution")}><option value="cancel">{labels.cancel}</option><option value="confirm_delivered">{labels.delivered}</option></select><input required placeholder={labels.reason} value={values.reason || ""} onChange={set("reason")} /></>}
    {kind === "incidents" && <><input required placeholder={labels.incidentId} value={values.incidentId || ""} onChange={set("incidentId")} /><select value={values.state || "acknowledged"} onChange={set("state")}><option value="acknowledged">{labels.acknowledge}</option><option value="resolved">{labels.resolve}</option></select>{values.state === "resolved" && <input required placeholder={labels.resolutionNote} value={values.note || ""} onChange={set("note")} />}</>}
    <button className="primary" disabled={busy}>{labels.confirm}</button></form>{message && <output className="operation-output">{message}</output>}</details>
    {inviteUrl && <div className="invite-link-panel" role="status"><strong>{labels.inviteReady}</strong><p>{labels.copyBeforeLeaving}</p><code>{inviteUrl}</code><button type="button" onClick={() => void navigator.clipboard.writeText(inviteUrl)}>{labels.copyLink}</button></div>}
  </>;
}
