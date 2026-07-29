import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { postConfirmation } from "../auth/post-confirmation/resource";
import { diagramFileAccess } from "../functions/diagram-file-access/resource";
import { projectInvitation } from "../functions/project-invitation/resource";
import { projectDiagramSync } from "../functions/project-diagram-sync/resource";
import { billingManager } from "../functions/billing-manager/resource";
import { lemonSqueezyWebhook } from "../functions/lemon-squeezy-webhook/resource";

const schema = a
  .schema({
    WorkspaceType: a.enum(["PERSONAL", "TEAM"]),
    ProjectRole: a.enum(["OWNER", "EDITOR", "VIEWER"]),
    MembershipStatus: a.enum(["ACTIVE", "PENDING", "REVOKED"]),
    InvitationStatus: a.enum([
      "PENDING",
      "ACCEPTED",
      "DECLINED",
      "EXPIRED",
      "REVOKED",
    ]),
    EmailDeliveryStatus: a.enum(["PENDING", "SENT", "FAILED"]),
    ProjectStatus: a.enum(["ACTIVE", "ARCHIVED"]),
    DiagramStatus: a.enum(["ACTIVE", "ARCHIVED"]),
    BillingProvider: a.enum(["LEMON_SQUEEZY"]),
    BillingPlanCode: a.enum(["FREE", "BASIC"]),
    BillingPeriod: a.enum(["MONTHLY", "YEARLY"]),
    BillingSubscriptionStatus: a.enum([
      "ACTIVE",
      "ON_TRIAL",
      "PAUSED",
      "PAST_DUE",
      "CANCELLED",
      "EXPIRED",
      "UNPAID",
    ]),
    BillingSyncSource: a.enum(["WEBHOOK", "MANUAL", "CHECKOUT"]),
    BillingEventStatus: a.enum(["RECEIVED", "PROCESSED", "FAILED"]),
    AnalysisType: a.enum(["POWER_FLOW"]),
    ExecutionPreference: a.enum(["AUTO", "STANDARD", "ADVANCED"]),
    ExecutionTier: a.enum(["STANDARD", "ADVANCED"]),
    ComputeProvider: a.enum(["LAMBDA", "AWS_BATCH", "ECS_FARGATE", "EMR"]),
    AnalysisStatus: a.enum([
      "VALIDATING",
      "QUEUED",
      "STARTING",
      "RUNNING",
      "CONVERGED",
      "NOT_CONVERGED",
      "FAILED",
      "TIMED_OUT",
      "CANCELLED",
    ]),
    UsageOperation: a.enum(["RESERVE", "CONSUME", "RELEASE", "REFUND", "ADJUSTMENT"]),

    UserProfile: a
      .model({
        id: a.id().required(),
        cognitoId: a.string().required(),
        profileOwner: a.string().required(),
        email: a.string().required(),
        firstName: a.string(),
        lastName: a.string(),
        displayName: a.string().required(),
        avatarKey: a.string(),
        personalWorkspaceId: a.id(),
      })
      .authorization((allow) => [allow.ownerDefinedIn("profileOwner")]),

    Workspace: a
      .model({
        id: a.id().required(),
        name: a.string().required(),
        description: a.string(),
        type: a.ref("WorkspaceType").required(),
        ownerProfileId: a.id().required(),
        ownerIdentity: a.string().required(),
        ownerIdentities: a.string().array(),
        projectCount: a.integer().default(0),
        memberCount: a.integer().default(1),
        projects: a.hasMany("Project", "workspaceId"),
      })
      .authorization((allow) => [allow.ownersDefinedIn("ownerIdentities")]),

    OrganizationSubscription: a
      .model({
        id: a.id().required(),
        workspaceId: a.id().required(),
        ownerIdentities: a.string().array(),
        provider: a.ref("BillingProvider").required(),
        providerCustomerId: a.string(),
        providerSubscriptionId: a.string(),
        providerVariantId: a.string(),
        planCode: a.ref("BillingPlanCode").required(),
        billingPeriod: a.ref("BillingPeriod"),
        status: a.ref("BillingSubscriptionStatus").required(),
        cancelAtPeriodEnd: a.boolean().default(false),
        currentPeriodEnd: a.datetime(),
        endsAt: a.datetime(),
        cardBrand: a.string(),
        cardLastFour: a.string(),
        providerUpdatedAt: a.datetime(),
        lastSyncedAt: a.datetime(),
        lastSyncSource: a.ref("BillingSyncSource"),
        testMode: a.boolean().default(true),
      })
      .secondaryIndexes((index) => [
        index("providerSubscriptionId").queryField(
          "listSubscriptionsByProviderId",
        ),
      ])
      .authorization((allow) => [
        allow.ownersDefinedIn("ownerIdentities").to(["read"]),
      ]),

    BillingCharge: a
      .model({
        id: a.id().required(),
        workspaceId: a.id().required(),
        ownerIdentities: a.string().array(),
        provider: a.ref("BillingProvider").required(),
        providerInvoiceId: a.string().required(),
        providerSubscriptionId: a.string(),
        status: a.string().required(),
        description: a.string(),
        currency: a.string().required(),
        amountMinor: a.integer().required(),
        refundedAmountMinor: a.integer().default(0),
        billingDate: a.datetime(),
        invoiceUrl: a.url(),
        testMode: a.boolean().default(true),
        providerUpdatedAt: a.datetime(),
      })
      .secondaryIndexes((index) => [
        index("workspaceId")
          .sortKeys(["billingDate"])
          .queryField("listChargesByWorkspace"),
      ])
      .authorization((allow) => [
        allow.ownersDefinedIn("ownerIdentities").to(["read"]),
      ]),

    BillingEvent: a
      .model({
        id: a.id().required(),
        provider: a.ref("BillingProvider").required(),
        eventType: a.string().required(),
        providerResourceId: a.string().required(),
        workspaceId: a.id(),
        processingStatus: a.ref("BillingEventStatus").required(),
        receivedAt: a.datetime().required(),
        processedAt: a.datetime(),
        errorMessage: a.string(),
        testMode: a.boolean().default(true),
      })
      .authorization((allow) => [allow.authenticated().to(["read"])]),

    Project: a
      .model({
        id: a.id().required(),
        workspaceId: a.id().required(),
        workspace: a.belongsTo("Workspace", "workspaceId"),
        name: a.string().required(),
        description: a.string(),
        status: a.ref("ProjectStatus").required(),
        activeDiagramId: a.id(),
        ownerProfileId: a.id().required(),
        ownerDisplayName: a.string().required(),
        ownerEmail: a.string().required(),
        createdByIdentity: a.string().required(),
        ownerIdentities: a.string().array(),
        editorIdentities: a.string().array(),
        viewerIdentities: a.string().array(),
        diagramCount: a.integer().default(0),
        memberCount: a.integer().default(1),
        accessVersion: a.integer().default(1),
        diagrams: a.hasMany("Diagram", "projectId"),
        members: a.hasMany("ProjectMember", "projectId"),
        invitations: a.hasMany("ProjectInvitation", "projectId"),
      })
      .secondaryIndexes((index) => [
        index("workspaceId").queryField("listProjectsByWorkspace"),
      ])
      .authorization((allow) => [
        allow.ownersDefinedIn("ownerIdentities"),
        allow.ownersDefinedIn("editorIdentities").to(["read"]),
        allow.ownersDefinedIn("viewerIdentities").to(["read"]),
      ]),

    Diagram: a
      .model({
        id: a.id().required(),
        projectId: a.id().required(),
        project: a.belongsTo("Project", "projectId"),
        name: a.string().required(),
        description: a.string(),
        status: a.ref("DiagramStatus").required(),
        position: a.integer().required(),
        storageKey: a.string().required(),
        storageVersion: a.integer().default(0),
        documentBytes: a.integer().default(0),
        documentChecksum: a.string(),
        lastSavedAt: a.datetime(),
        ownerIdentities: a.string().array(),
        editorIdentities: a.string().array(),
        viewerIdentities: a.string().array(),
      })
      .secondaryIndexes((index) => [
        index("projectId")
          .sortKeys(["position"])
          .queryField("listDiagramsByProject"),
      ])
      .authorization((allow) => [
        allow.ownersDefinedIn("ownerIdentities"),
        allow
          .ownersDefinedIn("editorIdentities")
          .to(["create", "read", "update", "delete"]),
        allow.ownersDefinedIn("viewerIdentities").to(["read"]),
      ]),

    ProjectMember: a
      .model({
        id: a.id().required(),
        projectId: a.id().required(),
        project: a.belongsTo("Project", "projectId"),
        profileId: a.id().required(),
        cognitoId: a.string().required(),
        email: a.string().required(),
        displayName: a.string().required(),
        role: a.ref("ProjectRole").required(),
        status: a.ref("MembershipStatus").required(),
        managerIdentities: a.string().array(),
        memberIdentities: a.string().array(),
      })
      .secondaryIndexes((index) => [
        index("projectId").queryField("listMembersByProject"),
        index("profileId").queryField("listMembersByProfile"),
      ])
      .authorization((allow) => [
        allow.ownersDefinedIn("managerIdentities"),
        allow.ownersDefinedIn("memberIdentities").to(["read"]),
      ]),

    ProjectInvitation: a
      .model({
        id: a.id().required(),
        projectId: a.id().required(),
        project: a.belongsTo("Project", "projectId"),
        projectName: a.string().required(),
        email: a.string().required(),
        role: a.ref("ProjectRole").required(),
        status: a.ref("InvitationStatus").required(),
        invitedByProfileId: a.id().required(),
        invitedByDisplayName: a.string().required(),
        acceptedByProfileId: a.id(),
        expiresAt: a.datetime().required(),
        emailDeliveryStatus: a.ref("EmailDeliveryStatus"),
        emailSentAt: a.datetime(),
        lastEmailAttemptAt: a.datetime(),
        emailError: a.string(),
        emailMessageId: a.string(),
        sendCount: a.integer().default(0),
        ownerIdentities: a.string().array(),
        recipientIdentities: a.string().array(),
      })
      .secondaryIndexes((index) => [
        index("email").queryField("listInvitationsByEmail"),
        index("projectId").queryField("listInvitationsByProject"),
      ])
      .authorization((allow) => [
        allow.ownersDefinedIn("ownerIdentities"),
        allow
          .ownersDefinedIn("recipientIdentities")
          .identityClaim("email")
          .to(["read"]),
      ]),

    AnalysisStudy: a
      .model({
        id: a.id().required(),
        workspaceId: a.id().required(),
        projectId: a.id().required(),
        diagramId: a.id().required(),
        operatingCaseId: a.string().required(),
        name: a.string(),
        analysisType: a.ref("AnalysisType").required(),
        executionPreference: a.ref("ExecutionPreference").required(),
        executionTier: a.ref("ExecutionTier"),
        computeProvider: a.ref("ComputeProvider"),
        status: a.ref("AnalysisStatus").required(),
        clientRequestId: a.string().required(),
        inputDiagramVersion: a.integer().required(),
        inputStorageKey: a.string(),
        resultStorageKey: a.string(),
        diagnosticsStorageKey: a.string(),
        engineName: a.string(),
        engineVersion: a.string(),
        requestedMemoryMb: a.integer(),
        executionTimeoutSeconds: a.integer(),
        providerExecutionId: a.string(),
        reservedUnits: a.integer().default(0),
        consumedUnits: a.integer().default(0),
        requestedByProfileId: a.id().required(),
        requestedAt: a.datetime().required(),
        startedAt: a.datetime(),
        completedAt: a.datetime(),
        failureCode: a.string(),
        failureMessage: a.string(),
        ownerIdentities: a.string().array(),
        editorIdentities: a.string().array(),
        viewerIdentities: a.string().array(),
      })
      .secondaryIndexes((index) => [
        index("workspaceId")
          .sortKeys(["requestedAt"])
          .queryField("listAnalysisStudiesByWorkspace"),
        index("diagramId")
          .sortKeys(["requestedAt"])
          .queryField("listAnalysisStudiesByDiagram"),
        index("clientRequestId").queryField("listAnalysisStudiesByClientRequest"),
      ])
      .authorization((allow) => [
        allow.ownersDefinedIn("ownerIdentities").to(["read"]),
        allow.ownersDefinedIn("editorIdentities").to(["read"]),
        allow.ownersDefinedIn("viewerIdentities").to(["read"]),
      ]),

    UsagePeriod: a
      .model({
        id: a.id().required(),
        workspaceId: a.id().required(),
        periodKey: a.string().required(),
        periodStart: a.datetime().required(),
        periodEnd: a.datetime().required(),
        planCode: a.ref("BillingPlanCode").required(),
        includedAnalysisUnits: a.integer().default(0),
        reservedAnalysisUnits: a.integer().default(0),
        consumedAnalysisUnits: a.integer().default(0),
        refundedAnalysisUnits: a.integer().default(0),
        successfulExecutions: a.integer().default(0),
        nonConvergedExecutions: a.integer().default(0),
        failedExecutions: a.integer().default(0),
        cancelledExecutions: a.integer().default(0),
        ownerIdentities: a.string().array(),
      })
      .secondaryIndexes((index) => [
        index("workspaceId")
          .sortKeys(["periodKey"])
          .queryField("listUsagePeriodsByWorkspace"),
      ])
      .authorization((allow) => [
        allow.ownersDefinedIn("ownerIdentities").to(["read"]),
      ]),

    UsageLedgerEntry: a
      .model({
        id: a.id().required(),
        workspaceId: a.id().required(),
        usagePeriodId: a.id().required(),
        studyId: a.id(),
        operation: a.ref("UsageOperation").required(),
        units: a.integer().required(),
        idempotencyKey: a.string().required(),
        reason: a.string(),
        createdAt: a.datetime().required(),
        ownerIdentities: a.string().array(),
      })
      .secondaryIndexes((index) => [
        index("usagePeriodId")
          .sortKeys(["createdAt"])
          .queryField("listUsageLedgerEntriesByPeriod"),
        index("studyId")
          .sortKeys(["createdAt"])
          .queryField("listUsageLedgerEntriesByStudy"),
        index("idempotencyKey").queryField("listUsageLedgerEntriesByIdempotencyKey"),
      ])
      .authorization((allow) => [
        allow.ownersDefinedIn("ownerIdentities").to(["read"]),
      ]),

    BillingChargeSummary: a.customType({
      id: a.id().required(),
      status: a.string().required(),
      description: a.string(),
      currency: a.string().required(),
      amountMinor: a.integer().required(),
      refundedAmountMinor: a.integer(),
      billingDate: a.datetime(),
      invoiceUrl: a.url(),
      createdAt: a.datetime(),
    }),

    BillingOverview: a.customType({
      planCode: a.ref("BillingPlanCode").required(),
      status: a.string().required(),
      statusLabel: a.string().required(),
      billingPeriod: a.ref("BillingPeriod"),
      cancelAtPeriodEnd: a.boolean().required(),
      currentPeriodEnd: a.datetime(),
      endsAt: a.datetime(),
      cardBrand: a.string(),
      cardLastFour: a.string(),
      lastSyncedAt: a.datetime(),
      hasProviderSubscription: a.boolean().required(),
      charges: a.ref("BillingChargeSummary").array(),
    }),

    BillingActionResult: a.customType({
      success: a.boolean().required(),
      url: a.url(),
      message: a.string(),
    }),

    DiagramFileTicket: a.customType({
      url: a.string().required(),
      key: a.string().required(),
      method: a.string().required(),
      expiresAt: a.datetime().required(),
      contentType: a.string(),
    }),

    ProjectInvitationDelivery: a.customType({
      invitationId: a.id().required(),
      projectId: a.id().required(),
      projectName: a.string().required(),
      email: a.string().required(),
      role: a.ref("ProjectRole").required(),
      status: a.ref("InvitationStatus").required(),
      expiresAt: a.datetime().required(),
      emailDeliveryStatus: a.ref("EmailDeliveryStatus").required(),
      emailSentAt: a.datetime(),
      emailError: a.string(),
      sendCount: a.integer().required(),
    }),

    getBillingOverview: a
      .query()
      .arguments({ workspaceId: a.id().required() })
      .returns(a.ref("BillingOverview"))
      .handler(a.handler.function(billingManager))
      .authorization((allow) => [allow.authenticated()]),

    createBillingCheckout: a
      .mutation()
      .arguments({
        workspaceId: a.id().required(),
        planCode: a.ref("BillingPlanCode").required(),
        billingPeriod: a.ref("BillingPeriod").required(),
      })
      .returns(a.ref("BillingActionResult"))
      .handler(a.handler.function(billingManager))
      .authorization((allow) => [allow.authenticated()]),

    syncBillingSubscription: a
      .mutation()
      .arguments({ workspaceId: a.id().required() })
      .returns(a.ref("BillingActionResult"))
      .handler(a.handler.function(billingManager))
      .authorization((allow) => [allow.authenticated()]),

    getBillingPortal: a
      .query()
      .arguments({ workspaceId: a.id().required() })
      .returns(a.ref("BillingActionResult"))
      .handler(a.handler.function(billingManager))
      .authorization((allow) => [allow.authenticated()]),

    cancelBillingSubscription: a
      .mutation()
      .arguments({ workspaceId: a.id().required() })
      .returns(a.ref("BillingActionResult"))
      .handler(a.handler.function(billingManager))
      .authorization((allow) => [allow.authenticated()]),

    changeBillingPlan: a
      .mutation()
      .arguments({
        workspaceId: a.id().required(),
        planCode: a.ref("BillingPlanCode").required(),
        billingPeriod: a.ref("BillingPeriod").required(),
      })
      .returns(a.ref("BillingActionResult"))
      .handler(a.handler.function(billingManager))
      .authorization((allow) => [allow.authenticated()]),

    requestDiagramUpload: a
      .mutation()
      .arguments({
        projectId: a.id().required(),
        diagramId: a.id().required(),
        action: a.string(),
        contentType: a.string(),
      })
      .returns(a.ref("DiagramFileTicket"))
      .handler(a.handler.function(diagramFileAccess))
      .authorization((allow) => [allow.authenticated()]),

    requestDiagramDownload: a
      .query()
      .arguments({
        projectId: a.id().required(),
        diagramId: a.id().required(),
        action: a.string(),
      })
      .returns(a.ref("DiagramFileTicket"))
      .handler(a.handler.function(diagramFileAccess))
      .authorization((allow) => [allow.authenticated()]),

    deleteDiagramDocument: a
      .mutation()
      .arguments({
        projectId: a.id().required(),
        diagramId: a.id().required(),
        action: a.string(),
      })
      .returns(a.boolean())
      .handler(a.handler.function(diagramFileAccess))
      .authorization((allow) => [allow.authenticated()]),

    sendProjectInvitation: a
      .mutation()
      .arguments({
        projectId: a.id().required(),
        email: a.string().required(),
        role: a.ref("ProjectRole").required(),
      })
      .returns(a.ref("ProjectInvitationDelivery"))
      .handler(a.handler.function(projectInvitation))
      .authorization((allow) => [allow.authenticated()]),

    resendProjectInvitation: a
      .mutation()
      .arguments({ invitationId: a.id().required() })
      .returns(a.ref("ProjectInvitationDelivery"))
      .handler(a.handler.function(projectInvitation))
      .authorization((allow) => [allow.authenticated()]),

    acceptProjectInvitation: a
      .mutation()
      .arguments({ invitationId: a.id().required() })
      .returns(a.boolean())
      .handler(a.handler.function(projectInvitation))
      .authorization((allow) => [allow.authenticated()]),

    syncProjectDiagrams: a
      .mutation()
      .arguments({
        projectId: a.id().required(),
        activeDiagramId: a.id(),
      })
      .returns(a.boolean())
      .handler(a.handler.function(projectDiagramSync))
      .authorization((allow) => [allow.authenticated()]),
  })
  .authorization((allow) => [
    allow.resource(postConfirmation).to(["query", "mutate"]),
    allow.resource(diagramFileAccess).to(["query"]),
    allow.resource(projectInvitation).to(["query", "mutate"]),
    allow.resource(projectDiagramSync).to(["query", "mutate"]),
    allow.resource(billingManager).to(["query", "mutate"]),
    allow.resource(lemonSqueezyWebhook).to(["query", "mutate"]),
  ]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
