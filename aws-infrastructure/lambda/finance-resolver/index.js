'use strict';

const { getPrisma } = require('lambda-shared/db');
const { withTenant } = require('lambda-shared/withTenant');

/**
 * FinanceResolver — AppSync resolver for the Finance domain
 *
 * Handles:
 *  - Fee Heads CRUD: listFeeHeads, createFeeHead, updateFeeHead, deleteFeeHead
 *  - Fee Structures CRUD: listFeeStructures, createFeeStructure, deleteFeeStructure
 *  - Programs list: listPrograms
 */
exports.handler = async (event) => {
  const fieldName = event.fieldName ?? event.info?.fieldName;
  const args = event.arguments ?? {};
  const identity = event.identity ?? null;

  const tenantId = identity?.claims?.['custom:tenant_id'];
  const userId   = identity?.claims?.sub;

  console.log(JSON.stringify({ fieldName, tenantId, userId }));

  const prisma = await getPrisma();

  switch (fieldName) {

    // ── Query.listFeeHeads ───────────────────────────────────────────────────
    case 'listFeeHeads': {
      const heads = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.feeHead.findMany({
          where: { tenantId },
          orderBy: { name: 'asc' },
        })
      );
      return heads.map(mapFeeHead);
    }

    // ── Mutation.createFeeHead ───────────────────────────────────────────────
    case 'createFeeHead': {
      const { name, type, description } = args.input;
      const head = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.feeHead.create({
          data: {
            tenantId,
            name,
            type: type || 'RECURRING',
            description: description || null,
            isActive: true,
          },
        })
      );
      return mapFeeHead(head);
    }

    // ── Mutation.updateFeeHead ───────────────────────────────────────────────
    case 'updateFeeHead': {
      const { id } = args;
      const { name, type, description } = args.input;
      const head = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.feeHead.update({
          where: { id },
          data: {
            name,
            type,
            description: description !== undefined ? description : undefined,
          },
        })
      );
      return mapFeeHead(head);
    }

    // ── Mutation.deleteFeeHead ───────────────────────────────────────────────
    case 'deleteFeeHead': {
      const { id } = args;
      await withTenant(prisma, tenantId, userId, (tx) =>
        tx.feeHead.delete({ where: { id } })
      );
      return true;
    }

    // ── Query.listFeeStructures ──────────────────────────────────────────────
    case 'listFeeStructures': {
      const structures = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.feeStructure.findMany({
          where: { tenantId },
          include: {
            academicYear: { select: { id: true, name: true } },
            program:      { select: { id: true, name: true, type: true } },
            components: {
              include: {
                feeHead: { select: { id: true, name: true, type: true } },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      );
      return structures.map(mapFeeStructure);
    }

    // ── Mutation.createFeeStructure ──────────────────────────────────────────
    case 'createFeeStructure': {
      const { name, academicYearId, programId, components = [] } = args.input;

      const totalAmount = components.reduce(
        (sum, c) => sum + (parseFloat(c.amount) || 0),
        0
      );

      const structure = await withTenant(prisma, tenantId, userId, async (tx) => {
        const created = await tx.feeStructure.create({
          data: {
            tenantId,
            name,
            academicYearId: academicYearId || null,
            programId: programId || null,
            totalAmount,
            isActive: true,
            components: {
              create: components.map((c) => ({
                feeHeadId: c.feeHeadId,
                amount: parseFloat(c.amount),
                dueDate: c.dueDate ? new Date(c.dueDate) : null,
                isOptional: c.isOptional ?? false,
              })),
            },
          },
          include: {
            academicYear: { select: { id: true, name: true } },
            program:      { select: { id: true, name: true, type: true } },
            components: {
              include: {
                feeHead: { select: { id: true, name: true, type: true } },
              },
            },
          },
        });
        return created;
      });

      return mapFeeStructure(structure);
    }

    // ── Mutation.deleteFeeStructure ──────────────────────────────────────────
    case 'deleteFeeStructure': {
      const { id } = args;
      await withTenant(prisma, tenantId, userId, (tx) =>
        tx.feeStructure.delete({ where: { id } })
      );
      return true;
    }

    // ── Query.listPrograms ───────────────────────────────────────────────────
    case 'listPrograms': {
      const programs = await withTenant(prisma, tenantId, userId, (tx) =>
        tx.program.findMany({
          where: { tenantId },
          orderBy: { name: 'asc' },
        })
      );
      return programs.map((p) => ({
        id:       p.id,
        name:     p.name,
        type:     p.type || null,
        level:    null,
        isActive: true,
      }));
    }

    default:
      throw new Error(`Unhandled fieldName: ${fieldName}`);
  }
};

// ── Mappers ──────────────────────────────────────────────────────────────────

function mapFeeHead(h) {
  return {
    id:          h.id,
    name:        h.name,
    type:        h.type,
    description: h.description || null,
    isActive:    h.isActive,
    createdAt:   h.createdAt?.toISOString() || null,
  };
}

function mapFeeStructure(s) {
  return {
    id:          s.id,
    name:        s.name,
    totalAmount: parseFloat(s.totalAmount?.toString() || '0'),
    isActive:    s.isActive,
    createdAt:   s.createdAt?.toISOString() || null,
    academicYear: s.academicYear
      ? { id: s.academicYear.id, name: s.academicYear.name }
      : null,
    program: s.program
      ? { id: s.program.id, name: s.program.name, type: s.program.type || null, level: null, isActive: true }
      : null,
    components: (s.components || []).map((c) => ({
      feeHead:    { id: c.feeHead.id, name: c.feeHead.name, type: c.feeHead.type },
      amount:     parseFloat(c.amount?.toString() || '0'),
      dueDate:    c.dueDate ? c.dueDate.toISOString().split('T')[0] : null,
      isOptional: c.isOptional,
    })),
  };
}
