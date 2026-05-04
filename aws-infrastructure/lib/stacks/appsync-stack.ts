import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as events from 'aws-cdk-lib/aws-events';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { EnvConfig } from '../../config/types';
import * as path from 'path';

// Root of the monorepo (two levels above aws-infrastructure/)
const REPO_ROOT = path.resolve(__dirname, '../../../');

interface AppSyncStackProps extends cdk.StackProps {
  config: EnvConfig;
  userPool: cognito.IUserPool;
  /** Only required when enableNat is true — Lambdas are placed in private subnets
   *  only when there is a NAT Gateway to reach MongoDB Atlas and other external services.
   *  When undefined, Lambdas run outside the VPC and reach everything over the internet. */
  vpc?: ec2.Vpc;
  sgLambda?: ec2.SecurityGroup;
  eventBus: events.EventBus;
  documentsBucket: s3.Bucket;
}

/**
 * AppSyncStack — GraphQL API + all domain Lambda resolvers.
 *
 * Each Lambda is built from monorepo apps/ TypeScript source via
 * NodejsFunction (esbuild) — no separate build step needed.
 * MongoDB URI is injected via CloudFormation dynamic reference from Secrets Manager.
 */
export class AppSyncStack extends cdk.Stack {
  public readonly api: appsync.GraphqlApi;
  public readonly apiUrl: string;
  public readonly apiId: string;

  constructor(scope: Construct, id: string, props: AppSyncStackProps) {
    super(scope, id, props);
    const { config, userPool, vpc, sgLambda, eventBus, documentsBucket } = props;

    // ── AppSync GraphQL API ─────────────────────────────────────────────────
    this.api = new appsync.GraphqlApi(this, 'Api', {
      name: `vebgenix-${config.stage}`,
      definition: appsync.Definition.fromFile(
        path.join(__dirname, '../schema/schema.graphql'),
      ),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool,
            defaultAction: appsync.UserPoolDefaultAction.ALLOW,
          },
        },
        additionalAuthorizationModes: [
          { authorizationType: appsync.AuthorizationType.IAM },
        ],
      },
      logConfig: {
        fieldLogLevel: config.stage === 'prod'
          ? appsync.FieldLogLevel.ERROR
          : appsync.FieldLogLevel.ALL,
        retention: config.stage === 'prod'
          ? logs.RetentionDays.THREE_MONTHS
          : logs.RetentionDays.ONE_WEEK,
      },
      xrayEnabled: true,
    });

    this.apiUrl = this.api.graphqlUrl;
    this.apiId  = this.api.apiId;

    const schemaNode = this.api.node.findChild('Schema');
    const cfnSchemaResource = schemaNode
      ? (schemaNode as import('constructs').IConstruct).node.defaultChild as cdk.CfnResource | null
      : null;

    // ── Shared Lambda environment ───────────────────────────────────────────
    const sharedEnv: Record<string, string> = {
      STAGE:               config.stage,
      MONGODB_URI:         `{{resolve:secretsmanager:vebgenix/${config.stage}/mongodb:SecretString:uri}}`,
      EVENT_BUS_NAME:      eventBus.eventBusName,
      DOCUMENTS_BUCKET:    documentsBucket.bucketName,
      COGNITO_USER_POOL_ID: userPool.userPoolId,
      COGNITO_CLIENT_ID:   config.cognitoClientId ?? '',
      COGNITO_REGION:      config.region,
      APP_NAME:            'Vebgenix',
      APP_BASE_URL:        config.appBaseUrl ?? '',
      NODE_OPTIONS:        '--enable-source-maps',
    };

    // ── IAM statements ──────────────────────────────────────────────────────
    const cognitoAdminPolicy = new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminDisableUser',
        'cognito-idp:AdminEnableUser',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminInitiateAuth',
        'cognito-idp:ListUsersInGroup',
        'cognito-idp:AdminAddUserToGroup',
      ],
      resources: [`arn:aws:cognito-idp:${config.region}:${config.account}:userpool/*`],
    });

    const eventBusPolicy = new iam.PolicyStatement({
      actions:   ['events:PutEvents'],
      resources: [eventBus.eventBusArn],
    });

    const s3ReadWritePolicy = new iam.PolicyStatement({
      actions:   ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
      resources: [`${documentsBucket.bucketArn}/*`],
    });

    // ── Lambda factory ──────────────────────────────────────────────────────
    const makeServiceLambda = (
      logicalId: string,
      fnName: string,
      entryRelPath: string,
      extraEnv?: Record<string, string>,
      extraPolicies?: iam.PolicyStatement[],
    ): nodejs.NodejsFunction => {
      const fn = new nodejs.NodejsFunction(this, logicalId, {
        functionName:   `vebgenix-${fnName}-${config.stage}`,
        runtime:        lambda.Runtime.NODEJS_20_X,
        entry:          path.join(REPO_ROOT, entryRelPath),
        handler:        'handler',
        timeout:        cdk.Duration.seconds(30),
        memorySize:     512,
        // Place in private subnets only when NAT is available (enableNat: true).
        // Without NAT, Lambdas run outside the VPC and reach Atlas + AWS services
        // directly over the internet — no VPC, no NAT cost.
        ...(vpc && sgLambda ? {
          vpc,
          vpcSubnets:     { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
          securityGroups: [sgLambda],
        } : {}),
        environment:    { ...sharedEnv, ...(extraEnv ?? {}) },
        tracing:        lambda.Tracing.ACTIVE,
        bundling: {
          forceDockerBundling: false,
          minify:    config.stage === 'prod',
          sourceMap: config.stage !== 'prod',
          externalModules: ['@aws-sdk/*'],
        },
      });
      (extraPolicies ?? []).forEach(p => fn.addToRolePolicy(p));
      return fn;
    };

    // ── 1. Identity service ─────────────────────────────────────────────────
    const usersLambda = makeServiceLambda(
      'UsersLambda', 'users-resolver',
      'apps/identity-service/src/handler.ts',
      {},
      [cognitoAdminPolicy],
    );

    // ── 2. Admissions service ───────────────────────────────────────────────
    const admissionsLambda = makeServiceLambda(
      'AdmissionsLambda', 'admissions-resolver',
      'apps/admissions-service/src/handler.ts',
      {},
      [eventBusPolicy],
    );

    // ── 3. Finance service ──────────────────────────────────────────────────
    const financeLambda = makeServiceLambda(
      'FinanceLambda', 'finance-resolver',
      'apps/finance-service/src/handler.ts',
      {
        RAZORPAY_KEY_ID:         `{{resolve:secretsmanager:vebgenix/${config.stage}/razorpay:SecretString:keyId}}`,
        RAZORPAY_KEY_SECRET:     `{{resolve:secretsmanager:vebgenix/${config.stage}/razorpay:SecretString:keySecret}}`,
        RAZORPAY_WEBHOOK_SECRET: `{{resolve:secretsmanager:vebgenix/${config.stage}/razorpay:SecretString:webhookSecret}}`,
      },
    );

    // ── 4. Academics service (classes, sections, subjects, students, exams, attendance) ──
    const academicsLambda = makeServiceLambda(
      'AcademicsLambda', 'academics-resolver',
      'apps/academics-service/src/handler.ts',
    );

    // ── 5. Settings service (tenants, campuses, programs, academic years, templates, features, dashboard, audit) ──
    // settingsLambda — general settings, dashboard stats, audit logs (no Cognito)
    // tenantsLambda  — platform tenant management (needs Cognito AdminCreateUser)
    const settingsLambda = makeServiceLambda(
      'SettingsLambda', 'settings-resolver',
      'apps/settings-service/src/handler.ts',
    );
    const tenantsLambda = makeServiceLambda(
      'TenantsLambda', 'tenants-resolver',
      'apps/settings-service/src/handler.ts',
      {},
      [cognitoAdminPolicy],
    );

    // ── 6. Storage service (presigned S3 URLs) ──────────────────────────────
    const storageLambda = makeServiceLambda(
      'StorageLambda', 'storage-resolver',
      'apps/storage-service/src/handler.ts',
      {},
      [s3ReadWritePolicy],
    );
    documentsBucket.grantPut(storageLambda);
    documentsBucket.grantRead(storageLambda);

    // ── 7. Comms service (announcements, events, leave) ─────────────────────
    const commsLambda = makeServiceLambda(
      'CommsLambda', 'comms-resolver',
      'apps/comms-service/src/handler.ts',
      {},
      [eventBusPolicy],
    );

    // ── 8. Results service (published result batches, public lookup) ─────────
    const resultsLambda = makeServiceLambda(
      'ResultsLambda', 'results-resolver',
      'apps/results-service/src/handler.ts',
    );

    // ── 9. Admin cleanup (dedup report, merge, cleanup) ───────────────────────
    const cleanupLambda = makeServiceLambda(
      'CleanupLambda', 'cleanup-resolver',
      'apps/admin-cleanup-service/src/handler.ts',
    );

    // ── AppSync Datasources ─────────────────────────────────────────────────
    const usersDs      = this.api.addLambdaDataSource('UsersDs',      usersLambda);
    const admissionsDs = this.api.addLambdaDataSource('AdmissionsDs', admissionsLambda);
    const financeDs    = this.api.addLambdaDataSource('FinanceDs',    financeLambda);
    const academicsDs  = this.api.addLambdaDataSource('AcademicsDs',  academicsLambda);
    const settingsDs   = this.api.addLambdaDataSource('SettingsDs',   settingsLambda);
    const tenantsDs    = this.api.addLambdaDataSource('TenantsDs',    tenantsLambda);
    const storageDs    = this.api.addLambdaDataSource('StorageDs',    storageLambda);
    const commsDs      = this.api.addLambdaDataSource('CommsDs',      commsLambda);
    const resultsDs    = this.api.addLambdaDataSource('ResultsDs',    resultsLambda);
    const cleanupDs    = this.api.addLambdaDataSource('CleanupDs',    cleanupLambda);

    // ── Resolver factory ────────────────────────────────────────────────────
    const R = (ds: appsync.LambdaDataSource) => (typeName: string, fieldName: string) => {
      const resolver = ds.createResolver(`${typeName}${fieldName}Resolver`, {
        typeName,
        fieldName,
        requestMappingTemplate:  appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
      if (cfnSchemaResource) {
        (resolver.node.defaultChild as cdk.CfnResource | undefined)
          ?.addDependency(cfnSchemaResource);
      }
      return resolver;
    };

    // ── Identity resolvers ──────────────────────────────────────────────────
    const users = R(usersDs);
    users('Query',    'me');
    users('Query',    'listUsers');
    users('Query',    'getUser');
    users('Query',    'listStaff');
    users('Query',    'getStaffMember');
    users('Query',    'listEmployees');
    users('Query',    'getEmployee');
    users('Query',    'listCampusAccess');
    users('Mutation', 'createUser');
    users('Mutation', 'updateUser');
    users('Mutation', 'deactivateUser');
    users('Mutation', 'reactivateUser');
    users('Mutation', 'inviteStaff');
    users('Mutation', 'updateEmployee');
    users('Mutation', 'addCampusAccess');
    users('Mutation', 'removeCampusAccess');
    users('Mutation', 'assignRole');
    users('Mutation', 'removeRole');
    users('Mutation', 'bulkDeactivateUsers');
    users('Mutation', 'impersonateUser');

    // ── Health check ────────────────────────────────────────────────────────
    R(settingsDs)('Query', 'health');

    // ── Admissions resolvers ────────────────────────────────────────────────
    const admissions = R(admissionsDs);
    admissions('Query',    'listAdmissions');
    admissions('Query',    'getAdmission');
    admissions('Mutation', 'createAdmission');
    admissions('Mutation', 'updateAdmission');
    admissions('Mutation', 'submitAdmission');
    admissions('Mutation', 'reviewAdmission');
    admissions('Mutation', 'withdrawAdmission');
    admissions('Mutation', 'updateAdmissionStatus');
    admissions('Query',    'listEnquiries');
    admissions('Query',    'getEnquiry');
    admissions('Query',    'listApplications');
    admissions('Query',    'getApplication');
    admissions('Query',    'getApprovalQueue');
    admissions('Query',    'getApplicationReviews');
    admissions('Query',    'admissionsStats');
    admissions('Mutation', 'createPublicEnquiry');
    admissions('Mutation', 'createEnquiry');
    admissions('Mutation', 'updateEnquiry');
    admissions('Mutation', 'deleteEnquiry');
    admissions('Mutation', 'checkDuplicate');
    admissions('Mutation', 'createApplication');
    admissions('Mutation', 'submitApplication');
    admissions('Mutation', 'reviewApplication');
    admissions('Mutation', 'withdrawApplication');
    admissions('Mutation', 'approveApplication');
    admissions('Mutation', 'rejectApplication');
    admissions('Mutation', 'verifyDocument');
    admissions('Mutation', 'getUploadUrl');

    // ── Finance resolvers ───────────────────────────────────────────────────
    const finance = R(financeDs);
    // Fee Categories
    finance('Query',    'listFeeCategories');
    finance('Query',    'getFeeCategory');
    // Fee Heads, Structures, Schedules
    finance('Query',    'listFeeHeads');
    finance('Query',    'getFeeHead');
    finance('Query',    'listFeeStructures');
    finance('Query',    'getFeeStructure');
    finance('Query',    'listFeeAssignments');
    finance('Query',    'getFeeAssignment');
    finance('Query',    'getStudentFeeAssignment');
    finance('Query',    'listFeeSchedules');
    finance('Query',    'listInstallmentPlans');
    // Invoices & Payments
    finance('Query',    'listInvoices');
    finance('Query',    'getInvoice');
    finance('Query',    'getStudentInvoices');
    finance('Query',    'listPayments');
    finance('Query',    'getPayment');
    finance('Query',    'getFeeRevisions');
    finance('Query',    'listReceipts');
    finance('Query',    'getReceipt');
    // Reports & Analytics
    finance('Query',    'dayBookReport');
    finance('Query',    'feeCollectionAnalytics');
    finance('Query',    'classFeeStats');
    finance('Query',    'studentFinancialSummary');
    finance('Query',    'getFeeAssignmentQueue');
    finance('Query',    'getAssignableFeeStructures');
    finance('Query',    'getStudentDues');
    // Fee Category mutations
    finance('Mutation', 'createFeeCategory');
    finance('Mutation', 'updateFeeCategory');
    finance('Mutation', 'deleteFeeCategory');
    // Fee Head mutations
    finance('Mutation', 'createFeeHead');
    finance('Mutation', 'updateFeeHead');
    finance('Mutation', 'deleteFeeHead');
    // Fee Structure & Schedule mutations
    finance('Mutation', 'createFeeStructure');
    finance('Mutation', 'updateFeeStructure');
    finance('Mutation', 'deleteFeeStructure');
    finance('Mutation', 'copyFeePatternToNextYear');
    finance('Mutation', 'createFeeAssignment');
    finance('Mutation', 'bulkAssignFeeStructure');
    finance('Mutation', 'createFeeSchedule');
    finance('Mutation', 'updateFeeSchedule');
    finance('Mutation', 'deleteFeeSchedule');
    finance('Mutation', 'addScheduleSlot');
    finance('Mutation', 'deleteScheduleSlot');
    finance('Mutation', 'createInstallmentPlan');
    finance('Mutation', 'updateInstallmentPlan');
    finance('Mutation', 'deleteInstallmentPlan');
    // Invoice mutations
    finance('Mutation', 'updateInvoice');
    finance('Mutation', 'cancelInvoice');
    finance('Mutation', 'reviseInvoice');
    finance('Mutation', 'createOneOffCharge');
    finance('Mutation', 'bulkCreateCharge');
    // Payment mutations
    finance('Mutation', 'recordPayment');
    finance('Mutation', 'createPaymentOrder');
    finance('Mutation', 'verifyPaymentSignature');
    finance('Mutation', 'collectPaymentByStudent');
    finance('Mutation', 'generatePaymentLink');

    // ── Academics resolvers ─────────────────────────────────────────────────
    const academics = R(academicsDs);
    academics('Query',    'listClasses');
    academics('Query',    'getClass');
    academics('Query',    'listAllSections');
    academics('Query',    'getSection');
    academics('Query',    'listSectionStudents');
    academics('Query',    'listSubjects');
    academics('Query',    'getSubject');
    academics('Query',    'listSectionCourses');
    academics('Query',    'listStudents');
    academics('Query',    'getStudent');
    academics('Query',    'listEnrollments');
    academics('Query',    'listRegistrationBatches');
    academics('Query',    'listRollNoBatches');
    academics('Query',    'listPromotionBatches');
    academics('Query',    'getPromotionBatch');
    academics('Query',    'listPromotionBatchItems');
    academics('Query',    'listAttendance');
    academics('Query',    'getSectionAttendance');
    academics('Query',    'getSectionAttendanceSummary');
    academics('Query',    'listExams');
    academics('Query',    'getExam');
    academics('Query',    'listResults');
    academics('Query',    'getExamResults');
    academics('Query',    'getSectionTimetable');
    academics('Query',    'getTeacherTimetable');
    academics('Query',    'getTeacherWorkload');
    academics('Query',    'listCertificates');
    academics('Mutation', 'createClass');
    academics('Mutation', 'updateClass');
    academics('Mutation', 'deleteClass');
    academics('Mutation', 'createSection');
    academics('Mutation', 'updateSection');
    academics('Mutation', 'deleteSection');
    academics('Mutation', 'setSectionIncharge');
    academics('Mutation', 'assignSectionCourse');
    academics('Mutation', 'removeSectionCourse');
    academics('Mutation', 'createSubject');
    academics('Mutation', 'updateSubject');
    academics('Mutation', 'deleteSubject');
    academics('Mutation', 'enrollStudent');
    academics('Mutation', 'updateStudent');
    academics('Mutation', 'updateStudentStatus');
    academics('Mutation', 'assignStudentClass');
    academics('Mutation', 'bulkAssignStudentsToClass');
    academics('Mutation', 'randomAssignStudentsToClass');
    academics('Mutation', 'convertApplicationToStudent');
    academics('Mutation', 'assignStudentToSection');
    academics('Mutation', 'transferStudentSection');
    academics('Mutation', 'generateRegistrationNumbers');
    academics('Mutation', 'freezeRegistrationNumbers');
    academics('Mutation', 'generateRollNumbers');
    academics('Mutation', 'freezeRollNumbers');
    academics('Mutation', 'promoteStudents');
    academics('Mutation', 'setStudentPromotionEligibility');
    academics('Mutation', 'markSectionAttendance');
    academics('Mutation', 'createExam');
    academics('Mutation', 'updateExam');
    academics('Mutation', 'deleteExam');
    academics('Mutation', 'enterMarks');
    academics('Mutation', 'publishResults');
    academics('Mutation', 'replaceSectionTimetable');
    academics('Mutation', 'issueCertificate');
    academics('Mutation', 'approveCertificate');

    // ── Settings resolvers ──────────────────────────────────────────────────
    const settings = R(settingsDs);
    settings('Query',    'listAcademicYears');
    settings('Query',    'getAcademicYear');
    settings('Query',    'listCampuses');
    settings('Query',    'getCampus');
    settings('Query',    'listPrograms');
    settings('Query',    'getProgram');
    settings('Query',    'listTemplates');
    settings('Query',    'getTemplate');
    settings('Query',    'getTenantFeatures');
    settings('Mutation', 'createAcademicYear');
    settings('Mutation', 'updateAcademicYear');
    settings('Mutation', 'setActiveAcademicYear');
    settings('Mutation', 'createCampus');
    settings('Mutation', 'updateCampus');
    settings('Mutation', 'deactivateCampus');
    settings('Mutation', 'createProgram');
    settings('Mutation', 'updateProgram');
    settings('Mutation', 'deleteProgram');
    settings('Mutation', 'createTemplate');
    settings('Mutation', 'updateTemplate');
    settings('Mutation', 'publishTemplateVersion');
    settings('Mutation', 'deleteTemplate');
    settings('Mutation', 'updateTenant');
    settings('Mutation', 'updateTenantFeatures');

    // ── Tenants (SUPER_ADMIN) resolvers ─────────────────────────────────────
    const tenants = R(tenantsDs);
    tenants('Query',    'listTenants');
    tenants('Query',    'getTenant');
    tenants('Mutation', 'createTenant');
    tenants('Mutation', 'deactivateTenant');

    // ── Dashboard resolvers ─────────────────────────────────────────────────
    const dashboard = R(settingsDs);
    dashboard('Query', 'dashboardOverview');
    dashboard('Query', 'superAdminOverview');
    dashboard('Query', 'platformStats');

    // ── Audit logs resolvers ────────────────────────────────────────────────
    const auditLogs = R(settingsDs);
    auditLogs('Query', 'listAuditLogs');
    auditLogs('Query', 'listPlatformAuditLogs');
    auditLogs('Query', 'getPlatformAuditLog');

    // ── Storage resolvers ───────────────────────────────────────────────────
    R(storageDs)('Mutation', 'generateUploadUrl');
    R(storageDs)('Query',    'generateDownloadUrl');

    // ── Comms resolvers ─────────────────────────────────────────────────────
    const comms = R(commsDs);
    comms('Query',    'listAnnouncements');
    comms('Query',    'getAnnouncement');
    comms('Query',    'listEvents');
    comms('Query',    'getEvent');
    comms('Query',    'listLeaveRequests');
    comms('Query',    'getLeaveRequest');
    comms('Mutation', 'createAnnouncement');
    comms('Mutation', 'updateAnnouncement');
    comms('Mutation', 'publishAnnouncement');
    comms('Mutation', 'archiveAnnouncement');
    comms('Mutation', 'deleteAnnouncement');
    comms('Mutation', 'createEvent');
    comms('Mutation', 'updateEvent');
    comms('Mutation', 'deleteEvent');
    comms('Mutation', 'createLeaveRequest');
    comms('Mutation', 'updateLeaveRequest');
    comms('Mutation', 'approveLeave');
    comms('Mutation', 'rejectLeave');
    comms('Mutation', 'cancelLeave');
    comms('Mutation', 'deleteLeaveRequest');

    // ── Results resolvers ───────────────────────────────────────────────────
    const results = R(resultsDs);
    results('Query',    'listResultBatches');
    results('Query',    'getResultBatch');
    results('Query',    'getPublicResult');
    results('Query',    'getResultPublicToken');
    results('Mutation', 'createResultBatch');
    results('Mutation', 'updateResultBatch');
    results('Mutation', 'publishResultBatch');
    results('Mutation', 'archiveResultBatch');
    results('Mutation', 'deleteResultBatch');

    // ── Identity extra resolvers ────────────────────────────────────────────
    users('Mutation', 'updateMyProfile');
    users('Mutation', 'uploadAvatar');
    users('Mutation', 'uploadTenantLogo');
    users('Mutation', 'resendInvite');
    users('Mutation', 'acceptInvite');

    // ── Academics extra resolvers ───────────────────────────────────────────
    academics('Query',    'getExamStats');
    academics('Query',    'getMarksStatus');
    academics('Query',    'getClassAttendance');
    academics('Query',    'getStudentAttendance');
    academics('Query',    'getAttendanceSummary');
    academics('Mutation', 'enablePortalAccess');
    academics('Mutation', 'enableStudentPortal');
    academics('Mutation', 'enableGuardianPortal');
    academics('Mutation', 'markClassAttendance');

    // ── Settings extra resolvers ────────────────────────────────────────────
    settings('Query',    'validateSubdomain');
    settings('Query',    'listAvailableFeatures');
    settings('Mutation', 'provisionTenant');
    settings('Mutation', 'requestTenantDeletion');
    settings('Mutation', 'confirmTenantDeletion');
    settings('Mutation', 'createFirstAdmin');
    settings('Mutation', 'finalizeOnboarding');
    settings('Mutation', 'finalizeTenant');
    settings('Mutation', 'resendTenantInvite');
    settings('Mutation', 'provisionTenantUser');
    settings('Mutation', 'deleteTenantUser');
    settings('Query',    'listTenantUsers');

    // ── Admin cleanup resolvers ─────────────────────────────────────────────
    const cleanup = R(cleanupDs);
    cleanup('Query',    'getDuplicateReport');
    cleanup('Query',    'getDuplicateEnquiryReport');
    cleanup('Query',    'getDuplicateStudentReport');
    cleanup('Mutation', 'runDeduplication');
    cleanup('Mutation', 'mergeEnquiries');
    cleanup('Mutation', 'mergeStudents');
    cleanup('Mutation', 'bulkDeleteInactiveEnquiries');

    // ── Outputs ─────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'ApiUrl', { value: this.apiUrl });
    new cdk.CfnOutput(this, 'ApiId',  { value: this.apiId });
    new cdk.CfnOutput(this, 'ApiArn', { value: this.api.arn });
  }
}
