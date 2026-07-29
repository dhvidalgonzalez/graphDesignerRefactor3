import crypto from "node:crypto";
import type { LambdaFunctionURLHandler } from "aws-lambda";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/lemon-squeezy-webhook";
import type { Schema } from "../../data/resource";

const { resourceConfig, libraryOptions } =
  await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

type WebhookPayload = {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, unknown>;
    test_mode?: boolean;
  };
  data?: {
    type?: string;
    id?: string;
    attributes?: Record<string, unknown>;
  };
};

function getRawBody(event: Parameters<LambdaFunctionURLHandler>[0]) {
  const body = event.body || "";
  return event.isBase64Encoded
    ? Buffer.from(body, "base64").toString("utf8")
    : body;
}

function verifySignature(rawBody: string, received: string) {
  const expected = crypto
    .createHmac("sha256", env.LEMON_SQUEEZY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function mapVariant(variantId: string) {
  if (variantId === String(env.LEMON_SQUEEZY_BASIC_YEARLY_VARIANT_ID)) {
    return { planCode: "BASIC" as const, billingPeriod: "YEARLY" as const };
  }
  if (variantId === String(env.LEMON_SQUEEZY_BASIC_MONTHLY_VARIANT_ID)) {
    return { planCode: "BASIC" as const, billingPeriod: "MONTHLY" as const };
  }
  throw new Error("UNKNOWN_BILLING_VARIANT");
}

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

function stringValue(value: unknown) {
  return value == null ? null : String(value);
}

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function findWorkspaceId(payload: WebhookPayload) {
  const customWorkspaceId = stringValue(
    payload.meta?.custom_data?.workspace_id,
  );
  if (customWorkspaceId) return customWorkspaceId;

  const attributes = payload.data?.attributes || {};
  const subscriptionId =
    stringValue(attributes.subscription_id) ||
    (payload.data?.type === "subscriptions"
      ? stringValue(payload.data?.id)
      : null);
  if (!subscriptionId) return null;

  const result = await client.models.OrganizationSubscription.list({
    filter: { providerSubscriptionId: { eq: subscriptionId } },
    limit: 1,
  });
  return result.data[0]?.workspaceId || null;
}

async function getWorkspace(workspaceId: string) {
  const result = await client.models.Workspace.get({ id: workspaceId });
  if (result.errors?.length || !result.data)
    throw new Error("WORKSPACE_NOT_FOUND");
  return result.data;
}

async function upsertSubscription(
  payload: WebhookPayload,
  workspaceId: string,
) {
  if (payload.data?.type !== "subscriptions" || !payload.data.id) return;
  const workspace = await getWorkspace(workspaceId);
  const attributes = payload.data.attributes || {};
  const mapped = mapVariant(String(attributes.variant_id));
  const id = workspace.id;
  const existing = await client.models.OrganizationSubscription.get({ id });
  const now = new Date().toISOString();
  const status = normalizeSubscriptionStatus(
    attributes.status,
  ) as Schema["OrganizationSubscription"]["type"]["status"];
  const input = {
    id,
    workspaceId: workspace.id,
    ownerIdentities: workspace.ownerIdentities ?? [workspace.ownerIdentity],
    provider: "LEMON_SQUEEZY" as const,
    providerCustomerId: String(attributes.customer_id),
    providerSubscriptionId: payload.data.id,
    providerVariantId: String(attributes.variant_id),
    planCode: mapped.planCode,
    billingPeriod: mapped.billingPeriod,
    status,
    cancelAtPeriodEnd: Boolean(attributes.cancelled),
    currentPeriodEnd:
      stringValue(attributes.renews_at) || stringValue(attributes.ends_at),
    endsAt: stringValue(attributes.ends_at),
    cardBrand: stringValue(attributes.card_brand),
    cardLastFour: stringValue(attributes.card_last_four),
    providerUpdatedAt: stringValue(attributes.updated_at) || now,
    lastSyncedAt: now,
    lastSyncSource: "WEBHOOK" as const,
    testMode: Boolean(attributes.test_mode ?? payload.meta?.test_mode),
  };
  const result = existing.data
    ? await client.models.OrganizationSubscription.update(input)
    : await client.models.OrganizationSubscription.create(input);
  if (result.errors?.length) throw new Error("SUBSCRIPTION_SAVE_FAILED");
}

async function upsertCharge(payload: WebhookPayload, workspaceId: string) {
  if (payload.data?.type !== "subscription-invoices" || !payload.data.id)
    return;
  const workspace = await getWorkspace(workspaceId);
  const attributes = payload.data.attributes || {};
  const existing = await client.models.BillingCharge.get({
    id: payload.data.id,
  });
  const urls = (attributes.urls || {}) as Record<string, unknown>;
  const input = {
    id: payload.data.id,
    workspaceId: workspace.id,
    ownerIdentities: workspace.ownerIdentities ?? [workspace.ownerIdentity],
    provider: "LEMON_SQUEEZY" as const,
    providerInvoiceId: payload.data.id,
    providerSubscriptionId: String(attributes.subscription_id),
    status: String(attributes.status || "unknown").toUpperCase(),
    description: stringValue(attributes.billing_reason) || "Suscripción",
    currency: String(attributes.currency || "USD").toUpperCase(),
    amountMinor: numberValue(attributes.total),
    refundedAmountMinor: numberValue(attributes.refunded_amount),
    billingDate:
      stringValue(attributes.billing_date) ||
      stringValue(attributes.created_at),
    invoiceUrl: stringValue(urls.invoice_url),
    testMode: Boolean(attributes.test_mode ?? payload.meta?.test_mode),
    providerUpdatedAt:
      stringValue(attributes.updated_at) ||
      stringValue(attributes.created_at) ||
      new Date().toISOString(),
  };
  const result = existing.data
    ? await client.models.BillingCharge.update(input)
    : await client.models.BillingCharge.create(input);
  if (result.errors?.length) throw new Error("BILLING_CHARGE_SAVE_FAILED");
}

export const handler: LambdaFunctionURLHandler = async (event) => {
  if (event.requestContext.http.method !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const rawBody = getRawBody(event);
  const signature =
    event.headers["x-signature"] || event.headers["X-Signature"];
  if (!signature || !verifySignature(rawBody, signature)) {
    return { statusCode: 401, body: "Invalid signature" };
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const eventName =
    event.headers["x-event-name"] || payload.meta?.event_name || "unknown";
  const resourceId =
    payload.data?.id ||
    crypto.createHash("sha256").update(rawBody).digest("hex");
  const eventId = `${eventName}:${resourceId}:${stringValue(payload.data?.attributes?.updated_at) || "initial"}`;
  const existing = await client.models.BillingEvent.get({ id: eventId });
  if (existing.data?.processingStatus === "PROCESSED") {
    return {
      statusCode: 200,
      body: JSON.stringify({ received: true, duplicate: true }),
    };
  }

  const workspaceId = await findWorkspaceId(payload);
  await (existing.data
    ? client.models.BillingEvent.update({
        id: eventId,
        processingStatus: "RECEIVED",
        receivedAt: new Date().toISOString(),
      })
    : client.models.BillingEvent.create({
        id: eventId,
        provider: "LEMON_SQUEEZY",
        eventType: String(eventName),
        providerResourceId: resourceId,
        workspaceId,
        processingStatus: "RECEIVED",
        receivedAt: new Date().toISOString(),
        testMode: Boolean(
          payload.meta?.test_mode || payload.data?.attributes?.test_mode,
        ),
      }));

  try {
    if (workspaceId) {
      await upsertSubscription(payload, workspaceId);
      await upsertCharge(payload, workspaceId);
    }
    await client.models.BillingEvent.update({
      id: eventId,
      workspaceId,
      processingStatus: "PROCESSED",
      processedAt: new Date().toISOString(),
      errorMessage: null,
    });
  } catch (error) {
    console.error("lemon-squeezy-webhook:processing-failed", {
      eventName,
      resourceId,
      workspaceId,
      error,
    });
    await client.models.BillingEvent.update({
      id: eventId,
      workspaceId,
      processingStatus: "FAILED",
      processedAt: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { statusCode: 500, body: "Webhook processing failed" };
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
