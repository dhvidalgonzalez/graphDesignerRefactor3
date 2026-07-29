import type {
  AppSyncIdentityCognito,
  AppSyncResolverHandler,
} from "aws-lambda";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/billing-manager";
import type { Schema } from "../../data/resource";

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

const API_BASE = "https://api.lemonsqueezy.com/v1";

type Action =
  | "OVERVIEW"
  | "CREATE_CHECKOUT"
  | "SYNC"
  | "PORTAL"
  | "CANCEL"
  | "CHANGE_PLAN";

type Arguments = {
  workspaceId: string;
  action?: string | null;
  planCode?: string | null;
  billingPeriod?: string | null;
};

type RuntimeEvent = { fieldName?: string };

type JsonApiResponse<T> = { data: T; meta?: Record<string, unknown> };

type SubscriptionAttributes = {
  store_id: number;
  customer_id: number;
  order_id: number;
  product_id: number;
  variant_id: number;
  product_name: string;
  variant_name: string;
  user_name: string;
  user_email: string;
  status: string;
  status_formatted?: string;
  card_brand?: string | null;
  card_last_four?: string | null;
  pause?: unknown;
  cancelled: boolean;
  renews_at?: string | null;
  ends_at?: string | null;
  trial_ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
  test_mode?: boolean;
  urls?: {
    update_payment_method?: string;
    customer_portal?: string;
  };
};

type SubscriptionResource = {
  type: "subscriptions";
  id: string;
  attributes: SubscriptionAttributes;
};

type InvoiceAttributes = {
  store_id: number;
  subscription_id: number;
  customer_id: number;
  status: string;
  billing_reason?: string;
  currency: string;
  total: number;
  refunded_amount?: number;
  created_at?: string;
  updated_at?: string;
  billing_date?: string;
  urls?: { invoice_url?: string };
  test_mode?: boolean;
};

type InvoiceResource = {
  type: "subscription-invoices";
  id: string;
  attributes: InvoiceAttributes;
};


function normalizeSubscriptionStatus(value: unknown) {
  const normalized = String(value || "active").toUpperCase();
  const allowed = new Set([
    "ACTIVE",
    "ON_TRIAL",
    "PAUSED",
    "PAST_DUE",
    "CANCELLED",
    "EXPIRED",
    "UNPAID",
  ]);
  return allowed.has(normalized) ? normalized : "UNPAID";
}

function getIdentity(eventIdentity: unknown) {
  const identity = eventIdentity as AppSyncIdentityCognito | null;
  const claims = (identity?.claims ?? {}) as Record<string, unknown>;
  const sub = String(identity?.sub ?? claims.sub ?? "");
  const username = String(
    identity?.username ?? claims.username ?? claims["cognito:username"] ?? "",
  );
  return {
    sub,
    username,
    email: String(claims.email ?? "").toLowerCase(),
    identityKey: sub && username ? `${sub}::${username}` : "",
  };
}

function includesIdentity(
  values: readonly (string | null)[] | null | undefined,
  identity: ReturnType<typeof getIdentity>,
) {
  const candidates = new Set(
    [identity.sub, identity.username, identity.email, identity.identityKey].filter(Boolean),
  );
  return (values ?? []).some((value) => Boolean(value && candidates.has(String(value))));
}

function resolveAction(event: RuntimeEvent, fallback?: string | null): Action {
  const byField: Record<string, Action> = {
    getBillingOverview: "OVERVIEW",
    createBillingCheckout: "CREATE_CHECKOUT",
    syncBillingSubscription: "SYNC",
    getBillingPortal: "PORTAL",
    cancelBillingSubscription: "CANCEL",
    changeBillingPlan: "CHANGE_PLAN",
  };
  const action = (event.fieldName && byField[event.fieldName]) || fallback?.toUpperCase();
  if (!action || !["OVERVIEW", "CREATE_CHECKOUT", "SYNC", "PORTAL", "CANCEL", "CHANGE_PLAN"].includes(action)) {
    throw new Error("UNSUPPORTED_BILLING_ACTION");
  }
  return action as Action;
}

function getVariantId(planCode = "BASIC", billingPeriod = "MONTHLY") {
  if (planCode !== "BASIC") throw new Error("UNSUPPORTED_PLAN");
  const variantId = billingPeriod === "YEARLY"
    ? env.LEMON_SQUEEZY_BASIC_YEARLY_VARIANT_ID
    : env.LEMON_SQUEEZY_BASIC_MONTHLY_VARIANT_ID;
  if (!variantId) throw new Error("BILLING_VARIANT_NOT_CONFIGURED");
  return String(variantId);
}

function mapVariant(variantId: string) {
  if (variantId === String(env.LEMON_SQUEEZY_BASIC_YEARLY_VARIANT_ID)) {
    return { planCode: "BASIC", billingPeriod: "YEARLY" };
  }
  if (variantId === String(env.LEMON_SQUEEZY_BASIC_MONTHLY_VARIANT_ID)) {
    return { planCode: "BASIC", billingPeriod: "MONTHLY" };
  }
  throw new Error("UNKNOWN_BILLING_VARIANT");
}

function isUsableStatus(status?: string | null) {
  return ["active", "on_trial", "paused", "past_due"].includes(String(status || "").toLowerCase());
}

function formatStatus(status?: string | null, cancelAtPeriodEnd = false) {
  if (cancelAtPeriodEnd && isUsableStatus(status)) return "Cancelación programada";
  const labels: Record<string, string> = {
    active: "Activa",
    on_trial: "En prueba",
    paused: "Pausada",
    past_due: "Pago pendiente",
    cancelled: "Cancelada",
    expired: "Expirada",
    unpaid: "Impaga",
  };
  return labels[String(status || "").toLowerCase()] || "Sin suscripción";
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${env.LEMON_SQUEEZY_API_KEY}`,
      ...(init.headers || {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    console.error("billing-manager:provider-error", { path, status: response.status, body });
    throw new Error(`PAYMENT_PROVIDER_ERROR_${response.status}`);
  }
  return (body ? JSON.parse(body) : null) as T;
}

async function getWorkspace(workspaceId: string, identity: ReturnType<typeof getIdentity>) {
  const result = await client.models.Workspace.get({ id: workspaceId });
  if (result.errors?.length || !result.data) throw new Error("WORKSPACE_NOT_FOUND");
  if (!includesIdentity(result.data.ownerIdentities, identity)) throw new Error("WORKSPACE_OWNER_REQUIRED");
  return result.data;
}

async function getLocalSubscription(workspaceId: string) {
  const result = await client.models.OrganizationSubscription.get({ id: workspaceId });
  if (result.errors?.length) throw new Error("SUBSCRIPTION_READ_FAILED");
  return result.data;
}

async function listCharges(workspaceId: string) {
  const items: Array<Schema["BillingCharge"]["type"]> = [];
  let nextToken: string | null | undefined;
  do {
    const page = await client.models.BillingCharge.listChargesByWorkspace(
      { workspaceId },
      { limit: 100, nextToken },
    );
    if (page.errors?.length) throw new Error("BILLING_CHARGES_READ_FAILED");
    items.push(...page.data);
    nextToken = page.nextToken;
  } while (nextToken);
  return items.sort((a, b) => String(b.billingDate || b.createdAt).localeCompare(String(a.billingDate || a.createdAt)));
}

async function saveSubscription(
  workspace: Schema["Workspace"]["type"],
  resource: SubscriptionResource,
  source: "WEBHOOK" | "MANUAL" | "CHECKOUT",
) {
  const attributes = resource.attributes;
  const mapped = mapVariant(String(attributes.variant_id));
  const now = new Date().toISOString();
  const current = await getLocalSubscription(workspace.id);
  const input = {
    id: workspace.id,
    workspaceId: workspace.id,
    ownerIdentities: workspace.ownerIdentities ?? [workspace.ownerIdentity],
    provider: "LEMON_SQUEEZY" as const,
    providerCustomerId: String(attributes.customer_id),
    providerSubscriptionId: resource.id,
    providerVariantId: String(attributes.variant_id),
    planCode: mapped.planCode as "BASIC",
    billingPeriod: mapped.billingPeriod as "MONTHLY" | "YEARLY",
    status: normalizeSubscriptionStatus(attributes.status) as Schema["OrganizationSubscription"]["type"]["status"],
    cancelAtPeriodEnd: Boolean(attributes.cancelled),
    currentPeriodEnd: attributes.renews_at || attributes.ends_at || null,
    endsAt: attributes.ends_at || null,
    cardBrand: attributes.card_brand || null,
    cardLastFour: attributes.card_last_four || null,
    providerUpdatedAt: attributes.updated_at || now,
    lastSyncedAt: now,
    lastSyncSource: source,
    testMode: Boolean(attributes.test_mode),
  };
  const result = current
    ? await client.models.OrganizationSubscription.update(input)
    : await client.models.OrganizationSubscription.create(input);
  if (result.errors?.length || !result.data) throw new Error("SUBSCRIPTION_SAVE_FAILED");
  return result.data;
}

async function syncInvoices(workspace: Schema["Workspace"]["type"], providerSubscriptionId: string) {
  const response = await apiRequest<JsonApiResponse<InvoiceResource[]>>(
    `/subscription-invoices?filter[subscription_id]=${encodeURIComponent(providerSubscriptionId)}&page[size]=100`,
  );
  for (const invoice of response.data ?? []) {
    const attributes = invoice.attributes;
    const existing = await client.models.BillingCharge.get({ id: invoice.id });
    const input = {
      id: invoice.id,
      workspaceId: workspace.id,
      ownerIdentities: workspace.ownerIdentities ?? [workspace.ownerIdentity],
      provider: "LEMON_SQUEEZY" as const,
      providerInvoiceId: invoice.id,
      providerSubscriptionId,
      status: String(attributes.status || "unknown").toUpperCase(),
      description: attributes.billing_reason || "Suscripción",
      currency: String(attributes.currency || "USD").toUpperCase(),
      amountMinor: Number(attributes.total || 0),
      refundedAmountMinor: Number(attributes.refunded_amount || 0),
      billingDate: attributes.billing_date || attributes.created_at || null,
      invoiceUrl: attributes.urls?.invoice_url || null,
      testMode: Boolean(attributes.test_mode),
      providerUpdatedAt: attributes.updated_at || attributes.created_at || new Date().toISOString(),
    };
    const saved = existing.data
      ? await client.models.BillingCharge.update(input)
      : await client.models.BillingCharge.create(input);
    if (saved.errors?.length) console.warn("billing-manager:invoice-save-warning", { invoiceId: invoice.id });
  }
}

async function fetchAndReconcile(workspace: Schema["Workspace"]["type"], providerSubscriptionId: string) {
  const response = await apiRequest<JsonApiResponse<SubscriptionResource>>(`/subscriptions/${providerSubscriptionId}`);
  const subscription = await saveSubscription(workspace, response.data, "MANUAL");
  await syncInvoices(workspace, providerSubscriptionId);
  return { provider: response.data, local: subscription };
}

function overviewFromLocal(
  subscription: Schema["OrganizationSubscription"]["type"] | null,
  charges: Array<Schema["BillingCharge"]["type"]>,
) {
  const usable = Boolean(subscription && isUsableStatus(subscription.status));
  return {
    planCode: usable ? subscription?.planCode || "FREE" : "FREE",
    status: subscription?.status || "FREE",
    statusLabel: formatStatus(subscription?.status, Boolean(subscription?.cancelAtPeriodEnd)),
    billingPeriod: subscription?.billingPeriod || null,
    cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
    currentPeriodEnd: subscription?.currentPeriodEnd || null,
    endsAt: subscription?.endsAt || null,
    cardBrand: subscription?.cardBrand || null,
    cardLastFour: subscription?.cardLastFour || null,
    lastSyncedAt: subscription?.lastSyncedAt || null,
    hasProviderSubscription: Boolean(subscription?.providerSubscriptionId),
    charges: charges.map((charge) => ({
      id: charge.id,
      status: charge.status,
      description: charge.description,
      currency: charge.currency,
      amountMinor: charge.amountMinor,
      refundedAmountMinor: charge.refundedAmountMinor,
      billingDate: charge.billingDate,
      invoiceUrl: charge.invoiceUrl,
      createdAt: charge.createdAt,
    })),
  };
}

export const handler: AppSyncResolverHandler<Arguments, unknown> = async (event) => {
  const identity = getIdentity(event.identity);
  if (!identity.sub) throw new Error("UNAUTHENTICATED");
  const action = resolveAction(event as unknown as RuntimeEvent, event.arguments.action);
  const workspace = await getWorkspace(event.arguments.workspaceId, identity);
  const local = await getLocalSubscription(workspace.id);

  if (action === "OVERVIEW") {
    return overviewFromLocal(local, await listCharges(workspace.id));
  }

  if (action === "CREATE_CHECKOUT") {
    const variantId = getVariantId(event.arguments.planCode || "BASIC", event.arguments.billingPeriod || "MONTHLY");
    const response = await apiRequest<JsonApiResponse<{ id: string; attributes: { url: string } }>>("/checkouts", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            product_options: {
              redirect_url: `${env.APP_URL}/#/workspace/billing?checkout=success`,
              receipt_button_text: "Volver a Gestion Diagrams",
              receipt_link_url: `${env.APP_URL}/#/workspace/billing`,
              receipt_thank_you_note: "La suscripción se activará cuando recibamos la confirmación del pago.",
            },
            checkout_data: {
              email: identity.email || undefined,
              custom: {
                workspace_id: workspace.id,
                requested_by: identity.sub,
                plan_code: "BASIC",
              },
            },
          },
          relationships: {
            store: { data: { type: "stores", id: String(env.LEMON_SQUEEZY_STORE_ID) } },
            variant: { data: { type: "variants", id: variantId } },
          },
        },
      }),
    });
    return { success: true, url: response.data.attributes.url, message: "CHECKOUT_CREATED" };
  }

  if (!local?.providerSubscriptionId) throw new Error("SUBSCRIPTION_NOT_FOUND");

  if (action === "SYNC") {
    await fetchAndReconcile(workspace, local.providerSubscriptionId);
    return { success: true, message: "SUBSCRIPTION_SYNCHRONIZED" };
  }

  if (action === "PORTAL") {
    const response = await apiRequest<JsonApiResponse<SubscriptionResource>>(`/subscriptions/${local.providerSubscriptionId}`);
    const url = response.data.attributes.urls?.customer_portal || response.data.attributes.urls?.update_payment_method;
    if (!url) throw new Error("BILLING_PORTAL_URL_UNAVAILABLE");
    return { success: true, url, message: "PORTAL_URL_CREATED" };
  }

  if (action === "CANCEL") {
    await apiRequest(`/subscriptions/${local.providerSubscriptionId}`, { method: "DELETE" });
    await fetchAndReconcile(workspace, local.providerSubscriptionId);
    return { success: true, message: "SUBSCRIPTION_CANCELLED" };
  }

  const variantId = getVariantId(event.arguments.planCode || "BASIC", event.arguments.billingPeriod || "MONTHLY");
  await apiRequest(`/subscriptions/${local.providerSubscriptionId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "subscriptions",
        id: local.providerSubscriptionId,
        attributes: { variant_id: Number(variantId) },
      },
    }),
  });
  await fetchAndReconcile(workspace, local.providerSubscriptionId);
  return { success: true, message: "SUBSCRIPTION_PLAN_CHANGED" };
};
