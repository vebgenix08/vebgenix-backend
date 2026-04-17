"use strict";

const { getPrisma } = require("lambda-shared/db");
const { withTenant } = require("lambda-shared/withTenant");
const { extractIdentity } = require("lambda-shared/identity");

/**
 * UsersLambda — AppSync resolver for User (Profile) domain
 *
 * DB table: profiles
 * All queries use withTenant() which enables RLS via SET LOCAL app.tenant_id
 */
exports.handler = async (event) => {
  const { fieldName, arguments: args, identity } = event;

  // Extract context (supports both Cognito and Lambda auth)
  const { tenantId, userId, email, globalRoles } = extractIdentity(identity);

  console.log(JSON.stringify({ fieldName, tenantId, userId }));

  const prisma = await getPrisma();

  switch (fieldName) {
    // ── Query.me ──────────────────────────────────────────────────────────────
    case "me": {
      const profile = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            personaRole: true,
            isActive: true,
            tenantId: true,
            createdAt: true,
          },
        }),
      );
      if (!profile) {
        // First login — profile may not exist yet, return Cognito data
        return {
          id: userId,
          email,
          fullName: identity?.claims?.name ?? "",
          role: globalRoles[0] ?? "STAFF",
          tenantId,
          active: true,
          createdAt: new Date().toISOString(),
        };
      }
      return mapProfile(profile);
    }

    // ── Query.listUsers ────────────────────────────────────────────────────────
    case "listUsers": {
      const { limit = 50, nextToken } = args ?? {};
      const cursor = nextToken ? { id: nextToken } : undefined;

      const profiles = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.findMany({
          where: { isActive: true },
          take: limit,
          skip: cursor ? 1 : 0,
          cursor,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            personaRole: true,
            isActive: true,
            tenantId: true,
            createdAt: true,
          },
        }),
      );

      const nextCursor =
        profiles.length === limit ? profiles[profiles.length - 1].id : null;
      return { items: profiles.map(mapProfile), nextToken: nextCursor };
    }

    // ── Query.getUser ──────────────────────────────────────────────────────────
    case "getUser": {
      const { id } = args;
      const profile = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.findUniqueOrThrow({
          where: { id },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            personaRole: true,
            isActive: true,
            tenantId: true,
            createdAt: true,
          },
        }),
      );

      // 3. Publish UserWelcome -> EmailWorker sends welcome email
      const {
        EventBridgeClient: EbClient,
        PutEventsCommand: PeCmd,
      } = require("@aws-sdk/client-eventbridge");
      await new EbClient({}).send(
        new PeCmd({
          Entries: [
            {
              EventBusName: process.env.EVENT_BUS_NAME,
              Source: "vebgenix.users",
              DetailType: "UserWelcome",
              Detail: JSON.stringify({ fullName, email, role, tenantId }),
            },
          ],
        }),
      );

      return mapProfile(profile);
    }

    // ── Mutation.createUser ────────────────────────────────────────────────────
    case "createUser": {
      const { email, fullName, role, temporaryPassword } = args.input;

      // 1. Create Cognito user (provisioned, not self-signed-up)
      const {
        CognitoIdentityProviderClient,
        AdminCreateUserCommand,
      } = require("@aws-sdk/client-cognito-identity-provider");
      const cognitoClient = new CognitoIdentityProviderClient({});
      const userPoolId = process.env.USER_POOL_ID;
      if (!userPoolId) throw new Error("USER_POOL_ID env var not set");

      const cognitoRes = await cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: email,
          TemporaryPassword: temporaryPassword,
          UserAttributes: [
            { Name: "email", Value: email },
            { Name: "email_verified", Value: "true" },
            { Name: "name", Value: fullName },
            { Name: "custom:tenant_id", Value: tenantId },
            { Name: "custom:role", Value: role },
          ],
          DesiredDeliveryMediums: ["EMAIL"],
        }),
      );

      const sub = cognitoRes.User.Attributes.find(
        (a) => a.Name === "sub",
      )?.Value;
      if (!sub) throw new Error("Cognito did not return sub for new user");

      // 2. Create DB profile
      const profile = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.create({
          data: {
            id: sub,
            email,
            fullName,
            role,
            tenantId,
            isActive: true,
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            isActive: true,
            tenantId: true,
            createdAt: true,
          },
        }),
      );

      // 3. Publish UserWelcome -> EmailWorker sends welcome email
      const {
        EventBridgeClient: EbClient,
        PutEventsCommand: PeCmd,
      } = require("@aws-sdk/client-eventbridge");
      await new EbClient({}).send(
        new PeCmd({
          Entries: [
            {
              EventBusName: process.env.EVENT_BUS_NAME,
              Source: "vebgenix.users",
              DetailType: "UserWelcome",
              Detail: JSON.stringify({ fullName, email, role, tenantId }),
            },
          ],
        }),
      );

      return mapProfile(profile);
    }

    // ── Mutation.updateUser ────────────────────────────────────────────────────
    case "updateUser": {
      const { id, input } = args;
      const profile = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.update({
          where: { id },
          data: {
            ...(input.fullName !== undefined && { fullName: input.fullName }),
            ...(input.role !== undefined && { role: input.role }),
            ...(input.active !== undefined && { isActive: input.active }),
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            isActive: true,
            tenantId: true,
            createdAt: true,
          },
        }),
      );

      // 3. Publish UserWelcome -> EmailWorker sends welcome email
      const {
        EventBridgeClient: EbClient,
        PutEventsCommand: PeCmd,
      } = require("@aws-sdk/client-eventbridge");
      await new EbClient({}).send(
        new PeCmd({
          Entries: [
            {
              EventBusName: process.env.EVENT_BUS_NAME,
              Source: "vebgenix.users",
              DetailType: "UserWelcome",
              Detail: JSON.stringify({ fullName, email, role, tenantId }),
            },
          ],
        }),
      );

      return mapProfile(profile);
    }

    // ── Mutation.deactivateUser ────────────────────────────────────────────────
    case "deactivateUser": {
      const { id } = args;
      const profile = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.update({
          where: { id },
          data: { isActive: false },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            isActive: true,
            tenantId: true,
            createdAt: true,
          },
        }),
      );

      // 3. Publish UserWelcome -> EmailWorker sends welcome email
      const {
        EventBridgeClient: EbClient,
        PutEventsCommand: PeCmd,
      } = require("@aws-sdk/client-eventbridge");
      await new EbClient({}).send(
        new PeCmd({
          Entries: [
            {
              EventBusName: process.env.EVENT_BUS_NAME,
              Source: "vebgenix.users",
              DetailType: "UserWelcome",
              Detail: JSON.stringify({ fullName, email, role, tenantId }),
            },
          ],
        }),
      );

      return mapProfile(profile);
    }

    // ── Query.listStaffProfiles ───────────────────────────────────────────────
    case "listStaffProfiles": {
      const { campusId, staffCategory, staffType } = args ?? {};
      const staff = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.findMany({
          where: {
            isActive: true,
            ...(staffType ? { staffType } : {}),
            ...(campusId ? { campusAccess: { some: { campusId } } } : {}),
            ...(staffCategory ? { employee: { staffCategory } } : {}),
          },
          include: {
            employee: true,
            campusAccess: true,
            reportingLines: {
              where: campusId ? { campusId } : undefined,
              include: { reportsTo: { select: { id: true, fullName: true } } },
            },
          },
          orderBy: { fullName: "asc" },
        }),
      );
      return staff.map(mapStaffProfile);
    }

    // ── Query.listCandidateManagers ───────────────────────────────────────────
    case "listCandidateManagers": {
      const { campusId, staffCategory } = args ?? {};
      const managers = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.findMany({
          where: {
            isActive: true,
            employee: {
              isHead: true,
              ...(staffCategory ? { staffCategory } : {}),
            },
            campusAccess: { some: { campusId } },
          },
          include: {
            employee: true,
            campusAccess: true,
            reportingLines: {
              where: { campusId },
              include: { reportsTo: { select: { id: true, fullName: true } } },
            },
          },
          orderBy: { fullName: "asc" },
        }),
      );
      return managers.map(mapStaffProfile);
    }

    // ── Query.getStaffProfile ─────────────────────────────────────────────────
    case "getStaffProfile": {
      const { profileId } = args;
      const profile = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.profile.findUniqueOrThrow({
          where: { id: profileId },
          include: {
            employee: true,
            campusAccess: true,
            reportingLines: {
              include: { reportsTo: { select: { id: true, fullName: true } } },
            },
          },
        }),
      );
      return mapStaffProfile(profile);
    }

    // ── Mutation.createTeachingStaff / createNonTeachingStaff ─────────────────
    case "createTeachingStaff":
    case "createNonTeachingStaff": {
      const isTeaching = fieldName === "createTeachingStaff";
      const input = args.input;
      const {
        fullName,
        email,
        phone,
        gender,
        dateOfBirth,
        employeeCode,
        joinedOn,
        employmentType,
        qualification,
        experienceYears,
        designation,
        department,
        staffType,
        primaryCampusId,
        campusIds,
        allCampusesAccess,
        reportsToProfileId,
        isHead,
        isActingHead,
        headEffectiveFrom,
        role,
        sendInvite,
      } = input;

      // Teaching-only: detect existing HOD/Principal conflict for reassignment prompt
      const TEACHING_HEAD_TYPES = ["HOD", "PRINCIPAL", "VICE_PRINCIPAL", "DEAN"];

      // 1. Create Cognito user
      const {
        CognitoIdentityProviderClient,
        AdminCreateUserCommand,
      } = require("@aws-sdk/client-cognito-identity-provider");
      const cognitoClient = new CognitoIdentityProviderClient({});
      const userPoolId = process.env.USER_POOL_ID;
      if (!userPoolId) throw new Error("USER_POOL_ID env var not set");

      const cognitoRole = role || (isTeaching ? "TEACHER" : "STAFF");

      const cognitoRes = await cognitoClient.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: email,
          ...(sendInvite ? {} : { MessageAction: "SUPPRESS" }),
          UserAttributes: [
            { Name: "email", Value: email },
            { Name: "email_verified", Value: "true" },
            { Name: "name", Value: fullName },
            { Name: "custom:tenant_id", Value: tenantId },
            { Name: "custom:role", Value: cognitoRole },
          ],
          DesiredDeliveryMediums: sendInvite ? ["EMAIL"] : [],
        }),
      );

      const sub = cognitoRes.User.Attributes.find((a) => a.Name === "sub")?.Value;
      if (!sub) throw new Error("Cognito did not return sub for new staff");

      // 2. DB operations in a transaction via withTenant
      const result = await withTenant(prisma, tenantId, userId, async (tx) => {
        // 2a. Detect existing leader conflict (for reassignment prompt)
        let replacedLeader = null;
        if (isHead && isTeaching && TEACHING_HEAD_TYPES.includes(staffType)) {
          const conflictWhere =
            staffType === "HOD"
              ? {
                  staffType: "HOD",
                  isActive: true,
                  employee: { staffCategory: "TEACHING", department },
                  campusAccess: { some: { campusId: primaryCampusId } },
                }
              : {
                  staffType,
                  isActive: true,
                  campusAccess: { some: { campusId: primaryCampusId } },
                };
          replacedLeader = await tx.profile.findFirst({
            where: conflictWhere,
            select: { id: true, fullName: true },
          });
        }

        // 2b. Create Profile
        const profile = await tx.profile.create({
          data: {
            id: sub,
            tenantId,
            email,
            fullName,
            staffType,
            allCampusesAccess: !!allCampusesAccess,
            isActive: true,
            role: cognitoRole,
          },
          include: {
            employee: true,
            campusAccess: true,
            reportingLines: {
              include: { reportsTo: { select: { id: true, fullName: true } } },
            },
          },
        });

        // 2c. Create Employee with extended fields
        await tx.employee.create({
          data: {
            tenantId,
            profileId: profile.id,
            phone: phone || null,
            designation: designation || null,
            department: department || null,
            employeeCode: employeeCode || null,
            joinedOn: joinedOn ? new Date(joinedOn) : null,
            gender: gender || null,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
            qualification: isTeaching ? (qualification || null) : null,
            experienceYears: isTeaching ? (experienceYears || null) : null,
            employmentType: employmentType || null,
            staffCategory: isTeaching ? "TEACHING" : "NON_TEACHING",
            isHead: !!isHead,
            isActingHead: !!isActingHead,
            headEffectiveFrom: headEffectiveFrom ? new Date(headEffectiveFrom) : null,
          },
        });

        // 2d. Campus access rows
        const allCampusIds = [...new Set([primaryCampusId, ...(campusIds || [])])];
        await tx.userCampusAccess.createMany({
          data: allCampusIds.map((cId) => ({ tenantId, profileId: profile.id, campusId: cId })),
          skipDuplicates: true,
        });

        // 2e. StaffReporting row for primary campus
        await tx.staffReporting.create({
          data: {
            tenantId,
            profileId: profile.id,
            campusId: primaryCampusId,
            reportsToProfileId: reportsToProfileId || null,
            reportingStatus: reportsToProfileId ? "ASSIGNED" : "PENDING",
          },
        });

        // Re-fetch with all relations for mapping
        const fullProfile = await tx.profile.findUnique({
          where: { id: profile.id },
          include: {
            employee: true,
            campusAccess: true,
            reportingLines: {
              include: { reportsTo: { select: { id: true, fullName: true } } },
            },
          },
        });

        return { profile: fullProfile, replacedLeader };
      });

      return {
        profile: mapStaffProfile(result.profile),
        replacedLeaderId: result.replacedLeader?.id ?? null,
        replacedLeaderName: result.replacedLeader?.fullName ?? null,
      };
    }

    // ── Mutation.updateStaffProfile ───────────────────────────────────────────
    case "updateStaffProfile": {
      const { profileId, input } = args;
      const {
        fullName,
        phone,
        gender,
        dateOfBirth,
        employeeCode,
        joinedOn,
        employmentType,
        qualification,
        experienceYears,
        designation,
        department,
        staffType,
        staffCategory,
        isHead,
        isActingHead,
        headEffectiveFrom,
        allCampusesAccess,
        campusIds,
        isActive,
      } = input;

      const profile = await withTenant(prisma, tenantId, userId, async (tx) => {
        // Update Profile
        await tx.profile.update({
          where: { id: profileId },
          data: {
            ...(fullName !== undefined && { fullName }),
            ...(staffType !== undefined && { staffType }),
            ...(allCampusesAccess !== undefined && { allCampusesAccess }),
            ...(isActive !== undefined && { isActive }),
          },
        });

        // Upsert Employee
        const empData = {
          ...(phone !== undefined && { phone }),
          ...(gender !== undefined && { gender }),
          ...(dateOfBirth !== undefined && { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null }),
          ...(employeeCode !== undefined && { employeeCode }),
          ...(joinedOn !== undefined && { joinedOn: joinedOn ? new Date(joinedOn) : null }),
          ...(employmentType !== undefined && { employmentType }),
          ...(qualification !== undefined && { qualification }),
          ...(experienceYears !== undefined && { experienceYears }),
          ...(designation !== undefined && { designation }),
          ...(department !== undefined && { department }),
          ...(staffCategory !== undefined && { staffCategory }),
          ...(isHead !== undefined && { isHead }),
          ...(isActingHead !== undefined && { isActingHead }),
          ...(headEffectiveFrom !== undefined && {
            headEffectiveFrom: headEffectiveFrom ? new Date(headEffectiveFrom) : null,
          }),
        };

        if (Object.keys(empData).length > 0) {
          await tx.employee.upsert({
            where: { profileId },
            update: empData,
            create: { tenantId, profileId, ...empData },
          });
        }

        // Update campus access if provided
        if (campusIds !== undefined) {
          await tx.userCampusAccess.deleteMany({ where: { profileId } });
          await tx.userCampusAccess.createMany({
            data: campusIds.map((cId) => ({ tenantId, profileId, campusId: cId })),
            skipDuplicates: true,
          });
        }

        return tx.profile.findUnique({
          where: { id: profileId },
          include: {
            employee: true,
            campusAccess: true,
            reportingLines: {
              include: { reportsTo: { select: { id: true, fullName: true } } },
            },
          },
        });
      });

      return mapStaffProfile(profile);
    }

    // ── Mutation.assignReportingManager ──────────────────────────────────────
    case "assignReportingManager": {
      const { profileId, campusId, reportsToProfileId } = args.input;
      const row = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.staffReporting.upsert({
          where: { profileId_campusId: { profileId, campusId } },
          update: {
            reportsToProfileId: reportsToProfileId || null,
            reportingStatus: reportsToProfileId ? "ASSIGNED" : "PENDING",
          },
          create: {
            tenantId,
            profileId,
            campusId,
            reportsToProfileId: reportsToProfileId || null,
            reportingStatus: reportsToProfileId ? "ASSIGNED" : "PENDING",
          },
          include: { reportsTo: { select: { id: true, fullName: true } } },
        }),
      );
      return {
        campusId: row.campusId,
        reportsToProfileId: row.reportsToProfileId,
        reportsToName: row.reportsTo?.fullName ?? null,
        reportingStatus: row.reportingStatus,
      };
    }

    // ── Mutation.bulkReassignHierarchy ────────────────────────────────────────
    case "bulkReassignHierarchy": {
      const { fromProfileId, toProfileId, campusId, profileIds } = args.input;
      await withTenant(prisma, tenantId, userId, (tx) =>
        tx.staffReporting.updateMany({
          where: {
            reportsToProfileId: fromProfileId,
            campusId,
            ...(profileIds?.length ? { profileId: { in: profileIds } } : {}),
          },
          data: {
            reportsToProfileId: toProfileId,
            reportingStatus: "ASSIGNED",
          },
        }),
      );
      return true;
    }

    default:
      throw new Error(`UsersLambda: unknown field "${fieldName}"`);
  }
};

// ── Mappers ───────────────────────────────────────────────────────────────────

// Map Prisma Profile → GraphQL User shape
function mapProfile(p) {
  return {
    id: p.id,
    email: p.email,
    fullName: p.fullName ?? "",
    role: p.role,
    tenantId: p.tenantId,
    active: p.isActive,
    createdAt: p.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

// Map Prisma Profile (with employee + campusAccess + reportingLines) → StaffProfile
function mapStaffProfile(p) {
  const emp = p.employee;
  const reporting = p.reportingLines?.[0] ?? null;
  return {
    id: p.id,
    fullName: p.fullName ?? null,
    email: p.email ?? "",
    phone: emp?.phone ?? null,
    gender: emp?.gender ?? null,
    dateOfBirth: emp?.dateOfBirth ? emp.dateOfBirth.toISOString().split("T")[0] : null,
    avatarUrl: p.avatarUrl ?? null,
    staffType: p.staffType ?? null,
    staffCategory: emp?.staffCategory ?? null,
    designation: emp?.designation ?? null,
    department: emp?.department ?? null,
    employeeCode: emp?.employeeCode ?? null,
    qualification: emp?.qualification ?? null,
    experienceYears: emp?.experienceYears ?? null,
    employmentType: emp?.employmentType ?? null,
    joinedOn: emp?.joinedOn ? emp.joinedOn.toISOString().split("T")[0] : null,
    isHead: emp?.isHead ?? false,
    isActingHead: emp?.isActingHead ?? false,
    headEffectiveFrom: emp?.headEffectiveFrom
      ? emp.headEffectiveFrom.toISOString().split("T")[0]
      : null,
    allCampusesAccess: p.allCampusesAccess ?? false,
    campusIds: p.campusAccess?.map((ca) => ca.campusId) ?? [],
    isActive: p.isActive ?? true,
    reporting: reporting
      ? {
          campusId: reporting.campusId,
          reportsToProfileId: reporting.reportsToProfileId ?? null,
          reportsToName: reporting.reportsTo?.fullName ?? null,
          reportingStatus: reporting.reportingStatus,
        }
      : null,
  };
}
