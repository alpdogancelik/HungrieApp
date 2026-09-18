import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";

export default function ReviewPreview() {
  const params = useLocalSearchParams<{ locale?: string; state?: string }>();
  const [locale, setLocale] = useState<"en" | "tr">(params.locale === "tr" ? "tr" : "en");
  const [state, setState] = useState<"content" | "empty" | "error">(
    params.state === "error" ? "error" : params.state === "empty" ? "empty" : "content",
  );
  if (!__DEV__) return <Redirect href="/reviews" />;
  const tr = locale === "tr";
  return <main className="content review-workspace">
    <header className="review-header"><div><p className="eyebrow">Local fixture · no network</p><h1>{tr ? "Sipariş değerlendirmeleri" : "Order reviews"}</h1><p>{tr ? "Anonim teslim edilmiş sipariş geri bildirimi." : "Anonymous delivered-order feedback."}</p></div></header>
    <div className="toolbar"><button onClick={() => setLocale(tr ? "en" : "tr")}>{tr ? "English" : "Türkçe"}</button><button onClick={() => setState("content")}>Content</button><button onClick={() => setState("empty")}>Empty</button><button onClick={() => setState("error")}>Error</button></div>
    {state === "error" && <div className="review-error" role="alert">{tr ? "Hizmet kullanılamıyor. Tekrar deneyin." : "Service unavailable. Try again."}<button>{tr ? "Tekrar dene" : "Try again"}</button></div>}
    {state === "empty" && <p className="empty-state">{tr ? "Değerlendirme yok." : "No reviews."}</p>}
    {state === "content" && <div className="review-list"><article className="review-card"><div className="review-card-head"><strong>👤 {tr ? "Anonim müşteri" : "Anonymous customer"}</strong><span className="status-chip status-published">{tr ? "Yayında" : "Published"}</span></div><div className="review-scores"><span>★ 4.5</span><span>{tr ? "Lezzet" : "Taste"}: 5/5</span><span>{tr ? "Hız" : "Speed"}: 4/5</span></div><p className="review-comment">{tr ? "Uzun içerik ve büyütülmüş metin için ağ kullanmayan geliştirme önizlemesi." : "A network-free development preview with long content for responsive and enlarged-text inspection."}</p><p>3× Margherita / Çok uzun yapılandırılmış yemek adı, 1× Ayran</p><button className="button report-button">{tr ? "Değerlendirmeyi bildir" : "Report review"}</button></article><div className="aggregate-grid"><article className="aggregate-card"><h2>Margherita</h2><p>👍 18 · 👎 2 · 90.0%</p></article></div></div>}
  </main>;
}
