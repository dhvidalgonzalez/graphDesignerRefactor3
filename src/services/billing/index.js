import amplifyClient from "../api/client/index.js";

function throwFirstError(errors, fallback) {
  if (!errors?.length) return;
  throw new Error(errors[0]?.message || fallback);
}

export async function getBillingOverviewService(workspaceId) {
  const response = await amplifyClient.queries.getBillingOverview({ workspaceId });
  throwFirstError(response.errors, "No fue posible cargar la facturación.");
  return response.data;
}

export async function createBillingCheckoutService(workspaceId, planCode = "BASIC", billingPeriod = "MONTHLY") {
  const response = await amplifyClient.mutations.createBillingCheckout({
    workspaceId,
    planCode,
    billingPeriod,
  });
  throwFirstError(response.errors, "No fue posible crear el checkout.");
  return response.data;
}

export async function syncBillingSubscriptionService(workspaceId) {
  const response = await amplifyClient.mutations.syncBillingSubscription({ workspaceId });
  throwFirstError(response.errors, "No fue posible sincronizar la suscripción.");
  return response.data;
}

export async function getBillingPortalService(workspaceId) {
  const response = await amplifyClient.queries.getBillingPortal({ workspaceId });
  throwFirstError(response.errors, "No fue posible abrir el portal de facturación.");
  return response.data;
}

export async function cancelBillingSubscriptionService(workspaceId) {
  const response = await amplifyClient.mutations.cancelBillingSubscription({ workspaceId });
  throwFirstError(response.errors, "No fue posible cancelar la suscripción.");
  return response.data;
}

export async function changeBillingPlanService(workspaceId, planCode, billingPeriod = "MONTHLY") {
  const response = await amplifyClient.mutations.changeBillingPlan({
    workspaceId,
    planCode,
    billingPeriod,
  });
  throwFirstError(response.errors, "No fue posible cambiar el plan.");
  return response.data;
}
