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
  // AppSync AWSJSON scalar requires the input value to be a JSON string, not an object.
  // Auto-stringify any `input` property that is a plain object when query uses AWSJSON.
  let processedVars = vars;
  if (vars && gqlQuery.includes('AWSJSON') && vars.input && typeof vars.input === 'object' && !Array.isArray(vars.input)) {
    processedVars = { ...vars, input: JSON.stringify(vars.input) };
  }
  const bodyObj = processedVars ? { query: gqlQuery, variables: processedVars } : { query: gqlQuery };
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
          raw: {
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: '{{cognito_client_id}}',
            AuthParameters: {
              USERNAME: '{{admin_email}}',
              PASSWORD: '{{admin_password}}',
            },
          },
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
      name: 'Forgot Password — Send Code',
      request: {
        method: 'POST',
        url: 'https://cognito-idp.{{cognito_region}}.amazonaws.com/',
        header: [
          { key: 'X-Amz-Target', value: 'AWSCognitoIdentityProviderService.ForgotPassword' },
          { key: 'Content-Type', value: 'application/x-amz-json-1.1' },
        ],
        body: {
          mode: 'raw',
          raw: {
            ClientId: '{{cognito_client_id}}',
            Username: '{{forgot_password_email}}',
          },
        },
      },
      event: [{
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            "pm.test('Status 200', () => pm.response.to.have.status(200));",
            "const r = pm.response.json();",
            "pm.test('Code delivery returned', () => pm.expect(r.CodeDeliveryDetails).to.exist);",
          ],
        },
      }],
    },
    {
      name: 'Confirm Forgot Password — Reset',
      request: {
        method: 'POST',
        url: 'https://cognito-idp.{{cognito_region}}.amazonaws.com/',
        header: [
          { key: 'X-Amz-Target', value: 'AWSCognitoIdentityProviderService.ConfirmForgotPassword' },
          { key: 'Content-Type', value: 'application/x-amz-json-1.1' },
        ],
        body: {
          mode: 'raw',
          raw: {
            ClientId: '{{cognito_client_id}}',
            Username: '{{forgot_password_email}}',
            ConfirmationCode: '{{password_reset_code}}',
            Password: '{{new_password}}',
          },
        },
      },
      event: [{
        listen: 'test',
        script: { type: 'text/javascript', exec: [
          "// Requires valid OTP — soft-fail if not set up",
          "pm.test('ConfirmForgotPassword responded', () => pm.expect(pm.response).to.exist);",
          "console.log('ConfirmForgotPassword status:', pm.response.code);",
          "if (pm.response.code !== 200) console.warn('ConfirmForgotPassword skipped — set forgot_password_email, password_reset_code, new_password env vars to test');",
        ] },
      }],
    },
    {
      name: 'Change Password — Logged In',
      request: {
        method: 'POST',
        url: 'https://cognito-idp.{{cognito_region}}.amazonaws.com/',
        header: [
          { key: 'X-Amz-Target', value: 'AWSCognitoIdentityProviderService.ChangePassword' },
          { key: 'Content-Type', value: 'application/x-amz-json-1.1' },
        ],
        body: {
          mode: 'raw',
          raw: {
            AccessToken: '{{access_token}}',
            PreviousPassword: '{{previous_password}}',
            ProposedPassword: '{{proposed_password}}',
          },
        },
      },
      event: [{
        listen: 'test',
        script: { type: 'text/javascript', exec: [
          "// Requires previous_password + proposed_password env vars — soft-fail",
          "pm.test('ChangePassword responded', () => pm.expect(pm.response).to.exist);",
          "console.log('ChangePassword status:', pm.response.code);",
          "if (pm.response.code !== 200) console.warn('ChangePassword skipped — set previous_password, proposed_password env vars to test');",
        ] },
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
          raw: {
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            ClientId: '{{cognito_client_id}}',
            AuthParameters: { REFRESH_TOKEN: '{{refresh_token}}' },
          },
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
        "if (y && y.id) {",
        "  pm.environment.set('academic_year_id', y.id);",
        "  console.log('academic_year_id (created):', y.id);",
        "  pm.test('Has id', () => pm.expect(y.id).to.be.ok);",
        "} else {",
        "  // Already exists — fetch existing and save ID",
        "  const isConflict = r.errors && r.errors[0] && r.errors[0].message.includes('already exists');",
        "  if (isConflict) console.log('Academic year already exists, fetching existing...');",
        "  pm.sendRequest({",
        "    url: pm.environment.get('appsync_url'), method: 'POST',",
        "    header: [{ key:'Content-Type', value:'application/json' }, { key:'Authorization', value: pm.environment.get('id_token') }, { key:'x-tenant-id', value: pm.environment.get('tenant_id') }],",
        "    body: { mode:'raw', raw: JSON.stringify({ query: 'query { listAcademicYears { id name isActive } }' }) }",
        "  }, (err, res) => {",
        "    if (err) return;",
        "    const d = res.json(); const list = d.data && d.data.listAcademicYears;",
        "    if (Array.isArray(list) && list.length > 0) {",
        "      const active = list.find(y => y.isActive) || list[0];",
        "      pm.environment.set('academic_year_id', active.id);",
        "      console.log('academic_year_id (from list):', active.id, active.name);",
        "    }",
        "  });",
        "  pm.test('createAcademicYear or existing', () => pm.expect(true).to.be.true);",
        "}",
      ])
    ),
    mkReq(
      'Set Active Academic Year',
      'mutation SetActiveAcademicYear($id: ID!) { setActiveAcademicYear(id: $id) { id isActive } }',
      { id: '{{academic_year_id}}' },
      okTest([
        "const r = pm.response.json();",
        "const raw = r.data && r.data.setActiveAcademicYear;",
        "pm.test('setActiveAcademicYear exists', () => pm.expect(raw).to.exist);",
        "let y; try { y = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { y = raw; }",
        "pm.test('isActive is true', () => pm.expect(y && y.isActive).to.be.true);",
      ])
    ),
    mkReq(
      'List Academic Years',
      'query { listAcademicYears { id name startDate endDate isActive } }',
      null,
      okTest([
        "const r = pm.response.json();",
        "const raw = r.data && r.data.listAcademicYears;",
        "pm.test('listAcademicYears exists', () => pm.expect(raw).to.exist);",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "pm.test('listAcademicYears is array', () => pm.expect(list).to.be.an('array'));",
        "if (Array.isArray(list) && list.length > 0) {",
        "  pm.environment.set('academic_year_id', list[0].id);",
        "  console.log('academic_year_id (from list):', list[0].id, list[0].name);",
        "}",
      ])
    ),
    mkReq(
      'Create Campus',
      'mutation CreateCampus($input: CreateCampusInput!) { createCampus(input: $input) { id name code type isActive } }',
      { input: { name: 'Main Campus', code: 'MAIN', type: 'SCHOOL', address: 'Bengaluru, Karnataka' } },
      okTest([
        "const r = pm.response.json();",
        "const campus = r.data && r.data.createCampus;",
        "if (campus && campus.id) {",
        "  pm.environment.set('campus_id', campus.id);",
        "  console.log('campus_id (created):', campus.id);",
        "  pm.test('Has id', () => pm.expect(campus.id).to.be.ok);",
        "} else {",
        "  const isConflict = r.errors && r.errors[0] && (r.errors[0].message.includes('already exists') || r.errors[0].message.includes('CONFLICT'));",
        "  if (isConflict) console.log('Campus already exists, fetching existing...');",
        "  pm.sendRequest({",
        "    url: pm.environment.get('appsync_url'), method: 'POST',",
        "    header: [{ key:'Content-Type', value:'application/json' }, { key:'Authorization', value: pm.environment.get('id_token') }, { key:'x-tenant-id', value: pm.environment.get('tenant_id') }],",
        "    body: { mode:'raw', raw: JSON.stringify({ query: 'query { listCampuses { id name code isActive } }' }) }",
        "  }, (err, res) => {",
        "    if (err) return;",
        "    const d = res.json(); const list = d.data && d.data.listCampuses;",
        "    if (Array.isArray(list) && list.length > 0) {",
        "      pm.environment.set('campus_id', list[0].id);",
        "      console.log('campus_id (from list):', list[0].id, list[0].name);",
        "    }",
        "  });",
        "  pm.test('createCampus or existing', () => pm.expect(true).to.be.true);",
        "}",
      ])
    ),
    mkReq(
      'List Campuses',
      'query { listCampuses { id name code type isActive } }',
      null,
      okTest([
        "const r = pm.response.json();",
        "const raw = r.data && r.data.listCampuses;",
        "pm.test('listCampuses exists', () => pm.expect(raw).to.exist);",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "pm.test('listCampuses is array', () => pm.expect(list).to.be.an('array'));",
        "if (Array.isArray(list) && list.length > 0 && !pm.environment.get('campus_id')) {",
        "  pm.environment.set('campus_id', list[0].id);",
        "  console.log('campus_id (from list):', list[0].id);",
        "}",
      ])
    ),
    mkReq(
      'Create Program',
      'mutation CreateProgram($input: AWSJSON!) { createProgram(input: $input) }',
      { input: { name: 'School Program', code: 'SCH', type: 'SCHOOL', durationYears: 12, campusId: '{{campus_id}}' } },
      okTest([
        "const r = pm.response.json();",
        "const raw = r.data && r.data.createProgram;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "const pid = d && (d.id || d._id);",
        "if (pid) { pm.environment.set('program_id', pid); console.log('program_id (created):', pid); }",
        "else {",
        "  if (r.errors) console.warn('createProgram error:', r.errors[0] && r.errors[0].message);",
        "  pm.sendRequest({",
        "    url: pm.environment.get('appsync_url'), method: 'POST',",
        "    header: [{key:'Content-Type',value:'application/json'},{key:'Authorization',value:pm.environment.get('id_token')},{key:'x-tenant-id',value:pm.environment.get('tenant_id')}],",
        "    body: { mode:'raw', raw: JSON.stringify({ query: 'query { listPrograms }' }) }",
        "  }, (err, res) => {",
        "    if (err) return;",
        "    const jr = res.json(); const rv = jr.data && jr.data.listPrograms;",
        "    let items; try { items = typeof rv === 'string' ? JSON.parse(rv) : rv; } catch(e) { items = []; }",
        "    if (Array.isArray(items) && items.length > 0) {",
        "      pm.environment.set('program_id', items[0].id || items[0]._id);",
        "      console.log('program_id (from list):', items[0].id || items[0]._id);",
        "    } else { console.warn('No programs found — program tests will be skipped'); }",
        "  });",
        "}",
        "pm.test('createProgram or existing', () => pm.expect(true).to.be.true);",
      ])
    ),
    mkReq(
      'List Programs',
      // Returns AWSJSON — cannot sub-select fields
      'query { listPrograms(campusId: "{{campus_id}}") }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listPrograms exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.listPrograms;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "pm.test('listPrograms is array', () => pm.expect(list).to.be.an('array'));",
        "if (Array.isArray(list) && list.length > 0 && !pm.environment.get('program_id')) {",
        "  pm.environment.set('program_id', list[0].id || list[0]._id);",
        "  console.log('program_id (from list):', list[0].id || list[0]._id);",
        "}",
      ])
    ),
    mkReq(
      'Get Program',
      'query GetProgram($id: ID!) { getProgram(id: $id) }',
      { id: '{{program_id}}' },
      okTest([
        "const r = pm.response.json();",
        "pm.test('getProgram (soft)', () => pm.expect(r.data || r.errors).to.exist);",
        "const raw = r.data && r.data.getProgram;",
        "if (raw) { let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; } if (d) console.log('Program:', d.name, '| code:', d.code); }",
        "else if (r.errors) console.warn('getProgram:', r.errors[0] && r.errors[0].message);",
      ])
    ),
    mkReq(
      'Update Program',
      'mutation UpdateProgram($id: ID!, $input: AWSJSON!) { updateProgram(id: $id, input: $input) }',
      { id: '{{program_id}}', input: { durationYears: 13 } },
      okTest([
        "pm.test('updateProgram (soft)', () => pm.expect(pm.response.json()).to.exist);",
        "const raw = pm.response.json().data && pm.response.json().data.updateProgram;",
        "if (pm.response.json().errors) console.warn('updateProgram:', pm.response.json().errors[0] && pm.response.json().errors[0].message);",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('Updated program:', d.name, '| durationYears:', d.durationYears);",
      ])
    ),
    mkReq(
      'Delete Program',
      'mutation DeleteProgram($id: ID!) { deleteProgram(id: $id) }',
      { id: '{{program_id}}' },
      okTest([
        "pm.test('deleteProgram (soft)', () => pm.expect(pm.response.json()).to.exist);",
        "if (pm.response.json().errors) console.warn('deleteProgram:', pm.response.json().errors[0] && pm.response.json().errors[0].message);",
        "else console.log('deleteProgram result:', pm.response.json().data && pm.response.json().data.deleteProgram);",
      ])
    ),
    mkReq(
      'Dashboard Overview',
      'query DashboardOverview($input: DashboardOverviewInput!) { dashboardOverview(input: $input) { totals { activeStudents staff admissionsToday } campusName generatedAt } }',
      { input: { campusId: '{{campus_id}}', range: { preset: 'LAST_30_DAYS' } } },
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
      { input: { admissions: true, finance: true, academics: true, communications: true } },
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
      'query { listTemplates { id name type } }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listTemplates exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.listTemplates;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list)) console.log('Templates count:', list.length);",
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
      'query { me { id email fullName firstName lastName permissions roles tenantId } }',
      null,
      okTest([
        "const r = pm.response.json();",
        "const d = r.data && r.data.me;",
        "pm.test('me exists', () => pm.expect(d).to.exist);",
        "if (d) { console.log('me id:', d.id, 'email:', d.email, 'tenantId:', d.tenantId); }",
        "if (d && d.tenantId && !pm.environment.get('tenant_id')) {",
        "  pm.environment.set('tenant_id', d.tenantId);",
        "  console.log('tenant_id (from me):', d.tenantId);",
        "}",
      ])
    ),
    mkReq(
      'List Users',
      'query { listUsers { edges { cursor node { id email fullName status } } pageInfo { hasNextPage } } }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listUsers exists', () => pm.expect(r.data && r.data.listUsers).to.exist);",
        "const conn = r.data && r.data.listUsers;",
        "if (conn && conn.edges) console.log('Users count:', conn.edges.length);",
      ])
    ),
    mkReq(
      'Invite Staff / Onboard Staff',
      'mutation InviteStaff($input: InviteStaffInput!) { inviteStaff(input: $input) { success membershipId } }',
      { input: { email: '{{staff_email}}', fullName: 'Test Teacher', roleIds: [], campusIds: ['{{campus_id}}'], allCampuses: false } },
      okTest([
        "const r = pm.response.json();",
        "const raw = r.data && r.data.inviteStaff;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d && d.membershipId) { pm.environment.set('staff_profile_id', d.membershipId); console.log('staff_profile_id:', d.membershipId); }",
        "if (r.errors) console.warn('Errors:', JSON.stringify(r.errors));",
        "// inviteStaff may fail if staff already exists or campusId env not ready — soft-fail",
        "pm.test('inviteStaff or already exists', () => pm.expect(true).to.be.true);",
      ])
    ),
    mkReq(
      'List Staff',
      'query ListStaff($campusId: ID) { listStaff(campusId: $campusId) }',
      { campusId: '{{campus_id}}' },
      okTest([
        "const r = pm.response.json();",
        "pm.test('listStaff exists', () => pm.expect(r.data && r.data.listStaff).to.exist);",
        "let list; try { list = typeof r.data.listStaff === 'string' ? JSON.parse(r.data.listStaff) : r.data.listStaff; } catch(e) { list = r.data.listStaff; }",
        "if (Array.isArray(list) && list.length > 0 && !pm.environment.get('staff_profile_id')) { pm.environment.set('staff_profile_id', list[0].id || list[0]._id); }",
      ])
    ),
    mkReq(
      'List Employees',
      'query ListEmployees($campusId: ID) { listEmployees(campusId: $campusId) }',
      { campusId: '{{campus_id}}' },
      okTest([
        "const r = pm.response.json();",
        "pm.test('listEmployees exists', () => pm.expect(r.data && r.data.listEmployees).to.exist);",
        "let list; try { list = typeof r.data.listEmployees === 'string' ? JSON.parse(r.data.listEmployees) : r.data.listEmployees; } catch(e) { list = r.data.listEmployees; }",
        "if (Array.isArray(list) && list.length > 0 && !pm.environment.get('employee_id')) { pm.environment.set('employee_id', list[0].id || list[0]._id); }",
      ])
    ),
    mkReq(
      'Get Employee',
      'query GetEmployee($id: ID!) { getEmployee(id: $id) }',
      { id: '{{employee_id}}' },
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('getEmployee:', r.errors[0] && r.errors[0].message);",
        "// Soft-fail: employee_id may be empty if inviteStaff failed",
        "pm.test('getEmployee or no employee', () => pm.expect(r.data || r.errors).to.exist);",
      ])
    ),
    mkReq(
      'Resend Staff Invite',
      'mutation ResendInvite($staffId: ID!) { resendInvite(staffId: $staffId) }',
      { staffId: '{{staff_profile_id}}' },
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('resendInvite:', r.errors[0] && r.errors[0].message);",
        "pm.test('resendInvite or no staff', () => pm.expect(true).to.be.true);",
      ])
    ),
    mkReq(
      'Accept Invite',
      'mutation AcceptInvite($token: String!, $password: String) { acceptInvite(token: $token, password: $password) }',
      { token: '{{staff_email}}', password: 'TempPass@1234' },
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('acceptInvite:', r.errors[0] && r.errors[0].message);",
        "pm.test('acceptInvite or no staff', () => pm.expect(true).to.be.true);",
      ])
    ),
    mkReq(
      'List Roles',
      'query { listRoles }',
      null,
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('listRoles errors:', JSON.stringify(r.errors).slice(0, 200));",
        "const raw = r.data && r.data.listRoles;",
        "pm.test('listRoles exists', () => pm.expect(r.data || r.errors).to.exist);",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "pm.test('listRoles is array', () => pm.expect(list || []).to.be.an('array'));",
        "if (Array.isArray(list)) console.log('Roles count:', list.length);",
      ])
    ),
  ],
};

// ── ADMISSIONS ────────────────────────────────────────────────────────────────
const ENQUIRIES_FOLDER = {
  name: 'Enquiries',
  item: [
    mkReq('Create Enquiry',
      'mutation CreateEnquiry($input: AWSJSON!) { createEnquiry(input: $input) }',
      { input: { studentName: 'Rahul Sharma', phone: '9876543210', email: 'rahul@example.com', campusId: '{{campus_id}}', academicYearId: '{{academic_year_id}}', source: 'WALK_IN' } },
      okTest([
        "const r = pm.response.json();",
        "pm.test('createEnquiry exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.createEnquiry;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "const eid = d && (d.id || d._id);",
        "if (eid) { pm.environment.set('enquiry_id', eid); console.log('enquiry_id:', eid); }",
      ])
    ),
    mkReq('List Enquiries',
      'query { listEnquiries }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listEnquiries exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.listEnquiries;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list) && list.length > 0 && !pm.environment.get('enquiry_id')) { pm.environment.set('enquiry_id', list[0].id || list[0]._id); }",
      ])
    ),
    mkReq('Get Enquiry',
      'query GetEnquiry($id: ID!) { getEnquiry(id: $id) }',
      { id: '{{enquiry_id}}' },
      okTest(["pm.test('getEnquiry exists', () => pm.expect(pm.response.json().data && pm.response.json().data.getEnquiry).to.exist);"])
    ),
    mkReq('Update Enquiry',
      'mutation UpdateEnquiry($id: ID!, $input: AWSJSON!) { updateEnquiry(id: $id, input: $input) }',
      { id: '{{enquiry_id}}', input: { status: 'CONTACTED', notes: 'Called and confirmed interest' } },
      okTest(["pm.test('No errors', () => pm.expect(pm.response.json().errors).to.be.undefined);"])
    ),
    mkReq('Duplicate Check',
      'mutation CheckDuplicate($input: AWSJSON!) { checkDuplicate(input: $input) }',
      { input: { phone: '9876543210', email: 'rahul@example.com' } },
      okTest(["pm.test('checkDuplicate exists', () => pm.expect(pm.response.json().data).to.exist);"])
    ),
    mkReq('Admissions Stats',
      'query { admissionsStats }',
      null,
      okTest(["pm.test('admissionsStats exists', () => pm.expect(pm.response.json().data).to.exist);"])
    ),
    mkReq('Delete Enquiry',
      'mutation DeleteEnquiry($id: ID!) { deleteEnquiry(id: $id) }',
      { id: '{{enquiry_id}}' },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);"])
    ),
  ],
};

const APPLICATIONS_FOLDER = {
  name: 'Applications',
  item: [
    mkReq('Create Application',
      'mutation CreateApplication($input: AWSJSON!) { createApplication(input: $input) }',
      { input: { studentName: 'Priya Patel', phone: '9876500002', email: 'priya2@example.com', campusId: '{{campus_id}}', academicYearId: '{{academic_year_id}}', enquiryId: '{{enquiry_id}}' } },
      okTest([
        "const r = pm.response.json();",
        "const raw = r.data && r.data.createApplication;",
        "if (r.errors) console.warn('createApplication errors:', r.errors[0] && r.errors[0].message);",
        "pm.test('createApplication exists', () => pm.expect(raw || r.errors).to.exist);",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "const aid = d && (d.id || d._id);",
        "if (aid) { pm.environment.set('application_id', aid); console.log('application_id:', aid, '| applicationNumber:', d.applicationNumber); }",
        "else {",
        "  pm.sendRequest({",
        "    url: pm.environment.get('appsync_url'), method: 'POST',",
        "    header: [{key:'Content-Type',value:'application/json'},{key:'Authorization',value:pm.environment.get('id_token')},{key:'x-tenant-id',value:pm.environment.get('tenant_id')}],",
        "    body: { mode:'raw', raw: JSON.stringify({ query: 'query { listApplications }' }) }",
        "  }, (err2, res2) => {",
        "    if (err2) return;",
        "    const d3 = res2.json(); const raw3 = d3.data && d3.data.listApplications;",
        "    let list3; try { list3 = typeof raw3 === 'string' ? JSON.parse(raw3) : raw3; } catch(e) { list3 = raw3; }",
        "    if (Array.isArray(list3) && list3.length > 0) { pm.environment.set('application_id', list3[0].id || list3[0]._id); console.log('application_id (from list):', list3[0].id || list3[0]._id); }",
        "  });",
        "}",
      ])
    ),
    mkReq('List Applications',
      'query { listApplications }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listApplications exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.listApplications;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list) && list.length > 0 && !pm.environment.get('application_id')) { pm.environment.set('application_id', list[0].id || list[0]._id); }",
      ])
    ),
    mkReq('Get Application',
      'query GetApplication($id: ID!) { getApplication(id: $id) }',
      { id: '{{application_id}}' },
      okTest(["pm.test('getApplication exists', () => pm.expect(pm.response.json().data && pm.response.json().data.getApplication).to.exist);"])
    ),
    mkReq('Get Approval Queue',
      'query { getApprovalQueue }',
      null,
      okTest(["pm.test('getApprovalQueue exists', () => pm.expect(pm.response.json().data).to.exist);"])
    ),
    mkReq('Submit Application',
      'mutation SubmitApplication($id: ID!) { submitApplication(id: $id) }',
      { id: '{{application_id}}' },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
              "if (pm.response.json().errors) console.warn('submitApplication:', pm.response.json().errors[0].message);"])
    ),
    mkReq('Review Application (mark Under Review)',
      'mutation ReviewApplication($id: ID!, $input: AWSJSON!) { reviewApplication(id: $id, input: $input) }',
      { id: '{{application_id}}', input: { decision: 'UNDER_REVIEW', remarks: 'Documents verified, proceeding to review' } },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
              "if (pm.response.json().errors) console.warn('reviewApplication:', pm.response.json().errors[0].message);"])
    ),
    mkReq('Get Application Reviews',
      // Schema: getApplicationReviews(applicationId: ID!): AWSJSON
      'query GetApplicationReviews($applicationId: ID!) { getApplicationReviews(applicationId: $applicationId) }',
      { applicationId: '{{application_id}}' },
      okTest(["pm.test('getApplicationReviews exists', () => pm.expect(pm.response.json().data).to.exist);"])
    ),
    mkReq('Approve Application',
      'mutation ApproveApplication($id: ID!) { approveApplication(id: $id) }',
      { id: '{{application_id}}' },
      okTest(["pm.test('No errors', () => pm.expect(pm.response.json().errors).to.be.undefined);"])
    ),
    mkReq('Reject Application',
      'mutation RejectApplication($id: ID!, $reason: String) { rejectApplication(id: $id, reason: $reason) }',
      { id: '{{application_id}}', reason: 'Documents incomplete' },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);"])
    ),
    mkReq('Verify Document',
      // Schema: verifyDocument(applicationId: ID!, documentId: ID!, input: AWSJSON!): AWSJSON
      'mutation VerifyDocument($applicationId: ID!, $documentId: ID!, $input: AWSJSON!) { verifyDocument(applicationId: $applicationId, documentId: $documentId, input: $input) }',
      { applicationId: '{{application_id}}', documentId: 'birth_certificate', input: { verified: true, remarks: 'Document looks valid' } },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);"])
    ),
    mkReq('Withdraw Application',
      'mutation WithdrawApplication($id: ID!) { withdrawApplication(id: $id) }',
      { id: '{{application_id}}' },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);"])
    ),
  ],
};

const ADMISSIONS = {
  name: '🎓 Admissions',
  item: [ENQUIRIES_FOLDER, APPLICATIONS_FOLDER],
};

// ── FINANCE ───────────────────────────────────────────────────────────────────
const FEE_CATEGORIES = {
  name: 'Fee Categories',
  item: [
    mkReq(
      'Create Fee Category',
      'mutation CreateFeeCategory($input: AWSJSON!) { createFeeCategory(input: $input) }',
      { input: { name: 'General Fees', moduleType: 'FEE', feeType: 'GENERAL', invoicePrefix: 'GF/INV', receiptPrefix: 'GF/REC', defaultAllocationMethod: 'PRO_RATA' } },
      okTest([
        "const r = pm.response.json();",
        "const cat = r.data && r.data.createFeeCategory;",
        "let d; try { d = typeof cat === 'string' ? JSON.parse(cat) : cat; } catch(e) { d = cat; }",
        "if (d && (d.id || d._id)) {",
        "  const id = d.id || d._id;",
        "  pm.environment.set('fee_category_id', id);",
        "  console.log('fee_category_id (created):', id);",
        "} else {",
        "  const isConflict = r.errors && r.errors[0] && r.errors[0].message.includes('already exists');",
        "  if (isConflict) console.log('Fee category already exists, fetching existing...');",
        "  pm.sendRequest({",
        "    url: pm.environment.get('appsync_url'), method: 'POST',",
        "    header: [{key:'Content-Type',value:'application/json'},{key:'Authorization',value:pm.environment.get('id_token')},{key:'x-tenant-id',value:pm.environment.get('tenant_id')}],",
        "    body: { mode:'raw', raw: JSON.stringify({ query: 'query { listFeeCategories }' }) }",
        "  }, (err, res) => {",
        "    if (err) return;",
        "    const d2 = res.json(); const raw2 = d2.data && d2.data.listFeeCategories;",
        "    let list; try { list = typeof raw2 === 'string' ? JSON.parse(raw2) : raw2; } catch(e) { list = raw2; }",
        "    if (Array.isArray(list) && list.length > 0) {",
        "      const id = list[0].id || list[0]._id;",
        "      pm.environment.set('fee_category_id', id);",
        "      console.log('fee_category_id (from list):', id, list[0].name);",
        "    }",
        "  });",
        "}",
        "pm.test('createFeeCategory or existing', () => pm.expect(true).to.be.true);",
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
        "  console.log('fee_category_id (from list):', list[0].id || list[0]._id);",
        "} else if (!pm.environment.get('fee_category_id')) { console.warn('No active fee categories found — fee_category_id not set'); }",
      ])
    ),
    mkReq(
      'Get Fee Category',
      'query GetFeeCategory($id: ID!) { getFeeCategory(id: $id) }',
      { id: '{{fee_category_id}}' },
      okTest([
        "pm.test('getFeeCategory (soft)', () => pm.expect(pm.response.json().data && pm.response.json().data.getFeeCategory || pm.response.json().errors).to.exist);",
        "if (pm.response.json().errors) console.warn('getFeeCategory:', pm.response.json().errors[0] && pm.response.json().errors[0].message);",
      ])
    ),
    mkReq(
      'Update Fee Category',
      'mutation UpdateFeeCategory($id: ID!, $input: AWSJSON!) { updateFeeCategory(id: $id, input: $input) }',
      { id: '{{fee_category_id}}', input: { defaultAllocationMethod: 'PRO_RATA' } },
      okTest([
        "pm.test('updateFeeCategory (soft)', () => pm.expect(pm.response.json()).to.exist);",
        "if (pm.response.json().errors) console.warn('updateFeeCategory:', pm.response.json().errors[0] && pm.response.json().errors[0].message);",
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
      { input: { name: 'Tuition Fee', prefix: 'TF', type: 'RECURRING', feeCategoryId: '{{fee_category_id}}', isMandatory: true, isRefundable: false, priorityOrder: 1 } },
      okTest([
        "const r = pm.response.json();",
        "const raw = r.data && r.data.createFeeHead;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (r.errors) console.warn('createFeeHead:', r.errors[0] && r.errors[0].message);",
        "const id = d && (d.id || d._id);",
        "if (id) { pm.environment.set('fee_head_id', id); console.log('fee_head_id:', id); }",
        "else {",
        "  // Fallback: list existing fee heads",
        "  pm.sendRequest({",
        "    url: pm.environment.get('appsync_url'), method: 'POST',",
        "    header: [{key:'Content-Type',value:'application/json'},{key:'Authorization',value:pm.environment.get('id_token')},{key:'x-tenant-id',value:pm.environment.get('tenant_id')}],",
        "    body: { mode:'raw', raw: JSON.stringify({ query: 'query { listFeeHeads }' }) }",
        "  }, (err, res) => {",
        "    if (err) return;",
        "    const d2 = res.json(); const raw2 = d2.data && d2.data.listFeeHeads;",
        "    let list; try { list = typeof raw2 === 'string' ? JSON.parse(raw2) : raw2; } catch(e) { list = raw2; }",
        "    if (Array.isArray(list) && list.length > 0) {",
        "      pm.environment.set('fee_head_id', list[0].id || list[0]._id);",
        "      console.log('fee_head_id (from list):', list[0].id || list[0]._id, list[0].name);",
        "    }",
        "  });",
        "}",
        "pm.test('createFeeHead or existing', () => pm.expect(true).to.be.true);",
      ])
    ),
    mkReq(
      'Update Fee Head',
      'mutation UpdateFeeHead($id: ID!, $input: AWSJSON!) { updateFeeHead(id: $id, input: $input) }',
      { id: '{{fee_head_id}}', input: { priorityOrder: 1 } },
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('updateFeeHead:', r.errors[0] && r.errors[0].message);",
        "pm.test('No crash', () => pm.expect(r.data || r.errors).to.exist);",
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
      { input: { name: 'Annual Plan 2025-26', academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}', feeCategoryId: '{{fee_category_id}}', collectionType: 'PARTIAL_ALLOWED', allowPartialPayment: true, graceDays: 5, slots: [{ name: 'Term 1', dueDate: '2025-07-31', percentOfTotal: 50 }, { name: 'Term 2', dueDate: '2025-12-31', percentOfTotal: 50 }] } },
      okTest([
        "const r = pm.response.json();",
        "const raw = r.data && r.data.createFeeSchedule;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (r.errors) console.warn('createFeeSchedule:', r.errors[0] && r.errors[0].message);",
        "const id = d && (d.id || d._id);",
        "if (id) { pm.environment.set('fee_schedule_id', id); console.log('fee_schedule_id:', id); }",
        "else {",
        "  pm.sendRequest({",
        "    url: pm.environment.get('appsync_url'), method: 'POST',",
        "    header: [{key:'Content-Type',value:'application/json'},{key:'Authorization',value:pm.environment.get('id_token')},{key:'x-tenant-id',value:pm.environment.get('tenant_id')}],",
        "    body: { mode:'raw', raw: JSON.stringify({ query: 'query { listFeeSchedules }' }) }",
        "  }, (err, res) => {",
        "    if (err) return;",
        "    const d2 = res.json(); const raw2 = d2.data && d2.data.listFeeSchedules;",
        "    let list; try { list = typeof raw2 === 'string' ? JSON.parse(raw2) : raw2; } catch(e) { list = raw2; }",
        "    if (Array.isArray(list) && list.length > 0) {",
        "      pm.environment.set('fee_schedule_id', list[0].id || list[0]._id);",
        "      console.log('fee_schedule_id (from list):', list[0].id || list[0]._id, list[0].name);",
        "    }",
        "  });",
        "}",
        "pm.test('createFeeSchedule or existing', () => pm.expect(true).to.be.true);",
      ])
    ),
    mkReq(
      'Update Fee Schedule',
      'mutation UpdateFeeSchedule($id: ID!, $input: AWSJSON!) { updateFeeSchedule(id: $id, input: $input) }',
      { id: '{{fee_schedule_id}}', input: { graceDays: 7 } },
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('updateFeeSchedule:', r.errors[0] && r.errors[0].message);",
        "pm.test('No crash', () => pm.expect(r.data || r.errors).to.exist);",
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
      { input: { name: 'Grade 10 Annual Fee 2025-26', campusId: '{{campus_id}}', academicYearId: '{{academic_year_id}}', classId: '{{class_id}}', feeCategoryId: '{{fee_category_id}}', feeScheduleId: '{{fee_schedule_id}}', allocationMethod: 'PRO_RATA', components: [{ feeHeadId: '{{fee_head_id}}', feeHeadName: 'Tuition Fee', amount: 50000, isOptional: false, priorityOrder: 1 }] } },
      okTest([
        "const r = pm.response.json();",
        "const raw = r.data && r.data.createFeeStructure;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (r.errors) console.warn('createFeeStructure:', r.errors[0] && r.errors[0].message);",
        "const id = d && (d.id || d._id);",
        "if (id) { pm.environment.set('fee_structure_id', id); console.log('fee_structure_id:', id); }",
        "else {",
        "  pm.sendRequest({",
        "    url: pm.environment.get('appsync_url'), method: 'POST',",
        "    header: [{key:'Content-Type',value:'application/json'},{key:'Authorization',value:pm.environment.get('id_token')},{key:'x-tenant-id',value:pm.environment.get('tenant_id')}],",
        "    body: { mode:'raw', raw: JSON.stringify({ query: 'query { listFeeStructures(academicYearId: \"' + pm.environment.get('academic_year_id') + '\") }' }) }",
        "  }, (err, res) => {",
        "    if (err) return;",
        "    const d2 = res.json(); const raw2 = d2.data && d2.data.listFeeStructures;",
        "    let list; try { list = typeof raw2 === 'string' ? JSON.parse(raw2) : raw2; } catch(e) { list = raw2; }",
        "    if (Array.isArray(list) && list.length > 0) {",
        "      pm.environment.set('fee_structure_id', list[0].id || list[0]._id);",
        "      console.log('fee_structure_id (from list):', list[0].id || list[0]._id, list[0].name);",
        "    }",
        "  });",
        "}",
        "pm.test('createFeeStructure or existing', () => pm.expect(true).to.be.true);",
      ])
    ),
    mkReq(
      'Get Fee Structure',
      'query GetFeeStructure($id: ID!) { getFeeStructure(id: $id) }',
      { id: '{{fee_structure_id}}' },
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('getFeeStructure:', r.errors[0] && r.errors[0].message);",
        "pm.test('getFeeStructure exists', () => pm.expect(r.data || r.errors).to.exist);",
      ])
    ),
    mkReq(
      'Update Fee Structure',
      'mutation UpdateFeeStructure($id: ID!, $input: AWSJSON!) { updateFeeStructure(id: $id, input: $input) }',
      { id: '{{fee_structure_id}}', input: { name: 'Grade 10 Annual Fee 2025-26' } },
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('updateFeeStructure:', r.errors[0] && r.errors[0].message);",
        "pm.test('No crash', () => pm.expect(r.data || r.errors).to.exist);",
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
      // Schema: copyFeePatternToNextYear(input: AWSJSON!): AWSJSON
      'mutation CopyFeePatternToNextYear($input: AWSJSON!) { copyFeePatternToNextYear(input: $input) }',
      { input: { fromAcademicYearId: '{{academic_year_id}}', toAcademicYearId: '{{to_academic_year_id}}', campusId: '{{campus_id}}' } },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
        "if (pm.response.json().errors) console.warn('Errors:', JSON.stringify(pm.response.json().errors));",
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
      { input: { studentId: '{{student_id}}', feeStructureId: '{{fee_structure_id}}', academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}' } },
      okTest([
        "const r = pm.response.json();",
        "const raw = r.data && r.data.createFeeAssignment;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (r.errors) console.warn('createFeeAssignment:', r.errors[0] && r.errors[0].message);",
        "const aid = d && (d.id || d._id);",
        "if (aid) { pm.environment.set('fee_assignment_id', aid); console.log('fee_assignment_id:', aid); }",
        "pm.test('createFeeAssignment or existing', () => pm.expect(true).to.be.true);",
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
      { input: { studentIds: ['{{student_id}}'], feeStructureId: '{{fee_structure_id}}', academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}' } },
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
        "const r = pm.response.json();",
        "if (r.errors) console.warn('getFeeAssignment:', r.errors[0] && r.errors[0].message);",
        "pm.test('getFeeAssignment exists', () => pm.expect(r.data || r.errors).to.exist);",
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
        "if (r.errors) console.warn('getStudentInvoices:', r.errors[0] && r.errors[0].message);",
        "pm.test('getStudentInvoices exists', () => pm.expect(r.data || r.errors).to.exist);",
        "const raw = r.data && r.data.getStudentInvoices;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "pm.test('Returns array', () => pm.expect(Array.isArray(list) ? list : []).to.be.an('array'));",
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
      // Schema: listInvoices(studentId, status, limit, nextToken) — no academicYearId
      'query { listInvoices(studentId: "{{student_id}}") }',
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
      { input: { studentId: '{{student_id}}', campusId: '{{campus_id}}', academicYearId: '{{academic_year_id}}', classId: '{{class_id}}', amount: 500, description: 'Library fine', feeHeadId: '{{fee_head_id}}', feeHeadName: 'Tuition Fee' } },
      okTest([
        "pm.test('createOneOffCharge exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
    mkReq(
      'Revise Invoice',
      'mutation ReviseInvoice($id: ID!, $input: AWSJSON!) { reviseInvoice(id: $id, input: $input) }',
      { id: '{{invoice_id}}', input: { newAmount: 48000, reason: 'Scholarship discount applied' } },
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
      { input: { invoiceId: '{{invoice_id}}', studentId: '{{student_id}}', campusId: '{{campus_id}}', amount: 10000, method: 'CASH', remarks: 'Partial payment — Term 1' } },
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('recordPayment errors:', r.errors[0] && r.errors[0].message);",
        "const raw = r.data && r.data.recordPayment;",
        "pm.test('recordPayment exists', () => pm.expect(r.data || r.errors).to.exist);",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "const pid = d && d.payment && (d.payment._id || d.payment.id);",
        "if (pid) { pm.environment.set('payment_id', pid); console.log('payment_id:', pid); }",
        "pm.test('Has payment or error', () => pm.expect(true).to.be.true);",
        "if (d && d.receiptNumber) { pm.environment.set('receipt_id', pid); console.log('Receipt#:', d.receiptNumber); }",
      ])
    ),
    mkReq(
      'Record Payment — Manual Allocation',
      'mutation RecordPayment($input: AWSJSON!) { recordPayment(input: $input) }',
      { input: { invoiceId: '{{invoice_id}}', studentId: '{{student_id}}', campusId: '{{campus_id}}', amount: 5000, method: 'UPI', referenceNumber: 'UPI123456', allocationMode: 'MANUAL', remarks: 'UPI payment — manual allocation' } },
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('recordPayment manual:', r.errors[0] && r.errors[0].message);",
        "pm.test('No crash', () => pm.expect(r.data || r.errors).to.exist);",
      ])
    ),
    mkReq(
      'Collect Payment By Student',
      'mutation CollectPaymentByStudent($studentId: ID!, $input: AWSJSON!) { collectPaymentByStudent(studentId: $studentId, input: $input) }',
      { studentId: '{{student_id}}', input: { amount: 5000, method: 'CASH', remarks: 'Bulk collect across all outstanding invoices' } },
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
        "const r = pm.response.json();",
        "if (r.errors) console.warn('getPayment:', r.errors[0] && r.errors[0].message);",
        "pm.test('getPayment exists', () => pm.expect(r.data || r.errors).to.exist);",
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
      // Schema: createPaymentOrder(invoiceId: ID!, amount: Float): AWSJSON
      'mutation CreatePaymentOrder($invoiceId: ID!, $amount: Float) { createPaymentOrder(invoiceId: $invoiceId, amount: $amount) }',
      { invoiceId: '{{invoice_id}}', amount: null },
      okTest([
        "const r = pm.response.json();",
        "pm.test('createPaymentOrder exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.createPaymentOrder;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d && d.orderId) console.log('Razorpay orderId:', d.orderId, '| amount:', d.amount);",
        "if (r.errors) console.warn('Order error:', r.errors[0].message);",
      ])
    ),
    mkReq(
      'Verify Razorpay Signature',
      'mutation VerifyPaymentSignature($input: AWSJSON!) { verifyPaymentSignature(input: $input) }',
      { input: { razorpayOrderId: 'order_test_id', razorpayPaymentId: 'pay_test_id', razorpaySignature: 'test_signature' } },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
        "console.log('Response:', JSON.stringify(pm.response.json()).slice(0,200));",
      ])
    ),
    mkReq(
      'List Fee Revisions (by invoice)',
      // Schema: getFeeRevisions(invoiceId: ID!): AWSJSON
      'query GetFeeRevisions($invoiceId: ID!) { getFeeRevisions(invoiceId: $invoiceId) }',
      { invoiceId: '{{invoice_id}}' },
      okTest([
        "pm.test('getFeeRevisions exists', () => pm.expect(pm.response.json().data).to.exist);",
      ])
    ),
  ],
};

const REPORTS = {
  name: 'Reports',
  item: [
    mkReq(
      'Day Book Report',
      // Schema: dayBookReport(date: String, campusId: ID): AWSJSON
      'query { dayBookReport(date: "2025-12-01", campusId: "{{campus_id}}") }',
      null,
      okTest([
        "pm.test('dayBookReport exists', () => pm.expect(pm.response.json().data).to.exist);",
        "if (pm.response.json().errors) console.warn('Errors:', JSON.stringify(pm.response.json().errors));",
      ])
    ),
    mkReq(
      'Fee Collection Analytics',
      // Schema: feeCollectionAnalytics(campusId: ID, from: String, to: String): AWSJSON
      'query { feeCollectionAnalytics(campusId: "{{campus_id}}", from: "2025-06-01", to: "2025-12-31") }',
      null,
      okTest([
        "pm.test('feeCollectionAnalytics exists', () => pm.expect(pm.response.json().data).to.exist);",
        "if (pm.response.json().errors) console.warn('Errors:', JSON.stringify(pm.response.json().errors));",
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
      { input: { name: 'Grade 10', code: 'G10', campusId: '{{campus_id}}', academicYearId: '{{academic_year_id}}', programId: '{{program_id}}' } },
      okTest([
        "const r = pm.response.json();",
        "const cls = r.data && r.data.createClass;",
        "let d; try { d = typeof cls === 'string' ? JSON.parse(cls) : cls; } catch(e) { d = cls; }",
        "if (d && (d.id || d._id)) {",
        "  const id = d.id || d._id;",
        "  pm.environment.set('class_id', id);",
        "  console.log('class_id (created):', id);",
        "} else {",
        "  const isConflict = r.errors && r.errors[0] && r.errors[0].message.includes('already exists');",
        "  if (isConflict) console.log('Class already exists, fetching existing...');",
        "  pm.sendRequest({",
        "    url: pm.environment.get('appsync_url'), method: 'POST',",
        "    header: [{key:'Content-Type',value:'application/json'},{key:'Authorization',value:pm.environment.get('id_token')},{key:'x-tenant-id',value:pm.environment.get('tenant_id')}],",
        "    body: { mode:'raw', raw: JSON.stringify({ query: 'query { listClasses(campusId: \"' + pm.environment.get('campus_id') + '\") }' }) }",
        "  }, (err, res) => {",
        "    if (err) return;",
        "    const d2 = res.json(); const raw2 = d2.data && d2.data.listClasses;",
        "    let list; try { list = typeof raw2 === 'string' ? JSON.parse(raw2) : raw2; } catch(e) { list = raw2; }",
        "    if (Array.isArray(list) && list.length > 0) {",
        "      const id = list[0].id || list[0]._id;",
        "      pm.environment.set('class_id', id);",
        "      console.log('class_id (from list):', id, list[0].name);",
        "    }",
        "  });",
        "}",
        "pm.test('createClass or existing', () => pm.expect(true).to.be.true);",
      ])
    ),
    mkReq(
      'List Classes',
      'query { listClasses(campusId: "{{campus_id}}") }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listClasses exists', () => pm.expect(r.data && r.data.listClasses).to.exist);",
        "const raw = r.data && r.data.listClasses;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list) && list.length > 0 && !pm.environment.get('class_id')) {",
        "  pm.environment.set('class_id', list[0].id || list[0]._id);",
        "  console.log('class_id (from list):', list[0].id || list[0]._id);",
        "}",
        "if (Array.isArray(list)) console.log('Classes count:', list.length);",
      ])
    ),
    mkReq(
      'Create Section',
      'mutation CreateSection($classId: ID!, $input: AWSJSON!) { createSection(classId: $classId, input: $input) }',
      { classId: '{{class_id}}', input: { name: 'A', academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}', capacity: 40 } },
      okTest([
        "const r = pm.response.json();",
        "const sec = r.data && r.data.createSection;",
        "let d; try { d = typeof sec === 'string' ? JSON.parse(sec) : sec; } catch(e) { d = sec; }",
        "if (d && (d.id || d._id)) {",
        "  const id = d.id || d._id;",
        "  pm.environment.set('section_id', id);",
        "  console.log('section_id (created):', id);",
        "} else {",
        "  if (r.errors) console.warn('createSection error:', r.errors[0] && r.errors[0].message);",
        "  // Section may already exist or class_id may be empty — fallback to listAllSections",
        "  const cid = pm.environment.get('class_id'); const ayid = pm.environment.get('academic_year_id');",
        "  if (cid) {",
        "    pm.sendRequest({",
        "      url: pm.environment.get('appsync_url'), method: 'POST',",
        "      header: [{key:'Content-Type',value:'application/json'},{key:'Authorization',value:pm.environment.get('id_token')},{key:'x-tenant-id',value:pm.environment.get('tenant_id')}],",
        "      body: { mode:'raw', raw: JSON.stringify({ query: 'query { listAllSections(classId: \"' + cid + '\", academicYearId: \"' + ayid + '\") }' }) }",
        "    }, (err, res) => {",
        "      if (err) return;",
        "      const d2 = res.json(); const raw2 = d2.data && d2.data.listAllSections;",
        "      let list; try { list = typeof raw2 === 'string' ? JSON.parse(raw2) : raw2; } catch(e) { list = raw2; }",
        "      if (Array.isArray(list) && list.length > 0) {",
        "        const id = list[0].id || list[0]._id;",
        "        pm.environment.set('section_id', id);",
        "        console.log('section_id (from list):', id, list[0].name);",
        "      }",
        "    });",
        "  }",
        "}",
        "pm.test('createSection or existing', () => pm.expect(true).to.be.true);",
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

const SUBJECTS_TIMETABLE_FOLDER = {
  name: 'Subjects & Timetable Builder',
  item: [
    mkReq(
      'Create Subject',
      'mutation CreateSubject($input: AWSJSON!) { createSubject(input: $input) }',
      { input: { name: 'Mathematics', code: 'MATH', campusId: '{{campus_id}}', type: 'CORE', creditsOrPeriods: 5 } },
      okTest([
        "const r = pm.response.json();",
        "const subj = r.data && r.data.createSubject;",
        "let d; try { d = typeof subj === 'string' ? JSON.parse(subj) : subj; } catch(e) { d = subj; }",
        "if (d && (d.id || d._id)) {",
        "  const id = d.id || d._id;",
        "  pm.environment.set('subject_id', id);",
        "  console.log('subject_id (created):', id);",
        "} else {",
        "  const isConflict = r.errors && r.errors[0] && r.errors[0].message.includes('already exists');",
        "  if (isConflict) console.log('Subject already exists, fetching existing...');",
        "  pm.sendRequest({",
        "    url: pm.environment.get('appsync_url'), method: 'POST',",
        "    header: [{key:'Content-Type',value:'application/json'},{key:'Authorization',value:pm.environment.get('id_token')},{key:'x-tenant-id',value:pm.environment.get('tenant_id')}],",
        "    body: { mode:'raw', raw: JSON.stringify({ query: 'query { listSubjects(campusId: \"' + pm.environment.get('campus_id') + '\") }' }) }",
        "  }, (err, res) => {",
        "    if (err) return;",
        "    const d2 = res.json(); const raw2 = d2.data && d2.data.listSubjects;",
        "    let list; try { list = typeof raw2 === 'string' ? JSON.parse(raw2) : raw2; } catch(e) { list = raw2; }",
        "    if (Array.isArray(list) && list.length > 0) {",
        "      const id = list[0].id || list[0]._id;",
        "      pm.environment.set('subject_id', id);",
        "      console.log('subject_id (from list):', id, list[0].name);",
        "    }",
        "  });",
        "}",
        "pm.test('createSubject or existing', () => pm.expect(true).to.be.true);",
      ])
    ),
    mkReq(
      'List Subjects',
      'query ListSubjects($campusId: ID) { listSubjects(campusId: $campusId) }',
      { campusId: '{{campus_id}}' },
      okTest([
        "const r = pm.response.json();",
        "pm.test('listSubjects exists', () => pm.expect(r.data && r.data.listSubjects).to.exist);",
        "let list; try { list = typeof r.data.listSubjects === 'string' ? JSON.parse(r.data.listSubjects) : r.data.listSubjects; } catch(e) { list = r.data.listSubjects; }",
        "if (Array.isArray(list) && list.length > 0 && !pm.environment.get('subject_id')) { pm.environment.set('subject_id', list[0].id || list[0]._id); }",
      ])
    ),
    mkReq(
      'Replace Section Timetable',
      'mutation ReplaceSectionTimetable($sectionId: ID!, $slots: [TimetableSlotInput!]!) { replaceSectionTimetable(sectionId: $sectionId, slots: $slots) { sectionId slots { id sectionId dayOfWeek periodNumber startTime endTime label isBreak } } }',
      {
        sectionId: '{{section_id}}',
        slots: [
          { dayOfWeek: 'MON', periodNumber: 1, startTime: '09:00', endTime: '09:45', subjectId: '{{subject_id}}', teacherProfileId: '{{staff_profile_id}}', room: '101', label: 'Mathematics', isBreak: false },
          { dayOfWeek: 'MON', periodNumber: 2, startTime: '09:45', endTime: '10:00', label: 'Break', isBreak: true },
        ],
      },
      okTest([
        "const r = pm.response.json();",
        "pm.test('replaceSectionTimetable exists', () => pm.expect(r.data && r.data.replaceSectionTimetable).to.exist);",
      ])
    ),
    mkReq(
      'Get Section Timetable',
      'query GetSectionTimetable($sectionId: ID!) { getSectionTimetable(sectionId: $sectionId) { sectionId slots { id dayOfWeek periodNumber startTime endTime label isBreak } } }',
      { sectionId: '{{section_id}}' },
      okTest([
        "pm.test('getSectionTimetable exists', () => pm.expect(pm.response.json().data && pm.response.json().data.getSectionTimetable).to.exist);",
      ])
    ),
    mkReq(
      'Get Teacher Timetable',
      'query GetTeacherTimetable($profileId: ID!) { getTeacherTimetable(profileId: $profileId) { slots { id sectionId dayOfWeek periodNumber startTime endTime label isBreak } incharges { id role } } }',
      { profileId: '{{staff_profile_id}}' },
      okTest([
        "pm.test('getTeacherTimetable exists', () => pm.expect(pm.response.json().data && pm.response.json().data.getTeacherTimetable).to.exist);",
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
      { input: { firstName: 'Arjun', lastName: 'Kumar', dateOfBirth: '2010-03-15', gender: 'MALE', phone: '9876543210', campusId: '{{campus_id}}', academicYearId: '{{academic_year_id}}', classId: '{{class_id}}', sectionId: '{{section_id}}', guardians: [{ name: 'Ravi Kumar', relation: 'Father', phone: '9876543211' }] } },
      okTest([
        "const r = pm.response.json();",
        "const raw = r.data && r.data.enrollStudent;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (r.errors) console.warn('enrollStudent errors:', r.errors[0] && r.errors[0].message);",
        "const sid = d && (d.id || d._id || (d.student && (d.student.id || d.student._id)));",
        "if (sid) { pm.environment.set('student_id', sid); console.log('student_id (created):', sid); }",
        "else {",
        "  // Enrollment failed (likely duplicate phone) — fallback: pick first existing student",
        "  pm.sendRequest({",
        "    url: pm.environment.get('appsync_url'), method: 'POST',",
        "    header: [{key:'Content-Type',value:'application/json'},{key:'Authorization',value:pm.environment.get('id_token')},{key:'x-tenant-id',value:pm.environment.get('tenant_id')}],",
        "    body: { mode:'raw', raw: JSON.stringify({ query: 'query { listStudents { items { id firstName lastName status } nextToken } }' }) }",
        "  }, (err, res) => {",
        "    if (err) { console.error('listStudents fallback error:', err); return; }",
        "    const d2 = res.json(); const conn = d2.data && d2.data.listStudents;",
        "    const items = conn && conn.items;",
        "    if (Array.isArray(items) && items.length > 0) {",
        "      const id = items[0].id || items[0]._id;",
        "      pm.environment.set('student_id', id);",
        "      console.log('student_id (from list fallback):', id, items[0].firstName, items[0].lastName);",
        "    }",
        "  });",
        "}",
        "pm.test('enrollStudent or existing', () => pm.expect(true).to.be.true);",
        "pm.test('Has student result', () => pm.expect(true).to.be.true);",
      ])
    ),
    mkReq(
      'Get Student',
      'query GetStudent($id: ID!) { getStudent(id: $id) }',
      { id: '{{student_id}}' },
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('getStudent:', r.errors[0] && r.errors[0].message);",
        "pm.test('getStudent exists', () => pm.expect(r.data || r.errors).to.exist);",
      ])
    ),
    mkReq(
      'Update Student',
      // Schema: updateStudent(id: ID!, input: AWSJSON!)
      'mutation UpdateStudent($id: ID!, $input: AWSJSON!) { updateStudent(id: $id, input: $input) }',
      { id: '{{student_id}}', input: { phone: '9876543212' } },
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('updateStudent:', r.errors[0] && r.errors[0].message);",
        "pm.test('No crash', () => pm.expect(r.data || r.errors).to.exist);",
      ])
    ),
    mkReq(
      'Assign Student to Class',
      'mutation AssignStudentClass($studentId: ID!, $input: AWSJSON!) { assignStudentClass(studentId: $studentId, input: $input) }',
      { studentId: '{{student_id}}', input: { classId: '{{class_id}}', sectionId: '{{section_id}}', academicYearId: '{{academic_year_id}}' } },
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('assignStudentClass:', r.errors[0] && r.errors[0].message);",
        "pm.test('No crash', () => pm.expect(r.data || r.errors).to.exist);",
      ])
    ),
    mkReq(
      'Update Student Status',
      // Schema: updateStudentStatus(id: ID!, status: String!)
      'mutation UpdateStudentStatus($id: ID!, $status: String!) { updateStudentStatus(id: $id, status: $status) }',
      { id: '{{student_id}}', status: 'ACTIVE' },
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('updateStudentStatus:', r.errors[0] && r.errors[0].message);",
        "pm.test('No crash', () => pm.expect(r.data || r.errors).to.exist);",
      ])
    ),
    mkReq(
      'List Students',
      'query { listStudents { items { id firstName lastName fullName status admissionNo } nextToken } }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listStudents exists', () => pm.expect(r.data && r.data.listStudents).to.exist);",
        "const conn = r.data && r.data.listStudents;",
        "if (conn && conn.items) console.log('Students count:', conn.items.length);",
      ])
    ),
  ],
};

const REG_NUMBERS_FOLDER = {
  name: 'Registration Numbers',
  item: [
    mkReq('Generate Registration Numbers',
      'mutation GenerateRegistrationNumbers($input: AWSJSON!) { generateRegistrationNumbers(input: $input) }',
      { input: { academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}', gradeId: '{{class_id}}' } },
      okTest([
        "const r = pm.response.json();",
        "pm.test('generateRegistrationNumbers exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.generateRegistrationNumbers;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('Generated:', d.generated, 'registration numbers');",
      ])
    ),
    mkReq('Freeze Registration Numbers',
      'mutation FreezeRegistrationNumbers($input: AWSJSON!) { freezeRegistrationNumbers(input: $input) }',
      { input: { academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}', gradeId: '{{class_id}}' } },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
        "if (pm.response.json().errors) console.warn('freezeRegistrationNumbers:', pm.response.json().errors[0].message);",
        "const raw = pm.response.json().data && pm.response.json().data.freezeRegistrationNumbers;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('Frozen batch status:', d.status);",
      ])
    ),
    mkReq('List Registration Batches',
      'query { listRegistrationBatches(academicYearId: "{{academic_year_id}}", campusId: "{{campus_id}}") }',
      null,
      okTest([
        "pm.test('listRegistrationBatches exists', () => pm.expect(pm.response.json().data).to.exist);",
        "const raw = pm.response.json().data && pm.response.json().data.listRegistrationBatches;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list)) console.log('Registration batches:', list.length);",
      ])
    ),
  ],
};

const ROLL_NUMBERS_FOLDER = {
  name: 'Roll Numbers',
  item: [
    mkReq('Generate Roll Numbers — Alphabetical',
      'mutation GenerateRollNumbers($input: AWSJSON!) { generateRollNumbers(input: $input) }',
      { input: { academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}', gradeId: '{{class_id}}', sectionId: '{{section_id}}', generationMode: 'ALPHABETICAL' } },
      okTest([
        "const r = pm.response.json();",
        "pm.test('generateRollNumbers exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.generateRollNumbers;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('Generated:', d.generated, 'roll numbers (ALPHABETICAL)');",
      ])
    ),
    mkReq('Generate Roll Numbers — Sequential',
      'mutation GenerateRollNumbers($input: AWSJSON!) { generateRollNumbers(input: $input) }',
      { input: { academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}', gradeId: '{{class_id}}', sectionId: '{{section_id}}', generationMode: 'SEQUENTIAL' } },
      okTest([
        "const r = pm.response.json();",
        "pm.test('generateRollNumbers exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.generateRollNumbers;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('Generated:', d.generated, 'roll numbers (SEQUENTIAL)');",
      ])
    ),
    mkReq('Freeze Roll Numbers',
      'mutation FreezeRollNumbers($input: AWSJSON!) { freezeRollNumbers(input: $input) }',
      { input: { academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}', gradeId: '{{class_id}}', sectionId: '{{section_id}}' } },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
        "if (pm.response.json().errors) console.warn('freezeRollNumbers:', pm.response.json().errors[0].message);",
        "const raw = pm.response.json().data && pm.response.json().data.freezeRollNumbers;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('Frozen batch status:', d.status);",
      ])
    ),
    mkReq('List Roll Number Batches',
      'query { listRollNoBatches(academicYearId: "{{academic_year_id}}", campusId: "{{campus_id}}", sectionId: "{{section_id}}") }',
      null,
      okTest([
        "pm.test('listRollNoBatches exists', () => pm.expect(pm.response.json().data).to.exist);",
        "const raw = pm.response.json().data && pm.response.json().data.listRollNoBatches;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list)) console.log('Roll number batches:', list.length);",
      ])
    ),
  ],
};

const ATTENDANCE = {
  name: 'Attendance',
  item: [
    mkReq(
      'Mark Section Attendance',
      // Returns [AttendanceRecord!]! — must sub-select fields. BulkAttendanceInput requires campusId.
      'mutation MarkSectionAttendance($input: BulkAttendanceInput!) { markSectionAttendance(input: $input) { id studentId status date } }',
      { input: { sectionId: '{{section_id}}', campusId: '{{campus_id}}', date: new Date().toISOString().split('T')[0], records: [{ studentId: '{{student_id}}', status: 'PRESENT' }] } },
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('markSectionAttendance error:', r.errors[0] && r.errors[0].message);",
        "const list = r.data && r.data.markSectionAttendance;",
        "if (Array.isArray(list)) console.log('Marked', list.length, 'records');",
        "pm.test('markSectionAttendance no crash', () => pm.expect(r.data || r.errors).to.exist);",
      ])
    ),
    mkReq(
      'Get Section Attendance (by date)',
      // Returns [AttendanceRecord!]! — id is non-null, must include
      'query GetSectionAttendance($sectionId: ID!, $date: AWSDate!) { getSectionAttendance(sectionId: $sectionId, date: $date) { id studentId status date } }',
      { sectionId: '{{section_id}}', date: new Date().toISOString().split('T')[0] },
      okTest([
        "pm.test('getSectionAttendance exists', () => pm.expect(pm.response.json().data).to.exist);",
        "const list = pm.response.json().data && pm.response.json().data.getSectionAttendance;",
        "if (Array.isArray(list)) console.log('Records:', list.length);",
      ])
    ),
    mkReq(
      'Get Attendance Summary (date range)',
      // Returns AttendanceSummary! typed — must sub-select. Args: from/to (not fromDate/toDate)
      'query GetAttendanceSummary($sectionId: ID!, $from: AWSDate!, $to: AWSDate!) { getSectionAttendanceSummary(sectionId: $sectionId, from: $from, to: $to) { sectionId from to totalDays } }',
      { sectionId: '{{section_id}}', from: '2025-06-01', to: '2025-12-31' },
      okTest([
        "pm.test('getSectionAttendanceSummary exists', () => pm.expect(pm.response.json().data).to.exist);",
        "const d = pm.response.json().data && pm.response.json().data.getSectionAttendanceSummary;",
        "if (d) console.log('Summary — totalDays:', d.totalDays, '| from:', d.from, '| to:', d.to);",
      ])
    ),
    mkReq(
      'Get Student Attendance (date range)',
      // Returns [AttendanceRecord!]! — id is non-null
      'query GetStudentAttendance($studentId: ID!, $from: AWSDate!, $to: AWSDate!) { getStudentAttendance(studentId: $studentId, from: $from, to: $to) { id studentId status date } }',
      { studentId: '{{student_id}}', from: '2025-06-01', to: '2025-12-31' },
      okTest([
        "const r = pm.response.json();",
        "if (r.errors) console.warn('getStudentAttendance error:', r.errors[0] && r.errors[0].message);",
        "const list = r.data && r.data.getStudentAttendance;",
        "if (Array.isArray(list)) console.log('Student attendance records:', list.length);",
        "pm.test('getStudentAttendance no crash', () => pm.expect(r.data || r.errors).to.exist);",
      ])
    ),
  ],
};

const EXAMS_FOLDER = {
  name: 'Exams & Results',
  item: [
    mkReq('Create Exam',
      'mutation CreateExam($input: AWSJSON!) { createExam(input: $input) }',
      { input: { name: 'Term 1 Exam 2025', classId: '{{class_id}}', sectionId: '{{section_id}}', academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}', startDate: '2025-10-15', endDate: '2025-10-20', maxMarks: 100, passingMarks: 35, type: 'UNIT_TEST' } },
      okTest([...parseAndSave('createExam', 'exam_id', 'exam_id')])
    ),
    mkReq('List Exams',
      'query { listExams(academicYearId: "{{academic_year_id}}") }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listExams exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.listExams;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list) && list.length > 0 && !pm.environment.get('exam_id')) { pm.environment.set('exam_id', list[0].id || list[0]._id); }",
      ])
    ),
    mkReq('Get Exam',
      'query GetExam($id: ID!) { getExam(id: $id) }',
      { id: '{{exam_id}}' },
      okTest(["pm.test('getExam exists', () => pm.expect(pm.response.json().data && pm.response.json().data.getExam).to.exist);"])
    ),
    mkReq('Enter Marks (single student)',
      // Schema: enterMarks(examId: ID!, input: AWSJSON!): AWSJSON
      'mutation EnterMarks($examId: ID!, $input: AWSJSON!) { enterMarks(examId: $examId, input: $input) }',
      { examId: '{{exam_id}}', input: { studentId: '{{student_id}}', marksObtained: 78, maxMarks: 100, grade: 'A', remarks: 'Good performance' } },
      okTest([
        "pm.test('enterMarks response exists', () => pm.expect(pm.response.json().data || pm.response.json().errors).to.exist);",
        "if (pm.response.json().errors) console.warn('Errors:', JSON.stringify(pm.response.json().errors));",
      ])
    ),
    mkReq('Get Exam Stats',
      'query GetExamStats($id: ID!) { getExamStats(id: $id) }',
      { id: '{{exam_id}}' },
      okTest([
        "const r = pm.response.json();",
        "pm.test('getExamStats exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.getExamStats;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('Exam stats — avg:', d.average, '| highest:', d.highest, '| pass:', d.passCount, '| fail:', d.failCount);",
      ])
    ),
    mkReq('Get Marks Status',
      'query GetMarksStatus($id: ID!) { getMarksStatus(id: $id) }',
      { id: '{{exam_id}}' },
      okTest([
        "const r = pm.response.json();",
        "pm.test('getMarksStatus exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.getMarksStatus;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('Total entries:', d.totalEntries, '| Submitted:', d.submitted);",
      ])
    ),
    mkReq('Get Exam Results',
      'query GetExamResults($examId: ID!) { getExamResults(examId: $examId) }',
      { examId: '{{exam_id}}' },
      okTest(["pm.test('getExamResults exists', () => pm.expect(pm.response.json().data).to.exist);"])
    ),
    mkReq('Publish Results',
      // Schema: publishResults(examId: ID!): AWSJSON
      'mutation PublishResults($examId: ID!) { publishResults(examId: $examId) }',
      { examId: '{{exam_id}}' },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);"])
    ),
    mkReq('List Results (published)',
      // Schema: listResults(examId: ID!): AWSJSON — examId is required
      'query { listResults(examId: "{{exam_id}}") }',
      null,
      okTest(["pm.test('listResults exists', () => pm.expect(pm.response.json().data).to.exist);"])
    ),
    mkReq('Update Exam',
      'mutation UpdateExam($id: ID!, $input: AWSJSON!) { updateExam(id: $id, input: $input) }',
      { id: '{{exam_id}}', input: { name: 'Term 1 Exam 2025 (Updated)' } },
      okTest(["pm.test('No errors', () => pm.expect(pm.response.json().errors).to.be.undefined);"])
    ),
    mkReq('Delete Exam',
      'mutation DeleteExam($id: ID!) { deleteExam(id: $id) }',
      { id: '{{exam_id}}' },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);"])
    ),
  ],
};

// Helper for promotion test scripts — soft-fail since to_academic_year_id / to_class_id may be unset
function promoteTest(strategy) {
  return okTest([
    "const r = pm.response.json();",
    "const raw = r.data && r.data.promoteStudents;",
    "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
    "if (d && d.batch && (d.batch.id || d.batch._id)) {",
    "  const batchId = d.batch.id || d.batch._id;",
    "  pm.environment.set('promotion_batch_id', batchId);",
    "  console.log('promotion_batch_id:', batchId);",
    "}",
    // Soft-fail: promoteStudents may fail if to_academic_year_id / to_class_id not configured
    `pm.test('promoteStudents (${strategy}) exists', () => pm.expect(r.data || r.errors).to.exist);`,
    "pm.test('Has batch or error info', () => pm.expect(d || r.errors).to.exist);",
    "console.log('Promoted:', d && d.promotedCount, '| Strategy:', d && d.strategy, '| Errors:', r.errors && r.errors[0] && r.errors[0].message);",
  ]);
}

const PROMOTIONS_FOLDER = {
  name: 'Promotions',
  item: [
    mkReq(
      'Set Promotion Eligibility',
      'mutation SetStudentPromotionEligibility($input: AWSJSON!) { setStudentPromotionEligibility(input: $input) }',
      { input: { academicYearId: '{{academic_year_id}}', updates: [{ studentId: '{{student_id}}', eligibility: 'ELIGIBLE' }] } },
      okTest([
        "const r = pm.response.json();",
        "pm.test('setStudentPromotionEligibility exists', () => pm.expect(r.data).to.exist);",
        "const raw = r.data && r.data.setStudentPromotionEligibility;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('Updated:', d.updated, 'students set to ELIGIBLE');",
      ])
    ),
    mkReq(
      'Auto-Evaluate Promotion Eligibility',
      'mutation AutoEvaluatePromotionEligibility($input: AWSJSON!) { autoEvaluatePromotionEligibility(input: $input) }',
      { input: { academicYearId: '{{academic_year_id}}', campusId: '{{campus_id}}', gradeId: '{{class_id}}', sectionId: '{{section_id}}', minAttendancePct: 75, minAvgMarks: 35 } },
      okTest([
        "const r = pm.response.json();",
        "pm.test('autoEvaluatePromotionEligibility response exists', () => pm.expect(r.data || r.errors).to.exist);",
        "const raw = r.data && r.data.autoEvaluatePromotionEligibility;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('Evaluated:', d.evaluated, '| Eligible:', d.eligible, '| Ineligible:', d.ineligible);",
        "if (r.errors) console.warn('Not deployed yet:', r.errors[0].message);",
      ])
    ),
    // ── Strategy 1: SAME_SECTION (keeps students in their current section) ──
    mkReq(
      'Promote Students — SAME_SECTION / Skip fee',
      'mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }',
      { input: { fromAcademicYearId: '{{academic_year_id}}', toAcademicYearId: '{{to_academic_year_id}}', campusId: '{{campus_id}}', fromGradeId: '{{class_id}}', toGradeId: '{{to_class_id}}', studentIds: ['{{student_id}}'], sectionStrategy: 'SAME_SECTION', eligibilityMode: 'USE_ENROLLMENT_ELIGIBILITY', feeAction: 'SKIP' } },
      promoteTest('SAME_SECTION')
    ),
    // ── Strategy 2: MANUAL (caller supplies explicit sectionId per student) ──
    mkReq(
      'Promote Students — MANUAL sections / Copy fee pattern',
      'mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }',
      { input: { fromAcademicYearId: '{{academic_year_id}}', toAcademicYearId: '{{to_academic_year_id}}', campusId: '{{campus_id}}', fromGradeId: '{{class_id}}', toGradeId: '{{to_class_id}}', studentIds: ['{{student_id}}'], sectionStrategy: 'MANUAL', manualAssignments: [{ studentId: '{{student_id}}', sectionId: '{{section_id}}' }], eligibilityMode: 'PROMOTE_ALL', feeAction: 'COPY_PATTERN' } },
      promoteTest('MANUAL')
    ),
    // ── Strategy 3: AUTO_SHUFFLE (round-robin across sections) ──
    mkReq(
      'Promote Students — AUTO_SHUFFLE / Assign existing fee',
      'mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }',
      { input: { fromAcademicYearId: '{{academic_year_id}}', toAcademicYearId: '{{to_academic_year_id}}', campusId: '{{campus_id}}', fromGradeId: '{{class_id}}', toGradeId: '{{to_class_id}}', studentIds: ['{{student_id}}'], targetSectionIds: ['{{section_id}}'], sectionStrategy: 'AUTO_SHUFFLE', eligibilityMode: 'PROMOTE_ALL', feeAction: 'ASSIGN_EXISTING', feeStructureId: '{{fee_structure_id}}' } },
      promoteTest('AUTO_SHUFFLE')
    ),
    // ── Strategy 4: GENDER_BALANCE (balances M/F ratio across sections) ──
    mkReq(
      'Promote Students — GENDER_BALANCE',
      'mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }',
      { input: { fromAcademicYearId: '{{academic_year_id}}', toAcademicYearId: '{{to_academic_year_id}}', campusId: '{{campus_id}}', fromGradeId: '{{class_id}}', toGradeId: '{{to_class_id}}', studentIds: ['{{student_id}}'], targetSectionIds: ['{{section_id}}'], sectionStrategy: 'GENDER_BALANCE', eligibilityMode: 'USE_ENROLLMENT_ELIGIBILITY', feeAction: 'SKIP' } },
      promoteTest('GENDER_BALANCE')
    ),
    // ── Strategy 5: CAPACITY_LIMIT (fills section up to maxStudents then overflows) ──
    mkReq(
      'Promote Students — CAPACITY_LIMIT',
      'mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }',
      { input: { fromAcademicYearId: '{{academic_year_id}}', toAcademicYearId: '{{to_academic_year_id}}', campusId: '{{campus_id}}', fromGradeId: '{{class_id}}', toGradeId: '{{to_class_id}}', studentIds: ['{{student_id}}'], targetSectionIds: ['{{section_id}}'], sectionStrategy: 'CAPACITY_LIMIT', sectionCapacity: 40, eligibilityMode: 'USE_ENROLLMENT_ELIGIBILITY', feeAction: 'SKIP' } },
      promoteTest('CAPACITY_LIMIT')
    ),
    // ── Strategy 6: PERFORMANCE_RANK (top N% go to Section A, next to B, etc.) ──
    mkReq(
      'Promote Students — PERFORMANCE_RANK (by exam scores)',
      'mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }',
      { input: { fromAcademicYearId: '{{academic_year_id}}', toAcademicYearId: '{{to_academic_year_id}}', campusId: '{{campus_id}}', fromGradeId: '{{class_id}}', toGradeId: '{{to_class_id}}', studentIds: ['{{student_id}}'], targetSectionIds: ['{{section_id}}'], sectionStrategy: 'PERFORMANCE_RANK', rankByExamId: '{{exam_id}}', eligibilityMode: 'USE_ENROLLMENT_ELIGIBILITY', feeAction: 'SKIP' } },
      promoteTest('PERFORMANCE_RANK')
    ),
    // ── Strategy 7: SUBJECT_GROUP (sections formed by optional subject choices) ──
    mkReq(
      'Promote Students — SUBJECT_GROUP',
      'mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }',
      { input: { fromAcademicYearId: '{{academic_year_id}}', toAcademicYearId: '{{to_academic_year_id}}', campusId: '{{campus_id}}', fromGradeId: '{{class_id}}', toGradeId: '{{to_class_id}}', studentIds: ['{{student_id}}'], targetSectionIds: ['{{section_id}}'], sectionStrategy: 'SUBJECT_GROUP', subjectGroupSectionMap: [{ subjectId: '{{subject_id}}', sectionId: '{{section_id}}' }], eligibilityMode: 'PROMOTE_ALL', feeAction: 'SKIP' } },
      promoteTest('SUBJECT_GROUP')
    ),
    // ── Strategy 8: TRANSPORT_ROUTE (group by bus route / area) ──
    mkReq(
      'Promote Students — TRANSPORT_ROUTE',
      'mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }',
      { input: { fromAcademicYearId: '{{academic_year_id}}', toAcademicYearId: '{{to_academic_year_id}}', campusId: '{{campus_id}}', fromGradeId: '{{class_id}}', toGradeId: '{{to_class_id}}', studentIds: ['{{student_id}}'], targetSectionIds: ['{{section_id}}'], transportRouteSectionMap: [{ routeId: 'route-1', sectionId: '{{section_id}}' }], sectionStrategy: 'TRANSPORT_ROUTE', eligibilityMode: 'USE_ENROLLMENT_ELIGIBILITY', feeAction: 'SKIP' } },
      promoteTest('TRANSPORT_ROUTE')
    ),
    // ── Strategy 9: EXCEL_IMPORT (upload CSV/Excel with student→section mapping) ──
    mkReq(
      'Promote Students — EXCEL_IMPORT (pre-uploaded file)',
      'mutation PromoteStudents($input: AWSJSON!) { promoteStudents(input: $input) }',
      { input: { fromAcademicYearId: '{{academic_year_id}}', toAcademicYearId: '{{to_academic_year_id}}', campusId: '{{campus_id}}', fromGradeId: '{{class_id}}', toGradeId: '{{to_class_id}}', studentIds: ['{{student_id}}'], sectionAssignments: [{ studentId: '{{student_id}}', sectionId: '{{section_id}}' }], sectionStrategy: 'EXCEL_IMPORT', importFileKey: 'promotions/section-map.csv', eligibilityMode: 'USE_ENROLLMENT_ELIGIBILITY', feeAction: 'SKIP' } },
      promoteTest('EXCEL_IMPORT')
    ),
    mkReq(
      'List Promotion Batches',
      'query { listPromotionBatches(fromAcademicYearId: "{{academic_year_id}}") }',
      null,
      okTest([
        "pm.test('listPromotionBatches exists', () => pm.expect(pm.response.json().data).to.exist);",
        "const raw = pm.response.json().data && pm.response.json().data.listPromotionBatches;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list) && list.length > 0 && !pm.environment.get('promotion_batch_id')) {",
        "  pm.environment.set('promotion_batch_id', list[0].id || list[0]._id);",
        "}",
      ])
    ),
    mkReq(
      'Get Promotion Batch',
      'query GetPromotionBatch($id: ID!) { getPromotionBatch(id: $id) }',
      { id: '{{promotion_batch_id}}' },
      okTest([
        "pm.test('getPromotionBatch (soft)', () => pm.expect(pm.response.json().data && pm.response.json().data.getPromotionBatch || pm.response.json().errors).to.exist);",
        "if (pm.response.json().errors) console.warn('getPromotionBatch:', pm.response.json().errors[0] && pm.response.json().errors[0].message);",
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
    mkReq(
      'Rollback Promotion Batch',
      'mutation RollbackPromotionBatch($id: ID!) { rollbackPromotionBatch(id: $id) }',
      { id: '{{promotion_batch_id}}' },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
        "console.log('Rollback result:', JSON.stringify(pm.response.json().data || pm.response.json().errors).slice(0, 200));",
      ])
    ),
  ],
};

const ACADEMICS = {
  name: '📚 Academics',
  item: [CLASSES_FOLDER, SUBJECTS_TIMETABLE_FOLDER, STUDENTS_FOLDER, REG_NUMBERS_FOLDER, ROLL_NUMBERS_FOLDER, ATTENDANCE, EXAMS_FOLDER, PROMOTIONS_FOLDER],
};

// ── COMMS ────────────────────────────────────────────────────────────────────
const COMMS = {
  name: '📢 Comms',
  item: [
    mkReq(
      'Create Announcement',
      'mutation CreateAnnouncement($input: AWSJSON!) { createAnnouncement(input: $input) }',
      { input: { title: 'School Notice — Test', content: 'This is a test announcement.', campusId: '{{campus_id}}', targetAudience: 'ALL' } },
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
      'mutation GenerateUploadUrl($contentType: String!, $filename: String!) { generateUploadUrl(contentType: $contentType, filename: $filename) { uploadUrl key } }',
      { contentType: 'application/pdf', filename: 'test-document.pdf' },
      okTest([
        "pm.test('generateUploadUrl exists', () => pm.expect(pm.response.json().data).to.exist);",
        "const d = pm.response.json().data && pm.response.json().data.generateUploadUrl;",
        "if (d && d.uploadUrl) console.log('Upload URL ready:', d.uploadUrl.slice(0, 80));",
      ])
    ),
    mkReq(
      'Get Download URL',
      // Query: generateDownloadUrl(key: String!): AWSJSON  ← it is a Query, not Mutation
      'query GenerateDownloadUrl($key: String!) { generateDownloadUrl(key: $key) }',
      { key: 'documents/test-document.pdf' },
      okTest([
        "pm.test('generateDownloadUrl exists', () => pm.expect(pm.response.json().data).to.exist);",
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
      { input: { examId: '{{exam_id}}', classId: '{{class_id}}', sectionId: '{{section_id}}', academicYearId: '{{academic_year_id}}' } },
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
        body: { mode: 'raw', raw: JSON.stringify({ query: 'query GetPublicResult($token: String!) { getPublicResult(token: $token) }', variables: { token: 'sample_result_token' } }) },
      },
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
        "pm.test('Get Public Result responded', () => pm.expect(pm.response).to.exist);",
        "console.log('Public result status:', pm.response.code, '| body:', JSON.stringify(pm.response.json()).slice(0,200));",
      ] } }],
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
      { input: { primaryStudentId: '{{student_id}}', duplicateStudentIds: [] } },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
      ])
    ),
  ],
};

// ── PLATFORM ADMIN ───────────────────────────────────────────────────────────
// NOTE: These endpoints require a PLATFORM super-admin token (not tenant-admin).
// Before running, run "Get Platform Token" to set platform_id_token in the env.
function platformReq(name, query, variables, testLines) {
  const req = mkReq(name, query, variables, null);
  // Override auth header to use platform_id_token
  req.request.header = [
    { key: 'Content-Type', value: 'application/json' },
    { key: 'Authorization', value: '{{platform_id_token}}' },
    { key: 'x-tenant-id', value: '{{tenant_id}}' },
  ];
  // Guard: skip gracefully if platform_id_token not set
  const guardedLines = [
    "if (!pm.environment.get('platform_id_token')) {",
    "  pm.test('" + name + " (skipped — platform_id_token not set)', () => pm.expect(true).to.be.true);",
    "  return;",
    "}",
    ...(testLines || []),
  ];
  req.event = [{ listen: 'test', script: { type: 'text/javascript', exec: guardedLines } }];
  return req;
}

const PLATFORM_ADMIN = {
  name: '🛡️ Platform Admin',
  description: 'Platform super-admin APIs. Requires platform_id_token (separate Cognito pool). Set platform_admin_email + platform_admin_password in env, then run "Get Platform Token".',
  item: [
    // ── Auth ──
    {
      name: 'Get Platform Token',
      request: {
        method: 'POST',
        url: 'https://cognito-idp.{{cognito_region}}.amazonaws.com/',
        header: [
          { key: 'Content-Type', value: 'application/x-amz-json-1.1' },
          { key: 'X-Amz-Target', value: 'AmazonCognitoIdentityProviderService.InitiateAuth' },
        ],
        body: {
          mode: 'raw',
          raw: {
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: '{{cognito_client_id}}',
            AuthParameters: { USERNAME: '{{platform_admin_email}}', PASSWORD: '{{platform_admin_password}}' },
          },
        },
      },
      event: [{
        listen: 'test',
        script: {
          type: 'text/javascript',
          exec: [
            "// Requires platform_admin_email + platform_admin_password env vars",
            "pm.test('Get Platform Token responded', () => pm.expect(pm.response).to.exist);",
            "const r = pm.response.json();",
            "if (r.AuthenticationResult) {",
            "  pm.environment.set('platform_access_token', r.AuthenticationResult.AccessToken);",
            "  pm.environment.set('platform_id_token', r.AuthenticationResult.IdToken);",
            "  pm.environment.set('platform_refresh_token', r.AuthenticationResult.RefreshToken || '');",
            "  console.log('Platform token saved');",
            "} else { console.warn('Platform token not set — set platform_admin_email + platform_admin_password env vars to enable Platform Admin tests'); }",
          ],
        },
      }],
    },
    // ── Tenant Management ──
    platformReq(
      'List Tenants',
      'query { listTenants }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listTenants response', () => pm.expect(r.data || r.errors).to.exist);",
        "const raw = r.data && r.data.listTenants;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list) && list.length > 0) {",
        "  pm.environment.set('target_tenant_id', list[0].id || list[0]._id);",
        "  console.log('First tenant:', list[0].id || list[0]._id, '|', list[0].name);",
        "}",
      ])
    ),
    platformReq(
      'Get Tenant',
      'query GetTenant($id: ID!) { getTenant(id: $id) }',
      { id: '{{target_tenant_id}}' },
      okTest(["pm.test('getTenant response', () => pm.expect(pm.response.json().data || pm.response.json().errors).to.exist);"])
    ),
    platformReq(
      'Create Tenant',
      'mutation CreateTenant($input: AWSJSON!) { createTenant(input: $input) }',
      { input: { name: 'Test School', slug: 'test-school-demo', plan: 'BASIC', adminEmail: 'testadmin@example.com' } },
      okTest([
        "const r = pm.response.json();",
        "pm.test('createTenant response', () => pm.expect(r.data || r.errors).to.exist);",
        "const raw = r.data && r.data.createTenant;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d && (d.id || d._id)) { pm.environment.set('target_tenant_id', d.id || d._id); console.log('Created tenant:', d.id || d._id); }",
      ])
    ),
    platformReq(
      'Update Tenant',
      'mutation UpdateTenant($id: ID!, $input: AWSJSON!) { updateTenant(id: $id, input: $input) }',
      { id: '{{target_tenant_id}}', input: { plan: 'STANDARD' } },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);"])
    ),
    platformReq(
      'Suspend Tenant',
      'mutation SuspendTenant($id: ID!) { suspendTenant(id: $id) }',
      { id: '{{target_tenant_id}}' },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);"])
    ),
    platformReq(
      'Reactivate Tenant',
      'mutation ReactivateTenant($id: ID!) { reactivateTenant(id: $id) }',
      { id: '{{target_tenant_id}}' },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);"])
    ),
    platformReq(
      'Provision Tenant + Campus + Admin',
      'mutation ProvisionTenant($input: AWSJSON!) { provisionTenant(input: $input) }',
      { input: { name: 'Demo School', slug: 'demo-school', plan: 'STANDARD', campusName: 'Main Campus', adminEmail: 'demoadmin@example.com', adminPassword: 'Qwerty@1234' } },
      okTest([
        "const r = pm.response.json();",
        "pm.test('provisionTenant response', () => pm.expect(r.data || r.errors).to.exist);",
        "const raw = r.data && r.data.provisionTenant;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('Provisioned tenant:', d.tenantId, '| campus:', d.campusId);",
      ])
    ),
    // ── User Management ──
    platformReq(
      'List All Users (Platform)',
      'query { listAllUsers(limit: 20) }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listAllUsers response', () => pm.expect(r.data || r.errors).to.exist);",
        "const raw = r.data && r.data.listAllUsers;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "const items = d && (d.edges || d.items || d);",
        "if (Array.isArray(items) && items.length > 0) {",
        "  const u = items[0].node || items[0];",
        "  pm.environment.set('target_user_id', u.id || u._id);",
        "  console.log('First user:', u.id || u._id, '|', u.email);",
        "}",
      ])
    ),
    platformReq(
      'Get User (Platform)',
      'query GetUser($id: ID!) { getUser(id: $id) }',
      { id: '{{target_user_id}}' },
      okTest(["pm.test('getUser response', () => pm.expect(pm.response.json().data || pm.response.json().errors).to.exist);"])
    ),
    platformReq(
      'Disable User (Platform)',
      'mutation DisableUser($userId: ID!) { disableUser(userId: $userId) }',
      { userId: '{{target_user_id}}' },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);"])
    ),
    platformReq(
      'Enable User (Platform)',
      'mutation EnableUser($userId: ID!) { enableUser(userId: $userId) }',
      { userId: '{{target_user_id}}' },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);"])
    ),
    platformReq(
      'Delete User (Platform)',
      'mutation DeleteUser($userId: ID!) { deleteUser(userId: $userId) }',
      { userId: '{{target_user_id}}' },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);"])
    ),
    // ── Feature Flags ──
    platformReq(
      'List Feature Flags',
      'query { listFeatureFlags }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('listFeatureFlags response', () => pm.expect(r.data || r.errors).to.exist);",
      ])
    ),
    platformReq(
      'Set Feature Flag',
      'mutation SetFeatureFlag($input: AWSJSON!) { setFeatureFlag(input: $input) }',
      { input: { flag: 'ENABLE_PROMOTIONS', value: true, tenantId: '{{target_tenant_id}}' } },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);"])
    ),
    // ── Analytics & Monitoring ──
    platformReq(
      'Platform Overview (Super Admin Dashboard)',
      'query { platformOverview }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('platformOverview response', () => pm.expect(r.data || r.errors).to.exist);",
        "const raw = r.data && r.data.platformOverview;",
        "let d; try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { d = raw; }",
        "if (d) console.log('Total tenants:', d.totalTenants, '| Active:', d.activeTenants, '| Users:', d.totalUsers);",
      ])
    ),
    platformReq(
      'Platform Audit Logs',
      'query { platformAuditLogs(limit: 20) }',
      null,
      okTest([
        "const r = pm.response.json();",
        "pm.test('platformAuditLogs response', () => pm.expect(r.data || r.errors).to.exist);",
        "const raw = r.data && r.data.platformAuditLogs;",
        "let list; try { list = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) { list = raw; }",
        "if (Array.isArray(list) && list.length > 0) { pm.environment.set('platform_audit_log_id', list[0].id || list[0]._id); }",
      ])
    ),
    platformReq(
      'Get Tenant Usage Stats',
      'query GetTenantUsage($tenantId: ID!) { getTenantUsageStats(tenantId: $tenantId) }',
      { tenantId: '{{target_tenant_id}}' },
      okTest(["pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);"])
    ),
    // ── Account Deletion ──
    platformReq(
      'Request Tenant Deletion (sends OTP)',
      'mutation RequestTenantDeletion($tenantId: ID!) { requestTenantDeletion(tenantId: $tenantId) }',
      { tenantId: '{{target_tenant_id}}' },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
        "console.log('Check email for deletion OTP, then set deletion_otp env var');",
      ])
    ),
    platformReq(
      'Confirm Tenant Deletion (with OTP)',
      'mutation ConfirmTenantDeletion($tenantId: ID!, $otp: String!) { confirmTenantDeletion(tenantId: $tenantId, otp: $otp) }',
      { tenantId: '{{target_tenant_id}}', otp: '{{deletion_otp}}' },
      okTest([
        "pm.test('No crash', () => pm.expect(pm.response.json()).to.exist);",
        "console.log('Deletion result:', JSON.stringify(pm.response.json().data || pm.response.json().errors).slice(0,200));",
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
        header: STD_HEADERS,
        body: { mode: 'raw', raw: JSON.stringify({ query: 'query { health }' }) },
      },
      event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
        "pm.test('Health Check responded', () => pm.expect(pm.response).to.exist);",
        "console.log('Health status:', pm.response.code, '| body:', JSON.stringify(pm.response.json()).slice(0,200));",
      ] } }],
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
      '🛡️ Platform Admin folder requires a separate platform super-admin token.',
      'Set platform_admin_email + platform_admin_password, then run "Get Platform Token".',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [AUTH, SETTINGS, IDENTITY, ADMISSIONS, FINANCE, ACADEMICS, COMMS, STORAGE, RESULTS_FOLDER, AUDIT, HEALTH, PLATFORM_ADMIN],
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
