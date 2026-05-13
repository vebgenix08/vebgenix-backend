/**
 * wipe-test-data.ts
 *
 * Deletes ALL data from the dev MongoDB database and Cognito user pool,
 * EXCEPT for platform admin users (AuthUser.isPlatformAdmin === true).
 *
 * Run: npx tsx scripts/wipe-test-data.ts
 *      (from the repo root, with .env loaded automatically by tsx --env-file=.env or dotenv)
 */

import mongoose from 'mongoose';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminDeleteUserCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';

// ── Import all models directly from source (no dist build needed) ─────────────
import { AuthUser } from '../packages/db/src/models/auth/AuthUser.model';
import { Profile } from '../packages/db/src/models/auth/Profile.model';
import { Tenant } from '../packages/db/src/models/settings/Tenant.model';
import { Campus } from '../packages/db/src/models/settings/Campus.model';
import { AcademicYear } from '../packages/db/src/models/settings/AcademicYear.model';
import { Program } from '../packages/db/src/models/settings/Program.model';
import { Template } from '../packages/db/src/models/settings/Template.model';
import { TenantFeature } from '../packages/db/src/models/settings/TenantFeature.model';
import { Enquiry } from '../packages/db/src/models/admissions/Enquiry.model';
import { Application } from '../packages/db/src/models/admissions/Application.model';
import { Class } from '../packages/db/src/models/academics/Class.model';
import { Section } from '../packages/db/src/models/academics/Section.model';
import { Subject } from '../packages/db/src/models/academics/Subject.model';
import { SubjectAllocation } from '../packages/db/src/models/academics/SubjectAllocation.model';
import { Student } from '../packages/db/src/models/academics/Student.model';
import { AcademicSequence } from '../packages/db/src/models/academics/AcademicSequence.model';
import { StudentAcademicEnrollment } from '../packages/db/src/models/academics/StudentAcademicEnrollment.model';
import { AcademicRegistrationBatch } from '../packages/db/src/models/academics/AcademicRegistrationBatch.model';
import { AcademicRollNoBatch } from '../packages/db/src/models/academics/AcademicRollNoBatch.model';
import { StudentPromotionBatch } from '../packages/db/src/models/academics/StudentPromotionBatch.model';
import { StudentPromotionBatchItem } from '../packages/db/src/models/academics/StudentPromotionBatchItem.model';
import { Employee } from '../packages/db/src/models/academics/Employee.model';
import { Attendance } from '../packages/db/src/models/academics/Attendance.model';
import { Exam } from '../packages/db/src/models/academics/Exam.model';
import { Timetable } from '../packages/db/src/models/academics/Timetable.model';
import { Certificate } from '../packages/db/src/models/academics/Certificate.model';
import { PublishedResultBatch } from '../packages/db/src/models/academics/PublishedResultBatch.model';
import { FeeHead } from '../packages/db/src/models/finance/FeeHead.model';
import { FeeStructure } from '../packages/db/src/models/finance/FeeStructure.model';
import { FeeAssignment } from '../packages/db/src/models/finance/FeeAssignment.model';
import { FeeSchedule } from '../packages/db/src/models/finance/FeeSchedule.model';
import { InstallmentPlan } from '../packages/db/src/models/finance/InstallmentPlan.model';
import { FeeRevision } from '../packages/db/src/models/finance/FeeRevision.model';
import { Invoice } from '../packages/db/src/models/finance/Invoice.model';
import { Payment } from '../packages/db/src/models/finance/Payment.model';
import { FinanceSequence } from '../packages/db/src/models/finance/FinanceSequence.model';
import { FeeCategory } from '../packages/db/src/models/finance/FeeCategory.model';
import { PaymentAllocation } from '../packages/db/src/models/finance/PaymentAllocation.model';
import { Announcement } from '../packages/db/src/models/comms/Announcement.model';
import { Event } from '../packages/db/src/models/comms/Event.model';
import { LeaveRequest } from '../packages/db/src/models/comms/LeaveRequest.model';
import { AuditLog } from '../packages/db/src/models/audit/AuditLog.model';
import { PlatformAuditLog } from '../packages/db/src/models/audit/PlatformAuditLog.model';

const COLLECTIONS_TO_WIPE = [
  { model: Profile,                  name: 'Profile' },
  { model: Tenant,                   name: 'Tenant' },
  { model: Campus,                   name: 'Campus' },
  { model: AcademicYear,             name: 'AcademicYear' },
  { model: Program,                  name: 'Program' },
  { model: Template,                 name: 'Template' },
  { model: TenantFeature,            name: 'TenantFeature' },
  { model: Enquiry,                  name: 'Enquiry' },
  { model: Application,              name: 'Application' },
  { model: Class,                    name: 'Class' },
  { model: Section,                  name: 'Section' },
  { model: Subject,                  name: 'Subject' },
  { model: SubjectAllocation,        name: 'SubjectAllocation' },
  { model: Student,                  name: 'Student' },
  { model: AcademicSequence,         name: 'AcademicSequence' },
  { model: StudentAcademicEnrollment,name: 'StudentAcademicEnrollment' },
  { model: AcademicRegistrationBatch,name: 'AcademicRegistrationBatch' },
  { model: AcademicRollNoBatch,      name: 'AcademicRollNoBatch' },
  { model: StudentPromotionBatch,    name: 'StudentPromotionBatch' },
  { model: StudentPromotionBatchItem,name: 'StudentPromotionBatchItem' },
  { model: Employee,                 name: 'Employee' },
  { model: Attendance,               name: 'Attendance' },
  { model: Exam,                     name: 'Exam' },
  { model: Timetable,                name: 'Timetable' },
  { model: Certificate,              name: 'Certificate' },
  { model: PublishedResultBatch,     name: 'PublishedResultBatch' },
  { model: FeeHead,                  name: 'FeeHead' },
  { model: FeeStructure,             name: 'FeeStructure' },
  { model: FeeAssignment,            name: 'FeeAssignment' },
  { model: FeeSchedule,              name: 'FeeSchedule' },
  { model: InstallmentPlan,          name: 'InstallmentPlan' },
  { model: FeeRevision,              name: 'FeeRevision' },
  { model: Invoice,                  name: 'Invoice' },
  { model: Payment,                  name: 'Payment' },
  { model: FinanceSequence,          name: 'FinanceSequence' },
  { model: FeeCategory,              name: 'FeeCategory' },
  { model: PaymentAllocation,        name: 'PaymentAllocation' },
  { model: Announcement,             name: 'Announcement' },
  { model: Event,                    name: 'Event' },
  { model: LeaveRequest,             name: 'LeaveRequest' },
  { model: AuditLog,                 name: 'AuditLog' },
  { model: PlatformAuditLog,         name: 'PlatformAuditLog' },
] as const;

async function getAllCognitoUsers(client: CognitoIdentityProviderClient, userPoolId: string): Promise<UserType[]> {
  const users: UserType[] = [];
  let paginationToken: string | undefined;

  do {
    const res = await client.send(new ListUsersCommand({
      UserPoolId: userPoolId,
      PaginationToken: paginationToken,
      Limit: 60,
    }));
    users.push(...(res.Users ?? []));
    paginationToken = res.PaginationToken;
  } while (paginationToken);

  return users;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in environment');

  // ── Connect ──────────────────────────────────────────────────────────────────
  console.log('\nConnecting to MongoDB...');
  await mongoose.connect(uri, { bufferCommands: false });
  console.log('Connected.\n');

  // ── Safety check: find platform admins ───────────────────────────────────────
  const platformAdmins = await AuthUser.find({ isPlatformAdmin: true }).lean();

  if (platformAdmins.length === 0) {
    console.error('ABORT: No platform admin users found. Refusing to wipe — this would lock you out.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const preservedSubs = new Set(platformAdmins.map(u => u.cognitoSub));

  console.log(`Preserving ${platformAdmins.length} platform admin(s):`);
  for (const u of platformAdmins) {
    console.log(`  • ${u.email}  (cognitoSub: ${u.cognitoSub})`);
  }
  console.log();

  // ── Wipe MongoDB ─────────────────────────────────────────────────────────────
  console.log('── MongoDB wipe ────────────────────────────────────────────');

  // AuthUser: delete only non-admins
  const { deletedCount: authDeleted } = await AuthUser.deleteMany({ isPlatformAdmin: { $ne: true } });
  console.log(`  AuthUser          deleted: ${authDeleted}`);

  // All other collections: full wipe
  for (const { model, name } of COLLECTIONS_TO_WIPE) {
    const { deletedCount } = await (model as mongoose.Model<mongoose.Document>).deleteMany({});
    console.log(`  ${name.padEnd(26)}deleted: ${deletedCount}`);
  }

  console.log();

  // ── Wipe Cognito ─────────────────────────────────────────────────────────────
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const region = process.env.COGNITO_REGION ?? 'ap-south-1';

  if (!userPoolId) {
    console.warn('COGNITO_USER_POOL_ID is not set — skipping Cognito cleanup.');
    console.warn('Set it in .env and re-run to also wipe Cognito users.\n');
  } else {
    console.log('── Cognito wipe ─────────────────────────────────────────────');
    const cognito = new CognitoIdentityProviderClient({ region });
    const allUsers = await getAllCognitoUsers(cognito, userPoolId);
    console.log(`  Total Cognito users found: ${allUsers.length}`);

    let deletedCognito = 0;
    let skippedCognito = 0;

    for (const user of allUsers) {
      const sub = user.Attributes?.find(a => a.Name === 'sub')?.Value;
      const username = user.Username!;

      if (sub && preservedSubs.has(sub)) {
        console.log(`  KEEP  ${username} (platform admin)`);
        skippedCognito++;
        continue;
      }

      await cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: username }));
      console.log(`  DEL   ${username}`);
      deletedCognito++;
    }

    console.log(`\n  Cognito: deleted ${deletedCognito}, preserved ${skippedCognito}`);
    console.log();
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  await mongoose.disconnect();
  console.log('Done. Database is clean. Platform admin(s) preserved.');
}

main().catch(err => {
  console.error('\nFATAL:', err);
  process.exit(1);
});
