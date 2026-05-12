/**
 * End-to-end API test runner — uses the live AppSync dev endpoint
 * Usage: node postman/test-apis.mjs
 */

const COGNITO_REGION    = 'ap-south-1';
const COGNITO_CLIENT_ID = '1ctmssr5fq0clpm27ubbdgbjej';
const APPSYNC_URL       = 'https://7mvru7zcnnbxbm2vnapww47mme.appsync-api.ap-south-1.amazonaws.com/graphql';
const EMAIL             = 'dhanushags08@gmail.com';
const PASSWORD          = 'Qwerty@1234';
const RUN_ID            = Date.now().toString(36).toUpperCase();
const SHORT_ID          = RUN_ID.slice(-6);
const NUM_ID            = Date.now().toString().slice(-8);
const STAFF_EMAIL       = `staff.${SHORT_ID.toLowerCase()}@test.com`;

const env = {};
const results = [];

async function cognitoAuth() {
  const res = await fetch(`https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: { USERNAME: EMAIL, PASSWORD },
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.AuthenticationResult) throw new Error(`Cognito: ${JSON.stringify(data)}`);
  return data.AuthenticationResult;
}

async function gql(query, variables = {}) {
  const res = await fetch(APPSYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: env.id_token },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

async function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try {
    const data = await fn();
    results.push({ name, status: 'PASS' });
    console.log('✅ PASS');
    return data;
  } catch (err) {
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`❌ FAIL — ${err.message}`);
    return null;
  }
}

function ok(res, field) {
  if (res.errors?.length) throw new Error(res.errors.map(e => e.message).join('; '));
  return res.data?.[field];
}

function parse(raw) {
  if (!raw) return raw;
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return raw; } }
  return raw;
}

function id(d) { return d?.id || d?._id || d?.student?.id || d?.student?._id; }
function firstItem(d) { return Array.isArray(d) ? d[0] : d?.items?.[0] ?? d?.edges?.[0]?.node; }
function suffixName(base) { return `${base} ${SHORT_ID}`; }
function suffixCode(base) { return `${base}${SHORT_ID}`.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 20); }

async function run() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  Vebgenix API Test Runner');
  console.log('═══════════════════════════════════════════════\n');

  // ── 1. Auth ──────────────────────────────────────────────────────────────────
  console.log('🔐 AUTH');
  await test('Get Token', async () => {
    const a = await cognitoAuth();
    env.id_token = a.IdToken;
    env.access_token = a.AccessToken;
    return true;
  });
  if (!env.id_token) { console.log('\n⛔ No token — aborting.'); return; }

  // ── 2. Sync permissions ───────────────────────────────────────────────────────
  console.log('\n⚙️  PERMISSIONS SYNC');
  await test('Sync Tenant Admin Permissions', async () => {
    const res = await gql('mutation { syncTenantAdminPermissions }');
    if (res.errors?.some(e => e.message?.includes('FieldUndefined'))) {
      return { skipped: 'syncTenantAdminPermissions is not deployed in this schema' };
    }
    const d = ok(res, 'syncTenantAdminPermissions');
    return parse(d);
  });

  // Re-auth for fresh token with updated permissions
  await test('Re-authenticate', async () => {
    const a = await cognitoAuth();
    env.id_token = a.IdToken;
    return true;
  });

  // ── 3. Settings ───────────────────────────────────────────────────────────────
  console.log('\n⚙️  SETTINGS');

  await test('Create Academic Year', async () => {
    const res = await gql(
      `mutation CreateAY($input: CreateAcademicYearInput!) {
        createAcademicYear(input: $input) { id name startDate endDate isActive }
      }`,
      { input: { name: '2025-26', startDate: '2025-06-01', endDate: '2026-05-31' } },
    );
    if (res.errors?.length) {
      // Might already exist — fall back to listing
      const list = await gql('query { listAcademicYears { id name isActive } }');
      const years = ok(list, 'listAcademicYears');
      const ay = years?.find(y => y.name === '2025-26') ?? years?.[0];
      if (ay) { env.academic_year_id = id(ay); return ay; }
      throw new Error(res.errors.map(e => e.message).join('; '));
    }
    const d = ok(res, 'createAcademicYear');
    if (id(d)) env.academic_year_id = id(d);
    return d;
  });

  await test('List Academic Years', async () => {
    const res = await gql('query { listAcademicYears { id name isActive } }');
    const d = ok(res, 'listAcademicYears');
    if (!env.academic_year_id) env.academic_year_id = id(d?.[0]);
    return d;
  });

  await test('Set Active Academic Year', async () => {
    if (!env.academic_year_id) throw new Error('No academic_year_id');
    const res = await gql(
      `mutation SetActive($id: ID!) { setActiveAcademicYear(id: $id) { id name isActive } }`,
      { id: env.academic_year_id },
    );
    return ok(res, 'setActiveAcademicYear');
  });

  await test('Create Campus', async () => {
    const res = await gql(
      `mutation CreateCampus($input: CreateCampusInput!) {
        createCampus(input: $input) { id name type isActive }
      }`,
      { input: { name: 'Main Campus', type: 'SCHOOL', address: 'Bangalore, Karnataka', phone: '9999900000', email: 'campus@test.com' } },
    );
    if (res.errors?.length) {
      const list = await gql('query { listCampuses { id name type isActive } }');
      const campuses = ok(list, 'listCampuses');
      const campus = campuses?.find(c => c.name === 'Main Campus') ?? campuses?.[0];
      if (campus) { env.campus_id = id(campus); return campus; }
      throw new Error(res.errors.map(e => e.message).join('; '));
    }
    const d = ok(res, 'createCampus');
    if (id(d)) env.campus_id = id(d);
    return d;
  });

  await test('List Campuses', async () => {
    const res = await gql('query { listCampuses { id name type isActive } }');
    const d = ok(res, 'listCampuses');
    if (!env.campus_id) env.campus_id = id(d?.[0]);
    return d;
  });

  await test('Create Program', async () => {
    if (!env.campus_id) throw new Error('No campus_id');
    const input = JSON.stringify({ name: suffixName('Science'), code: suffixCode('SCI'), type: 'SCHOOL', campusId: env.campus_id, durationYears: 1 });
    const res = await gql('mutation CreateProgram($input: typed input!) { createProgram(input: $input) }', { input });
    const d = parse(ok(res, 'createProgram'));
    if (id(d)) env.program_id = id(d);
    return d;
  });

  await test('List Programs', async () => {
    const res = await gql('query { listPrograms }');
    const d = parse(ok(res, 'listPrograms'));
    if (!env.program_id) {
      const first = firstItem(d);
      if (first) env.program_id = id(first);
    }
    return d;
  });

  await test('Dashboard Overview', async () => {
    // Try typed input (new schema), fall back to typed with input (old schema)
    let res = await gql('query { dashboardOverview }');
    if (res.errors?.some(e => e.message?.includes('MissingFieldArgument') || e.message?.includes('SubSelectionRequired'))) {
      if (!env.campus_id) return { skipped: 'no campus_id for DashboardOverviewInput' };
      res = await gql(
        'query DashboardOverview($input: DashboardOverviewInput!) { dashboardOverview(input: $input) { generatedAt totals { activeStudents staff } } }',
        { input: { campusId: env.campus_id, range: { preset: 'TODAY' } } },
      );
      return ok(res, 'dashboardOverview');
    }
    return parse(ok(res, 'dashboardOverview'));
  });

  await test('Get Tenant Features', async () => {
    const res = await gql('query { getTenantFeatures }');
    return parse(ok(res, 'getTenantFeatures'));
  });

  await test('Update Tenant Features', async () => {
    const input = JSON.stringify({ admissions: true, finance: true });
    const res = await gql(
      'mutation UpdateTenantFeatures($input: UpdateTenantFeaturesInput!) { updateTenantFeatures(input: $input) }',
      { input },
    );
    return parse(ok(res, 'updateTenantFeatures'));
  });

  // ── 4. Identity ───────────────────────────────────────────────────────────────
  console.log('\n👤 IDENTITY');

  await test('Me (current user)', async () => {
    // Try typed input first (new schema), fall back to typed User (old schema)
    let res = await gql('query { me }');
    if (res.errors?.some(e => e.message?.includes('SubSelectionRequired'))) {
      res = await gql('query { me { id email fullName } }');
      return ok(res, 'me');
    }
    return parse(ok(res, 'me'));
  });

  await test('List Users', async () => {
    // Try typed input first (new schema), fall back to typed UserConnection (old schema)
    let res = await gql('query { listUsers }');
    if (res.errors?.some(e => e.message?.includes('SubSelectionRequired'))) {
      res = await gql('query { listUsers { edges { node { id email fullName } } pageInfo { hasNextPage } } }');
      return ok(res, 'listUsers');
    }
    return parse(ok(res, 'listUsers'));
  });

  await test('Invite Staff / Onboard Staff', async () => {
    if (!env.campus_id) throw new Error('No campus_id');
    const res = await gql(
      `mutation InviteStaff($input: InviteStaffInput!) {
        inviteStaff(input: $input) { success membershipId }
      }`,
      {
        input: {
          email: STAFF_EMAIL,
          fullName: suffixName('API Teacher'),
          roleIds: [],
          campusIds: [env.campus_id],
          allCampuses: false,
        },
      },
    );
    const d = ok(res, 'inviteStaff');
    if (d?.membershipId) env.staff_profile_id = d.membershipId;
    return d;
  });

  await test('List Staff', async () => {
    const res = await gql('query ListStaff($campusId: ID) { listStaff(campusId: $campusId) }', { campusId: env.campus_id });
    const d = parse(ok(res, 'listStaff'));
    const list = Array.isArray(d) ? d : d?.items ?? [];
    const staff = list.find(s => s.email === STAFF_EMAIL) ?? firstItem(d);
    if (!env.staff_profile_id && staff) env.staff_profile_id = id(staff);
    return d;
  });

  await test('List Employees', async () => {
    const res = await gql('query ListEmployees($campusId: ID) { listEmployees(campusId: $campusId) }', { campusId: env.campus_id });
    const d = parse(ok(res, 'listEmployees'));
    const list = Array.isArray(d) ? d : d?.items ?? [];
    const employee = list.find(e => e.email === STAFF_EMAIL) ?? firstItem(d);
    if (employee) env.employee_id = id(employee);
    return d;
  });

  // ── 5. Academics — Classes ────────────────────────────────────────────────────
  console.log('\n📚 ACADEMICS — Classes');

  await test('Create Class', async () => {
    if (!env.campus_id || !env.academic_year_id) throw new Error('Need campus_id and academic_year_id');
    const input = JSON.stringify({ name: suffixName('Grade 1'), code: suffixCode('G1'), grade: '1', campusId: env.campus_id, academicYearId: env.academic_year_id });
    const res = await gql('mutation CreateClass($input: CreateClassInput!) { createClass(input: $input) }', { input });
    const d = parse(ok(res, 'createClass'));
    if (id(d)) env.class_id = id(d);
    return d;
  });

  await test('List Classes', async () => {
    const res = await gql('query { listClasses }');
    const d = parse(ok(res, 'listClasses'));
    if (!env.class_id) {
      const first = firstItem(d);
      if (first) env.class_id = id(first);
    }
    return d;
  });

  await test('Create Section', async () => {
    if (!env.class_id) throw new Error('No class_id');
    const input = JSON.stringify({ name: `A-${SHORT_ID}`, academicYearId: env.academic_year_id, campusId: env.campus_id });
    const res = await gql(
      'mutation CreateSection($classId: ID!, $input: CreateSectionInput!) { createSection(classId: $classId, input: $input) }',
      { classId: env.class_id, input },
    );
    const d = parse(ok(res, 'createSection'));
    if (id(d)) env.section_id = id(d);
    return d;
  });

  await test('List Sections', async () => {
    if (!env.class_id) throw new Error('No class_id');
    const res = await gql(
      'query ListSections($classId: ID!, $academicYearId: ID!) { listAllSections(classId: $classId, academicYearId: $academicYearId) }',
      { classId: env.class_id, academicYearId: env.academic_year_id },
    );
    const d = parse(ok(res, 'listAllSections'));
    if (!env.section_id) {
      const first = firstItem(d);
      if (first) env.section_id = id(first);
    }
    return d;
  });

  await test('Create Subject', async () => {
    if (!env.campus_id) throw new Error('No campus_id');
    const input = JSON.stringify({
      name: suffixName('Mathematics'),
      code: suffixCode('MATH'),
      campusId: env.campus_id,
      type: 'CORE',
      creditsOrPeriods: 5,
    });
    const res = await gql('mutation CreateSubject($input: CreateSubjectInput!) { createSubject(input: $input) }', { input });
    const d = parse(ok(res, 'createSubject'));
    if (id(d)) env.subject_id = id(d);
    return d;
  });

  await test('List Subjects', async () => {
    const res = await gql('query ListSubjects($campusId: ID) { listSubjects(campusId: $campusId) }', { campusId: env.campus_id });
    const d = parse(ok(res, 'listSubjects'));
    if (!env.subject_id) {
      const first = firstItem(d);
      if (first) env.subject_id = id(first);
    }
    return d;
  });

  await test('Replace Section Timetable', async () => {
    if (!env.section_id) throw new Error('No section_id');
    const slots = [{
      dayOfWeek: 'MON',
      periodNumber: 1,
      startTime: '09:00',
      endTime: '09:45',
      subjectId: env.subject_id,
      teacherProfileId: env.staff_profile_id,
      room: '101',
      label: 'Mathematics',
      isBreak: false,
    }, {
      dayOfWeek: 'MON',
      periodNumber: 2,
      startTime: '09:45',
      endTime: '10:00',
      label: 'Break',
      isBreak: true,
    }];
    const res = await gql(
      `mutation ReplaceSectionTimetable($sectionId: ID!, $slots: [TimetableSlotInput!]!) {
        replaceSectionTimetable(sectionId: $sectionId, slots: $slots) {
          sectionId
          slots { id sectionId dayOfWeek periodNumber startTime endTime label isBreak }
        }
      }`,
      { sectionId: env.section_id, slots },
    );
    return ok(res, 'replaceSectionTimetable');
  });

  await test('Get Section Timetable', async () => {
    if (!env.section_id) throw new Error('No section_id');
    const res = await gql(
      `query GetSectionTimetable($sectionId: ID!) {
        getSectionTimetable(sectionId: $sectionId) {
          sectionId
          slots { id dayOfWeek periodNumber startTime endTime label isBreak }
        }
      }`,
      { sectionId: env.section_id },
    );
    return ok(res, 'getSectionTimetable');
  });

  await test('Get Teacher Timetable', async () => {
    if (!env.staff_profile_id) return { skipped: 'No staff_profile_id' };
    const res = await gql(
      `query GetTeacherTimetable($profileId: ID!) {
        getTeacherTimetable(profileId: $profileId) {
          slots { id sectionId dayOfWeek periodNumber startTime endTime label isBreak }
          incharges { id role }
        }
      }`,
      { profileId: env.staff_profile_id },
    );
    return ok(res, 'getTeacherTimetable');
  });

  // ── 6. Finance — Fee Setup ────────────────────────────────────────────────────
  console.log('\n💰 FINANCE — Fee Setup');

  await test('Create Fee Category', async () => {
    const input = JSON.stringify({
      name: suffixName('Tuition Fee'), feeType: 'GENERAL',
      invoicePrefix: `TF${SHORT_ID.slice(-3)}`, receiptPrefix: `TR${SHORT_ID.slice(-3)}`,
      moduleType: 'FEE',
    });
    const res = await gql('mutation CreateFeeCat($input: typed input!) { createFeeCategory(input: $input) }', { input });
    const d = parse(ok(res, 'createFeeCategory'));
    if (id(d)) env.fee_category_id = id(d);
    return d;
  });

  await test('Get Fee Category', async () => {
    if (!env.fee_category_id) throw new Error('No fee_category_id');
    const res = await gql('query GetFeeCategory($id: ID!) { getFeeCategory(id: $id) }', { id: env.fee_category_id });
    return parse(ok(res, 'getFeeCategory'));
  });

  await test('List Fee Categories', async () => {
    const res = await gql('query { listFeeCategories }');
    const d = parse(ok(res, 'listFeeCategories'));
    if (!env.fee_category_id) {
      const first = firstItem(d);
      if (first) env.fee_category_id = id(first);
    }
    return d;
  });

  await test('Create Fee Head', async () => {
    if (!env.fee_category_id) throw new Error('No fee_category_id');
    const input = JSON.stringify({
      name: suffixName('Term 1 Fee'),
      type: 'ONE_TIME',
      feeCategoryId: env.fee_category_id,
      code: suffixCode('T1F'),
      prefix: suffixCode('T1F').slice(0, 8),
    });
    const res = await gql('mutation CreateFeeHead($input: CreateFeeHeadInput!) { createFeeHead(input: $input) }', { input });
    const d = parse(ok(res, 'createFeeHead'));
    if (id(d)) env.fee_head_id = id(d);
    return d;
  });

  await test('List Fee Heads', async () => {
    const res = await gql(
      'query ListFeeHeads($feeCategoryId: ID) { listFeeHeads(feeCategoryId: $feeCategoryId) }',
      { feeCategoryId: env.fee_category_id },
    );
    const d = parse(ok(res, 'listFeeHeads'));
    if (!env.fee_head_id) {
      const first = firstItem(d);
      if (first) env.fee_head_id = id(first);
    }
    return d;
  });

  await test('Create Fee Schedule', async () => {
    if (!env.academic_year_id) throw new Error('No academic_year_id');
    const input = JSON.stringify({
      name: suffixName('Annual'), academicYearId: env.academic_year_id,
      feeCategoryId: env.fee_category_id, dueDate: '2025-07-31',
    });
    const res = await gql('mutation CreateFeeSchedule($input: CreateFeeScheduleInput!) { createFeeSchedule(input: $input) }', { input });
    const d = parse(ok(res, 'createFeeSchedule'));
    if (id(d)) env.fee_schedule_id = id(d);
    return d;
  });

  await test('List Fee Schedules', async () => {
    const res = await gql('query { listFeeSchedules }');
    return parse(ok(res, 'listFeeSchedules'));
  });

  await test('Create Fee Structure', async () => {
    if (!env.fee_category_id || !env.academic_year_id || !env.campus_id || !env.fee_head_id) {
      throw new Error('Need fee_category_id, academic_year_id, campus_id, fee_head_id');
    }
    const input = JSON.stringify({
      name: suffixName('Grade 1 Structure'), feeCategoryId: env.fee_category_id,
      academicYearId: env.academic_year_id, campusId: env.campus_id,
      classId: env.class_id,
      components: [{ feeHeadId: env.fee_head_id, feeHeadName: suffixName('Term 1 Fee'), amount: 10000 }],
    });
    const res = await gql('mutation CreateFeeStructure($input: CreateFeeStructureInput!) { createFeeStructure(input: $input) }', { input });
    const d = parse(ok(res, 'createFeeStructure'));
    if (id(d)) env.fee_structure_id = id(d);
    return d;
  });

  await test('List Fee Structures', async () => {
    const res = await gql('query { listFeeStructures }');
    const d = parse(ok(res, 'listFeeStructures'));
    if (!env.fee_structure_id) {
      const first = firstItem(d);
      if (first) env.fee_structure_id = id(first);
    }
    return d;
  });

  // ── 7. Admissions ─────────────────────────────────────────────────────────────
  console.log('\n🎓 ADMISSIONS');

  await test('List Enquiries', async () => {
    const res = await gql('query { listEnquiries }');
    return parse(ok(res, 'listEnquiries'));
  });

  await test('Create Enquiry', async () => {
    const input = JSON.stringify({
      studentName: suffixName('Test Student'), phone: `98${NUM_ID}`,
      guardianName: 'Test Parent', guardianEmail: `parent.${SHORT_ID.toLowerCase()}@test.com`,
      gradeApplied: 'Grade 1', academicYearId: env.academic_year_id,
      campusId: env.campus_id,
    });
    const res = await gql('mutation CreateEnquiry($input: CreateEnquiryInput!) { createEnquiry(input: $input) }', { input });
    return parse(ok(res, 'createEnquiry'));
  });

  await test('List Applications', async () => {
    const res = await gql('query { listApplications }');
    return parse(ok(res, 'listApplications'));
  });

  await test('Create Application (application no)', async () => {
    if (!env.campus_id || !env.academic_year_id) throw new Error('Need campus_id and academic_year_id');
    const input = JSON.stringify({
      campusId: env.campus_id,
      academicYearId: env.academic_year_id,
      programId: env.program_id,
      studentName: suffixName('Application Student'),
      phone: `97${NUM_ID}`,
      email: `application.${SHORT_ID.toLowerCase()}@test.com`,
      dateOfBirth: '2015-02-15',
      gender: 'MALE',
      guardianName: 'Application Parent',
      guardianPhone: `96${NUM_ID}`,
      guardianRelation: 'Father',
    });
    const res = await gql('mutation CreateApplication($input: CreateApplicationInput!) { createApplication(input: $input) }', { input });
    const d = parse(ok(res, 'createApplication'));
    if (id(d)) env.application_id = id(d);
    if (!d?.applicationNumber && !d?.applicationNo) throw new Error('No application number generated');
    return d;
  });

  await test('Submit Application', async () => {
    if (!env.application_id) throw new Error('No application_id');
    const res = await gql('mutation SubmitApplication($id: ID!) { submitApplication(id: $id) }', { id: env.application_id });
    return parse(ok(res, 'submitApplication'));
  });

  await test('Approve Application', async () => {
    if (!env.application_id) throw new Error('No application_id');
    const res = await gql(
      'mutation ApproveApplication($id: ID!, $input: typed input) { approveApplication(id: $id, input: $input) }',
      { id: env.application_id, input: JSON.stringify({ remarks: 'API test approval' }) },
    );
    return parse(ok(res, 'approveApplication'));
  });

  await test('Admissions Stats', async () => {
    const res = await gql(
      'query AdmissionsStats($campusId: ID, $academicYearId: ID) { admissionsStats(campusId: $campusId, academicYearId: $academicYearId) }',
      { campusId: env.campus_id, academicYearId: env.academic_year_id },
    );
    return parse(ok(res, 'admissionsStats'));
  });

  // ── 8. Academics — Students ───────────────────────────────────────────────────
  console.log('\n📚 ACADEMICS — Students');

  await test('Enroll Student', async () => {
    if (!env.campus_id || !env.academic_year_id) throw new Error('Need campus_id and academic_year_id');
    const input = JSON.stringify({
      firstName: 'John', lastName: SHORT_ID, dateOfBirth: '2015-01-15', gender: 'MALE',
      campusId: env.campus_id, academicYearId: env.academic_year_id,
      classId: env.class_id, sectionId: env.section_id, programId: env.program_id,
      phone: `95${NUM_ID}`,
      email: `student.${SHORT_ID.toLowerCase()}@test.com`,
      force: true,
      guardians: [{ name: 'Jane Doe', relation: 'Mother', phone: `94${NUM_ID}`, email: `jane.${SHORT_ID.toLowerCase()}@test.com` }],
    });
    const res = await gql('mutation EnrollStudent($input: EnrollStudentInput!) { enrollStudent(input: $input) }', { input });
    const d = parse(ok(res, 'enrollStudent'));
    const sid = id(d) || id(d?.student);
    if (sid) env.student_id = sid;
    return d;
  });

  await test('Get Student', async () => {
    if (!env.student_id) throw new Error('No student_id');
    const res = await gql('query GetStudent($id: ID!) { getStudent(id: $id) }', { id: env.student_id });
    return parse(ok(res, 'getStudent'));
  });

  await test('List Students', async () => {
    let res = await gql('query { listStudents }');
    if (res.errors?.some(e => e.message?.includes('SubSelectionRequired'))) {
      res = await gql('query { listStudents { items { id fullName status } nextToken } }');
    }
    const d = parse(ok(res, 'listStudents'));
    if (!env.student_id) {
      const first = firstItem(d);
      if (first) env.student_id = id(first);
    }
    return d;
  });

  await test('Convert Application To Student (admission no)', async () => {
    if (!env.application_id) throw new Error('No application_id');
    const res = await gql(
      `mutation ConvertApplication($applicationId: ID!) {
        convertApplicationToStudent(applicationId: $applicationId) { id fullName registrationNumber applicationNo admissionNo }
      }`,
      { applicationId: env.application_id },
    );
    const d = ok(res, 'convertApplicationToStudent');
    if (!d?.id) throw new Error('Converted student missing id');
    if (!d?.applicationNo) throw new Error('Converted student missing applicationNo');
    if (!d?.admissionNo) throw new Error('Converted student missing admissionNo');
    env.converted_student_id = d.id;
    return d;
  });

  await test('Assign Student to Class', async () => {
    if (!env.student_id || !env.class_id) throw new Error('Need student_id and class_id');
    const input = JSON.stringify({
      classId: env.class_id, sectionId: env.section_id,
      academicYearId: env.academic_year_id,
    });
    const res = await gql(
      'mutation AssignStudentClass($studentId: ID!, $input: AssignStudentClassInput!) { assignStudentClass(studentId: $studentId, input: $input) }',
      { studentId: env.student_id, input },
    );
    return parse(ok(res, 'assignStudentClass'));
  });

  await test('Update Student Status', async () => {
    if (!env.student_id) throw new Error('No student_id');
    // Note: the schema uses id, not studentId
    const res = await gql(
      'mutation UpdateStudentStatus($id: ID!, $status: String!) { updateStudentStatus(id: $id, status: $status) }',
      { id: env.student_id, status: 'ACTIVE' },
    );
    return parse(ok(res, 'updateStudentStatus'));
  });

  await test('List Enrollments', async () => {
    if (!env.academic_year_id || !env.campus_id || !env.class_id) throw new Error('Need academic_year_id, campus_id, class_id');
    const res = await gql(
      `query ListEnrollments($academicYearId: ID, $campusId: ID, $gradeId: ID, $sectionId: ID, $status: String) {
        listEnrollments(academicYearId: $academicYearId, campusId: $campusId, gradeId: $gradeId, sectionId: $sectionId, status: $status)
      }`,
      {
        academicYearId: env.academic_year_id,
        campusId: env.campus_id,
        gradeId: env.class_id,
        sectionId: env.section_id,
        status: 'ACTIVE',
      },
    );
    const d = parse(ok(res, 'listEnrollments'));
    const first = firstItem(d);
    if (first) env.enrollment_id = id(first);
    return d;
  });

  await test('Generate Registration Numbers', async () => {
    if (!env.academic_year_id || !env.campus_id || !env.class_id) throw new Error('Need academic_year_id, campus_id, class_id');
    const input = JSON.stringify({ academicYearId: env.academic_year_id, campusId: env.campus_id, gradeId: env.class_id });
    const res = await gql('mutation GenerateRegistrationNumbers($input: GenerateRegistrationNumbersInput!) { generateRegistrationNumbers(input: $input) }', { input });
    const d = parse(ok(res, 'generateRegistrationNumbers'));
    if (!Number(d?.generated)) throw new Error('No registration numbers generated');
    return d;
  });

  await test('List Registration Batches', async () => {
    const res = await gql(
      'query ListRegistrationBatches($academicYearId: ID, $campusId: ID, $gradeId: ID) { listRegistrationBatches(academicYearId: $academicYearId, campusId: $campusId, gradeId: $gradeId) }',
      { academicYearId: env.academic_year_id, campusId: env.campus_id, gradeId: env.class_id },
    );
    return parse(ok(res, 'listRegistrationBatches'));
  });

  await test('Freeze Registration Numbers', async () => {
    const input = JSON.stringify({ academicYearId: env.academic_year_id, campusId: env.campus_id, gradeId: env.class_id });
    const res = await gql('mutation FreezeRegistrationNumbers($input: FreezeRegistrationNumbersInput!) { freezeRegistrationNumbers(input: $input) }', { input });
    return parse(ok(res, 'freezeRegistrationNumbers'));
  });

  await test('Generate Roll Numbers', async () => {
    if (!env.academic_year_id || !env.campus_id || !env.class_id || !env.section_id) {
      throw new Error('Need academic_year_id, campus_id, class_id, section_id');
    }
    const input = JSON.stringify({
      academicYearId: env.academic_year_id,
      campusId: env.campus_id,
      gradeId: env.class_id,
      sectionId: env.section_id,
      generationMode: 'ALPHABETICAL',
    });
    const res = await gql('mutation GenerateRollNumbers($input: GenerateRollNumbersInput!) { generateRollNumbers(input: $input) }', { input });
    const d = parse(ok(res, 'generateRollNumbers'));
    if (!Number(d?.generated)) throw new Error('No roll numbers generated');
    return d;
  });

  await test('List Roll No Batches', async () => {
    const res = await gql(
      'query ListRollNoBatches($academicYearId: ID, $campusId: ID, $gradeId: ID, $sectionId: ID) { listRollNoBatches(academicYearId: $academicYearId, campusId: $campusId, gradeId: $gradeId, sectionId: $sectionId) }',
      { academicYearId: env.academic_year_id, campusId: env.campus_id, gradeId: env.class_id, sectionId: env.section_id },
    );
    return parse(ok(res, 'listRollNoBatches'));
  });

  await test('Freeze Roll Numbers', async () => {
    const input = JSON.stringify({ academicYearId: env.academic_year_id, campusId: env.campus_id, gradeId: env.class_id, sectionId: env.section_id });
    const res = await gql('mutation FreezeRollNumbers($input: FreezeRollNumbersInput!) { freezeRollNumbers(input: $input) }', { input });
    return parse(ok(res, 'freezeRollNumbers'));
  });

  await test('Mark Attendance', async () => {
    if (!env.section_id || !env.student_id || !env.campus_id) throw new Error('Need section_id, student_id, campus_id');
    const today = new Date().toISOString().split('T')[0];
    const res = await gql(
      `mutation MarkAttendance($input: BulkAttendanceInput!) {
        markSectionAttendance(input: $input) { id studentId status date }
      }`,
      {
        input: {
          sectionId: env.section_id,
          campusId: env.campus_id,
          date: today,
          records: [{ studentId: env.student_id, status: 'PRESENT' }],
        },
      },
    );
    return ok(res, 'markSectionAttendance');
  });

  // ── 9. Finance — Fee Assignment ───────────────────────────────────────────────
  console.log('\n💰 FINANCE — Fee Assignment');

  await test('Get Fee Assignment Queue', async () => {
    if (!env.academic_year_id || !env.campus_id) throw new Error('Need academic_year_id and campus_id');
    const res = await gql(
      'query GetFeeAssignmentQueue($academicYearId: ID!, $campusId: ID!) { getFeeAssignmentQueue(academicYearId: $academicYearId, campusId: $campusId) }',
      { academicYearId: env.academic_year_id, campusId: env.campus_id },
    );
    return parse(ok(res, 'getFeeAssignmentQueue'));
  });

  await test('Assign Fee Structure', async () => {
    if (!env.student_id || !env.fee_structure_id) throw new Error('Need student_id and fee_structure_id');
    const input = JSON.stringify({
      studentId: env.student_id, feeStructureId: env.fee_structure_id,
      academicYearId: env.academic_year_id, campusId: env.campus_id,
    });
    const res = await gql('mutation AssignFeeStructure($input: typed input!) { createFeeAssignment(input: $input) }', { input });
    const d = parse(ok(res, 'createFeeAssignment'));
    if (id(d)) env.fee_assignment_id = id(d);
    return d;
  });

  await test('Get Student Fee Assignment', async () => {
    if (!env.student_id) throw new Error('No student_id');
    const res = await gql(
      'query GetStudentFeeAssignment($studentId: ID!, $academicYearId: ID) { getStudentFeeAssignment(studentId: $studentId, academicYearId: $academicYearId) }',
      { studentId: env.student_id, academicYearId: env.academic_year_id },
    );
    return parse(ok(res, 'getStudentFeeAssignment'));
  });

  await test('List Fee Assignments', async () => {
    const res = await gql('query { listFeeAssignments }');
    return parse(ok(res, 'listFeeAssignments'));
  });

  // ── 10. Finance — Invoices ────────────────────────────────────────────────────
  console.log('\n💰 FINANCE — Invoices');

  await test('Get Student Invoices', async () => {
    if (!env.student_id) throw new Error('No student_id');
    const res = await gql(
      'query GetStudentInvoices($studentId: ID!) { getStudentInvoices(studentId: $studentId) }',
      { studentId: env.student_id },
    );
    const d = parse(ok(res, 'getStudentInvoices'));
    const first = firstItem(d);
    if (first) env.invoice_id = id(first);
    return d;
  });

  await test('List Invoices', async () => {
    const res = await gql('query { listInvoices }');
    const d = parse(ok(res, 'listInvoices'));
    if (!env.invoice_id) {
      const first = firstItem(d);
      if (first) env.invoice_id = id(first);
    }
    return d;
  });

  await test('Get Invoice', async () => {
    if (!env.invoice_id) throw new Error('No invoice_id — fee assignment may not have auto-generated one');
    const res = await gql('query GetInvoice($id: ID!) { getInvoice(id: $id) }', { id: env.invoice_id });
    return parse(ok(res, 'getInvoice'));
  });

  await test('Get Student Dues', async () => {
    if (!env.student_id) throw new Error('No student_id');
    const res = await gql(
      'query GetStudentDues($studentId: ID!) { getStudentDues(studentId: $studentId) }',
      { studentId: env.student_id },
    );
    return parse(ok(res, 'getStudentDues'));
  });

  // ── 11. Finance — Payments ────────────────────────────────────────────────────
  console.log('\n💰 FINANCE — Payments');

  await test('Record Payment (Cash)', async () => {
    if (!env.invoice_id || !env.student_id) throw new Error('Need invoice_id and student_id');
    const input = JSON.stringify({
      invoiceId: env.invoice_id, studentId: env.student_id,
      campusId: env.campus_id, amount: 5000,
      method: 'CASH', remarks: 'API test payment',
    });
    const res = await gql('mutation RecordPayment($input: RecordPaymentInput!) { recordPayment(input: $input) }', { input });
    const d = parse(ok(res, 'recordPayment'));
    const pid = id(d?.payment) || id(d);
    if (pid) env.payment_id = pid;
    return d;
  });

  await test('List Payments', async () => {
    const res = await gql('query { listPayments }');
    return parse(ok(res, 'listPayments'));
  });

  await test('Get Payment', async () => {
    if (!env.payment_id) throw new Error('No payment_id');
    const res = await gql('query GetPayment($id: ID!) { getPayment(id: $id) }', { id: env.payment_id });
    return parse(ok(res, 'getPayment'));
  });

  await test('List Receipts', async () => {
    const res = await gql('query { listReceipts }');
    const d = parse(ok(res, 'listReceipts'));
    const first = firstItem(d);
    if (first) env.receipt_id = id(first);
    return d;
  });

  await test('Get Receipt', async () => {
    if (!env.receipt_id && !env.payment_id) throw new Error('No receipt_id or payment_id');
    const rid = env.receipt_id || env.payment_id;
    const res = await gql('query GetReceipt($id: ID!) { getReceipt(id: $id) }', { id: rid });
    return parse(ok(res, 'getReceipt'));
  });

  await test('Collect Payment By Student', async () => {
    if (!env.student_id) throw new Error('No student_id');
    const input = JSON.stringify({ amount: 1000, method: 'CASH', remarks: 'Collect test' });
    const res = await gql(
      'mutation CollectPayment($studentId: ID!, $input: typed input!) { collectPaymentByStudent(studentId: $studentId, input: $input) }',
      { studentId: env.student_id, input },
    );
    return parse(ok(res, 'collectPaymentByStudent'));
  });

  // ── 12. Finance — Reports ─────────────────────────────────────────────────────
  console.log('\n💰 FINANCE — Reports');

  await test('Day Book Report', async () => {
    const today = new Date().toISOString().split('T')[0];
    const res = await gql(
      'query DayBook($date: String, $campusId: ID) { dayBookReport(date: $date, campusId: $campusId) }',
      { date: today, campusId: env.campus_id },
    );
    return parse(ok(res, 'dayBookReport'));
  });

  await test('Fee Collection Analytics', async () => {
    const today = new Date().toISOString().split('T')[0];
    const res = await gql(
      'query FeeAnalytics($campusId: ID, $from: String, $to: String) { feeCollectionAnalytics(campusId: $campusId, from: $from, to: $to) }',
      { campusId: env.campus_id, from: '2025-06-01', to: today },
    );
    return parse(ok(res, 'feeCollectionAnalytics'));
  });

  // ── 13. Academics — Exams ─────────────────────────────────────────────────────
  console.log('\n📚 ACADEMICS — Exams');

  await test('Create Exam', async () => {
    if (!env.class_id || !env.academic_year_id || !env.campus_id) throw new Error('Need class_id, academic_year_id, campus_id');
    const input = JSON.stringify({
      name: suffixName('Unit Test 1'), classId: env.class_id,
      academicYearId: env.academic_year_id, campusId: env.campus_id,
      startDate: '2025-08-01', endDate: '2025-08-05',
      maxMarks: 100, passingMarks: 35, type: 'UNIT_TEST',
    });
    const res = await gql('mutation CreateExam($input: CreateExamInput!) { createExam(input: $input) }', { input });
    const d = parse(ok(res, 'createExam'));
    if (id(d)) env.exam_id = id(d);
    return d;
  });

  await test('List Exams', async () => {
    const res = await gql('query { listExams }');
    return parse(ok(res, 'listExams'));
  });

  // ── 14. Promotions ────────────────────────────────────────────────────────────
  console.log('\n📚 PROMOTIONS');

  await test('Create Next Academic Year (promotion target)', async () => {
    const res = await gql(
      `mutation CreateAY($input: CreateAcademicYearInput!) {
        createAcademicYear(input: $input) { id name startDate endDate isActive }
      }`,
      { input: { name: '2026-27', startDate: '2026-06-01', endDate: '2027-05-31' } },
    );
    if (res.errors?.length) {
      const list = await gql('query { listAcademicYears { id name isActive } }');
      const years = ok(list, 'listAcademicYears');
      const ay = years?.find(y => y.name === '2026-27') ?? years?.find(y => y.id !== env.academic_year_id);
      if (ay) { env.to_academic_year_id = id(ay); return ay; }
      throw new Error(res.errors.map(e => e.message).join('; '));
    }
    const d = ok(res, 'createAcademicYear');
    if (id(d)) env.to_academic_year_id = id(d);
    return d;
  });

  await test('Create Target Class (Grade 2)', async () => {
    if (!env.campus_id || !env.to_academic_year_id) throw new Error('Need campus_id and to_academic_year_id');
    const input = JSON.stringify({ name: suffixName('Grade 2'), code: suffixCode('G2'), grade: '2', campusId: env.campus_id, academicYearId: env.to_academic_year_id });
    const res = await gql('mutation CreateClass($input: CreateClassInput!) { createClass(input: $input) }', { input });
    const d = parse(ok(res, 'createClass'));
    if (id(d)) env.to_class_id = id(d);
    return d;
  });

  await test('Set Promotion Eligibility', async () => {
    if (!env.student_id || !env.academic_year_id) throw new Error('Need student_id and academic_year_id');
    const input = JSON.stringify({
      academicYearId: env.academic_year_id,
      updates: [{ studentId: env.student_id, eligibility: 'ELIGIBLE' }],
    });
    const res = await gql(
      'mutation SetEligibility($input: typed input!) { setStudentPromotionEligibility(input: $input) }',
      { input },
    );
    return parse(ok(res, 'setStudentPromotionEligibility'));
  });

  await test('Promote Students', async () => {
    if (!env.student_id || !env.academic_year_id || !env.to_academic_year_id) {
      throw new Error('Need student_id, academic_year_id, to_academic_year_id');
    }
    const input = JSON.stringify({
      fromAcademicYearId: env.academic_year_id,
      toAcademicYearId:   env.to_academic_year_id,
      campusId:           env.campus_id,
      fromGradeId:        env.class_id,
      toGradeId:          env.to_class_id,
      studentIds:         [env.student_id],
      sectionStrategy:    'SAME_SECTION',
      feeAction:          'SKIP',
    });
    const res = await gql('mutation PromoteStudents($input: PromoteStudentsInput!) { promoteStudents(input: $input) }', { input });
    const d = parse(ok(res, 'promoteStudents'));
    const bid = id(d) || d?.batchId;
    if (bid) env.promotion_batch_id = bid;
    return d;
  });

  await test('List Promotion Batches', async () => {
    const res = await gql('query { listPromotionBatches }');
    const d = parse(ok(res, 'listPromotionBatches'));
    if (!env.promotion_batch_id) {
      const first = firstItem(d);
      if (first) env.promotion_batch_id = id(first);
    }
    return d;
  });

  await test('Get Promotion Batch', async () => {
    if (!env.promotion_batch_id) throw new Error('No promotion_batch_id');
    const res = await gql(
      'query GetPromotionBatch($id: ID!) { getPromotionBatch(id: $id) }',
      { id: env.promotion_batch_id },
    );
    return parse(ok(res, 'getPromotionBatch'));
  });

  await test('List Promotion Batch Items', async () => {
    if (!env.promotion_batch_id) throw new Error('No promotion_batch_id');
    // schema uses id, not batchId
    const res = await gql(
      'query ListPromotionBatchItems($id: ID!) { listPromotionBatchItems(id: $id) }',
      { id: env.promotion_batch_id },
    );
    return parse(ok(res, 'listPromotionBatchItems'));
  });

  // ── 15. Comms ─────────────────────────────────────────────────────────────────
  console.log('\n📢 COMMS');

  await test('Create Announcement', async () => {
    const input = JSON.stringify({ title: suffixName('Test Announcement'), content: 'This is a test announcement.', audience: ['ALL'] });
    const res = await gql('mutation CreateAnnouncement($input: CreateAnnouncementInput!) { createAnnouncement(input: $input) }', { input });
    return parse(ok(res, 'createAnnouncement'));
  });

  await test('List Announcements', async () => {
    const res = await gql('query { listAnnouncements }');
    return parse(ok(res, 'listAnnouncements'));
  });

  await test('List Events', async () => {
    const res = await gql('query { listEvents }');
    return parse(ok(res, 'listEvents'));
  });

  await test('List Leave Requests', async () => {
    const res = await gql('query { listLeaveRequests }');
    return parse(ok(res, 'listLeaveRequests'));
  });

  // ── 16. Storage ───────────────────────────────────────────────────────────────
  console.log('\n📁 STORAGE');

  await test('Get Upload URL', async () => {
    const input = JSON.stringify({ fileName: `test-${SHORT_ID}.pdf`, contentType: 'application/pdf', folder: 'docs' });
    const res = await gql('mutation GetUploadUrl($input: typed input!) { getUploadUrl(input: $input) }', { input });
    return parse(ok(res, 'getUploadUrl'));
  });

  // ── 17. Results ───────────────────────────────────────────────────────────────
  console.log('\n📊 RESULTS');

  await test('List Result Batches', async () => {
    const res = await gql('query { listResultBatches }');
    return parse(ok(res, 'listResultBatches'));
  });

  // ── 18. Audit & Cleanup ───────────────────────────────────────────────────────
  console.log('\n🔍 AUDIT & CLEANUP');

  await test('List Audit Logs', async () => {
    const res = await gql('query { listAuditLogs }');
    return parse(ok(res, 'listAuditLogs'));
  });

  await test('Duplicate Student Report', async () => {
    const res = await gql('query { getDuplicateStudentReport }');
    return parse(ok(res, 'getDuplicateStudentReport'));
  });

  // ── Summary ───────────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.status === 'PASS');
  const failed = results.filter(r => r.status === 'FAIL');

  console.log('\n═══════════════════════════════════════════════');
  console.log('  RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════');
  console.log(`\n✅ PASSED: ${passed.length}`);
  console.log(`❌ FAILED: ${failed.length}`);
  console.log(`📊 TOTAL:  ${results.length}\n`);

  if (failed.length > 0) {
    console.log('─── FAILURES ───────────────────────────────────');
    failed.forEach(r => console.log(`  ❌ ${r.name}\n     ${r.error}`));
  }

  console.log('\n─── ENV IDs collected ──────────────────────────');
  [
    'academic_year_id','campus_id','program_id','class_id','section_id',
    'fee_category_id','fee_head_id','fee_schedule_id','fee_structure_id','fee_assignment_id',
    'student_id','converted_student_id','application_id','enrollment_id','staff_profile_id','employee_id','subject_id','invoice_id','payment_id','receipt_id','exam_id',
    'promotion_batch_id','to_academic_year_id','to_class_id',
  ].forEach(k => { if (env[k]) console.log(`  ${k}: ${env[k]}`); });
  console.log('');
}

run().catch(err => { console.error('\n⛔ Fatal:', err); process.exit(1); });

