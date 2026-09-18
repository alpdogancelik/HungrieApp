"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function AdminReviewPreview() {
  const params = useSearchParams();
  const [tr, setTr] = useState(params.get("locale") === "tr");
  const [error, setError] = useState(params.get("state") === "error");
  return <main className="admin-reviews" style={{ padding: "2rem", margin: "auto" }}>
    <p className="eyebrow">Local fixture · no network</p><div className="page-header"><div><h2>{tr ? "Değerlendirme yönetimi" : "Review handling"}</h2><p>{tr ? "Müşteri kimliği veya sipariş kişisel verisi yok." : "No Customer identity or order PII."}</p></div><button onClick={() => setTr(value => !value)}>{tr ? "English" : "Türkçe"}</button></div>
    <button onClick={() => setError(value => !value)}>{tr ? "Hata durumunu değiştir" : "Toggle error"}</button>{error && <p className="error" role="alert">{tr ? "Yakın zamanda kimlik doğrulama gerekiyor. TOTP ile yeniden giriş yapın." : "Recent authentication required. Sign in again with TOTP."}</p>}
    <div className="admin-review-grid"><div className="admin-report-list"><button className="admin-report-card" aria-pressed="true"><strong>personal information</strong><span>open · Contract v2</span><span>restaurant-fixture</span><span>★ 4.5 · Taste 5/5 · Speed 4/5</span></button></div><article className="admin-review-detail"><h3>{tr ? "Bildirilen değerlendirme" : "Reported review"}</h3><blockquote>{tr ? "Değiştirilemeyen uzun değerlendirme yorumu." : "Immutable long review comment."}</blockquote><p>3× Margherita / Çok uzun yapılandırılmış yemek adı</p><label>{tr ? "Dahili moderasyon nedeni" : "Internal moderation reason"}<textarea defaultValue="Fixture reason" /></label><button className="primary">{tr ? "Değerlendirmeyi gizle" : "Hide review"}</button><h3>{tr ? "Güvenli denetim geçmişi" : "Safe audit history"}</h3><details open><summary>visibility_changed_v2</summary><p>published → hidden</p></details><h3>{tr ? "Toplu yemek geri bildirimi" : "Aggregate meal feedback"}</h3><p>Margherita · 👍 18 · 👎 2 · 90.0%</p></article></div>
  </main>;
}
