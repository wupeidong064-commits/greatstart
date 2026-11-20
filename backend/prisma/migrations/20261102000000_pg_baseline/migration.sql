-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startdate" TIMESTAMP(3),
    "enddate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campuses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT,
    "campusId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campusId" TEXT,
    "name" TEXT NOT NULL,
    "gender" TEXT,
    "birthDate" TIMESTAMP(3),
    "phone" TEXT,
    "parentName" TEXT,
    "parentPhone" TEXT,
    "parentEmail" TEXT,
    "address" TEXT,
    "emergencyContact" TEXT,
    "emergencyPhone" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "cardOpenDate" TIMESTAMP(3),
    "purchasedLessons" INTEGER NOT NULL DEFAULT 0,
    "consumedLessons" INTEGER NOT NULL DEFAULT 0,
    "remainingLessons" INTEGER NOT NULL DEFAULT 0,
    "totalPayment" DECIMAL(65,30) DEFAULT 0,
    "frozenLessons" INTEGER NOT NULL DEFAULT 0,
    "frozenAt" TIMESTAMP(3),
    "frozenReason" TEXT,
    "unfreezeAt" TIMESTAMP(3),
    "salesId" TEXT,
    "lastClassDate" TIMESTAMP(3),
    "renewalStatus" TEXT,
    "noRenewalReason" TEXT,
    "noRenewalDate" TIMESTAMP(3),
    "refundReason" TEXT,
    "refundDate" TIMESTAMP(3),
    "removalStatus" TEXT,
    "removalReason" TEXT,
    "removalExpectedRecallDate" TIMESTAMP(3),
    "removalSubmittedById" TEXT,
    "removalSubmittedByName" TEXT,
    "removalSubmittedAt" TIMESTAMP(3),
    "removalReviewedById" TEXT,
    "removalReviewedByName" TEXT,
    "removalReviewedAt" TIMESTAMP(3),
    "removalRejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campusId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "courseType" TEXT NOT NULL,
    "level" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 20,
    "teacherId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "description" TEXT,
    "scheduleRule" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "price" DECIMAL(65,30) DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campusId" TEXT,
    "classId" TEXT NOT NULL,
    "courseId" TEXT,
    "teacherId" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "classroom" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceRule" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "originalScheduleId" TEXT,
    "lessonIndex" INTEGER,
    "weekNumber" INTEGER,
    "scheduleGroupId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "enrolledBy" TEXT,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "checkedInBy" TEXT,
    "status" TEXT NOT NULL,
    "checkInTime" TIMESTAMP(3),
    "checkOutTime" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "paymentType" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "paidBy" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "age" INTEGER,
    "contact" TEXT NOT NULL,
    "source" TEXT,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "lastContactAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT,
    "studentName" TEXT NOT NULL,
    "age" INTEGER,
    "gender" TEXT,
    "contact" TEXT NOT NULL,
    "parentName" TEXT,
    "address" TEXT,
    "classId" TEXT,
    "className" TEXT,
    "courseType" TEXT,
    "totalLessons" INTEGER,
    "price" DECIMAL(10,2),
    "paymentMethod" TEXT,
    "paymentStatus" TEXT DEFAULT 'paid',
    "salesId" TEXT,
    "salesName" TEXT,
    "conversionDate" TEXT NOT NULL,
    "notes" TEXT,
    "experienceLessonId" TEXT,
    "leadId" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'pending',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experience_lessons" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "age" INTEGER,
    "contact" TEXT NOT NULL,
    "source" TEXT,
    "leadId" TEXT,
    "classId" TEXT,
    "className" TEXT,
    "scheduleDate" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "classroom" TEXT,
    "teachingTeacherId" TEXT,
    "teachingTeacherName" TEXT,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "convertedAt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "experience_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_logs" (
    "scheduleId" TEXT,
    "businessDate" TEXT,
    "reversalOfId" TEXT,
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "lessons" INTEGER NOT NULL,
    "notes" TEXT,
    "operatorId" TEXT,
    "operatorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "headingPath" TEXT NOT NULL,
    "blockType" TEXT NOT NULL,
    "entity" TEXT,
    "period" TEXT,
    "content" TEXT NOT NULL,
    "searchVector" tsvector,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_deduction_records" (
    "scheduleId" TEXT,
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "operatorId" TEXT,
    "operatorName" TEXT,
    "deductionDate" TEXT NOT NULL,
    "deductionCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_deduction_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_transfers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromTeacherId" TEXT NOT NULL,
    "fromTeacherName" TEXT,
    "toTeacherId" TEXT NOT NULL,
    "toTeacherName" TEXT,
    "transferDetails" JSONB,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "operatedBy" TEXT,
    "operatedByName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_transfers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromClassId" TEXT NOT NULL,
    "toClassId" TEXT NOT NULL,
    "transferredLessons" INTEGER NOT NULL,
    "priceDifference" DECIMAL(10,2) DEFAULT 0,
    "refundAmount" DECIMAL(10,2) DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "notes" TEXT,
    "operatedBy" TEXT,
    "operatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "classId" TEXT,
    "className" TEXT,
    "conversionId" TEXT,
    "lessonsToRefund" INTEGER NOT NULL,
    "amountToRefund" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submittedById" TEXT NOT NULL,
    "submittedByName" TEXT,
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_credit_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campusId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "balanceMicros" INTEGER NOT NULL DEFAULT 0,
    "reservedMicros" INTEGER NOT NULL DEFAULT 0,
    "openedById" TEXT,
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_credit_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_credit_ledger" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "micros" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "billId" TEXT,
    "operatorId" TEXT,
    "reason" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_task_bills" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campusId" TEXT,
    "userId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "reservedMicros" INTEGER NOT NULL,
    "settledMicros" INTEGER NOT NULL DEFAULT 0,
    "releasedMicros" INTEGER NOT NULL DEFAULT 0,
    "stopReason" TEXT,
    "usageJson" JSONB,
    "estimateMicros" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "ai_task_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_prices" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputMicrosPer1k" INTEGER NOT NULL,
    "outputMicrosPer1k" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "ai_model_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_employee_authorizations" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "limitMicros" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_employee_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code");

-- CreateIndex
CREATE INDEX "organizations_code_idx" ON "organizations"("code");

-- CreateIndex
CREATE INDEX "campuses_organizationId_idx" ON "campuses"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "campuses_organizationId_code_key" ON "campuses"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "users_campusId_idx" ON "users"("campusId");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "students_organizationId_idx" ON "students"("organizationId");

-- CreateIndex
CREATE INDEX "students_campusId_idx" ON "students"("campusId");

-- CreateIndex
CREATE INDEX "students_name_idx" ON "students"("name");

-- CreateIndex
CREATE INDEX "students_status_idx" ON "students"("status");

-- CreateIndex
CREATE INDEX "students_salesId_idx" ON "students"("salesId");

-- CreateIndex
CREATE INDEX "students_removalStatus_idx" ON "students"("removalStatus");

-- CreateIndex
CREATE INDEX "classes_organizationId_idx" ON "classes"("organizationId");

-- CreateIndex
CREATE INDEX "classes_campusId_idx" ON "classes"("campusId");

-- CreateIndex
CREATE INDEX "classes_teacherId_idx" ON "classes"("teacherId");

-- CreateIndex
CREATE INDEX "classes_status_idx" ON "classes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "classes_organizationId_code_key" ON "classes"("organizationId", "code");

-- CreateIndex
CREATE INDEX "courses_organizationId_idx" ON "courses"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "courses_organizationId_code_key" ON "courses"("organizationId", "code");

-- CreateIndex
CREATE INDEX "schedules_organizationId_idx" ON "schedules"("organizationId");

-- CreateIndex
CREATE INDEX "schedules_campusId_idx" ON "schedules"("campusId");

-- CreateIndex
CREATE INDEX "schedules_classId_idx" ON "schedules"("classId");

-- CreateIndex
CREATE INDEX "schedules_startTime_idx" ON "schedules"("startTime");

-- CreateIndex
CREATE INDEX "schedules_status_idx" ON "schedules"("status");

-- CreateIndex
CREATE INDEX "schedules_scheduleGroupId_idx" ON "schedules"("scheduleGroupId");

-- CreateIndex
CREATE INDEX "enrollments_organizationId_idx" ON "enrollments"("organizationId");

-- CreateIndex
CREATE INDEX "enrollments_studentId_idx" ON "enrollments"("studentId");

-- CreateIndex
CREATE INDEX "enrollments_classId_idx" ON "enrollments"("classId");

-- CreateIndex
CREATE INDEX "enrollments_status_idx" ON "enrollments"("status");

-- CreateIndex
CREATE INDEX "attendances_organizationId_idx" ON "attendances"("organizationId");

-- CreateIndex
CREATE INDEX "attendances_studentId_idx" ON "attendances"("studentId");

-- CreateIndex
CREATE INDEX "attendances_scheduleId_idx" ON "attendances"("scheduleId");

-- CreateIndex
CREATE INDEX "attendances_classId_idx" ON "attendances"("classId");

-- CreateIndex
CREATE INDEX "attendances_status_idx" ON "attendances"("status");

-- CreateIndex
CREATE INDEX "attendances_checkInTime_idx" ON "attendances"("checkInTime");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_studentId_scheduleId_key" ON "attendances"("studentId", "scheduleId");

-- CreateIndex
CREATE INDEX "payments_organizationId_idx" ON "payments"("organizationId");

-- CreateIndex
CREATE INDEX "payments_enrollmentId_idx" ON "payments"("enrollmentId");

-- CreateIndex
CREATE INDEX "payments_studentId_idx" ON "payments"("studentId");

-- CreateIndex
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");

-- CreateIndex
CREATE INDEX "leads_organizationId_idx" ON "leads"("organizationId");

-- CreateIndex
CREATE INDEX "leads_customerName_idx" ON "leads"("customerName");

-- CreateIndex
CREATE INDEX "leads_contact_idx" ON "leads"("contact");

-- CreateIndex
CREATE INDEX "leads_createdAt_idx" ON "leads"("createdAt");

-- CreateIndex
CREATE INDEX "conversions_organizationId_idx" ON "conversions"("organizationId");

-- CreateIndex
CREATE INDEX "conversions_studentId_idx" ON "conversions"("studentId");

-- CreateIndex
CREATE INDEX "conversions_classId_idx" ON "conversions"("classId");

-- CreateIndex
CREATE INDEX "conversions_salesId_idx" ON "conversions"("salesId");

-- CreateIndex
CREATE INDEX "conversions_conversionDate_idx" ON "conversions"("conversionDate");

-- CreateIndex
CREATE INDEX "conversions_approvalStatus_idx" ON "conversions"("approvalStatus");

-- CreateIndex
CREATE INDEX "experience_lessons_organizationId_idx" ON "experience_lessons"("organizationId");

-- CreateIndex
CREATE INDEX "experience_lessons_leadId_idx" ON "experience_lessons"("leadId");

-- CreateIndex
CREATE INDEX "experience_lessons_classId_idx" ON "experience_lessons"("classId");

-- CreateIndex
CREATE INDEX "experience_lessons_teachingTeacherId_idx" ON "experience_lessons"("teachingTeacherId");

-- CreateIndex
CREATE INDEX "experience_lessons_assigneeId_idx" ON "experience_lessons"("assigneeId");

-- CreateIndex
CREATE INDEX "experience_lessons_scheduleDate_idx" ON "experience_lessons"("scheduleDate");

-- CreateIndex
CREATE INDEX "experience_lessons_status_idx" ON "experience_lessons"("status");

-- CreateIndex
CREATE INDEX "lesson_logs_organizationId_idx" ON "lesson_logs"("organizationId");

-- CreateIndex
CREATE INDEX "lesson_logs_studentId_idx" ON "lesson_logs"("studentId");

-- CreateIndex
CREATE INDEX "lesson_logs_operatorId_idx" ON "lesson_logs"("operatorId");

-- CreateIndex
CREATE INDEX "lesson_logs_createdAt_idx" ON "lesson_logs"("createdAt");

-- CreateIndex
CREATE INDEX "settings_organizationId_idx" ON "settings"("organizationId");

-- CreateIndex
CREATE INDEX "settings_key_idx" ON "settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_organizationId_key" ON "settings"("key", "organizationId");

-- CreateIndex
CREATE INDEX "knowledge_chunks_sourceFile_idx" ON "knowledge_chunks"("sourceFile");

-- CreateIndex
CREATE INDEX "knowledge_chunks_blockType_idx" ON "knowledge_chunks"("blockType");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_deduction_records_scheduleId_key" ON "lesson_deduction_records"("scheduleId");

-- CreateIndex
CREATE INDEX "lesson_deduction_records_organizationId_idx" ON "lesson_deduction_records"("organizationId");

-- CreateIndex
CREATE INDEX "lesson_deduction_records_classId_idx" ON "lesson_deduction_records"("classId");

-- CreateIndex
CREATE INDEX "lesson_deduction_records_operatorId_idx" ON "lesson_deduction_records"("operatorId");

-- CreateIndex
CREATE INDEX "lesson_deduction_records_deductionDate_idx" ON "lesson_deduction_records"("deductionDate");

-- CreateIndex
CREATE INDEX "resource_transfers_organizationId_idx" ON "resource_transfers"("organizationId");

-- CreateIndex
CREATE INDEX "resource_transfers_fromTeacherId_idx" ON "resource_transfers"("fromTeacherId");

-- CreateIndex
CREATE INDEX "resource_transfers_toTeacherId_idx" ON "resource_transfers"("toTeacherId");

-- CreateIndex
CREATE INDEX "lesson_transfers_organizationId_idx" ON "lesson_transfers"("organizationId");

-- CreateIndex
CREATE INDEX "lesson_transfers_studentId_idx" ON "lesson_transfers"("studentId");

-- CreateIndex
CREATE INDEX "lesson_transfers_fromClassId_idx" ON "lesson_transfers"("fromClassId");

-- CreateIndex
CREATE INDEX "lesson_transfers_toClassId_idx" ON "lesson_transfers"("toClassId");

-- CreateIndex
CREATE INDEX "refunds_organizationId_idx" ON "refunds"("organizationId");

-- CreateIndex
CREATE INDEX "refunds_studentId_idx" ON "refunds"("studentId");

-- CreateIndex
CREATE INDEX "refunds_classId_idx" ON "refunds"("classId");

-- CreateIndex
CREATE INDEX "refunds_submittedById_idx" ON "refunds"("submittedById");

-- CreateIndex
CREATE INDEX "refunds_status_idx" ON "refunds"("status");

-- CreateIndex
CREATE INDEX "ai_credit_accounts_organizationId_idx" ON "ai_credit_accounts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_credit_accounts_organizationId_campusId_key" ON "ai_credit_accounts"("organizationId", "campusId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_credit_ledger_idempotencyKey_key" ON "ai_credit_ledger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ai_credit_ledger_accountId_createdAt_idx" ON "ai_credit_ledger"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_task_bills_accountId_createdAt_idx" ON "ai_task_bills"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_task_bills_userId_createdAt_idx" ON "ai_task_bills"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_model_prices_model_effectiveFrom_idx" ON "ai_model_prices"("model", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ai_employee_authorizations_accountId_userId_key" ON "ai_employee_authorizations"("accountId", "userId");

-- AddForeignKey
ALTER TABLE "campuses" ADD CONSTRAINT "campuses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_salesId_fkey" FOREIGN KEY ("salesId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_removalSubmittedById_fkey" FOREIGN KEY ("removalSubmittedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_removalReviewedById_fkey" FOREIGN KEY ("removalReviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_enrolledBy_fkey" FOREIGN KEY ("enrolledBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_checkedInBy_fkey" FOREIGN KEY ("checkedInBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_paidBy_fkey" FOREIGN KEY ("paidBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_salesId_fkey" FOREIGN KEY ("salesId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_experienceLessonId_fkey" FOREIGN KEY ("experienceLessonId") REFERENCES "experience_lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_lessons" ADD CONSTRAINT "experience_lessons_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_lessons" ADD CONSTRAINT "experience_lessons_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_lessons" ADD CONSTRAINT "experience_lessons_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_lessons" ADD CONSTRAINT "experience_lessons_teachingTeacherId_fkey" FOREIGN KEY ("teachingTeacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experience_lessons" ADD CONSTRAINT "experience_lessons_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_logs" ADD CONSTRAINT "lesson_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_logs" ADD CONSTRAINT "lesson_logs_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_logs" ADD CONSTRAINT "lesson_logs_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_transfers" ADD CONSTRAINT "lesson_transfers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_transfers" ADD CONSTRAINT "lesson_transfers_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_transfers" ADD CONSTRAINT "lesson_transfers_fromClassId_fkey" FOREIGN KEY ("fromClassId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_transfers" ADD CONSTRAINT "lesson_transfers_toClassId_fkey" FOREIGN KEY ("toClassId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_transfers" ADD CONSTRAINT "lesson_transfers_operatedBy_fkey" FOREIGN KEY ("operatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "conversions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

