/**
 * Generates the Vebgenix-API.postman_collection.json
 * Run: node postman/build-collection.js
 */
const fs = require('fs');
const path = require('path');

const STD_HEADERS = [
  { key: 'Authorization', value: '{{id_token}}' },
  { key: 'Content-Type',  value: 'application/json' },
  { key: 'x-tenant-id',  value: '{{tenant_id}}' },
];

function mkReq(name, gqlQuery, vars, testExec) {
  const bodyObj = vars ? { query: gqlQuery, variables: vars } : { query: gqlQuery };
  return {
    name,
    request: {
      method: 'POST',
      url: '{{appsync_url}}',
      header: STD_HEADERS,
      body: { mode: 'raw', raw: JSON.stringify(bodyObj, null, 2) },
    },
    event: testExec
      ? [{ listen: 'test', script: { type: 'text/javascript', exec: testExec } }]
      : [],
  };
}

function okTest(extra) {
  return [
    "pm.test('Status 200', () => pm.response.to.have.status(200));",
    ...(extra || []),
  ];
}

// ── Helper: parse AWSJSON-style response and optionally save an env var ────────
function parseAndSave(dataKey, envKey, logLabel) {
  const lines = [
    `const r = pm.response.json();`,
    `const raw = r.data && r.data['${dataKey}'];`,
    `pm.test('${dataKey} exists', () => pm.expect(raw).to.exist);`,
    `if (!raw) { console.error('No ${dataKey} in response:', JSON.stringify(r)); return; }`,
    `let d;`,
    `try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }`,
  ];
  if (envKey && logLabel) {
    lines.push(
      `const id = d && (d.id || d._id);`,
      `if (id) { pm.environment.set('${envKey}', id); console.log('${logLabel}:', id); }`,
      `pm.test('Has id', () => pm.expect(id).to.be.ok);`,
    );
  }
  return lines;
}

// ────────────────────────────────────────────────────────────────────────────────
// AUTH
// ────────────────────────────────────────────────────────────────────────────────
const AUTH = {
  name: '🔐 Auth (Cognito)',
  item: [
    {
      name: 'Get Token — User+Password',
      request: {
        method: 'POST',
        url: 'https://cognito-idp.{{cognito_region}}.amazonaws.com/',
        header: [
          { key: 'X-Amz-Target', value: 'AWSCognitoIdentityProviderService.InitiateAuth' },
          { key: 'Content-Type', value: 'application/x-amz-json-1.1' },
        ],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: '{{cognito_client_id}}',
            AuthParameters: {
              USERNAME: 'dhanushags08@gmaill.com',
              PASSWORD: 'Qwerty@1234',
            },
          }, null, 2),
        },
      },
      event: [{
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            "pm.test('Status 200', () => pm.response.to.have.status(200));",
            "const r = pm.response.json();",
            "const auth = r.AuthenticationResult;",
            "if (auth) {",
            "  pm.environment.set('access_token', auth.AccessToken);",
            "  pm.environment.set('id_token', auth.IdToken);",
            "  pm.environment.set('refresh_token', auth.RefreshToken);",
            "  console.log('✅ Tokens saved. IdToken prefix:', auth.IdToken.slice(0,40));",
            "} else {",
            "  console.error('❌ Auth failed:', JSON.stringify(r));",
            "  pm.test('AuthenticationResult present', () => pm.expect(auth).to.exist);",
            "}",
          ],
        },
      }],
    },
    {
      name: 'Refresh Token',
      request: {
        method: 'POST',
        url: 'https://cognito-idp.{{cognito_region}}.amazonaws.com/',
        header: [
          { key: 'X-Amz-Target', value: 'AWSCognitoIdentityProviderService.InitiateAuth' },
          { key: 'Content-Type', value: 'application/x-amz-json-1.1' },
        ],
        body: {
          mode: 'raw',
          raw: JSON.stringify({
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            ClientId: '{{cognito_client_id}}',
            AuthParameters: { REFRESH_TOKEN: '{{refresh_token}}' },
          }, null, 2),
        },
      },
      event: [{
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            "pm.test('Status 200', () => pm.response.to.have.status(200));",
            "const r = pm.response.json();",
            "const auth = r.AuthenticationResult;",
            "if (auth) {",
            "  pm.environment.set('access_token', auth.AccessToken);",
            "  pm.environment.set('id_token', auth.IdToken);",
            "  console.log('✅ Tokens refreshed.');",
            "}",
          ],
        },
      }],
    },
  ],
};

// ── SETTINGS ──────────────────────────────────────────────────────────────────
const SETTINGS = {
  name: '⚙️ Settings',
  item: [
    mkReq(
      'Create Academic Year',
      'mutation CreateAcademicYear($input: CreateAcademicYearInput!) { createAcademicYear(input: $input) { id name startDate endDate isActive } }',
      { input: { name: '2025-26', startDate: '2025-06-01', endDate: '2026-05-31' } },
      okTest([
        "const r = pm.response.json();",
        "const y = r.data && r.data.createAcademicYear;",
        "pm.test('createAcademicYear exists', () => pm.expect(y).to.exist);",
        "if (y && y.id) { pm.environment.set('academic_year_id', y.id); console.log('academic_year_id:', y.id); }",
      ])
    ),
    mkReq(
      'Set Active Academic Year',
      'mutation SetActiveAcademicYear($id: ID!) { setActiveAcademicYear(id: $id) { id name isActive } }',
      { id: '{{academic_year_id}}' },
      okTest([
        "const r = pm.response.json();",
        "const y = r.data && r.data.setActiveAcademicYear;",
        "pm.test('setActiveAcademicYear exists', () => pm.expect(y).to.exist);",
        "pm.test('isActive is true', () => pm.expect(y && y.isActive).to.be.true);",
      ])
    ),
    mkReq(
      'List Academic Years',
      'query { listAcademicYears { id name startDate endDate isActive } }',
      null,
      okTest([
        "const r = pm.response.json();",
        "const list = r.data && r.data.listAcademicYears;",
        "pm.test('listAcademicYears is array', () => pm.expect(list).to.be.an('array'));",
        "if (list && list.length > 0) {",
        "  pm.environment.set('academic_year_id', list[0].id);",
        "  console.log('academic_year_id (from list):', list[0].id, list[0].name);",
        "}",
      ])
    ),
    mkReq(
      'Create Campus',
      'mutation CreateCampus($input: AWSJSON!) { createCampus(input: $input) }',
      { input: JSON.stringify({ name: 'Main Campus', code: 'MAIN', type: 'SCHOOL' }) },
      okTest([
        ...parseAndSave('createCampus', 'campus_id', 'campus_id'),
      ])
    ),
    mkReq(
      'List Campuses',
      'query { listCampuses { id name code type isActive } }',
      null,
      okTest([
        "const r = pm.response.json();",
        "const list = r.data && r.data.listCampuses;",
        "pm.test('listCampuses is array', () => pm.expect(list).to.be.an('array'));",
        "if (list && list.length > 0 && !pm.environment.get('campus_id')) {",
        "  pm.environment.set('campus_id', list[0].id);",
        "  console.log('campus_id (from list):', list[0].id);",
        "}",
      ])
    ),
    mkReq(
      'Create Program',
      'mutation CreateProgram($input: AWSJSON!) { createProgram(input: $input) }',
      { input: JSON.stringify({ name: 'School Program', code: 'SCH', type: 'SCHOOL', durationYears: 12 }) },
      okTest([
        ...parseAndSave('createProgram', 'program_id', 'program_id'),
      ])
    ),
    mkReq(
      'List Programs',
      'query { listPrograms { id name code type } }',
      null,
      okTest([
        "const r = pm.response.json();",
        "const list = r.data && r.data.listPrograms;",
        "pm.test('listPrograms is array', () => pm.expect(list).to.be.an('array'));",
        "if (list && list.length > 0 && !pm.environment.get('program_id')) {",
        "  pm.environment.set('program_id', list[0].id);",
        "}",
      ])
    ),
    mkReq(
      'Dashboard Overview',
      'query DashboardOverview { dashboardOverview }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('dashboardOverview exists', () => pm.expect(r.data && r.data.dashboardOverview).to.exist);",
      ])
    ),
    mkReq(
      'Get Tenant Features',
      'query { getTenantFeatures }',
      null,
      okTest([
        "pm.test('getTenantFeatures exists', () => pm.expect(pm.response.json().data && pm.response.json().data.getTenantFeatures).to.exist);",
      ])
    ),
    mkReq(
      'Update Tenant Features',
      'mutation UpdateTenantFeatures($input: AWSJSON!) { updateTenantFeatures(input: $input) }',
      { input: JSON.stringify({ admissions: true, finance: true, academics: true, communications: true }) },
      okTest([
        "pm.test('No errors', () => pm.expect(pm.response.json().errors).to.be.undefined);",
      ])
    ),
    mkReq(
      'List Audit Logs',
      'query { listAuditLogs(limit: 20) }',
      null,
      okTest([
        "pm.test('listAuditLogs exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'List Templates',
      'query { listTemplates }',
      null,
      okTest([
        "pm.test('listTemplates exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
  ],
};

// ── IDENTITY ──────────────────────────────────────────────────────────────────
const IDENTITY = {
  name: '👤 Identity',
  item: [
    mkReq(
      'Me (current user)',
      'query { me }',
      null,
      okTest([
        "const r = pm.response.json();",
        "const raw = r.data && r.data.me;",
        "pm.test('me exists', () => pm.expect(raw).to.exist);",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d && d.userId) console.log('userId:', d.userId);",
        "if (d && d.membership && d.membership.tenantId && !pm.environment.get('tenant_id')) {",
        "  pm.environment.set('tenant_id', d.membership.tenantId);",
        "  console.log('tenant_id:', d.membership.tenantId);",
        "}",
      ])
    ),
    mkReq(
      'List Users',
      'query { listUsers }',
      null,
      okTest([
        "pm.test('listUsers exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Invite Staff',
      'mutation InviteStaff($input: AWSJSON!) { inviteStaff(input: $input) }',
      { input: JSON.stringify({ email: 'teacher@example.com', role: 'TEACHER', campusId: '{{campus_id}}', firstName: 'Test', lastName: 'Teacher' }) },
      okTest([
        "const r = pm.response.json();",
        "pm.test('inviteStaff exists', () => pm.expect(r.data).to.exist);",
        "if (r.errors) console.warn('Errors:', JSON.stringify(r.errors));",
      ])
    ),
  ],
};

// ── ADMISSIONS ────────────────────────────────────────────────────────────────
const ADMISSIONS = {
  name: '🎓 Admissions',
  item: [
    mkReq(
      'Create Enquiry',
      'mutation CreateEnquiry($input: AWSJSON!) { createEnquiry(input: $input) }',
      { input: JSON.stringify({ studentName: 'Rahul Sharma', phone: '9876543210', email: 'rahul@example.com', campusId: '{{campus_id}}', academicYearId: '{{academic_year_id}}', source: 'WALK_IN' }) },
      okTest([
        "pm.test('createEnquiry exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'List Enquiries',
      'query { listEnquiries }',
      null,
      okTest([
        "pm.test('listEnquiries exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'List Applications',
      'query { listApplications }',
      null,
      okTest([
        "pm.test('listApplications exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Admissions Stats',
      'query { admissionsStats }',
      null,
      okTest([
        "pm.test('admissionsStats exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
  ],
};

// ── FINANCE ───────────────────────────────────────────────────────────────────
const FEE_CATEGORIES = {
  name: 'Fee Categories',
  item: [
    mkReq(
      'Create Fee Category',
      'mutation CreateFeeCategory($input: AWSJSON!) { createFeeCategory(input: $input) }',
      { input: JSON.stringify({ name: 'General Fees', moduleType: 'FEE', feeType: 'GENERAL', invoicePrefix: 'GF/INV', receiptPrefix: 'GF/REC', defaultAllocationMethod: 'PRO_RATA' }) },
      okTest([
        ...parseAndSave('createFeeCategory', 'fee_category_id', 'fee_category_id'),
      ])
    ),
    mkReq(
      'Get Fee Category',
      'query GetFeeCategory($id: ID!) { getFeeCategory(id: $id) }',
      { id: '{{fee_category_id}}' },
      okTest([
        "pm.test('getFeeCategory exists', () => pm.expect(pm.response.json().data && pm.response.json().data.getFeeCategory).to.exist);",
      ])
    ),
    mkReq(
      'Update Fee Category',
      'mutation UpdateFeeCategory($id: ID!, $input: AWSJSON!) { updateFeeCategory(id: $id, input: $input) }',
      { id: '{{fee_category_id}}', input: JSON.stringify({ defaultAllocationMethod: 'PRO_RATA' }) },
      okTest([
        "pm.test('No errors', () => pm.expect(pm.response.json().errors).to.be.undefined);",
      ])
    ),
    mkReq(
      'List Fee Categories',
      'query { listFeeCategories }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listFeeCategories exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.listFeeCategories;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list) && list.length > 0 && !pm.environment.get('fee_category_id')) {",
        "  pm.environment.set('fee_category_id', list[0].id || list[0]._id);",
        "}",
      ])
    ),
    mkReq(
      'Delete Fee Category',
      'mutation DeleteFeeCategory($id: ID!) { deleteFeeCategory(id: $id) }',
      { id: '{{fee_category_id}}' },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
      ])
    ),
  ],
};

const FEE_HEADS = {
  name: 'Fee Heads',
  item: [
    mkReq(
      'Create Fee Head',
      'mutation CreateFeeHead($input: AWSJSON!) { createFeeHead(input: $input) }',
      { input: JSON.stringify({ name: 'Tuition Fee', prefix: 'TF', type: 'RECURRING', feeCategoryId: '{{fee_category_id}}', isMandatory: true, isRefundable: false, priorityOrder: 1 }) },
      okTest([
        ...parseAndSave('createFeeHead', 'fee_head_id', 'fee_head_id'),
      ])
    ),
    mkReq(
      'Update Fee Head',
      'mutation UpdateFeeHead($id: ID!, $input: AWSJSON!) { updateFeeHead(id: $id, input: $input) }',
      { id: '{{fee_head_id}}', input: JSON.stringify({ priorityOrder: 1 }) },
      okTest([
        "pm.test('No errors', () => pm.expect(pm.response.json().errors).to.be.undefined);",
      ])
    ),
    mkReq(
      'List Fee Heads',
      'query { listFeeHeads }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listFeeHeads exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.listFeeHeads;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list) && list.length > 0 && !pm.environment.get('fee_head_id')) {",
        "  pm.environment.set('fee_head_id', list[0].id || list[0]._id);",
        "}",
      ])
    ),
    mkReq(
      'Delete Fee Head',
      'mutation DeleteFeeHead($id: ID!) { deleteFeeHead(id: $id) }',
      { id: '{{fee_head_id}}' },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
      ])
    ),
  ],
};

const FEE_SCHEDULES = {
  name: 'Fee Schedules',
  item: [
    mkReq(
      'Create Fee Schedule',
      'mutation CreateFeeSchedule($input: AWSJSON!) { createFeeSchedule(input: $input) }',
      { input: JSON.stringify({ name: 'Annual Plan 2025-26', academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}', feeCategoryId: '{{fee_category_id}}', collectionType: 'PARTIAL_ALLOWED', allowPartialPayment: true, graceDays: 5, slots: [{ name: 'Term 1', dueDate: '2025-07-31', percentOfTotal: 50 }, { name: 'Term 2', dueDate: '2025-12-31', percentOfTotal: 50 }] }) },
      okTest([
        ...parseAndSave('createFeeSchedule', 'fee_schedule_id', 'fee_schedule_id'),
      ])
    ),
    mkReq(
      'Update Fee Schedule',
      'mutation UpdateFeeSchedule($id: ID!, $input: AWSJSON!) { updateFeeSchedule(id: $id, input: $input) }',
      { id: '{{fee_schedule_id}}', input: JSON.stringify({ graceDays: 7 }) },
      okTest([
        "pm.test('No errors', () => pm.expect(pm.response.json().errors).to.be.undefined);",
      ])
    ),
    mkReq(
      'List Fee Schedules',
      'query { listFeeSchedules }',
      null,
      okTest([
        "pm.test('listFeeSchedules exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Delete Fee Schedule',
      'mutation DeleteFeeSchedule($id: ID!) { deleteFeeSchedule(id: $id) }',
      { id: '{{fee_schedule_id}}' },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
      ])
    ),
  ],
};

const FEE_STRUCTURES = {
  name: 'Fee Structures',
  item: [
    mkReq(
      'Create Fee Structure',
      'mutation CreateFeeStructure($input: AWSJSON!) { createFeeStructure(input: $input) }',
      { input: JSON.stringify({ name: 'Grade 10 Annual Fee 2025-26', campusId: '{{campus_id}}', academicYearId: '{{academic_year_id}}', classId: '{{class_id}}', feeCategoryId: '{{fee_category_id}}', feeScheduleId: '{{fee_schedule_id}}', allocationMethod: 'PRO_RATA', components: [{ feeHeadId: '{{fee_head_id}}', feeHeadName: 'Tuition Fee', amount: 50000, isOptional: false, priorityOrder: 1 }] }) },
      okTest([
        ...parseAndSave('createFeeStructure', 'fee_structure_id', 'fee_structure_id'),
      ])
    ),
    mkReq(
      'Get Fee Structure',
      'query GetFeeStructure($id: ID!) { getFeeStructure(id: $id) }',
      { id: '{{fee_structure_id}}' },
      okTest([
        "pm.test('getFeeStructure exists', () => pm.expect(pm.response.json().data && pm.response.json().data.getFeeStructure).to.exist);",
      ])
    ),
    mkReq(
      'Update Fee Structure',
      'mutation UpdateFeeStructure($id: ID!, $input: AWSJSON!) { updateFeeStructure(id: $id, input: $input) }',
      { id: '{{fee_structure_id}}', input: JSON.stringify({ name: 'Grade 10 Annual Fee 2025-26' }) },
      okTest([
        "pm.test('No errors', () => pm.expect(pm.response.json().errors).to.be.undefined);",
      ])
    ),
    mkReq(
      'List Fee Structures',
      'query { listFeeStructures(academicYearId: "{{academic_year_id}}") }',
      null,
      okTest([
        "pm.test('listFeeStructures exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Copy Fee Pattern to Next Year',
      'mutation CopyFeePattern($input: AWSJSON!) { copyFeePattern(input: $input) }',
      { input: JSON.stringify({ fromAcademicYearId: '{{academic_year_id}}', toAcademicYearId: '{{to_academic_year_id}}', campusId: '{{campus_id}}' }) },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
      ])
    ),
    mkReq(
      'Delete Fee Structure',
      'mutation DeleteFeeStructure($id: ID!) { deleteFeeStructure(id: $id) }',
      { id: '{{fee_structure_id}}' },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
      ])
    ),
  ],
};

const FEE_ASSIGNMENTS = {
  name: 'Fee Assignments',
  item: [
    mkReq(
      'Get Fee Assignment Queue',
      'query { getFeeAssignmentQueue(academicYearId: "{{academic_year_id}}", campusId: "{{campus_id}}") }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('getFeeAssignmentQueue exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.getFeeAssignmentQueue;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "console.log('Unassigned students count:', Array.isArray(list) ? list.length : 'N/A');",
      ])
    ),
    mkReq(
      'Assign Fee Structure',
      'mutation CreateFeeAssignment($input: AWSJSON!) { createFeeAssignment(input: $input) }',
      { input: JSON.stringify({ studentId: '{{student_id}}', feeStructureId: '{{fee_structure_id}}', academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}' }) },
      okTest([
        ...parseAndSave('createFeeAssignment', 'fee_assignment_id', 'fee_assignment_id'),
      ])
    ),
    mkReq(
      'Get Student Fee Assignment',
      'query GetStudentFeeAssignment($studentId: ID!, $academicYearId: ID!) { getStudentFeeAssignment(studentId: $studentId, academicYearId: $academicYearId) }',
      { studentId: '{{student_id}}', academicYearId: '{{academic_year_id}}' },
      okTest([
        "pm.test('getStudentFeeAssignment exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Bulk Assign Fee Structure',
      'mutation BulkAssignFeeStructure($input: AWSJSON!) { bulkAssignFeeStructure(input: $input) }',
      { input: JSON.stringify({ studentIds: ['{{student_id}}'], feeStructureId: '{{fee_structure_id}}', academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}' }) },
      okTest([
        "const r = pm.response.json();",
        "pm.test('bulkAssignFeeStructure exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.bulkAssignFeeStructure;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('Bulk assign — succeeded:', d.succeeded, 'failed:', d.failed, 'total:', d.total);",
      ])
    ),
    mkReq(
      'List Fee Assignments',
      'query { listFeeAssignments(academicYearId: "{{academic_year_id}}") }',
      null,
      okTest([
        "pm.test('listFeeAssignments exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Get Fee Assignment',
      'query GetFeeAssignment($id: ID!) { getFeeAssignment(id: $id) }',
      { id: '{{fee_assignment_id}}' },
      okTest([
        "pm.test('getFeeAssignment exists', () => pm.expect(pm.response.json().data && pm.response.json().data.getFeeAssignment).to.exist);",
      ])
    ),
  ],
};

const INVOICES = {
  name: 'Invoices',
  item: [
    mkReq(
      'Get Student Invoices',
      'query { getStudentInvoices(studentId: "{{student_id}}") }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('getStudentInvoices exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.getStudentInvoices;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "pm.test('Returns array', () => pm.expect(list).to.be.an('array'));",
        "if (Array.isArray(list) && list.length > 0) {",
        "  const inv = list[0];",
        "  const iid = inv.id || inv._id;",
        "  pm.environment.set('invoice_id', iid);",
        "  console.log('invoice_id:', iid, '| status:', inv.status, '| dueAmount:', inv.dueAmount);",
        "}",
      ])
    ),
    mkReq(
      'List Invoices',
      'query { listInvoices(academicYearId: "{{academic_year_id}}") }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listInvoices exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.listInvoices;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list) && list.length > 0 && !pm.environment.get('invoice_id')) {",
        "  pm.environment.set('invoice_id', list[0].id || list[0]._id);",
        "}",
      ])
    ),
    mkReq(
      'Get Invoice',
      'query GetInvoice($id: ID!) { getInvoice(id: $id) }',
      { id: '{{invoice_id}}' },
      okTest([
        "pm.test('getInvoice exists', () => pm.expect(pm.response.json().data && pm.response.json().data.getInvoice).to.exist);",
      ])
    ),
    mkReq(
      'Student Dues',
      'query { getStudentDues(studentId: "{{student_id}}") }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('getStudentDues exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.getStudentDues;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('Total due:', d.totalDue, '| Invoice count:', d.invoices && d.invoices.length);",
      ])
    ),
    mkReq(
      'Create One-off Charge',
      'mutation CreateOneOffCharge($input: AWSJSON!) { createOneOffCharge(input: $input) }',
      { input: JSON.stringify({ studentId: '{{student_id}}', campusId: '{{campus_id}}', academicYearId: '{{academic_year_id}}', classId: '{{class_id}}', amount: 500, description: 'Library fine', feeHeadId: '{{fee_head_id}}', feeHeadName: 'Tuition Fee' }) },
      okTest([
        "pm.test('createOneOffCharge exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Revise Invoice',
      'mutation ReviseInvoice($id: ID!, $input: AWSJSON!) { reviseInvoice(id: $id, input: $input) }',
      { id: '{{invoice_id}}', input: JSON.stringify({ newAmount: 48000, reason: 'Scholarship discount applied' }) },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
      ])
    ),
    mkReq(
      'Cancel Invoice',
      'mutation CancelInvoice($id: ID!, $reason: String) { cancelInvoice(id: $id, reason: $reason) }',
      { id: '{{invoice_id}}', reason: 'Cancelled for testing' },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
      ])
    ),
  ],
};

const PAYMENTS = {
  name: 'Payments',
  item: [
    mkReq(
      'Record Payment (Cash / Cheque / UPI)',
      'mutation RecordPayment($input: AWSJSON!) { recordPayment(input: $input) }',
      { input: JSON.stringify({ invoiceId: '{{invoice_id}}', studentId: '{{student_id}}', campusId: '{{campus_id}}', amount: 10000, method: 'CASH', remarks: 'Partial payment — Term 1' }) },
      okTest([
        "const r = pm.response.json();",
        "const raw = r.data && r.data.recordPayment;",
        "pm.test('recordPayment exists', () => pm.expect(raw).to.exist);",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "const pid = d && d.payment && (d.payment._id || d.payment.id);",
        "if (pid) { pm.environment.set('payment_id', pid); console.log('payment_id:', pid); }",
        "pm.test('Has payment', () => pm.expect(d && d.payment).to.exist);",
        "if (d && d.receiptNumber) { pm.environment.set('receipt_id', pid); console.log('Receipt#:', d.receiptNumber); }",
      ])
    ),
    mkReq(
      'Record Payment — Manual Allocation',
      'mutation RecordPayment($input: AWSJSON!) { recordPayment(input: $input) }',
      { input: JSON.stringify({ invoiceId: '{{invoice_id}}', studentId: '{{student_id}}', campusId: '{{campus_id}}', amount: 5000, method: 'UPI', referenceNumber: 'UPI123456', allocationMode: 'MANUAL', remarks: 'UPI payment — manual allocation' }) },
      okTest([
        "pm.test('No errors', () => pm.expect(pm.response.json().errors).to.be.undefined);",
      ])
    ),
    mkReq(
      'Collect Payment By Student',
      'mutation CollectPaymentByStudent($studentId: ID!, $input: AWSJSON!) { collectPaymentByStudent(studentId: $studentId, input: $input) }',
      { studentId: '{{student_id}}', input: JSON.stringify({ amount: 5000, method: 'CASH', remarks: 'Bulk collect across all outstanding invoices' }) },
      okTest([
        "const r = pm.response.json();",
        "pm.test('collectPaymentByStudent exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.collectPaymentByStudent;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('totalCollected:', d.totalCollected, '| remainingAmount:', d.remainingAmount, '| payments:', d.payments && d.payments.length);",
      ])
    ),
    mkReq(
      'List Payments',
      'query { listPayments(studentId: "{{student_id}}") }',
      null,
      okTest([
        "pm.test('listPayments exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Get Payment',
      'query GetPayment($id: ID!) { getPayment(id: $id) }',
      { id: '{{payment_id}}' },
      okTest([
        "pm.test('getPayment exists', () => pm.expect(pm.response.json().data && pm.response.json().data.getPayment).to.exist);",
      ])
    ),
    mkReq(
      'List Receipts',
      'query { listReceipts(studentId: "{{student_id}}") }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listReceipts exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.listReceipts;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list) && list.length > 0) {",
        "  pm.environment.set('receipt_id', list[0].id || list[0]._id);",
        "  console.log('receipt_id:', list[0].id || list[0]._id);",
        "}",
      ])
    ),
    mkReq(
      'Get Receipt',
      'query GetReceipt($id: ID!) { getReceipt(id: $id) }',
      { id: '{{receipt_id}}' },
      okTest([
        "pm.test('getReceipt exists', () => pm.expect(pm.response.json().data && pm.response.json().data.getReceipt).to.exist);",
      ])
    ),
    mkReq(
      'Create Razorpay Order',
      'mutation CreatePaymentOrder($input: AWSJSON!) { createPaymentOrder(input: $input) }',
      { input: JSON.stringify({ invoiceId: '{{invoice_id}}' }) },
      okTest([
        "const r = pm.response.json();",
        "pm.test('createPaymentOrder exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.createPaymentOrder;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d && d.orderId) console.log('Razorpay orderId:', d.orderId, '| amount:', d.amount);",
      ])
    ),
    mkReq(
      'Verify Razorpay Signature',
      'mutation VerifyPaymentSignature($input: AWSJSON!) { verifyPaymentSignature(input: $input) }',
      { input: JSON.stringify({ razorpayOrderId: 'order_test_id', razorpayPaymentId: 'pay_test_id', razorpaySignature: 'test_signature' }) },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
        "console.log('Response:', JSON.stringify(pm.response.json()).slice(0,200));",
      ])
    ),
    mkReq(
      'List Allocations by Payment',
      'query { listPaymentAllocations(paymentId: "{{payment_id}}") }',
      null,
      okTest([
        "pm.test('listPaymentAllocations exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
  ],
};

const REPORTS = {
  name: 'Reports',
  item: [
    mkReq(
      'Day Book',
      'query { dayBook(from: "2025-06-01", to: "2025-12-31", campusId: "{{campus_id}}") }',
      null,
      okTest([
        "pm.test('dayBook exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Fee Collection Analytics',
      'query { feeCollectionAnalytics(academicYearId: "{{academic_year_id}}", campusId: "{{campus_id}}") }',
      null,
      okTest([
        "pm.test('feeCollectionAnalytics exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
  ],
};

const FINANCE = {
  name: '💰 Finance',
  item: [FEE_CATEGORIES, FEE_HEADS, FEE_SCHEDULES, FEE_STRUCTURES, FEE_ASSIGNMENTS, INVOICES, PAYMENTS, REPORTS],
};

// ── ACADEMICS ─────────────────────────────────────────────────────────────────
const CLASSES_FOLDER = {
  name: 'Classes',
  item: [
    mkReq(
      'Create Class',
      'mutation CreateClass($input: AWSJSON!) { createClass(input: $input) }',
      { input: JSON.stringify({ name: 'Grade 10', code: 'G10', campusId: '{{campus_id}}', academicYearId: '{{academic_year_id}}', programId: '{{program_id}}' }) },
      okTest([
        ...parseAndSave('createClass', 'class_id', 'class_id'),
      ])
    ),
    mkReq(
      'List Classes',
      'query { listClasses(academicYearId: "{{academic_year_id}}") }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listClasses exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.listClasses;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list) && list.length > 0 && !pm.environment.get('class_id')) {",
        "  pm.environment.set('class_id', list[0].id || list[0]._id);",
        "  console.log('class_id (from list):', list[0].id || list[0]._id);",
        "}",
      ])
    ),
    mkReq(
      'Create Section',
      'mutation CreateSection($classId: ID!, $input: AWSJSON!) { createSection(classId: $classId, input: $input) }',
      { classId: '{{class_id}}', input: JSON.stringify({ name: 'A', academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}', capacity: 40 }) },
      okTest([
        ...parseAndSave('createSection', 'section_id', 'section_id'),
      ])
    ),
    mkReq(
      'List Sections',
      'query { listAllSections(classId: "{{class_id}}", academicYearId: "{{academic_year_id}}") }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listAllSections exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.listAllSections;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list) && list.length > 0 && !pm.environment.get('section_id')) {",
        "  pm.environment.set('section_id', list[0].id || list[0]._id);",
        "  console.log('section_id (from list):', list[0].id || list[0]._id);",
        "}",
      ])
    ),
  ],
};

const STUDENTS_FOLDER = {
  name: 'Students',
  item: [
    mkReq(
      'Enroll Student',
      'mutation EnrollStudent($input: AWSJSON!) { enrollStudent(input: $input) }',
      { input: JSON.stringify({ firstName: 'Arjun', lastName: 'Kumar', dateOfBirth: '2010-03-15', gender: 'MALE', phone: '9876543210', campusId: '{{campus_id}}', academicYearId: '{{academic_year_id}}', classId: '{{class_id}}', sectionId: '{{section_id}}', guardians: [{ name: 'Ravi Kumar', relation: 'Father', phone: '9876543211' }] }) },
      okTest([
        "const r = pm.response.json();",
        "const raw = r.data && r.data.enrollStudent;",
        "pm.test('enrollStudent exists', () => pm.expect(raw).to.exist);",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "const sid = d && (d.id || d._id || (d.student && (d.student.id || d.student._id)));",
        "if (sid) { pm.environment.set('student_id', sid); console.log('student_id:', sid); }",
        "pm.test('Has student result', () => pm.expect(d).to.exist);",
      ])
    ),
    mkReq(
      'Get Student',
      'query GetStudent($id: ID!) { getStudent(id: $id) }',
      { id: '{{student_id}}' },
      okTest([
        "pm.test('getStudent exists', () => pm.expect(pm.response.json().data && pm.response.json().data.getStudent).to.exist);",
      ])
    ),
    mkReq(
      'Update Student',
      'mutation UpdateStudent($studentId: ID!, $input: AWSJSON!) { updateStudent(studentId: $studentId, input: $input) }',
      { studentId: '{{student_id}}', input: JSON.stringify({ phone: '9876543212' }) },
      okTest([
        "pm.test('No errors', () => pm.expect(pm.response.json().errors).to.be.undefined);",
      ])
    ),
    mkReq(
      'Assign Student to Class',
      'mutation AssignStudentClass($studentId: ID!, $input: AWSJSON!) { assignStudentClass(studentId: $studentId, input: $input) }',
      { studentId: '{{student_id}}', input: JSON.stringify({ classId: '{{class_id}}', sectionId: '{{section_id}}', academicYearId: '{{academic_year_id}}' }) },
      okTest([
        "pm.test('No errors', () => pm.expect(pm.response.json().errors).to.be.undefined);",
      ])
    ),
    mkReq(
      'Update Student Status',
      'mutation UpdateStudentStatus($studentId: ID!, $status: String!) { updateStudentStatus(studentId: $studentId, status: $status) }',
      { studentId: '{{student_id}}', status: 'ACTIVE' },
      okTest([
        "pm.test('No errors', () => pm.expect(pm.response.json().errors).to.be.undefined);",
      ])
    ),
    mkReq(
      'List Students',
      'query { listStudents }',
      null,
      okTest([
        "pm.test('listStudents exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
  ],
};

const ATTENDANCE = {
  name: 'Attendance',
  item: [
    mkReq(
      'Mark Class Attendance',
      'mutation MarkSectionAttendance($input: BulkAttendanceInput!) { markSectionAttendance(input: $input) { studentId status } }',
      { input: { sectionId: '{{section_id}}', date: new Date().toISOString().split('T')[0], records: [{ studentId: '{{student_id}}', status: 'PRESENT' }] } },
      okTest([
        "pm.test('markSectionAttendance exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Get Class Attendance',
      'query GetSectionAttendance($sectionId: ID!, $date: AWSDate!) { getSectionAttendance(sectionId: $sectionId, date: $date) { studentId status } }',
      { sectionId: '{{section_id}}', date: new Date().toISOString().split('T')[0] },
      okTest([
        "pm.test('getSectionAttendance exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
  ],
};

const EXAMS_FOLDER = {
  name: 'Exams & Results',
  item: [
    mkReq(
      'Create Exam',
      'mutation CreateExam($input: AWSJSON!) { createExam(input: $input) }',
      { input: JSON.stringify({ name: 'Term 1 Exam 2025', classId: '{{class_id}}', sectionId: '{{section_id}}', academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}', date: '2025-10-15', maxMarks: 100 }) },
      okTest([
        ...parseAndSave('createExam', 'exam_id', 'exam_id'),
      ])
    ),
    mkReq(
      'List Exams',
      'query { listExams(academicYearId: "{{academic_year_id}}") }',
      null,
      okTest([
        "pm.test('listExams exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Publish Results',
      'mutation PublishResults($examId: ID!) { publishResults(examId: $examId) }',
      { examId: '{{exam_id}}' },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
      ])
    ),
  ],
};

const PROMOTIONS_FOLDER = {
  name: 'Promotions',
  item: [
    mkReq(
      'Set Promotion Eligibility',
      'mutation SetStudentPromotionEligibility($input: AWSJSON!) { setStudentPromotionEligibility(input: $input) }',
      { input: JSON.stringify({ academicYearId: '{{academic_year_id}}', updates: [{ studentId: '{{student_id}}', eligibility: 'ELIGIBLE' }] }) },
      okTest([
        "const r = pm.response.json();",
        "pm.test('setStudentPromotionEligibility exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.setStudentPromotionEligibility;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('Updated:', d.updated, 'students set to ELIGIBLE');",
      ])
    ),
    mkReq(
      'Promote Students',
      'mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }',
      { input: JSON.stringify({ fromAcademicYearId: '{{academic_year_id}}', toAcademicYearId: '{{to_academic_year_id}}', campusId: '{{campus_id}}', fromGradeId: '{{class_id}}', toGradeId: '{{to_class_id}}', studentIds: ['{{student_id}}'], sectionStrategy: 'SAME_SECTION', eligibilityMode: 'USE_ENROLLMENT_ELIGIBILITY', feeAction: 'SKIP' }) },
      okTest([
        "const r = pm.response.json();",
        "const raw = r.data && r.data.promoteStudents;",
        "pm.test('promoteStudents exists', () => pm.expect(raw).to.exist);",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d && d.batch && (d.batch.id || d.batch._id)) {",
        "  const batchId = d.batch.id || d.batch._id;",
        "  pm.environment.set('promotion_batch_id', batchId);",
        "  console.log('promotion_batch_id:', batchId);",
        "}",
        "pm.test('Has batch', () => pm.expect(d && d.batch).to.exist);",
        "pm.test('promotedCount >= 0', () => pm.expect(d && d.promotedCount).to.be.at.least(0));",
        "console.log('Promoted:', d && d.promotedCount, '| Detained:', d && d.detainedCount, '| Skipped:', d && d.skippedCount, '| Failed:', d && d.failedCount);",
      ])
    ),
    mkReq(
      'List Promotion Batches',
      'query { listPromotionBatches(fromAcademicYearId: "{{academic_year_id}}") }',
      null,
      okTest([
        "pm.test('listPromotionBatches exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Get Promotion Batch',
      'query GetPromotionBatch($id: ID!) { getPromotionBatch(id: $id) }',
      { id: '{{promotion_batch_id}}' },
      okTest([
        "pm.test('getPromotionBatch exists', () => pm.expect(pm.response.json().data && pm.response.json().data.getPromotionBatch).to.exist);",
      ])
    ),
    mkReq(
      'List Promotion Batch Items',
      'query { listPromotionBatchItems(id: "{{promotion_batch_id}}") }',
      null,
      okTest([
        "pm.test('listPromotionBatchItems exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
  ],
};

const ACADEMICS = {
  name: '📚 Academics',
  item: [CLASSES_FOLDER, STUDENTS_FOLDER, ATTENDANCE, EXAMS_FOLDER, PROMOTIONS_FOLDER],
};

// ── COMMS ────────────────────────────────────────────────────────────────────
const COMMS = {
  name: '📢 Comms',
  item: [
    mkReq(
      'Create Announcement',
      'mutation CreateAnnouncement($input: AWSJSON!) { createAnnouncement(input: $input) }',
      { input: JSON.stringify({ title: 'School Notice — Test', content: 'This is a test announcement.', campusId: '{{campus_id}}', targetAudience: 'ALL' }) },
      okTest([
        "pm.test('createAnnouncement exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'List Announcements',
      'query { listAnnouncements }',
      null,
      okTest([
        "pm.test('listAnnouncements exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'List Events',
      'query { listEvents }',
      null,
      okTest([
        "pm.test('listEvents exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'List Leave Requests',
      'query { listLeaveRequests }',
      null,
      okTest([
        "pm.test('listLeaveRequests exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
  ],
};

// ── STORAGE ──────────────────────────────────────────────────────────────────
const STORAGE = {
  name: '📁 Storage',
  item: [
    mkReq(
      'Get Upload URL',
      'mutation GenerateUploadUrl($input: AWSJSON!) { getUploadUrl(input: $input) }',
      { input: JSON.stringify({ fileName: 'test-document.pdf', contentType: 'application/pdf', folder: 'documents' }) },
      okTest([
        "pm.test('getUploadUrl exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Get Download URL',
      'mutation GenerateDownloadUrl($input: AWSJSON!) { getDownloadUrl(input: $input) }',
      { input: JSON.stringify({ key: 'documents/test-document.pdf' }) },
      okTest([
        "pm.test('getDownloadUrl exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
  ],
};

// ── RESULTS ──────────────────────────────────────────────────────────────────
const RESULTS_FOLDER = {
  name: '📊 Results',
  item: [
    mkReq(
      'Create Result Batch',
      'mutation CreateResultBatch($input: AWSJSON!) { createResultBatch(input: $input) }',
      { input: JSON.stringify({ examId: '{{exam_id}}', classId: '{{class_id}}', sectionId: '{{section_id}}', academicYearId: '{{academic_year_id}}' }) },
      okTest([
        "pm.test('createResultBatch exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'List Result Batches',
      'query { listResultBatches(academicYearId: "{{academic_year_id}}") }',
      null,
      okTest([
        "pm.test('listResultBatches exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    {
      name: 'Get Public Result (no auth)',
      request: {
        method: 'POST',
        url: '{{appsync_url}}',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: { mode: 'raw', raw: JSON.stringify({ query: 'query GetPublicResult($token: String!) { getPublicResult(token: $token) }', variables: { token: 'sample_result_token' } }, null, 2) },
      },
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);"]) } }],
    },
  ],
};

// ── AUDIT ────────────────────────────────────────────────────────────────────
const AUDIT = {
  name: '🔍 Audit & Cleanup',
  item: [
    mkReq(
      'List Audit Logs',
      'query { listAuditLogs(limit: 20) }',
      null,
      okTest([
        "pm.test('listAuditLogs exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Duplicate Student Report',
      'query { getDuplicateStudentReport }',
      null,
      okTest([
        "pm.test('getDuplicateStudentReport exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Merge Students',
      'mutation MergeStudents($input: AWSJSON!) { mergeStudents(input: $input) }',
      { input: JSON.stringify({ primaryStudentId: '{{student_id}}', duplicateStudentIds: [] }) },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
      ])
    ),
  ],
};

// ── HEALTH ───────────────────────────────────────────────────────────────────
const HEALTH = {
  name: '❤️ Health',
  item: [
    {
      name: 'Health Check',
      request: {
        method: 'POST',
        url: '{{appsync_url}}',
        header: [{ key: 'Content-Type', value: 'application/json' }],
        body: { mode: 'raw', raw: JSON.stringify({ query: 'query { health }' }, null, 2) },
      },
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: okTest() } }],
    },
  ],
};

// ── ASSEMBLE ─────────────────────────────────────────────────────────────────
const collection = {
  info: {
    _postman_id: 'vebgenix-api-collection',
    name: 'Vebgenix API',
    description: [
      'Admin / Tenant-Admin API collection for Vebgenix (AppSync GraphQL).',
      'Import alongside Vebgenix-Dev.postman_environment.json.',
      '',
      'Credentials: dhanushags08@gmaill.com / Qwerty@1234',
      '',
      'Run in order:',
      '  1. Get Token         — saves id_token, access_token, refresh_token',
      '  2. Settings          — Create/Set Academic Year, Campus, Program',
      '  3. Academics         — Create Class → Create Section',
      '  4. Finance Setup     — Fee Category → Fee Head → Fee Schedule → Fee Structure',
      '  5. Students          — Enroll → Assign to Class',
      '  6. Finance Assign    — Assign Fee Structure → Get Student Invoices',
      '  7. Finance Payments  — Record Payment → List Receipts',
      '  8. Academics Exams   — Create Exam → Publish Results',
      '  9. Promotions        — Set Eligibility → Promote Students → View Batch',
      '',
      'Each request auto-saves its ID to env vars for chaining.',
      'Platform-admin endpoints removed — not accessible with tenant admin credentials.',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [AUTH, SETTINGS, IDENTITY, ADMISSIONS, FINANCE, ACADEMICS, COMMS, STORAGE, RESULTS_FOLDER, AUDIT, HEALTH],
};

const outPath = path.join(__dirname, 'Vebgenix-API.postman_collection.json');
fs.writeFileSync(outPath, JSON.stringify(collection, null, 2));

function countReqs(items, n = 0) {
  for (const i of items) {
    if (i.request) n++;
    if (i.item) n = countReqs(i.item, n);
  }
  return n;
}
const total = countReqs(collection.item);
console.log('✅ Collection written to', outPath);
console.log('   Total requests:', total);
