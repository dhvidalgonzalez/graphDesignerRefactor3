import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../common/Icon.jsx";
import LoadingIndicator from "../common/LoadingIndicator.jsx";
import { useWorkspace } from "../../workspace/WorkspaceContext.jsx";
import { getPlanDefinition, PLAN_DEFINITIONS } from "../../billing/plans.js";
import {
  cancelBillingSubscriptionService,
  createBillingCheckoutService,
  getBillingOverviewService,
  getBillingPortalService,
  syncBillingSubscriptionService,
} from "../../services/billing/index.js";

function formatMoney(amountMinor, currency = "USD") {
  const amount = Number(amountMinor || 0) / 100;
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
  }).format(amount);
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function BillingPage() {
  const { workspace } = useWorkspace();
  const [overview, setOverview] = useState(null);
  const [status, setStatus] = useState("loading");
  const [action, setAction] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!workspace?.id) return;
    setStatus("loading");
    setError(null);
    try {
      setOverview(await getBillingOverviewService(workspace.id));
      setStatus("ready");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError : new Error(String(nextError)));
      setStatus("error");
    }
  }, [workspace?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const currentPlan = useMemo(
    () => getPlanDefinition(overview?.planCode || "FREE"),
    [overview?.planCode],
  );

  const runAction = useCallback(async (name, task, { openUrl = false } = {}) => {
    setAction(name);
    setError(null);
    try {
      const result = await task();
      if (openUrl && result?.url) window.location.assign(result.url);
      else await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError : new Error(String(nextError)));
    } finally {
      setAction(null);
    }
  }, [load]);

  if (status === "loading") {
    return <div className="billing-page billing-page--loading"><LoadingIndicator label="Cargando facturación…" /></div>;
  }

  return (
    <div className="workspace-content-scroll billing-page">
      <header className="workspace-content-header billing-header">
        <div>
          <span className="workspace-kicker">Configuración del workspace</span>
          <h1>Planes y facturación</h1>
          <p>Administra la suscripción, el medio de pago y el historial de cobros de este espacio de trabajo.</p>
        </div>
        <button className="button button--soft" type="button" disabled={Boolean(action)} onClick={() => runAction("sync", () => syncBillingSubscriptionService(workspace.id))}>
          <Icon name="refresh" size={16} /> {action === "sync" ? "Sincronizando…" : "Sincronizar"}
        </button>
      </header>

      {error && <div className="billing-alert billing-alert--error">{error.message}</div>}

      <section className="billing-current-plan">
        <div>
          <span className="billing-plan-label">Plan actual</span>
          <h2>{currentPlan.name}</h2>
          <p>{currentPlan.description}</p>
        </div>
        <div className="billing-status-stack">
          <span className={`billing-status billing-status--${String(overview?.status || "free").toLowerCase()}`}>
            {overview?.statusLabel || "Sin suscripción"}
          </span>
          <small>Última sincronización: {formatDate(overview?.lastSyncedAt)}</small>
        </div>
      </section>

      <section className="billing-plans-grid">
        {Object.values(PLAN_DEFINITIONS).map((plan) => {
          const isCurrent = plan.code === currentPlan.code;
          return (
            <article className={`billing-plan-card${isCurrent ? " billing-plan-card--current" : ""}`} key={plan.code}>
              <div className="billing-plan-card-head">
                <div><span>{plan.name}</span><strong>{plan.priceLabel}</strong></div>
                {isCurrent && <span className="billing-current-badge">Actual</span>}
              </div>
              <p>{plan.description}</p>
              <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
              {plan.code === "BASIC" && !isCurrent && (
                <button className="button button--primary" type="button" disabled={Boolean(action)} onClick={() => runAction("checkout", () => createBillingCheckoutService(workspace.id), { openUrl: true })}>
                  {action === "checkout" ? "Preparando pago…" : "Suscribirse por US$1"}
                </button>
              )}
            </article>
          );
        })}
      </section>

      {overview?.hasProviderSubscription && (
        <section className="billing-actions-panel">
          <div><h2>Administrar suscripción</h2><p>Los datos de tarjeta se administran de forma segura en Lemon Squeezy.</p></div>
          <div className="billing-actions-row">
            <button className="button button--soft" type="button" disabled={Boolean(action)} onClick={() => runAction("portal", () => getBillingPortalService(workspace.id), { openUrl: true })}>Administrar medio de pago</button>
            {!overview?.cancelAtPeriodEnd && (
              <button className="button button--danger" type="button" disabled={Boolean(action)} onClick={() => {
                if (window.confirm("La suscripción seguirá activa hasta el final del periodo pagado. ¿Deseas cancelarla?")) {
                  runAction("cancel", () => cancelBillingSubscriptionService(workspace.id));
                }
              }}>{action === "cancel" ? "Cancelando…" : "Cancelar renovación"}</button>
            )}
          </div>
        </section>
      )}

      <section className="billing-history-panel">
        <div className="billing-section-title"><div><h2>Historial de cobros</h2><p>Registro de cobros y documentos asociados a tu suscripción.</p></div><span>{overview?.charges?.length || 0} registros</span></div>
        {overview?.charges?.length ? (
          <div className="billing-table-wrap">
            <table className="billing-table">
              <thead><tr><th>Fecha</th><th>Descripción</th><th>Estado</th><th>Monto</th><th>Factura</th></tr></thead>
              <tbody>{overview.charges.map((charge) => (
                <tr key={charge.id}>
                  <td>{formatDate(charge.billingDate || charge.createdAt)}</td>
                  <td>{charge.description || "Suscripción"}</td>
                  <td><span className="billing-charge-status">{charge.status}</span></td>
                  <td>{formatMoney(charge.amountMinor, charge.currency)}</td>
                  <td>{charge.invoiceUrl ? <a href={charge.invoiceUrl} target="_blank" rel="noreferrer">Ver</a> : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="billing-empty"><Icon name="file" size={24} /><strong>Aún no hay cobros</strong><p>Los pagos y renovaciones aparecerán aquí después de ser sincronizados.</p></div>}
      </section>
    </div>
  );
}
