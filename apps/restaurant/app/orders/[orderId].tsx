import { useLocalSearchParams } from "expo-router";
import { Shell } from "../../src/Shell";
import { Button } from "../../src/components/Button";
import { useLocale } from "../../src/providers";
import { OrderDetailView } from "../../src/orders/OrderDetailView";
import { useOrderDetail } from "../../src/orders/useOrderDetail";

export default function OrderDetailRoute() {
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId || "";
  const { t } = useLocale();
  const detail = useOrderDetail(orderId);
  return <Shell>
    {detail.stale && <p className="ui-notice ui-notice--warning" role="status">{t.changed}</p>}
    {detail.error && !detail.order && <div className="ui-card order-empty"><p role="alert">{t.unavailable}</p><Button variant="secondary" onClick={() => void detail.reload()}>{t.retry}</Button></div>}
    {detail.loading && !detail.order && <div className="ui-card order-skeleton" aria-busy="true"><span /><span /><span /></div>}
    {detail.order && <OrderDetailView stale={detail.stale} order={detail.order} reload={detail.reload} />}
  </Shell>;
}
