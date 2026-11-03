import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () =>
  text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`);

// Shared Academy records; technical authority is always keyed to an independent track.
export const academyFamilies = sqliteTable("academy_families", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(()=>organizations.id),
  track: text("track").notNull(), name: text("name").notNull(),
  assetCategoryId: text("asset_category_id").references(()=>assetCategories.id),
},t=>[index("idx_academy_families_track").on(t.organizationId,t.track)]);
export const academyProfiles = sqliteTable("academy_profiles", {
  id: text("id").primaryKey(),
  track: text("track").notNull().default("biomedical"),
  technicianId: text("technician_id").notNull().references(() => technicians.id),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  currentLevel: text("current_level"), targetLevel: text("target_level"), specialty: text("specialty"),
  evidence: text("evidence").notNull().default(""), recordVersion: integer("record_version").notNull().default(1),
  updatedBy: text("updated_by").notNull().references(() => users.id), updatedAt: updatedAt(),
},t=>[uniqueIndex("uq_academy_profile_track").on(t.organizationId,t.technicianId,t.track)]);
export const academyTrainingRecords = sqliteTable("academy_training_records", {
  track: text("track").notNull().default("biomedical"),
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id),
  technicianId: text("technician_id").notNull().references(() => technicians.id),
  title: text("title").notNull().default(""), provider: text("provider").notNull().default(""),
  completedOn: text("completed_on"), minutes: integer("minutes"), evidence: text("evidence").notNull().default(""),
  status: text("status").notNull().default("draft"), recordVersion: integer("record_version").notNull().default(1),
  submittedBy: text("submitted_by").notNull().references(() => users.id), reviewedBy: text("reviewed_by").references(() => users.id),
  reviewedAt: text("reviewed_at"), feedback: text("feedback"), createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [index("idx_academy_training_tech").on(t.organizationId,t.technicianId,t.status)]);
export const academyCourses = sqliteTable("academy_courses", {
  id:text("id").primaryKey(), organizationId:text("organization_id").notNull().references(()=>organizations.id),
  track:text("track").notNull(), title:text("title").notNull().default(""), category:text("category").notNull().default("foundations"),
  level:text("level").notNull().default(""), manufacturer:text("manufacturer").notNull().default(""), model:text("model").notNull().default(""),
  credential:text("credential").notNull().default(""), specialty:text("specialty").notNull().default(""), difficulty:text("difficulty").notNull().default("introductory"),
  draftJson:text("draft_json").notNull().default("{}"), status:text("status").notNull().default("draft"),
  publishedRevisionId:text("published_revision_id"), recordVersion:integer("record_version").notNull().default(1),
  updatedBy:text("updated_by").notNull().references(()=>users.id), createdAt:createdAt(), updatedAt:updatedAt(),
},t=>[index("idx_academy_courses_catalog").on(t.organizationId,t.track,t.status,t.category)]);
export const academyCourseRevisions = sqliteTable("academy_course_revisions", {
  id:text("id").primaryKey(), courseId:text("course_id").notNull().references(()=>academyCourses.id),
  organizationId:text("organization_id").notNull().references(()=>organizations.id), track:text("track").notNull(),
  revision:integer("revision").notNull(), snapshotJson:text("snapshot_json").notNull(),
  publishedBy:text("published_by").notNull().references(()=>users.id), publishedAt:createdAt(),
},t=>[uniqueIndex("uq_academy_course_revision").on(t.courseId,t.revision),index("idx_academy_course_revisions_track").on(t.organizationId,t.track)]);
export const academyEnrollments = sqliteTable("academy_enrollments", {
  id:text("id").primaryKey(), organizationId:text("organization_id").notNull().references(()=>organizations.id),
  track:text("track").notNull(), technicianId:text("technician_id").notNull().references(()=>technicians.id),
  revisionId:text("revision_id").notNull().references(()=>academyCourseRevisions.id),
  progressJson:text("progress_json").notNull().default("{}"), status:text("status").notNull().default("in_progress"),
  trainingRecordId:text("training_record_id").references(()=>academyTrainingRecords.id), recordVersion:integer("record_version").notNull().default(1),
  assignedBy:text("assigned_by").notNull().references(()=>users.id), createdAt:createdAt(), updatedAt:updatedAt(),
},t=>[uniqueIndex("uq_academy_enrollment_revision").on(t.organizationId,t.technicianId,t.revisionId),index("idx_academy_enrollment_tech").on(t.organizationId,t.track,t.technicianId,t.status)]);
export const academyEducationRequests = sqliteTable("academy_education_requests", {
  id:text("id").primaryKey(), organizationId:text("organization_id").notNull().references(()=>organizations.id),
  track:text("track").notNull(), technicianId:text("technician_id").notNull().references(()=>technicians.id),
  course:text("course").notNull().default(""), provider:text("provider").notNull().default(""), officialUrl:text("official_url").notNull().default(""),
  costCents:integer("cost_cents"), requestedCompanyCents:integer("requested_company_cents"), approvedCompanyCents:integer("approved_company_cents"),
  employeeRemainderCents:integer("employee_remainder_cents"), agreementReference:text("agreement_reference").notNull().default(""),
  notes:text("notes").notNull().default(""), status:text("status").notNull().default("draft"), decisionNotes:text("decision_notes").notNull().default(""),
  decidedBy:text("decided_by").references(()=>users.id), decidedAt:text("decided_at"), trainingRecordId:text("training_record_id").references(()=>academyTrainingRecords.id),
  recordVersion:integer("record_version").notNull().default(1), createdBy:text("created_by").notNull().references(()=>users.id), createdAt:createdAt(), updatedAt:updatedAt(),
},t=>[index("idx_academy_education_requests").on(t.organizationId,t.track,t.technicianId,t.status)]);
export const academySignoffs = sqliteTable("academy_signoffs", {
  track: text("track").notNull().default("biomedical"),
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(() => organizations.id),
  technicianId: text("technician_id").notNull().references(() => technicians.id),
  familyId: text("family_id").notNull().references(() => academyFamilies.id), manufacturer: text("manufacturer").notNull(), model: text("model").notNull(),
  task: text("task").notNull(), authorizationLevel: text("authorization_level").notNull(), result: text("result").notNull(),
  evaluatedOn: text("evaluated_on").notNull(), reviewDueOn: text("review_due_on"), demonstration: text("demonstration").notNull(),
  evidence: text("evidence").notNull(), evaluatorName: text("evaluator_name").notNull(), evaluatorQualifications: text("evaluator_qualifications").notNull(),
  evaluatorUserId: text("evaluator_user_id").references(() => users.id), recordedBy: text("recorded_by").notNull().references(() => users.id),
  source: text("source").notNull(), notes: text("notes").notNull().default(""), createdAt: createdAt(),
},t=>[index("idx_academy_signoffs_tech").on(t.organizationId,t.technicianId)]);
export const academySignoffEvidence = sqliteTable("academy_signoff_evidence", {
  id: text("id").primaryKey(), signoffId: text("signoff_id").notNull().references(()=>academySignoffs.id),
  workOrderId: text("work_order_id").references(()=>workOrders.id), trainingRecordId: text("training_record_id").references(()=>academyTrainingRecords.id),
});
export const academyAuthorizations = sqliteTable("academy_authorizations", {
  track: text("track").notNull().default("biomedical"),
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(()=>organizations.id),
  technicianId: text("technician_id").notNull().references(()=>technicians.id), familyId: text("family_id").notNull().references(()=>academyFamilies.id),
  manufacturer: text("manufacturer").notNull(), model: text("model").notNull(), task: text("task").notNull(),
  level: text("level").notNull(), signoffId: text("signoff_id").notNull().references(()=>academySignoffs.id), reviewDueOn: text("review_due_on"),
  recordVersion: integer("record_version").notNull().default(1), updatedAt: updatedAt(),
},t=>[uniqueIndex("uq_academy_authorization_scope").on(t.organizationId,t.track,t.technicianId,t.familyId,t.manufacturer,t.model,t.task)]);
export const academySupervisionReviews = sqliteTable("academy_supervision_reviews", {
  track: text("track").notNull().default("biomedical"),
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(()=>organizations.id),
  workOrderId: text("work_order_id").notNull().references(()=>workOrders.id), assetId: text("asset_id").notNull().references(()=>assets.id),
  technicianId: text("technician_id").notNull().references(()=>technicians.id), supervisorId: text("supervisor_id").notNull().references(()=>technicians.id),
  assetVersion: integer("asset_version").notNull(), notes: text("notes").notNull(), evidenceSnapshotJson: text("evidence_snapshot_json").notNull(),
  signedBy: text("signed_by").notNull().references(()=>users.id), signedAt: createdAt(),
},t=>[uniqueIndex("uq_academy_supervision_revision").on(t.workOrderId,t.assetId,t.technicianId,t.assetVersion,t.supervisorId)]);
// Service-report supervision is revision/evidence bound. Biomedical asset
// reviews remain above because their evidence lives on each work_order_asset;
// DME evidence lives on the technician's service report instead.
export const academyReportSupervisionReviews = sqliteTable("academy_report_supervision_reviews", {
  track: text("track").notNull().default("dme_mobility"),
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(()=>organizations.id),
  workOrderId: text("work_order_id").notNull().references(()=>workOrders.id), reportId: text("report_id").notNull().references(()=>serviceReports.id),
  technicianId: text("technician_id").notNull().references(()=>technicians.id), supervisorId: text("supervisor_id").notNull().references(()=>technicians.id),
  reportVersion: integer("report_version").notNull(), evidenceFingerprint: text("evidence_fingerprint").notNull(),
  notes: text("notes").notNull(), evidenceSnapshotJson: text("evidence_snapshot_json").notNull(),
  signedBy: text("signed_by").notNull().references(()=>users.id), signedAt: createdAt(),
},t=>[
  uniqueIndex("uq_academy_report_supervision_revision").on(t.reportId,t.technicianId,t.reportVersion,t.supervisorId),
  index("idx_academy_report_supervision_work").on(t.organizationId,t.track,t.workOrderId),
]);
// A field mode changes presentation only. Exact authorization, procedure
// requirements and revision-bound supervision remain authoritative.
export const academyFieldModes = sqliteTable("academy_field_modes", {
  id:text("id").primaryKey(), organizationId:text("organization_id").notNull().references(()=>organizations.id),
  track:text("track").notNull(), workOrderId:text("work_order_id").notNull().references(()=>workOrders.id),
  technicianId:text("technician_id").notNull().references(()=>technicians.id),
  mode:text("mode").notNull(), authorizationSnapshotJson:text("authorization_snapshot_json").notNull(),
  lastRequestId:text("last_request_id").notNull(), selectedBy:text("selected_by").notNull().references(()=>users.id),
  recordVersion:integer("record_version").notNull().default(1), createdAt:createdAt(), updatedAt:updatedAt(),
},t=>[
  uniqueIndex("uq_academy_field_mode_work").on(t.organizationId,t.workOrderId,t.technicianId),
  uniqueIndex("uq_academy_field_mode_request").on(t.organizationId,t.lastRequestId),
  index("idx_academy_field_mode_tech").on(t.organizationId,t.track,t.technicianId,t.updatedAt),
]);
export const academyExperience = sqliteTable("academy_experience", {
  track: text("track").notNull().default("biomedical"),
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull().references(()=>organizations.id),
  technicianId: text("technician_id").notNull().references(()=>technicians.id), workOrderId: text("work_order_id").references(()=>workOrders.id),
  reportId: text("report_id").references(()=>serviceReports.id), assetId: text("asset_id").references(()=>assets.id),
  intakeId: text("intake_id").references(()=>workOrderIntakes.id), packetId: text("packet_id").references(()=>spinlifePackets.id),
  sourceKey: text("source_key").notNull(),
  familyId: text("family_id").references(()=>academyFamilies.id), manufacturer: text("manufacturer").notNull(), model: text("model").notNull(),
  task: text("task").notNull(), serviceType: text("service_type").notNull(), supervision: text("supervision").notNull(),
  supervisorId: text("supervisor_id").references(()=>technicians.id), authorizationSnapshotJson: text("authorization_snapshot_json").notNull(),
  disposition: text("disposition").notNull(), qaResult: text("qa_result").notNull(), verifiedBy: text("verified_by").notNull().references(()=>users.id), createdAt: createdAt(),
},t=>[uniqueIndex("uq_academy_experience_report_asset").on(t.reportId,t.assetId,t.technicianId),uniqueIndex("uq_academy_experience_source").on(t.organizationId,t.track,t.sourceKey,t.technicianId),index("idx_academy_experience_tech").on(t.organizationId,t.technicianId,t.task)]);

// Immutable administrator-reviewed service outcomes. A later review creates a
// new revision rather than rewriting the evidence available to an earlier
// career or quality decision.
export const academyQualityReviews = sqliteTable("academy_quality_reviews", {
  id:text("id").primaryKey(), organizationId:text("organization_id").notNull().references(()=>organizations.id),
  track:text("track").notNull().default("dme_mobility"), technicianId:text("technician_id").notNull().references(()=>technicians.id),
  workOrderId:text("work_order_id").notNull().references(()=>workOrders.id), reportId:text("report_id").notNull().references(()=>serviceReports.id),
  reportVersion:integer("report_version").notNull(), revision:integer("revision").notNull(),
  diagnosticOutcome:text("diagnostic_outcome").notNull(), firstRepairOutcome:text("first_repair_outcome").notNull(),
  callbackOutcome:text("callback_outcome").notNull(), documentationOutcome:text("documentation_outcome").notNull(),
  reviewedThroughOn:text("reviewed_through_on").notNull(), evidence:text("evidence").notNull(), sourceSnapshotJson:text("source_snapshot_json").notNull(),
  previousReviewId:text("previous_review_id"), reviewedBy:text("reviewed_by").notNull().references(()=>users.id), createdAt:createdAt(),
},t=>[
  uniqueIndex("uq_academy_quality_revision").on(t.reportId,t.technicianId,t.revision),
  index("idx_academy_quality_tech").on(t.organizationId,t.track,t.technicianId,t.createdAt),
]);

export const academyPolicies = sqliteTable("academy_policies", {
  id:text("id").primaryKey(), organizationId:text("organization_id").notNull().references(()=>organizations.id),
  track:text("track").notNull(), targetLevel:text("target_level").notNull(), title:text("title").notNull().default(""),
  status:text("status").notNull().default("draft"), compensationReview:integer("compensation_review").notNull().default(0),
  payBandMinCents:integer("pay_band_min_cents"), payBandMaxCents:integer("pay_band_max_cents"),
  notes:text("notes").notNull().default(""), recordVersion:integer("record_version").notNull().default(1),
  updatedBy:text("updated_by").notNull().references(()=>users.id), createdAt:createdAt(), updatedAt:updatedAt(),
},t=>[uniqueIndex("uq_academy_policy_target").on(t.organizationId,t.track,t.targetLevel)]);
export const academyRequirements = sqliteTable("academy_requirements", {
  id:text("id").primaryKey(), policyId:text("policy_id").notNull().references(()=>academyPolicies.id),
  kind:text("kind").notNull(), label:text("label").notNull(), minimum:integer("minimum").notNull(),
  matchValue:text("match_value").notNull().default(""), issuer:text("issuer").notNull().default(""),
  familyId:text("family_id"), manufacturer:text("manufacturer").notNull().default(""), model:text("model").notNull().default(""),
  task:text("task").notNull().default(""), sortOrder:integer("sort_order").notNull().default(0),
},t=>[index("idx_academy_requirements_policy").on(t.policyId,t.sortOrder)]);
export const academyAdvancementReviews = sqliteTable("academy_advancement_reviews", {
  id:text("id").primaryKey(), organizationId:text("organization_id").notNull().references(()=>organizations.id),
  track:text("track").notNull(), technicianId:text("technician_id").notNull().references(()=>technicians.id),
  policyId:text("policy_id").notNull().references(()=>academyPolicies.id), policyVersion:integer("policy_version").notNull(),
  evidenceHash:text("evidence_hash").notNull(), snapshotJson:text("snapshot_json").notNull(),
  status:text("status").notNull().default("pending"), compensationStatus:text("compensation_status").notNull().default("not_requested"),
  decisionNotes:text("decision_notes").notNull().default(""), decidedBy:text("decided_by").references(()=>users.id), decidedAt:text("decided_at"),
  compensationNotes:text("compensation_notes").notNull().default(""), compensationDecidedBy:text("compensation_decided_by").references(()=>users.id), compensationDecidedAt:text("compensation_decided_at"),
  requestedBy:text("requested_by").notNull().references(()=>users.id), recordVersion:integer("record_version").notNull().default(1),createdAt:createdAt(),
},t=>[uniqueIndex("uq_academy_review_evidence").on(t.organizationId,t.technicianId,t.policyId,t.policyVersion,t.evidenceHash),index("idx_academy_review_status").on(t.organizationId,t.track,t.status)]);

export const spinlifeCloseoutDrafts = sqliteTable("spinlife_closeout_drafts", {
  intakeId:text("intake_id").primaryKey().references(()=>workOrderIntakes.id),
  organizationId:text("organization_id").notNull().references(()=>organizations.id),
  dataJson:text("data_json").notNull().default("{}"), recordVersion:integer("record_version").notNull().default(1),
  sourceVersion:integer("source_version").notNull(), workOrderId:text("work_order_id").references(()=>workOrders.id),
  snapshotJson:text("snapshot_json"), updatedBy:text("updated_by").notNull().references(()=>users.id),
  createdAt:createdAt(), updatedAt:updatedAt(),
},t=>[uniqueIndex("uq_spinlife_closeout_work").on(t.workOrderId)]);

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  legalName: text("legal_name").notNull(),
  displayName: text("display_name").notNull(),
  timezone: text("timezone").notNull().default("America/New_York"),
  currency: text("currency").notNull().default("USD"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    authSubject: text("auth_subject").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    phone: text("phone"),
    status: text("status").notNull().default("active"),
    lastSeenAt: text("last_seen_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_users_auth_subject").on(table.authSubject),
    uniqueIndex("uidx_users_email").on(table.email),
  ],
);

// Human-readable aliases never replace the provider email or the role-bearing
// portal identity. Store a canonical unique key for case-insensitive sign-in.
export const loginUsernames = sqliteTable("login_usernames", {
  userId: text("user_id").primaryKey().references(() => users.id),
  username: text("username").notNull(),
  usernameKey: text("username_key").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [uniqueIndex("uq_login_username_key").on(table.usernameKey)]);

export const roles = sqliteTable(
  "roles",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: integer("is_system", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_roles_org_name").on(table.organizationId, table.name),
  ],
);

export const permissions = sqliteTable("permissions", {
  key: text("key").primaryKey(),
  description: text("description").notNull(),
  module: text("module").notNull(),
});

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uidx_role_permissions_pair").on(
      table.roleId,
      table.permissionKey,
    ),
  ],
);

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_memberships_org_user_role").on(
      table.organizationId,
      table.userId,
      table.roleId,
    ),
    index("idx_memberships_user").on(table.userId),
  ],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    externalId: text("external_id"),
    name: text("name").notNull(),
    accountType: text("account_type").notNull(),
    status: text("status").notNull().default("active"),
    billingEmail: text("billing_email"),
    paymentTermsDays: integer("payment_terms_days").notNull().default(30),
    serviceDiscipline: text("service_discipline"),
    serviceLevel: text("service_level"),
    notes: text("notes"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_accounts_org_status").on(table.organizationId, table.status),
    uniqueIndex("uidx_accounts_org_external").on(
      table.organizationId,
      table.externalId,
    ),
  ],
);

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    locationId: text("location_id"),
    name: text("name").notNull(),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    contactType: text("contact_type").notNull().default("general"),
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("idx_contacts_account").on(table.accountId)],
);

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    locationId: text("location_id").references(() => locations.id),
    externalId: text("external_id"),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    address1: text("address_1"),
    address2: text("address_2"),
    city: text("city"),
    state: text("state"),
    postalCode: text("postal_code"),
    notes: text("notes"),
    status: text("status").notNull().default("active"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_customers_account_status").on(table.accountId, table.status),
    index("idx_customers_location").on(table.locationId),
    uniqueIndex("uidx_customers_account_external").on(
      table.accountId,
      table.externalId,
    ),
  ],
);

export const locations = sqliteTable(
  "locations",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    externalId: text("external_id"),
    name: text("name").notNull(),
    locationType: text("location_type"),
    department: text("department"),
    status: text("status").notNull().default("active"),
    address1: text("address_1").notNull(),
    address2: text("address_2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    postalCode: text("postal_code").notNull(),
    country: text("country").notNull().default("US"),
    timezone: text("timezone").notNull().default("America/New_York"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    accessInstructions: text("access_instructions"),
    serviceWindowJson: text("service_window_json"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_locations_account_status").on(table.accountId, table.status),
    index("idx_locations_region").on(table.state, table.postalCode),
    uniqueIndex("uidx_locations_account_external").on(
      table.accountId,
      table.externalId,
    ),
  ],
);

export const departments = sqliteTable(
  "departments",
  {
    id: text("id").primaryKey(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id),
    name: text("name").notNull(),
    floor: text("floor"),
    room: text("room"),
    costCenter: text("cost_center"),
    status: text("status").notNull().default("active"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_departments_location_name").on(
      table.locationId,
      table.name,
    ),
    index("idx_departments_location_status").on(table.locationId, table.status),
  ],
);

export const accountAccess = sqliteTable(
  "account_access",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    locationId: text("location_id").references(() => locations.id),
    accessRole: text("access_role").notNull().default("viewer"),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_account_access_scope").on(
      table.userId,
      table.accountId,
      table.locationId,
    ),
    index("idx_account_access_user").on(table.userId, table.status),
  ],
);

export const clientMessages = sqliteTable(
  "client_messages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    workOrderId: text("work_order_id"),
    senderUserId: text("sender_user_id")
      .notNull()
      .references(() => users.id),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    visibility: text("visibility").notNull().default("shared"),
    status: text("status").notNull().default("sent"),
    readAt: text("read_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_client_messages_account_time").on(
      table.accountId,
      table.createdAt,
    ),
    index("idx_client_messages_work_order_time").on(
      table.workOrderId,
      table.createdAt,
    ),
  ],
);

export const technicians = sqliteTable(
  "technicians",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id").references(() => users.id),
    technicianCode: text("technician_code").notNull(),
    employmentType: text("employment_type").notNull(),
    status: text("status").notNull().default("active"),
    phone: text("phone"),
    homePostalCode: text("home_postal_code"),
    homeLatitude: real("home_latitude"),
    homeLongitude: real("home_longitude"),
    dispatchAddress1: text("dispatch_address_1"),
    dispatchAddress2: text("dispatch_address_2"),
    dispatchCity: text("dispatch_city"),
    dispatchState: text("dispatch_state"),
    dispatchPostalCode: text("dispatch_postal_code"),
    dispatchLatitude: real("dispatch_latitude"),
    dispatchLongitude: real("dispatch_longitude"),
    maxRadiusMiles: integer("max_radius_miles").notNull().default(200),
    payoutType: text("payout_type").notNull().default("percentage"),
    payoutRate: real("payout_rate").notNull().default(0.55),
    trainingMode: integer("training_mode", { mode: "boolean" })
      .notNull()
      .default(true),
    proficiencyLevel: text("proficiency_level").notNull().default("trainee"),
    guidedJobsCompleted: integer("guided_jobs_completed").notNull().default(0),
    qaPassStreak: integer("qa_pass_streak").notNull().default(0),
    competencyScore: integer("competency_score").notNull().default(0),
    hireDate: text("hire_date"),
    currentHourlyRateCents: integer("current_hourly_rate_cents")
      .notNull()
      .default(2500),
    compensationTier: text("compensation_tier")
      .notNull()
      .default("field_tech_1"),
    protectedRateCents: integer("protected_rate_cents").notNull().default(2500),
    rateStatus: text("rate_status").notNull().default("active"),
    ceuDueOn: text("ceu_due_on"),
    ceuHoursRequired: real("ceu_hours_required").notNull().default(0),
    ceuHoursCompleted: real("ceu_hours_completed").notNull().default(0),
    lastCompensationReviewAt: text("last_compensation_review_at"),
    serviceDisciplinesJson: text("service_disciplines_json"),
    skillsJson: text("skills_json"),
    availabilityJson: text("availability_json"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_technicians_org_code").on(
      table.organizationId,
      table.technicianCode,
    ),
    index("idx_technicians_org_status").on(table.organizationId, table.status),
  ],
);

export const calendarProfiles = sqliteTable(
  "calendar_profiles",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull().default("google"),
    externalCalendarId: text("external_calendar_id"),
    displayName: text("display_name"),
    connectionMode: text("connection_mode").notNull().default("user_oauth"),
    status: text("status").notNull().default("not_connected"),
    selfManage: integer("self_manage", { mode: "boolean" }).notNull().default(true),
    administratorsCanSchedule: integer("administrators_can_schedule", { mode: "boolean" }).notNull().default(true),
    lastSyncAt: text("last_sync_at"),
    lastError: text("last_error"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_calendar_profiles_user_provider").on(
      table.organizationId,
      table.userId,
      table.provider,
    ),
    index("idx_calendar_profiles_status").on(table.organizationId, table.status),
  ],
);

export const technicianCompensationReviews = sqliteTable(
  "technician_compensation_reviews",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    technicianId: text("technician_id")
      .notNull()
      .references(() => technicians.id),
    reviewType: text("review_type").notNull().default("progression"),
    currentRateCents: integer("current_rate_cents").notNull(),
    recommendedRateCents: integer("recommended_rate_cents").notNull(),
    approvedRateCents: integer("approved_rate_cents"),
    recommendedTier: text("recommended_tier").notNull(),
    scoreSnapshotJson: text("score_snapshot_json").notNull(),
    marginSnapshotJson: text("margin_snapshot_json").notNull(),
    status: text("status").notNull().default("recommended"),
    effectiveOn: text("effective_on"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: text("reviewed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_comp_reviews_technician_time").on(
      table.technicianId,
      table.createdAt,
    ),
    index("idx_comp_reviews_status").on(table.organizationId, table.status),
  ],
);

export const technicianMentorships = sqliteTable(
  "technician_mentorships",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    mentorTechnicianId: text("mentor_technician_id")
      .notNull()
      .references(() => technicians.id),
    menteeTechnicianId: text("mentee_technician_id")
      .notNull()
      .references(() => technicians.id),
    status: text("status").notNull().default("active"),
    startedOn: text("started_on").notNull(),
    soloQualifiedOn: text("solo_qualified_on"),
    bonusRateBps: integer("bonus_rate_bps").notNull().default(100),
    bonusCapCents: integer("bonus_cap_cents").notNull().default(100000),
    earnedCents: integer("earned_cents").notNull().default(0),
    fundedCents: integer("funded_cents").notNull().default(0),
    paidCents: integer("paid_cents").notNull().default(0),
    earningWindowEndsOn: text("earning_window_ends_on"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_mentorship_mentee_status").on(
      table.menteeTechnicianId,
      table.status,
    ),
    index("idx_mentorship_mentor_status").on(
      table.mentorTechnicianId,
      table.status,
    ),
  ],
);

export const technicianCredentials = sqliteTable(
  "technician_credentials",
  {
    id: text("id").primaryKey(),
    technicianId: text("technician_id")
      .notNull()
      .references(() => technicians.id),
    credentialType: text("credential_type").notNull(),
    credentialNumber: text("credential_number"),
    issuer: text("issuer"),
    issuedOn: text("issued_on"),
    expiresOn: text("expires_on"),
    status: text("status").notNull().default("current"),
    attachmentId: text("attachment_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_credentials_technician").on(table.technicianId),
    index("idx_credentials_expiration").on(table.status, table.expiresOn),
  ],
);

export const serviceRegions = sqliteTable(
  "service_regions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    regionType: text("region_type").notNull(),
    definitionJson: text("definition_json").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_regions_org_status").on(table.organizationId, table.status),
  ],
);

export const technicianRegions = sqliteTable(
  "technician_regions",
  {
    technicianId: text("technician_id")
      .notNull()
      .references(() => technicians.id),
    serviceRegionId: text("service_region_id")
      .notNull()
      .references(() => serviceRegions.id),
    priority: integer("priority").notNull().default(1),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uidx_technician_regions_pair").on(
      table.technicianId,
      table.serviceRegionId,
    ),
  ],
);

export const assetCategories = sqliteTable(
  "asset_categories",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    riskClass: text("risk_class").notNull(),
    defaultPmIntervalMonths: integer("default_pm_interval_months"),
    draftName: text("draft_name"),
    draftRiskClass: text("draft_risk_class"),
    draftDefaultPmIntervalMonths: integer("draft_default_pm_interval_months"),
    defaultProcedureJson: text("default_procedure_json"),
    policyBasis: text("policy_basis").notNull().default(""),
    sourceReference: text("source_reference").notNull().default(""),
    effectiveOn: text("effective_on"),
    status: text("status").notNull().default("draft"),
    currentRevisionId: text("current_revision_id"),
    recordVersion: integer("record_version").notNull().default(1),
    lastRequestId: text("last_request_id"),
    lastRequestFingerprint: text("last_request_fingerprint"),
    updatedBy: text("updated_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_asset_categories_org_name").on(
      table.organizationId,
      table.name,
    ),
    uniqueIndex("uq_asset_category_draft_request").on(table.organizationId, table.lastRequestId),
  ],
);

export const assetCategoryRevisions = sqliteTable(
  "asset_category_revisions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    categoryId: text("category_id").notNull().references(() => assetCategories.id),
    revision: integer("revision").notNull(),
    name: text("name").notNull(),
    riskClass: text("risk_class").notNull(),
    defaultPmIntervalMonths: integer("default_pm_interval_months"),
    policyBasis: text("policy_basis").notNull(),
    sourceReference: text("source_reference").notNull(),
    effectiveOn: text("effective_on").notNull(),
    requestId: text("request_id").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    publishedBy: text("published_by").notNull().references(() => users.id),
    publishedAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uq_asset_category_revision").on(table.categoryId, table.revision),
    uniqueIndex("uq_asset_category_publish_request").on(table.organizationId, table.requestId),
    index("idx_asset_category_revisions").on(table.organizationId, table.categoryId, table.revision),
  ],
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id),
    departmentId: text("department_id").references(() => departments.id),
    categoryId: text("category_id").references(() => assetCategories.id),
    categoryRevisionId: text("category_revision_id").references(() => assetCategoryRevisions.id),
    assetTag: text("asset_tag").notNull(),
    customerAssetId: text("customer_asset_id"),
    manufacturer: text("manufacturer").notNull(),
    model: text("model").notNull(),
    serialNumber: text("serial_number"),
    description: text("description"),
    department: text("department"),
    room: text("room"),
    configuration: text("configuration"),
    softwareVersion: text("software_version"),
    riskClass: text("risk_class").notNull(),
    status: text("status").notNull().default("in_service"),
    ownershipType: text("ownership_type"),
    inServiceDate: text("in_service_date"),
    warrantyExpiresOn: text("warranty_expires_on"),
    lastPmOn: text("last_pm_on"),
    nextPmDueOn: text("next_pm_due_on"),
    pmIntervalMonths: integer("pm_interval_months"),
    qrCodeValue: text("qr_code_value"),
    metadataJson: text("metadata_json"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_assets_org_tag").on(table.organizationId, table.assetTag),
    index("idx_assets_location_status").on(table.locationId, table.status),
    index("idx_assets_pm_due").on(table.status, table.nextPmDueOn),
    index("idx_assets_serial").on(table.manufacturer, table.serialNumber),
  ],
);

export const assetCategoryEvents = sqliteTable(
  "asset_category_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    assetId: text("asset_id").notNull().references(() => assets.id),
    requestId: text("request_id").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    fromCategoryId: text("from_category_id").references(() => assetCategories.id),
    fromRevisionId: text("from_revision_id").references(() => assetCategoryRevisions.id),
    toCategoryId: text("to_category_id").notNull().references(() => assetCategories.id),
    toRevisionId: text("to_revision_id").notNull().references(() => assetCategoryRevisions.id),
    reason: text("reason").notNull(),
    assetVersion: integer("asset_version").notNull(),
    changedBy: text("changed_by").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uq_asset_category_event_request").on(table.organizationId, table.requestId),
    index("idx_asset_category_event_timeline").on(table.organizationId, table.assetId, table.createdAt),
  ],
);

export const assetPlacementEvents = sqliteTable(
  "asset_placement_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    assetId: text("asset_id").notNull().references(() => assets.id),
    requestId: text("request_id").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    fromAccountId: text("from_account_id").notNull().references(() => accounts.id),
    fromLocationId: text("from_location_id").notNull().references(() => locations.id),
    fromDepartmentId: text("from_department_id").references(() => departments.id),
    fromRoom: text("from_room"),
    fromConfiguration: text("from_configuration"),
    fromSoftwareVersion: text("from_software_version"),
    toAccountId: text("to_account_id").notNull().references(() => accounts.id),
    toLocationId: text("to_location_id").notNull().references(() => locations.id),
    toDepartmentId: text("to_department_id").references(() => departments.id),
    toRoom: text("to_room"),
    toConfiguration: text("to_configuration"),
    toSoftwareVersion: text("to_software_version"),
    reason: text("reason").notNull(),
    assetVersion: integer("asset_version").notNull(),
    changedBy: text("changed_by").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uq_asset_placement_request").on(table.organizationId, table.requestId),
    index("idx_asset_placement_timeline").on(table.organizationId, table.assetId, table.createdAt),
  ],
);

export const assetLabels = sqliteTable("asset_labels", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  assetId: text("asset_id").notNull().references(() => assets.id),
  labelCode: text("label_code").notNull(),
  source: text("source").notNull(),
  status: text("status").notNull().default("active"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: createdAt(),
  retiredBy: text("retired_by").references(() => users.id),
  retiredAt: text("retired_at"),
  retirementReason: text("retirement_reason"),
}, table => [uniqueIndex("uidx_asset_labels_org_code").on(table.organizationId, table.labelCode),
  index("idx_asset_labels_asset").on(table.organizationId, table.assetId, table.status)]);

export const assetLabelPrintEvents = sqliteTable(
  "asset_label_print_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id),
    assetId: text("asset_id").notNull().references(() => assets.id),
    labelId: text("label_id").notNull().references(() => assetLabels.id),
    requestId: text("request_id").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    printNumber: integer("print_number").notNull(),
    labelWidthMils: integer("label_width_mils").notNull(),
    labelHeightMils: integer("label_height_mils").notNull(),
    symbology: text("symbology").notNull().default("code128b"),
    reason: text("reason"),
    assetVersion: integer("asset_version").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    printedBy: text("printed_by").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uidx_asset_label_print_request").on(table.organizationId, table.requestId),
    uniqueIndex("uidx_asset_label_print_sequence").on(table.organizationId, table.labelId, table.printNumber),
    index("idx_asset_label_print_timeline").on(table.organizationId, table.assetId, table.createdAt),
  ],
);

export const pmPlans = sqliteTable(
  "pm_plans",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    procedureVersion: text("procedure_version").notNull(),
    intervalMonths: integer("interval_months").notNull(),
    nextDueOn: text("next_due_on").notNull(),
    graceDays: integer("grace_days").notNull().default(0),
    checklistJson: text("checklist_json").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("idx_pm_plans_due").on(table.status, table.nextDueOn)],
);

export const rateCards = sqliteTable(
  "rate_cards",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountId: text("account_id").references(() => accounts.id),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    currency: text("currency").notNull().default("USD"),
    effectiveFrom: text("effective_from").notNull(),
    effectiveTo: text("effective_to"),
    targetGrossMargin: real("target_gross_margin").notNull().default(0.4),
    status: text("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_rate_cards_account_name_version").on(
      table.accountId,
      table.name,
      table.version,
    ),
    index("idx_rate_cards_active").on(
      table.accountId,
      table.status,
      table.effectiveFrom,
    ),
  ],
);

export const accountPricingPolicies = sqliteTable(
  "account_pricing_policies",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    name: text("name").notNull().default("Primary account rules"),
    targetGrossMarginBps: integer("target_gross_margin_bps")
      .notNull()
      .default(4000),
    mileageRateCents: integer("mileage_rate_cents").notNull().default(77),
    consumerMileageRateCents: integer("consumer_mileage_rate_cents")
      .notNull()
      .default(67),
    consumerFreeMiles: integer("consumer_free_miles").notNull().default(10),
    fuelPerDriveHourCents: integer("fuel_per_drive_hour_cents")
      .notNull()
      .default(1000),
    technicianHourlyCostCents: integer("technician_hourly_cost_cents")
      .notNull()
      .default(2500),
    operatingAllowancePerHourCents: integer(
      "operating_allowance_per_hour_cents",
    )
      .notNull()
      .default(1000),
    additionalTechnicianFeeCents: integer("additional_technician_fee_cents")
      .notNull()
      .default(6500),
    stairsFeeCents: integer("stairs_fee_cents").notNull().default(10000),
    pricingRulesJson: text("pricing_rules_json").notNull(),
    status: text("status").notNull().default("active"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_account_pricing_policies_account").on(table.accountId),
    index("idx_account_pricing_policies_status").on(
      table.status,
      table.updatedAt,
    ),
  ],
);

export const equipmentKnowledgeArticles = sqliteTable(
  "equipment_knowledge_articles",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    manufacturer: text("manufacturer").notNull(),
    modelPattern: text("model_pattern"),
    equipmentType: text("equipment_type").notNull(),
    title: text("title").notNull(),
    symptomKeywordsJson: text("symptom_keywords_json"),
    diagnosticQuestionsJson: text("diagnostic_questions_json").notNull(),
    diagnosticStepsJson: text("diagnostic_steps_json").notNull(),
    supportPhone: text("support_phone"),
    supportEmail: text("support_email"),
    supportHours: text("support_hours"),
    sourceUrl: text("source_url"),
    sourceVerifiedOn: text("source_verified_on"),
    status: text("status").notNull().default("active"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_equipment_knowledge_lookup").on(
      table.organizationId,
      table.manufacturer,
      table.equipmentType,
      table.status,
    ),
  ],
);

export const technicalDocuments = sqliteTable("technical_documents", {
  id:text("id").primaryKey(), organizationId:text("organization_id").notNull().references(()=>organizations.id),
  track:text("track").notNull(), familyId:text("family_id"), manufacturer:text("manufacturer").notNull().default(""),
  model:text("model").notNull().default(""), serialRange:text("serial_range").notNull().default(""), documentType:text("document_type").notNull().default("service_manual"),
  title:text("title").notNull().default(""), status:text("status").notNull().default("draft"), draftJson:text("draft_json").notNull().default("{}"),
  currentRevisionId:text("current_revision_id"), recordVersion:integer("record_version").notNull().default(1),
  createdBy:text("created_by").notNull().references(()=>users.id), updatedBy:text("updated_by").notNull().references(()=>users.id), createdAt:createdAt(), updatedAt:updatedAt(),
},t=>[index("idx_technical_documents_lookup").on(t.organizationId,t.track,t.manufacturer,t.model,t.status)]);

export const technicalDocumentRevisions = sqliteTable("technical_document_revisions", {
  id:text("id").primaryKey(), documentId:text("document_id").notNull().references(()=>technicalDocuments.id), revisionNumber:integer("revision_number").notNull(),
  sourceName:text("source_name").notNull(), sourceUrl:text("source_url").notNull(), sourceRevision:text("source_revision").notNull().default(""),
  documentSnapshotJson:text("document_snapshot_json").notNull(),
  effectiveOn:text("effective_on"), verifiedOn:text("verified_on").notNull(), applicability:text("applicability").notNull(), limitationsJson:text("limitations_json").notNull().default("[]"),
  reviewBasis:text("review_basis").notNull(), publishedBy:text("published_by").notNull().references(()=>users.id), publishedAt:text("published_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[uniqueIndex("uq_technical_document_revision").on(t.documentId,t.revisionNumber),index("idx_technical_revisions_document").on(t.documentId,t.publishedAt)]);

export const technicalWorkflowTemplates = sqliteTable("technical_workflow_templates", {
  id:text("id").primaryKey(), revisionId:text("revision_id").notNull().references(()=>technicalDocumentRevisions.id), serviceType:text("service_type").notNull(),
  stepsJson:text("steps_json").notNull(), createdAt:createdAt(),
},t=>[uniqueIndex("uq_technical_workflow_revision_service").on(t.revisionId,t.serviceType)]);

export const technicalMeasurementRequirements = sqliteTable("technical_measurement_requirements", {
  id:text("id").primaryKey(), templateId:text("template_id").notNull().references(()=>technicalWorkflowTemplates.id), stepId:text("step_id").notNull(),
  name:text("name").notNull(), unit:text("unit").notNull(), expectedMin:text("expected_min"), expectedMax:text("expected_max"), expectedText:text("expected_text"),
  conditions:text("conditions").notNull().default(""), sourceLocator:text("source_locator").notNull(), required:integer("required",{mode:"boolean"}).notNull().default(true), sortOrder:integer("sort_order").notNull().default(0),
},t=>[uniqueIndex("uq_technical_measurement_step_name").on(t.templateId,t.stepId,t.name),index("idx_technical_measurements_template").on(t.templateId,t.sortOrder)]);

export const technicalProcedureFeedback = sqliteTable("technical_procedure_feedback", {
  id:text("id").primaryKey(), organizationId:text("organization_id").notNull().references(()=>organizations.id),
  documentId:text("document_id").notNull().references(()=>technicalDocuments.id), revisionId:text("revision_id").notNull().references(()=>technicalDocumentRevisions.id),
  track:text("track").notNull(), manufacturer:text("manufacturer").notNull(), model:text("model").notNull(), feedbackType:text("feedback_type").notNull(),
  summary:text("summary").notNull(), observedResult:text("observed_result").notNull().default(""), expectedResult:text("expected_result").notNull().default(""),
  sourceLocator:text("source_locator").notNull(), supportingSourceUrl:text("supporting_source_url"), negatingEvidence:text("negating_evidence").notNull().default(""),
  workReference:text("work_reference").notNull().default(""), status:text("status").notNull().default("submitted"), decisionNote:text("decision_note").notNull().default(""),
  recordVersion:integer("record_version").notNull().default(1), submittedBy:text("submitted_by").notNull().references(()=>users.id),
  reviewedBy:text("reviewed_by").references(()=>users.id), reviewedAt:text("reviewed_at"), implementedRevisionId:text("implemented_revision_id").references(()=>technicalDocumentRevisions.id),
  createdAt:createdAt(), updatedAt:updatedAt(),
},t=>[index("idx_technical_feedback_queue").on(t.organizationId,t.track,t.status,t.createdAt),index("idx_technical_feedback_document").on(t.documentId,t.revisionId)]);

export const serviceContracts = sqliteTable(
  "service_contracts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    rateCardId: text("rate_card_id").references(() => rateCards.id),
    contractNumber: text("contract_number"),
    name: text("name").notNull(),
    contractType: text("contract_type").notNull(),
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on"),
    autoRenew: integer("auto_renew", { mode: "boolean" })
      .notNull()
      .default(false),
    serviceLevelJson: text("service_level_json"),
    coveredServicesJson: text("covered_services_json"),
    status: text("status").notNull().default("draft"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_contracts_account_status").on(table.accountId, table.status),
    uniqueIndex("uidx_contracts_account_number").on(
      table.accountId,
      table.contractNumber,
    ),
  ],
);

export const pricingRules = sqliteTable(
  "pricing_rules",
  {
    id: text("id").primaryKey(),
    rateCardId: text("rate_card_id")
      .notNull()
      .references(() => rateCards.id),
    serviceType: text("service_type").notNull(),
    ruleName: text("rule_name").notNull(),
    ruleType: text("rule_type").notNull(),
    priority: integer("priority").notNull().default(100),
    conditionJson: text("condition_json"),
    calculationJson: text("calculation_json").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_pricing_rules_card_service").on(
      table.rateCardId,
      table.serviceType,
      table.isActive,
    ),
  ],
);

export const workOrderIntakes = sqliteTable(
  "work_order_intakes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountId: text("account_id").references(() => accounts.id),
    locationId: text("location_id").references(() => locations.id),
    customerId: text("customer_id").references(() => customers.id),
    assetId: text("asset_id").references(() => assets.id),
    source: text("source").notNull().default("manual"),
    externalId: text("external_id"),
    noticeType: text("notice_type").notNull().default("new_assignment"),
    sourceDetailUrl: text("source_detail_url"),
    responseDueAt: text("response_due_at"),
    status: text("status").notNull().default("needs_information"),
    blockingCount: integer("blocking_count").notNull().default(0),
    missingFieldsJson: text("missing_fields_json").notNull().default("[]"),
    dataJson: text("data_json").notNull(),
    convertedWorkOrderId: text("converted_work_order_id"),
    reviewedAt: text("reviewed_at"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => users.id),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_work_order_intakes_queue").on(
      table.organizationId,
      table.status,
      table.responseDueAt,
    ),
    uniqueIndex("uidx_work_order_intakes_source_external").on(
      table.organizationId,
      table.source,
      table.externalId,
    ),
  ],
);

// SpinLife fieldwork stays attached to its original intake. A customer, facility,
// biomedical asset, price approval or schedule is not required to retain a job.
export const spinlifeVisits = sqliteTable("spinlife_visits", {
  intakeId: text("intake_id").primaryKey().references(() => workOrderIntakes.id),
  technicianId: text("technician_id").references(() => technicians.id),
  technicianPayCents: integer("technician_pay_cents"),
  scheduledStart: text("scheduled_start"),
  startedAt: text("started_at"),
  documentedAt: text("documented_at"),
  visitJson: text("visit_json").notNull().default("{}"),
  recordVersion: integer("record_version").notNull().default(1),
  lastMutationId: text("last_mutation_id").notNull(),
}, (table) => [index("idx_spinlife_visits_technician").on(table.technicianId)]);

export const spinlifePackets = sqliteTable("spinlife_packets", {
  id: text("id").primaryKey(),
  intakeId: text("intake_id").notNull().references(() => workOrderIntakes.id),
  sourceVersion: integer("source_version").notNull(),
  attachmentId: text("attachment_id").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("uidx_spinlife_packets_version").on(table.intakeId, table.sourceVersion)]);

export const workOrders = sqliteTable(
  "work_orders",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id),
    customerId: text("customer_id").references(() => customers.id),
    assetId: text("asset_id").references(() => assets.id),
    externalSource: text("external_source"),
    externalId: text("external_id"),
    serviceType: text("service_type").notNull(),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("new"),
    summary: text("summary").notNull(),
    description: text("description"),
    requiredSkillsJson: text("required_skills_json"),
    requiredTechnicianCount: integer("required_technician_count")
      .notNull()
      .default(1),
    productWeightLb: real("product_weight_lb"),
    stairsCount: integer("stairs_count").notNull().default(0),
    scheduledStart: text("scheduled_start"),
    scheduledEnd: text("scheduled_end"),
    serviceWindowJson: text("service_window_json"),
    offeredPaymentCents: integer("offered_payment_cents"),
    acceptedPriceCents: integer("accepted_price_cents"),
    estimatedCostCents: integer("estimated_cost_cents"),
    grossMarginBasisPoints: integer("gross_margin_basis_points"),
    openedAt: text("opened_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
    invoiceReadyAt: text("invoice_ready_at"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_work_orders_source_external").on(
      table.externalSource,
      table.externalId,
    ),
    index("idx_work_orders_org_status").on(table.organizationId, table.status),
    index("idx_work_orders_account_status").on(table.accountId, table.status),
    index("idx_work_orders_schedule").on(table.status, table.scheduledStart),
    index("idx_work_orders_location").on(table.locationId),
    index("idx_work_orders_customer").on(table.customerId),
  ],
);

export const workOrderAssets = sqliteTable(
  "work_order_assets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    workOrderId: text("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    status: text("status").notNull().default("not_started"),
    notes: text("notes"),
    findings: text("findings"),
    workPerformed: text("work_performed"),
    testResults: text("test_results"),
    disposition: text("disposition"),
    notApplicableReason: text("not_applicable_reason"),
    procedureSnapshotJson: text("procedure_snapshot_json"),
    procedureAnswersJson: text("procedure_answers_json"),
    recordVersion: integer("record_version").notNull().default(1),
    updatedBy: text("updated_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_work_order_assets_scope").on(
      table.workOrderId,
      table.assetId,
    ),
    index("idx_work_order_assets_progress").on(table.workOrderId, table.status),
    index("idx_work_order_assets_asset").on(table.assetId, table.updatedAt),
  ],
);

export const calendarEventLinks = sqliteTable(
  "calendar_event_links",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    workOrderId: text("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    userId: text("user_id").references(() => users.id),
    calendarRole: text("calendar_role").notNull(),
    provider: text("provider").notNull().default("google"),
    externalCalendarId: text("external_calendar_id").notNull(),
    externalEventId: text("external_event_id").notNull(),
    status: text("status").notNull().default("active"),
    lastSyncAt: text("last_sync_at"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_calendar_event_links_target").on(
      table.provider,
      table.externalCalendarId,
      table.externalEventId,
    ),
    index("idx_calendar_event_links_work_order").on(table.workOrderId, table.status),
  ],
);

export const assetVisits = sqliteTable(
  "asset_visits",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    workOrderId: text("work_order_id").references(() => workOrders.id),
    technicianId: text("technician_id").references(() => technicians.id),
    visitType: text("visit_type").notNull(),
    visitedAt: text("visited_at").notNull(),
    complaint: text("complaint"),
    findings: text("findings").notNull(),
    workPerformed: text("work_performed").notNull(),
    partsJson: text("parts_json"),
    testResultsJson: text("test_results_json"),
    disposition: text("disposition").notNull(),
    nextAction: text("next_action"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_asset_visits_timeline").on(table.assetId, table.visitedAt),
  ],
);

export const documentRecords = sqliteTable(
  "document_records",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id"),
    attachmentId: text("attachment_id").notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    effectiveOn: text("effective_on"),
    expiresOn: text("expires_on"),
    searchableText: text("searchable_text"),
    status: text("status").notNull().default("current"),
    deletedAt: text("deleted_at"),
    uploadedBy: text("uploaded_by").references(() => users.id),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_document_records_scope").on(
      table.scopeType,
      table.scopeId,
      table.status,
    ),
    index("idx_document_records_expiry").on(table.status, table.expiresOn),
    index("idx_document_records_trash_retention").on(
      table.status,
      table.deletedAt,
    ),
  ],
);

export const onboardingProgress = sqliteTable(
  "onboarding_progress",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    itemKey: text("item_key").notNull(),
    status: text("status").notNull().default("complete"),
    completedAt: text("completed_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_onboarding_user_item").on(table.userId, table.itemKey),
  ],
);

export const knowledgeEntries = sqliteTable(
  "knowledge_entries",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    category: text("category").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    keywords: text("keywords"),
    sourceType: text("source_type").notNull().default("internal"),
    sourceId: text("source_id"),
    audience: text("audience").notNull().default("internal"),
    status: text("status").notNull().default("active"),
    recordVersion: integer("record_version").notNull().default(1),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_knowledge_entries_category").on(
      table.organizationId,
      table.category,
      table.status,
    ),
  ],
);

export const assistantQuestions = sqliteTable(
  "assistant_questions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    askedBy: text("asked_by")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    sourcesJson: text("sources_json"),
    status: text("status").notNull().default("answered"),
    createdAt: createdAt(),
  },
  (table) => [
    index("idx_assistant_questions_user").on(table.askedBy, table.createdAt),
  ],
);

export const workOrderAssignments = sqliteTable(
  "work_order_assignments",
  {
    id: text("id").primaryKey(),
    workOrderId: text("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    technicianId: text("technician_id")
      .notNull()
      .references(() => technicians.id),
    role: text("role").notNull().default("primary"),
    status: text("status").notNull().default("offered"),
    offeredAt: text("offered_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    respondedAt: text("responded_at"),
    dispatchedAt: text("dispatched_at"),
    arrivedAt: text("arrived_at"),
    departedAt: text("departed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_work_order_assignments_pair").on(
      table.workOrderId,
      table.technicianId,
    ),
    index("idx_assignments_technician_status").on(
      table.technicianId,
      table.status,
    ),
  ],
);

export const workOrderEvents = sqliteTable(
  "work_order_events",
  {
    id: text("id").primaryKey(),
    workOrderId: text("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    eventType: text("event_type").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id),
    source: text("source").notNull().default("portal"),
    payloadJson: text("payload_json"),
    occurredAt: text("occurred_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_work_order_events_timeline").on(
      table.workOrderId,
      table.occurredAt,
    ),
  ],
);

export const serviceReports = sqliteTable(
  "service_reports",
  {
    id: text("id").primaryKey(),
    workOrderId: text("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    technicianId: text("technician_id")
      .notNull()
      .references(() => technicians.id),
    reportVersion: integer("report_version").notNull().default(1),
    findings: text("findings"),
    workPerformed: text("work_performed"),
    recommendation: text("recommendation"),
    customerComplaint: text("customer_complaint"),
    equipmentType: text("equipment_type"),
    manufacturer: text("manufacturer"),
    model: text("model"),
    serialNumber: text("serial_number"),
    diagnosticStepsJson: text("diagnostic_steps_json").notNull().default("[]"),
    testResults: text("test_results"),
    partsUsedJson: text("parts_used_json").notNull().default("[]"),
    documentDetailsJson: text("document_details_json").notNull().default("{}"),
    assetDisposition: text("asset_disposition"),
    checklistJson: text("checklist_json"),
    customerSignatureName: text("customer_signature_name"),
    customerSignedAt: text("customer_signed_at"),
    signatureAttachmentId: text("signature_attachment_id"),
    reportPdfAttachmentId: text("report_pdf_attachment_id"),
    submittedAt: text("submitted_at"),
    qaStatus: text("qa_status").notNull().default("draft"),
    qaNotes: text("qa_notes"),
    qaReviewedBy: text("qa_reviewed_by").references(() => users.id),
    qaReviewedAt: text("qa_reviewed_at"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_service_reports_qa").on(table.qaStatus, table.submittedAt),
  ],
);

export const technicianTrainingAttempts = sqliteTable(
  "technician_training_attempts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    technicianId: text("technician_id")
      .notNull()
      .references(() => technicians.id),
    workOrderId: text("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    moduleKey: text("module_key").notNull(),
    moduleVersion: integer("module_version").notNull().default(1),
    answersJson: text("answers_json").notNull(),
    scorePercent: integer("score_percent").notNull(),
    passed: integer("passed", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    index("idx_training_attempts_technician_time").on(
      table.technicianId,
      table.createdAt,
    ),
    index("idx_training_attempts_work_order").on(
      table.workOrderId,
      table.technicianId,
    ),
  ],
);

export const estimates = sqliteTable(
  "estimates",
  {
    id: text("id").primaryKey(),
    workOrderId: text("work_order_id").references(() => workOrders.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    rateCardId: text("rate_card_id").references(() => rateCards.id),
    estimateNumber: text("estimate_number").notNull(),
    status: text("status").notNull().default("draft"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
    grossMarginBasisPoints: integer("gross_margin_basis_points")
      .notNull()
      .default(0),
    pricingSnapshotJson: text("pricing_snapshot_json").notNull(),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: text("approved_at"),
    expiresAt: text("expires_at"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_estimates_number").on(table.estimateNumber),
    index("idx_estimates_account_status").on(table.accountId, table.status),
  ],
);

export const estimateItems = sqliteTable(
  "estimate_items",
  {
    id: text("id").primaryKey(),
    estimateId: text("estimate_id")
      .notNull()
      .references(() => estimates.id),
    sortOrder: integer("sort_order").notNull().default(0),
    description: text("description").notNull(),
    quantity: real("quantity").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    ruleId: text("rule_id").references(() => pricingRules.id),
    metadataJson: text("metadata_json"),
  },
  (table) => [
    index("idx_estimate_items_estimate").on(table.estimateId, table.sortOrder),
  ],
);

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    workOrderId: text("work_order_id").references(() => workOrders.id),
    estimateId: text("estimate_id").references(() => estimates.id),
    invoiceNumber: text("invoice_number").notNull(),
    status: text("status").notNull().default("draft"),
    issuedOn: text("issued_on"),
    dueOn: text("due_on"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    balanceCents: integer("balance_cents").notNull().default(0),
    pdfAttachmentId: text("pdf_attachment_id"),
    externalProvider: text("external_provider"),
    externalId: text("external_id"),
    externalStatus: text("external_status"),
    lastSyncedAt: text("last_synced_at"),
    paidAt: text("paid_at"),
    paymentReference: text("payment_reference"),
    templateVersion: text("template_version")
      .notNull()
      .default("techflex-blue-v1"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_invoices_number").on(table.invoiceNumber),
    uniqueIndex("uidx_invoices_external").on(
      table.externalProvider,
      table.externalId,
    ),
    index("idx_invoices_account_status").on(
      table.accountId,
      table.status,
      table.dueOn,
    ),
  ],
);

export const invoicePayments = sqliteTable(
  "invoice_payments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    provider: text("provider").notNull().default("manual"),
    externalId: text("external_id"),
    amountCents: integer("amount_cents").notNull(),
    receivedOn: text("received_on").notNull(),
    reference: text("reference"),
    payloadJson: text("payload_json"),
    recordedBy: text("recorded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uidx_invoice_payments_provider_external").on(
      table.provider,
      table.externalId,
    ),
    index("idx_invoice_payments_invoice").on(table.invoiceId, table.receivedOn),
  ],
);

export const payStubs = sqliteTable(
  "pay_stubs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    technicianId: text("technician_id")
      .notNull()
      .references(() => technicians.id),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    scheduledFor: text("scheduled_for").notNull(),
    status: text("status").notNull().default("generated"),
    jobCount: integer("job_count").notNull().default(0),
    grossRevenueCents: integer("gross_revenue_cents").notNull().default(0),
    grossPayCents: integer("gross_pay_cents").notNull().default(0),
    pdfAttachmentId: text("pdf_attachment_id"),
    generatedAt: text("generated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    confirmedAt: text("confirmed_at"),
    paidAt: text("paid_at"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_pay_stubs_technician_period").on(
      table.technicianId,
      table.periodStart,
      table.periodEnd,
    ),
    index("idx_pay_stubs_status_schedule").on(
      table.organizationId,
      table.status,
      table.scheduledFor,
    ),
  ],
);

export const invoiceItems = sqliteTable(
  "invoice_items",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    sortOrder: integer("sort_order").notNull().default(0),
    description: text("description").notNull(),
    quantity: real("quantity").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
  },
  (table) => [
    index("idx_invoice_items_invoice").on(table.invoiceId, table.sortOrder),
  ],
);

export const technicianPayouts = sqliteTable(
  "technician_payouts",
  {
    id: text("id").primaryKey(),
    technicianId: text("technician_id")
      .notNull()
      .references(() => technicians.id),
    workOrderId: text("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    invoiceId: text("invoice_id").references(() => invoices.id),
    status: text("status").notNull().default("pending"),
    basisType: text("basis_type").notNull(),
    basisRate: real("basis_rate").notNull(),
    grossRevenueCents: integer("gross_revenue_cents").notNull().default(0),
    payoutCents: integer("payout_cents").notNull().default(0),
    collectionStatus: text("collection_status")
      .notNull()
      .default("awaiting_customer_payment"),
    fundsReceivedAt: text("funds_received_at"),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: text("approved_at"),
    paidAt: text("paid_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_payouts_tech_work_order").on(
      table.technicianId,
      table.workOrderId,
    ),
    index("idx_payouts_status").on(table.status, table.createdAt),
  ],
);

export const payStubItems = sqliteTable(
  "pay_stub_items",
  {
    id: text("id").primaryKey(),
    payStubId: text("pay_stub_id")
      .notNull()
      .references(() => payStubs.id),
    payoutId: text("payout_id")
      .notNull()
      .references(() => technicianPayouts.id),
    workOrderId: text("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    invoiceId: text("invoice_id").references(() => invoices.id),
    workOrderNumber: text("work_order_number").notNull(),
    accountName: text("account_name").notNull(),
    serviceDate: text("service_date"),
    grossRevenueCents: integer("gross_revenue_cents").notNull(),
    payoutCents: integer("payout_cents").notNull(),
    collectionStatus: text("collection_status").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uidx_pay_stub_items_payout").on(table.payoutId),
    index("idx_pay_stub_items_stub").on(table.payStubId),
  ],
);

export const customerFeedbackRequests = sqliteTable(
  "customer_feedback_requests",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    workOrderId: text("work_order_id")
      .notNull()
      .references(() => workOrders.id),
    customerId: text("customer_id").references(() => customers.id),
    channel: text("channel").notNull(),
    destination: text("destination"),
    campaignName: text("campaign_name"),
    status: text("status").notNull().default("queued"),
    messageSubject: text("message_subject"),
    messageBody: text("message_body").notNull(),
    reviewUrl: text("review_url"),
    scheduledFor: text("scheduled_for")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    sentAt: text("sent_at"),
    externalId: text("external_id"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_feedback_work_order_channel").on(
      table.workOrderId,
      table.channel,
    ),
    index("idx_feedback_status_schedule").on(
      table.organizationId,
      table.status,
      table.scheduledFor,
    ),
  ],
);

export const technicianTimeEntries = sqliteTable(
  "technician_time_entries",
  {
    id: text("id").primaryKey(),
    technicianId: text("technician_id")
      .notNull()
      .references(() => technicians.id),
    workOrderId: text("work_order_id").references(() => workOrders.id),
    entryDate: text("entry_date").notNull(),
    entryType: text("entry_type").notNull(),
    hours: real("hours").notNull().default(0),
    miles: real("miles").notNull().default(0),
    notes: text("notes"),
    status: text("status").notNull().default("submitted"),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: text("approved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_time_entries_technician_date").on(
      table.technicianId,
      table.entryDate,
    ),
    index("idx_time_entries_status").on(table.status, table.entryDate),
  ],
);

export const adminTasks = sqliteTable(
  "admin_tasks",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountId: text("account_id").references(() => accounts.id),
    workOrderId: text("work_order_id").references(() => workOrders.id),
    assignedUserId: text("assigned_user_id").references(() => users.id),
    assignedRole: text("assigned_role"),
    category: text("category").notNull(),
    title: text("title").notNull(),
    instructions: text("instructions"),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("open"),
    source: text("source").notNull().default("manual"),
    sourceRecordId: text("source_record_id"),
    dueAt: text("due_at"),
    completedAt: text("completed_at"),
    completedBy: text("completed_by").references(() => users.id),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("idx_admin_tasks_queue").on(
      table.organizationId,
      table.status,
      table.priority,
      table.dueAt,
    ),
    uniqueIndex("uidx_admin_tasks_source_record").on(
      table.source,
      table.sourceRecordId,
    ),
  ],
);

export const biomedicalFollowUps = sqliteTable(
  "biomedical_follow_ups",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    taskId: text("task_id")
      .notNull()
      .references(() => adminTasks.id),
    workOrderAssetId: text("work_order_asset_id")
      .notNull()
      .references(() => workOrderAssets.id),
    sourceProgressVersion: integer("source_progress_version").notNull(),
    stage: text("stage").notNull().default("needs_verification"),
    needsReverification: integer("needs_reverification", { mode: "boolean" })
      .notNull()
      .default(false),
    partDescription: text("part_description").notNull().default(""),
    partNumber: text("part_number").notNull().default(""),
    manufacturerReference: text("manufacturer_reference")
      .notNull()
      .default(""),
    approvalReference: text("approval_reference").notNull().default(""),
    vendorName: text("vendor_name").notNull().default(""),
    orderReference: text("order_reference").notNull().default(""),
    orderedOn: text("ordered_on"),
    receivedOn: text("received_on"),
    repairWorkOrderId: text("repair_work_order_id").references(
      () => workOrders.id,
    ),
    resolutionNote: text("resolution_note").notNull().default(""),
    notes: text("notes").notNull().default(""),
    recordVersion: integer("record_version").notNull().default(1),
    lastRequestId: text("last_request_id"),
    updatedBy: text("updated_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uq_biomedical_follow_up_task").on(table.taskId),
    index("idx_biomedical_follow_up_queue").on(
      table.organizationId,
      table.stage,
      table.needsReverification,
    ),
    index("idx_biomedical_follow_up_asset").on(table.workOrderAssetId),
  ],
);

export const integrationConnections = sqliteTable(
  "integration_connections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    integrationKey: text("integration_key").notNull(),
    provider: text("provider").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("not_connected"),
    connectionMode: text("connection_mode").notNull(),
    configJson: text("config_json"),
    lastSyncAt: text("last_sync_at"),
    lastSuccessAt: text("last_success_at"),
    lastError: text("last_error"),
    syncCursor: text("sync_cursor"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_integration_connections_org_key").on(
      table.organizationId,
      table.integrationKey,
    ),
    index("idx_integration_connections_status").on(
      table.organizationId,
      table.status,
    ),
  ],
);

export const partnerApiKeys = sqliteTable(
  "partner_api_keys",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopesJson: text("scopes_json").notNull(),
    status: text("status").notNull().default("active"),
    lastUsedAt: text("last_used_at"),
    expiresAt: text("expires_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_partner_api_key_hash").on(table.keyHash),
    index("idx_partner_api_account_status").on(table.accountId, table.status),
  ],
);

export const partnerApiRequests = sqliteTable(
  "partner_api_requests",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    apiKeyId: text("api_key_id")
      .notNull()
      .references(() => partnerApiKeys.id),
    idempotencyKey: text("idempotency_key").notNull(),
    operation: text("operation").notNull(),
    status: text("status").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    responseJson: text("response_json"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uidx_partner_api_idempotency").on(
      table.apiKeyId,
      table.idempotencyKey,
    ),
    index("idx_partner_api_request_time").on(table.accountId, table.createdAt),
  ],
);

export const partnerLaunches = sqliteTable(
  "partner_launches",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"),
    contractAttachmentId: text("contract_attachment_id"),
    configurationJson: text("configuration_json").notNull(),
    submittedBy: text("submitted_by").references(() => users.id),
    submittedAt: text("submitted_at"),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: text("approved_at"),
    activatedAt: text("activated_at"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_partner_launch_account_version").on(
      table.accountId,
      table.version,
    ),
    index("idx_partner_launch_status").on(
      table.organizationId,
      table.status,
      table.updatedAt,
    ),
  ],
);

export const websiteIntakeSubmissions = sqliteTable(
  "website_intake_submissions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    externalSubmissionId: text("external_submission_id").notNull(),
    workflow: text("workflow").notNull(),
    status: text("status").notNull().default("received"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    companyName: text("company_name"),
    message: text("message"),
    sourcePageUrl: text("source_page_url"),
    marketingConsent: integer("marketing_consent", { mode: "boolean" })
      .notNull()
      .default(false),
    payloadJson: text("payload_json").notNull(),
    clientIpHash: text("client_ip_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_website_intake_external").on(
      table.organizationId,
      table.externalSubmissionId,
    ),
    index("idx_website_intake_queue").on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
    index("idx_website_intake_ip_time").on(
      table.clientIpHash,
      table.createdAt,
    ),
  ],
);

export const marketingConsents = sqliteTable(
  "marketing_consents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    websiteSubmissionId: text("website_submission_id")
      .notNull()
      .references(() => websiteIntakeSubmissions.id),
    email: text("email").notNull(),
    status: text("status").notNull().default("consented"),
    source: text("source").notNull().default("techflex_website"),
    consentText: text("consent_text"),
    consentedAt: text("consented_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_marketing_consent_submission").on(
      table.websiteSubmissionId,
    ),
    index("idx_marketing_consent_email").on(
      table.organizationId,
      table.email,
    ),
  ],
);

export const dataImports = sqliteTable(
  "data_imports",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    importType: text("import_type").notNull(),
    source: text("source").notNull(),
    fileName: text("file_name"),
    sourceDocumentId: text("source_document_id"),
    status: text("status").notNull().default("received"),
    rowCount: integer("row_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    updatedCount: integer("updated_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    mappingJson: text("mapping_json"),
    errorJson: text("error_json"),
    importedBy: text("imported_by")
      .notNull()
      .references(() => users.id),
    startedAt: text("started_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    completedAt: text("completed_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("idx_data_imports_org_created").on(
      table.organizationId,
      table.createdAt,
    ),
    index("idx_data_imports_status").on(table.status, table.startedAt),
  ],
);

export const assetImportRows = sqliteTable(
  "asset_import_rows",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    importId: text("import_id")
      .notNull()
      .references(() => dataImports.id),
    sourceRow: integer("source_row").notNull(),
    action: text("action").notNull(),
    assetId: text("asset_id").references(() => assets.id),
    expectedAssetVersion: integer("expected_asset_version"),
    selectedFieldsJson: text("selected_fields_json").notNull().default("[]"),
    sourceJson: text("source_json").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    decidedBy: text("decided_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uidx_asset_import_rows_import_row").on(
      table.organizationId,
      table.importId,
      table.sourceRow,
    ),
    index("idx_asset_import_rows_asset_created").on(
      table.organizationId,
      table.assetId,
      table.createdAt,
    ),
  ],
);

export const importMappingProfiles = sqliteTable(
  "import_mapping_profiles",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    profileName: text("profile_name").notNull(),
    importType: text("import_type").notNull(),
    sourceHeadersJson: text("source_headers_json").notNull(),
    mappingJson: text("mapping_json").notNull(),
    status: text("status").notNull().default("saved_plan"),
    exchangeVerified: integer("exchange_verified", { mode: "boolean" })
      .notNull()
      .default(false),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_import_mapping_profiles_org_type_name").on(
      table.organizationId,
      table.importType,
      table.profileName,
    ),
    index("idx_import_mapping_profiles_org_type").on(
      table.organizationId,
      table.importType,
      table.updatedAt,
    ),
  ],
);

export const routes = sqliteTable(
  "routes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    technicianId: text("technician_id")
      .notNull()
      .references(() => technicians.id),
    routeDate: text("route_date").notNull(),
    status: text("status").notNull().default("draft"),
    startLocationJson: text("start_location_json").notNull(),
    endLocationJson: text("end_location_json"),
    totalMiles: real("total_miles"),
    totalDriveMinutes: integer("total_drive_minutes"),
    optimizationProvider: text("optimization_provider"),
    optimizationSnapshotJson: text("optimization_snapshot_json"),
    optimizedAt: text("optimized_at"),
    recordVersion: integer("record_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_routes_tech_date").on(
      table.technicianId,
      table.routeDate,
    ),
    index("idx_routes_org_date").on(table.organizationId, table.routeDate),
  ],
);

export const routeStops = sqliteTable(
  "route_stops",
  {
    id: text("id").primaryKey(),
    routeId: text("route_id")
      .notNull()
      .references(() => routes.id),
    workOrderId: text("work_order_id").references(() => workOrders.id),
    stopOrder: integer("stop_order").notNull(),
    stopType: text("stop_type").notNull().default("service"),
    addressJson: text("address_json").notNull(),
    timeWindowStart: text("time_window_start"),
    timeWindowEnd: text("time_window_end"),
    plannedArrival: text("planned_arrival"),
    plannedDeparture: text("planned_departure"),
    legMiles: real("leg_miles"),
    driveMinutes: integer("drive_minutes"),
    travelSource: text("travel_source").notNull().default("missing"),
    actualArrival: text("actual_arrival"),
    status: text("status").notNull().default("planned"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("uidx_route_stops_order").on(table.routeId, table.stopOrder),
    index("idx_route_stops_work_order").on(table.workOrderId),
  ],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksum: text("checksum"),
    category: text("category").notNull().default("general"),
    uploadedBy: text("uploaded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uidx_attachments_storage_key").on(table.storageKey),
    index("idx_attachments_entity").on(table.entityType, table.entityId),
  ],
);

export const multipartUploadSessions = sqliteTable(
  "multipart_upload_sessions",
  {
    uploadId: text("upload_id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    attachmentId: text("attachment_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    category: text("category").notNull(),
    storageKey: text("storage_key").notNull(),
    sourceFileName: text("source_file_name").notNull(),
    safeName: text("safe_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    initiatedBy: text("initiated_by").notNull().references(() => users.id),
    status: text("status").notNull().default("active"),
    expiresAt: text("expires_at").notNull(),
    completedAt: text("completed_at"),
    endedAt: text("ended_at"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uidx_multipart_upload_storage_key").on(table.storageKey),
    uniqueIndex("uidx_multipart_upload_active_attachment")
      .on(table.organizationId, table.attachmentId)
      .where(sql`${table.status} = 'active'`),
    index("idx_multipart_upload_attachment").on(
      table.organizationId,
      table.attachmentId,
      table.status,
    ),
    index("idx_multipart_upload_expiry").on(table.status, table.expiresAt),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorUserId: text("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    requestId: text("request_id"),
    deviceId: text("device_id"),
    ipHash: text("ip_hash"),
    occurredAt: text("occurred_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_audit_entity_timeline").on(
      table.entityType,
      table.entityId,
      table.occurredAt,
    ),
    index("idx_audit_actor_timeline").on(table.actorUserId, table.occurredAt),
  ],
);

export const syncMutations = sqliteTable(
  "sync_mutations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    clientMutationId: text("client_mutation_id").notNull(),
    deviceId: text("device_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    operation: text("operation").notNull(),
    baseVersion: integer("base_version"),
    payloadJson: text("payload_json").notNull(),
    status: text("status").notNull().default("received"),
    conflictJson: text("conflict_json"),
    receivedAt: text("received_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    appliedAt: text("applied_at"),
  },
  (table) => [
    uniqueIndex("uidx_sync_client_mutation").on(table.clientMutationId),
    index("idx_sync_device_status").on(
      table.deviceId,
      table.status,
      table.receivedAt,
    ),
  ],
);

export const integrationEvents = sqliteTable(
  "integration_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    integrationKey: text("integration_key").notNull(),
    externalEventId: text("external_event_id"),
    direction: text("direction").notNull(),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    payloadJson: text("payload_json").notNull(),
    errorMessage: text("error_message"),
    nextAttemptAt: text("next_attempt_at"),
    processedAt: text("processed_at"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("uidx_integration_external_event").on(
      table.integrationKey,
      table.externalEventId,
    ),
    index("idx_integration_events_queue").on(table.status, table.nextAttemptAt),
  ],
);

export const trainingSchools = sqliteTable("training_schools", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  name: text("name").notNull(), coordinatorEmail: text("coordinator_email").notNull(),
  active: integer("active").notNull().default(1), dataJson: text("data_json").notNull(),
  recordVersion: integer("record_version").notNull().default(1), createdAt: createdAt(),
}, t => [index("idx_training_schools_email").on(t.organizationId,t.coordinatorEmail,t.active)]);
export const trainingPlacements = sqliteTable("training_placements", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  schoolId: text("school_id").notNull().references(() => trainingSchools.id),
  studentName: text("student_name").notNull(), technicianId: text("technician_id"),
  mentorId: text("mentor_id").notNull(), status: text("status").notNull().default("active"),
  dataJson: text("data_json").notNull(), recordVersion: integer("record_version").notNull().default(1), createdAt: createdAt(),
}, t => [index("idx_training_placements_school").on(t.organizationId,t.schoolId),index("idx_training_placements_tech").on(t.technicianId,t.status)]);
export const trainingLogs = sqliteTable("training_logs", {
  id: text("id").primaryKey(), organizationId: text("organization_id").notNull(),
  placementId: text("placement_id").notNull().references(() => trainingPlacements.id),
  workOrderId: text("work_order_id"), status: text("status").notNull().default("pending"),
  dataJson: text("data_json").notNull(), submittedBy: text("submitted_by").notNull(),
  reviewedBy: text("reviewed_by"), reviewedAt: text("reviewed_at"), createdAt: createdAt(),
}, t => [index("idx_training_logs_placement").on(t.organizationId,t.placementId)]);

export const schoolInterestSubmissions = sqliteTable("school_interest_submissions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  institutionSlug: text("institution_slug").notNull(),
  institutionName: text("institution_name").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  program: text("program"),
  graduationDate: text("graduation_date"),
  availability: text("availability").notNull(),
  transportation: text("transportation").notNull(),
  tools: text("tools").notNull(),
  resumeKey: text("resume_key"),
  resumeName: text("resume_name"),
  resumeContentType: text("resume_content_type"),
  status: text("status").notNull().default("new"),
  createdAt: createdAt(),
}, t => [index("idx_school_interest_institution_created").on(t.organizationId, t.institutionSlug, t.createdAt)]);

export const assetProcedureResearch = sqliteTable("asset_procedure_research", {
 cacheKey: text("cache_key").primaryKey(),
 organizationId: text("organization_id").notNull().references(()=>organizations.id),
 generationId: text("generation_id").notNull(),
 status: text("status").notNull(),
 documentJson: text("document_json"),
 errorMessage: text("error_message"),
 expiresAt: text("expires_at").notNull(),
 updatedAt: updatedAt(),
});

export const biomedicalPmDraftEntries = sqliteTable("biomedical_pm_draft_entries", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(()=>organizations.id),
  reportKey: text("report_key").notNull(),
  unitNumber: text("unit_number").notNull(),
  fieldsJson: text("fields_json").notNull(),
  recordVersion: integer("record_version").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: updatedAt(),
}, t => [uniqueIndex("uq_pm_draft_unit").on(t.organizationId,t.reportKey,t.unitNumber)]);
export const biomedicalPmDraftHistory = sqliteTable("biomedical_pm_draft_history", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(()=>organizations.id),
  reportKey: text("report_key").notNull(),
  unitNumber: text("unit_number").notNull(),
  fieldsJson: text("fields_json").notNull(),
  recordVersion: integer("record_version").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: createdAt(),
},t=>[uniqueIndex("uq_pm_draft_history_revision").on(t.organizationId,t.reportKey,t.unitNumber,t.recordVersion)]);

// ------------------------------------------------------------------------------
// PARTS & INVENTORY DOMAIN (Catalog, Van Stock, Installed Parts, POs & RMAs)
// ------------------------------------------------------------------------------

export const partsCatalog = sqliteTable("parts_catalog", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  partNumber: text("part_number").notNull(),
  name: text("name").notNull(),
  manufacturer: text("manufacturer").notNull().default("Generic OEM"),
  category: text("category").notNull().default("Hardware & Cables"),
  warehouseStock: integer("warehouse_stock").notNull().default(0),
  totalVanStock: integer("total_van_stock").notNull().default(0),
  minThreshold: integer("min_threshold").notNull().default(5),
  unitCost: real("unit_cost").notNull().default(0),
  retailPrice: real("retail_price").notNull().default(0),
  status: text("status").notNull().default("In Stock"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  uniqueIndex("uq_parts_catalog_org_num").on(t.organizationId, t.partNumber),
  index("idx_parts_catalog_cat").on(t.organizationId, t.category),
]);

export const vanStock = sqliteTable("van_stock", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  vanId: text("van_id").notNull(),
  vanName: text("van_name").notNull(),
  technicianName: text("technician_name").notNull(),
  technicianId: text("technician_id"),
  partId: text("part_id").references(() => partsCatalog.id),
  partNumber: text("part_number").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("Hardware & Cables"),
  qtyOnHand: integer("qty_on_hand").notNull().default(0),
  parLevel: integer("par_level").notNull().default(2),
  unitCost: real("unit_cost").notNull().default(0),
  retailPrice: real("retail_price").notNull().default(0),
  binLocation: text("bin_location").default("BIN-A1"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  uniqueIndex("uq_van_stock_van_part").on(t.organizationId, t.vanId, t.partNumber),
  index("idx_van_stock_van").on(t.organizationId, t.vanId),
]);

export const installedParts = sqliteTable("installed_parts", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  workOrderId: text("work_order_id").notNull(),
  technicianName: text("technician_name").notNull(),
  technicianId: text("technician_id"),
  equipmentModel: text("equipment_model").notNull(),
  serialNumber: text("serial_number"),
  partNumber: text("part_number").notNull(),
  partName: text("part_name").notNull(),
  qty: integer("qty").notNull().default(1),
  unitPrice: real("unit_price").notNull().default(0),
  warrantyStatus: text("warranty_status").notNull().default("Billable to Customer"),
  installedDate: text("installed_date").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  index("idx_installed_parts_wo").on(t.organizationId, t.workOrderId),
]);

export const partsPurchaseOrders = sqliteTable("parts_purchase_orders", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  poNumber: text("po_number").notNull(),
  vendor: text("vendor").notNull(),
  partNumber: text("part_number").notNull(),
  partName: text("part_name").notNull(),
  qty: integer("qty").notNull().default(1),
  totalCost: real("total_cost").notNull().default(0),
  status: text("status").notNull().default("Ordered"),
  trackingNumber: text("tracking_number"),
  orderDate: text("order_date"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  uniqueIndex("uq_parts_po_number").on(t.organizationId, t.poNumber),
  index("idx_parts_po_vendor").on(t.organizationId, t.vendor),
]);

// ------------------------------------------------------------------------------
// 2. SYSTEM SETTINGS & COMPANY RATE CARDS
// ------------------------------------------------------------------------------

export const systemSettings = sqliteTable("system_settings", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().unique().references(() => organizations.id),
  companyName: text("company_name").notNull().default("TechFlex Mobility Solutions"),
  address: text("address").notNull().default("611 Park Meadow Rd, Suite B"),
  city: text("city").notNull().default("Westerville"),
  state: text("state").notNull().default("OH"),
  zipCode: text("zip_code").notNull().default("43081"),
  phone: text("phone").notNull().default("877-231-TECH"),
  email: text("email").notNull().default("service@techflexmobility.com"),
  hubLatitude: real("hub_latitude").default(40.125),
  hubLongitude: real("hub_longitude").default(-82.932),
  standardHourlyRate: real("standard_hourly_rate").notNull().default(85.0),
  overtimeHourlyRate: real("overtime_hourly_rate").notNull().default(125.0),
  weekendHourlyRate: real("weekend_hourly_rate").notNull().default(145.0),
  travelMileageRate: real("travel_mileage_rate").notNull().default(0.65),
  fixedTripFee: real("fixed_trip_fee").notNull().default(45.0),
  emergencyDispatchSurcharge: real("emergency_dispatch_surcharge").notNull().default(75.0),
  minBillableHours: real("min_billable_hours").notNull().default(1.0),
  maxDailyRouteMiles: integer("max_daily_route_miles").notNull().default(250),
  maxJobsPerTech: integer("max_jobs_per_tech").notNull().default(6),
  originPrecedence: text("origin_precedence").notNull().default("hub"),
  defaultTravelBufferMinutes: integer("default_travel_buffer_minutes").notNull().default(30),
  requirePhotoAttestation: integer("require_photo_attestation").notNull().default(1),
  enforce40PercentMarginFloor: integer("enforce_40_percent_margin_floor").notNull().default(1),
  autoSyncQuickBooks: integer("auto_sync_quickbooks").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ------------------------------------------------------------------------------
// 3. OPERATIONS REPORTS & MARGIN GUARDRAIL RECORDS
// ------------------------------------------------------------------------------

export const operationsMarginRecords = sqliteTable("operations_margin_records", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  workOrderId: text("work_order_id").notNull(),
  monthYear: text("month_year").notNull(),
  clientAccount: text("client_account").notNull(),
  billedRevenue: real("billed_revenue").notNull().default(0),
  directLaborCost: real("direct_labor_cost").notNull().default(0),
  directPartsCost: real("direct_parts_cost").notNull().default(0),
  travelCost: real("travel_cost").notNull().default(0),
  totalDirectCost: real("total_direct_cost").notNull().default(0),
  grossMarginDollars: real("gross_margin_dollars").notNull().default(0),
  grossMarginPercent: real("gross_margin_percent").notNull().default(0),
  meetsGuardrail: integer("meets_guardrail").notNull().default(1),
  overrideReason: text("override_reason"),
  auditedBy: text("audited_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  index("idx_ops_margin_org_wo").on(t.organizationId, t.workOrderId),
  index("idx_ops_margin_month").on(t.organizationId, t.monthYear),
]);

export const operationsKpiSnapshots = sqliteTable("operations_kpi_snapshots", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  snapshotDate: text("snapshot_date").notNull(),
  totalBilled: real("total_billed").notNull().default(0),
  totalDirectCost: real("total_direct_cost").notNull().default(0),
  averageGrossMargin: real("average_gross_margin").notNull().default(0),
  firstTimeFixRate: real("first_time_fix_rate").notNull().default(0),
  slaComplianceRate: real("sla_compliance_rate").notNull().default(0),
  activeTechnicianCount: integer("active_technician_count").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  uniqueIndex("uq_ops_kpi_snapshot_date").on(t.organizationId, t.snapshotDate),
]);

// ------------------------------------------------------------------------------
// 4. QUICKBOOKS SYNC CONFIGURATION & TRANSACTION LEDGER
// ------------------------------------------------------------------------------

export const quickbooksConnections = sqliteTable("quickbooks_connections", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().unique().references(() => organizations.id),
  realmId: text("realm_id").notNull(),
  companyName: text("company_name").notNull().default("TechFlex Mobility QuickBooks"),
  isConnected: integer("is_connected").notNull().default(0),
  tokenExpiresAt: text("token_expires_at"),
  lastSyncAt: text("last_sync_at"),
  autoSyncEnabled: integer("auto_sync_enabled").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const quickbooksSyncLedger = sqliteTable("quickbooks_sync_ledger", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  qboId: text("qbo_id"),
  syncStatus: text("sync_status").notNull().default("Pending"),
  syncDirection: text("sync_direction").notNull().default("outbound"),
  attemptCount: integer("attempt_count").notNull().default(1),
  lastAttemptAt: text("last_attempt_at"),
  errorMessage: text("error_message"),
  responsePayloadJson: text("response_payload_json"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  index("idx_qb_ledger_entity").on(t.organizationId, t.entityType, t.entityId),
  index("idx_qb_ledger_status").on(t.organizationId, t.syncStatus),
]);

// ------------------------------------------------------------------------------
// 5. ROUTE MAP CANVAS & DISPATCH ROUTING
// ------------------------------------------------------------------------------

export const dispatchRoutePlans = sqliteTable("dispatch_route_plans", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  routeDate: text("route_date").notNull(),
  technicianId: text("technician_id").notNull(),
  technicianName: text("technician_name").notNull(),
  vehicleId: text("vehicle_id").notNull().default("Van 101"),
  originAddress: text("origin_address").notNull().default("611 Park Meadow Rd, Suite B, Westerville, OH 43081"),
  originLatitude: real("origin_latitude").default(40.125),
  originLongitude: real("origin_longitude").default(-82.932),
  destinationAddress: text("destination_address"),
  totalDistanceMiles: real("total_distance_miles").notNull().default(0),
  estimatedDurationMinutes: integer("estimated_duration_minutes").notNull().default(0),
  stopsCount: integer("stops_count").notNull().default(0),
  status: text("status").notNull().default("Draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  index("idx_route_plans_tech_date").on(t.organizationId, t.technicianId, t.routeDate),
]);

export const dispatchRouteWaypoints = sqliteTable("dispatch_route_waypoints", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  routePlanId: text("route_plan_id").notNull().references(() => dispatchRoutePlans.id),
  workOrderId: text("work_order_id").notNull(),
  stopSequence: integer("stop_sequence").notNull(),
  locationName: text("location_name").notNull(),
  address: text("address").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  appointmentTime: text("appointment_time"),
  stopStatus: text("stop_status").notNull().default("Pending"),
  distanceFromLastStop: real("distance_from_last_stop").notNull().default(0),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  index("idx_waypoints_route_seq").on(t.organizationId, t.routePlanId, t.stopSequence),
]);

// ------------------------------------------------------------------------------
// 6. EVIDENCE DOCUMENT VIEWER & VERIFICATION REVIEWS
// ------------------------------------------------------------------------------

export const evidenceDocumentReviews = sqliteTable("evidence_document_reviews", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id),
  workOrderId: text("work_order_id").notNull(),
  documentTitle: text("document_title").notNull(),
  originalFileName: text("original_file_name").notNull(),
  fileType: text("file_type").notNull().default("application/pdf"),
  fileHashSha256: text("file_hash_sha256"),
  fileSizeBytes: integer("file_size_bytes").notNull().default(0),
  storagePath: text("storage_path").notNull(),
  extractedFieldsJson: text("extracted_fields_json").notNull().default("{}"),
  confidenceScore: real("confidence_score").notNull().default(1.0),
  reviewStatus: text("review_status").notNull().default("Needs Review"),
  reviewerId: text("reviewer_id"),
  reviewedAt: text("reviewed_at"),
  humanOverrideJson: text("human_override_json"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  index("idx_evidence_reviews_wo").on(t.organizationId, t.workOrderId),
  index("idx_evidence_reviews_status").on(t.organizationId, t.reviewStatus),
]);


