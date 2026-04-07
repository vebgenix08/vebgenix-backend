import { InvoiceStatus, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import prisma from "../../../infrastructure/prisma/client";

type FinanceRequest = Request & {
  tenant?: { tenantId?: string };
  campus?: { campusId?: string };
  user?: { id?: string };
};

function toNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

function generateReference(prefix: string) {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${stamp}-${suffix}`;
}

function startOfDay(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildScopedWhere(tenantId: string, campusId?: string) {
  return {
    tenantId,
    ...(campusId ? { campusId } : {}),
  };
}

function getAcademicYear(req: Request) {
  return (req.query.academicYear as string | undefined)?.trim();
}

function normalizeSnapshotLines(snapshot: unknown): Array<{
  description: string;
  quantity: number;
  unitAmount: number;
  lineTotal: number;
  metadata?: Record<string, unknown>;
}> {
  const source =
    Array.isArray(snapshot)
      ? snapshot
      : Array.isArray((snapshot as any)?.lines)
        ? (snapshot as any).lines
        : Array.isArray((snapshot as any)?.items)
          ? (snapshot as any).items
          : Array.isArray((snapshot as any)?.heads)
            ? (snapshot as any).heads
            : [];

  const lines = source
    .map((item: any, index: number) => {
      const quantity = Number(item?.quantity ?? 1);
      const rawAmount = item?.lineTotal ?? item?.amount ?? item?.value ?? item?.total ?? item?.unitAmount;
      const amount = Number(rawAmount ?? 0);
      const unitAmount =
        item?.unitAmount != null
          ? Number(item.unitAmount)
          : quantity > 0
            ? amount / quantity
            : amount;

      return {
        description:
          item?.description ??
          item?.name ??
          item?.label ??
          item?.headName ??
          item?.feeHeadName ??
          `Fee Line ${index + 1}`,
        quantity: quantity > 0 ? quantity : 1,
        unitAmount,
        lineTotal: amount > 0 ? amount : unitAmount,
        metadata: item && typeof item === "object" ? item : undefined,
      };
    })
    .filter((line: { lineTotal: number }) => line.lineTotal > 0);

  if (lines.length > 0) {
    return lines;
  }

  const fallbackAmount = Number((snapshot as any)?.totalAmount ?? (snapshot as any)?.amount ?? 0);
  if (fallbackAmount > 0) {
    return [
      {
        description: "Assigned Fee Structure",
        quantity: 1,
        unitAmount: fallbackAmount,
        lineTotal: fallbackAmount,
      },
    ];
  }

  return [];
}

function mapInvoice(invoice: any) {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    title: invoice.title,
    description: invoice.description,
    status: invoice.status,
    subtotalAmount: toNumber(invoice.subtotalAmount),
    discountAmount: toNumber(invoice.discountAmount),
    totalAmount: toNumber(invoice.totalAmount),
    paidAmount: toNumber(invoice.paidAmount),
    dueAmount: toNumber(invoice.dueAmount),
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    student: invoice.student
      ? {
          id: invoice.student.id,
          fullName: invoice.student.fullName,
          registrationNumber: invoice.student.registrationNumber,
          currentGrade: invoice.student.currentGrade,
        }
      : null,
    lineCount: invoice._count?.lines ?? invoice.lines?.length ?? 0,
  };
}

function mapPayment(payment: any) {
  return {
    id: payment.id,
    paymentNumber: payment.paymentNumber,
    amount: toNumber(payment.amount),
    method: payment.method,
    status: payment.status,
    reference: payment.reference,
    notes: payment.notes,
    paidAt: payment.paidAt,
    student: payment.student
      ? {
          id: payment.student.id,
          fullName: payment.student.fullName,
          registrationNumber: payment.student.registrationNumber,
        }
      : null,
    invoice: payment.invoice
      ? {
          id: payment.invoice.id,
          invoiceNumber: payment.invoice.invoiceNumber,
          title: payment.invoice.title,
        }
      : null,
    receipt: payment.receipt
      ? {
          id: payment.receipt.id,
          receiptNumber: payment.receipt.receiptNumber,
          issuedAt: payment.receipt.issuedAt,
        }
      : null,
  };
}

function mapReceipt(receipt: any) {
  return {
    id: receipt.id,
    receiptNumber: receipt.receiptNumber,
    amount: toNumber(receipt.amount),
    issuedAt: receipt.issuedAt,
    student: receipt.student
      ? {
          id: receipt.student.id,
          fullName: receipt.student.fullName,
          registrationNumber: receipt.student.registrationNumber,
        }
      : null,
    payment: receipt.payment
      ? {
          id: receipt.payment.id,
          paymentNumber: receipt.payment.paymentNumber,
          method: receipt.payment.method,
          reference: receipt.payment.reference,
          paidAt: receipt.payment.paidAt,
        }
      : null,
  };
}

export class FinanceController {
  static async getSummary(req: Request, res: Response) {
    try {
      const { tenantId, campusId } = FinanceController.getScope(req as FinanceRequest, res);
      if (!tenantId) return;

      const today = startOfDay();
      const monthStart = startOfMonth();
      const academicYear = getAcademicYear(req);
      const studentYearFilter = academicYear
        ? { student: { application: { academicYear } } }
        : {};

      const [
        completedToday,
        completedMonth,
        outstandingInvoices,
        receiptsToday,
        openInvoices,
        pendingAssignments,
        recentPayments,
      ] = await Promise.all([
        prisma.payment.aggregate({
          where: {
            ...buildScopedWhere(tenantId, campusId),
            status: PaymentStatus.COMPLETED,
            paidAt: { gte: today },
            ...studentYearFilter,
          },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: {
            ...buildScopedWhere(tenantId, campusId),
            status: PaymentStatus.COMPLETED,
            paidAt: { gte: monthStart },
            ...studentYearFilter,
          },
          _sum: { amount: true },
        }),
        prisma.invoice.aggregate({
          where: {
            ...buildScopedWhere(tenantId, campusId),
            status: { in: [InvoiceStatus.OPEN, InvoiceStatus.PARTIALLY_PAID] },
            ...(academicYear ? { student: { application: { academicYear } } } : {}),
          },
          _sum: { dueAmount: true },
        }),
        prisma.receipt.count({
          where: {
            ...buildScopedWhere(tenantId, campusId),
            issuedAt: { gte: today },
            ...(academicYear ? { student: { application: { academicYear } } } : {}),
          },
        }),
        prisma.invoice.count({
          where: {
            ...buildScopedWhere(tenantId, campusId),
            status: { in: [InvoiceStatus.OPEN, InvoiceStatus.PARTIALLY_PAID] },
            ...(academicYear ? { student: { application: { academicYear } } } : {}),
          },
        }),
        prisma.student.count({
          where: {
            ...buildScopedWhere(tenantId, campusId),
            ...(academicYear ? { application: { academicYear } } : {}),
            feeAssignments: { none: {} },
          },
        }),
        prisma.payment.findMany({
          where: {
            ...buildScopedWhere(tenantId, campusId),
            status: PaymentStatus.COMPLETED,
            ...studentYearFilter,
          },
          orderBy: { paidAt: "desc" },
          take: 5,
          include: {
            student: {
              select: {
                id: true,
                fullName: true,
                registrationNumber: true,
              },
            },
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                title: true,
              },
            },
            receipt: {
              select: {
                id: true,
                receiptNumber: true,
                issuedAt: true,
              },
            },
          },
        }),
      ]);

      return res.json({
        summary: {
          collectedToday: toNumber(completedToday._sum.amount),
          collectedThisMonth: toNumber(completedMonth._sum.amount),
          outstandingDue: toNumber(outstandingInvoices._sum.dueAmount),
          openInvoices,
          receiptsToday,
          pendingFeeAssignments: pendingAssignments,
        },
        recentPayments: recentPayments.map(mapPayment),
      });
    } catch (error: any) {
      return res.status(500).json({
        error: { message: error?.message || "Failed to load finance summary" },
      });
    }
  }

  static async listInvoices(req: Request, res: Response) {
    try {
      const { tenantId, campusId } = FinanceController.getScope(req as FinanceRequest, res);
      if (!tenantId) return;

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const search = (req.query.search as string | undefined)?.trim();
      const status = (req.query.status as string | undefined)?.trim() as InvoiceStatus | undefined;
      const academicYear = getAcademicYear(req);
      const skip = (page - 1) * limit;

      const where: Prisma.InvoiceWhereInput = {
        ...buildScopedWhere(tenantId, campusId),
        ...(status ? { status } : {}),
        ...(academicYear ? { student: { application: { academicYear } } } : {}),
      };

      if (search) {
        where.OR = [
          { invoiceNumber: { contains: search, mode: "insensitive" } },
          { title: { contains: search, mode: "insensitive" } },
          { student: { fullName: { contains: search, mode: "insensitive" } } },
          { student: { registrationNumber: { contains: search, mode: "insensitive" } } },
        ];
      }

      const [items, total] = await prisma.$transaction([
        prisma.invoice.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ createdAt: "desc" }],
          include: {
            student: {
              select: {
                id: true,
                fullName: true,
                registrationNumber: true,
                currentGrade: true,
              },
            },
            _count: {
              select: { lines: true },
            },
          },
        }),
        prisma.invoice.count({ where }),
      ]);

      return res.json({
        data: items.map(mapInvoice),
        total,
        pagination: {
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        error: { message: error?.message || "Failed to load invoices" },
      });
    }
  }

  static async createInvoiceFromAssignment(req: Request, res: Response) {
    try {
      const { tenantId, campusId, actorProfileId } = FinanceController.getScope(req as FinanceRequest, res);
      if (!tenantId) return;

      const { assignmentId, dueDate, title } = req.body ?? {};
      if (!assignmentId) {
        return res.status(400).json({ error: { message: "assignmentId is required" } });
      }

      const assignment = await prisma.studentFeeAssignment.findFirst({
        where: {
          id: assignmentId,
          tenantId,
          student: {
            ...(campusId ? { campusId } : {}),
          },
        },
        include: {
          student: true,
          invoices: {
            select: { id: true, invoiceNumber: true },
            take: 1,
          },
        },
      });

      if (!assignment) {
        return res.status(404).json({ error: { message: "Fee assignment not found" } });
      }

      if (assignment.invoices.length > 0) {
        return res.status(409).json({
          error: {
            message: "Invoice already exists for this fee assignment",
          },
        });
      }

      const lines = normalizeSnapshotLines(assignment.snapshotContent);
      if (lines.length === 0) {
        return res.status(422).json({
          error: {
            message: "Assigned fee structure does not contain billable line items",
          },
        });
      }

      const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      const invoiceNumber = generateReference("INV");
      const resolvedDueDate = dueDate
        ? new Date(dueDate)
        : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

      const created = await prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            tenantId,
            campusId: assignment.student.campusId,
            studentId: assignment.studentId,
            assignmentId: assignment.id,
            invoiceNumber,
            title: title?.trim() || `${assignment.structureName} v${assignment.structureVersion}`,
            description: "Invoice created from assigned fee structure",
            status: InvoiceStatus.OPEN,
            subtotalAmount: subtotal,
            discountAmount: 0,
            totalAmount: subtotal,
            paidAmount: 0,
            dueAmount: subtotal,
            dueDate: resolvedDueDate,
            metadata: {
              source: "assignment",
              structureName: assignment.structureName,
              structureVersion: assignment.structureVersion,
            },
            lines: {
              createMany: {
                data: lines.map((line) => ({
                  tenantId,
                  description: line.description,
                  quantity: line.quantity,
                  unitAmount: line.unitAmount,
                  lineTotal: line.lineTotal,
                  metadata: line.metadata
                    ? (line.metadata as Prisma.InputJsonValue)
                    : undefined,
                })),
              },
            },
          },
          include: {
            student: {
              select: {
                id: true,
                fullName: true,
                registrationNumber: true,
                currentGrade: true,
              },
            },
            _count: {
              select: { lines: true },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId: actorProfileId,
            action: "CREATE_INVOICE_FROM_ASSIGNMENT",
            entityType: "INVOICE",
            entityId: invoice.id,
            details: {
              assignmentId,
              invoiceNumber,
              studentId: assignment.studentId,
            },
          },
        });

        return invoice;
      });

      return res.status(201).json(mapInvoice(created));
    } catch (error: any) {
      return res.status(500).json({
        error: { message: error?.message || "Failed to create invoice" },
      });
    }
  }

  static async createOneOffCharge(req: Request, res: Response) {
    try {
      const { tenantId, campusId, actorProfileId } = FinanceController.getScope(req as FinanceRequest, res);
      if (!tenantId) return;

      const { studentId, title, description, amount, dueDate } = req.body ?? {};
      const normalizedAmount = Number(amount);

      if (!studentId || !title || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
        return res.status(400).json({
          error: { message: "studentId, title and a positive amount are required" },
        });
      }

      const student = await prisma.student.findFirst({
        where: {
          id: studentId,
          tenantId,
          ...(campusId ? { campusId } : {}),
        },
        select: {
          id: true,
          campusId: true,
          fullName: true,
          registrationNumber: true,
          currentGrade: true,
        },
      });

      if (!student) {
        return res.status(404).json({ error: { message: "Student not found" } });
      }

      const invoice = await prisma.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            tenantId,
            campusId: student.campusId,
            studentId: student.id,
            invoiceNumber: generateReference("INV"),
            title: title.trim(),
            description: description?.trim() || null,
            status: InvoiceStatus.OPEN,
            subtotalAmount: normalizedAmount,
            discountAmount: 0,
            totalAmount: normalizedAmount,
            paidAmount: 0,
            dueAmount: normalizedAmount,
            dueDate: dueDate ? new Date(dueDate) : null,
            metadata: {
              source: "manual_charge",
            },
            lines: {
              createMany: {
                data: [
                  {
                    tenantId,
                    description: description?.trim() || title.trim(),
                    quantity: 1,
                    unitAmount: normalizedAmount,
                    lineTotal: normalizedAmount,
                  },
                ],
              },
            },
          },
          include: {
            student: {
              select: {
                id: true,
                fullName: true,
                registrationNumber: true,
                currentGrade: true,
              },
            },
            _count: {
              select: { lines: true },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId: actorProfileId,
            action: "CREATE_MANUAL_CHARGE",
            entityType: "INVOICE",
            entityId: created.id,
            details: {
              studentId,
              amount: normalizedAmount,
              title,
            },
          },
        });

        return created;
      });

      return res.status(201).json(mapInvoice(invoice));
    } catch (error: any) {
      return res.status(500).json({
        error: { message: error?.message || "Failed to create charge" },
      });
    }
  }

  static async listPayments(req: Request, res: Response) {
    try {
      const { tenantId, campusId } = FinanceController.getScope(req as FinanceRequest, res);
      if (!tenantId) return;

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const search = (req.query.search as string | undefined)?.trim();
      const status = (req.query.status as string | undefined)?.trim() as PaymentStatus | undefined;
      const academicYear = getAcademicYear(req);
      const skip = (page - 1) * limit;

      const where: Prisma.PaymentWhereInput = {
        ...buildScopedWhere(tenantId, campusId),
        ...(status ? { status } : {}),
        ...(academicYear ? { student: { application: { academicYear } } } : {}),
      };

      if (search) {
        where.OR = [
          { paymentNumber: { contains: search, mode: "insensitive" } },
          { reference: { contains: search, mode: "insensitive" } },
          { student: { fullName: { contains: search, mode: "insensitive" } } },
          { student: { registrationNumber: { contains: search, mode: "insensitive" } } },
          { invoice: { invoiceNumber: { contains: search, mode: "insensitive" } } },
        ];
      }

      const [items, total] = await prisma.$transaction([
        prisma.payment.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ paidAt: "desc" }],
          include: {
            student: {
              select: {
                id: true,
                fullName: true,
                registrationNumber: true,
              },
            },
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                title: true,
              },
            },
            receipt: {
              select: {
                id: true,
                receiptNumber: true,
                issuedAt: true,
              },
            },
          },
        }),
        prisma.payment.count({ where }),
      ]);

      return res.json({
        data: items.map(mapPayment),
        total,
        pagination: {
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        error: { message: error?.message || "Failed to load payments" },
      });
    }
  }

  static async collectPayment(req: Request, res: Response) {
    try {
      const { tenantId, campusId, actorProfileId } = FinanceController.getScope(req as FinanceRequest, res);
      if (!tenantId) return;

      const { invoiceId, amount, method, reference, notes } = req.body ?? {};
      const normalizedAmount = Number(amount);

      if (!invoiceId || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0 || !method) {
        return res.status(400).json({
          error: { message: "invoiceId, amount and method are required" },
        });
      }

      const normalizedMethod = String(method).toUpperCase() as PaymentMethod;
      if (!Object.values(PaymentMethod).includes(normalizedMethod)) {
        return res.status(400).json({
          error: { message: "Invalid payment method" },
        });
      }

      const invoice = await prisma.invoice.findFirst({
        where: {
          id: invoiceId,
          tenantId,
          ...(campusId ? { campusId } : {}),
        },
      });

      if (!invoice) {
        return res.status(404).json({ error: { message: "Invoice not found" } });
      }

      const dueAmount = toNumber(invoice.dueAmount);
      if (invoice.status === InvoiceStatus.PAID || dueAmount <= 0) {
        return res.status(409).json({ error: { message: "Invoice is already settled" } });
      }

      if (normalizedAmount > dueAmount) {
        return res.status(400).json({
          error: { message: "Payment amount cannot exceed the current due amount" },
        });
      }

      const paymentNumber = generateReference("PAY");
      const receiptNumber = generateReference("RCT");
      const nextPaidAmount = toNumber(invoice.paidAmount) + normalizedAmount;
      const nextDueAmount = Math.max(toNumber(invoice.totalAmount) - nextPaidAmount, 0);
      const nextStatus =
        nextDueAmount === 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

      const payment = await prisma.$transaction(async (tx) => {
        const createdPayment = await tx.payment.create({
          data: {
            tenantId,
            campusId: invoice.campusId,
            studentId: invoice.studentId,
            invoiceId: invoice.id,
            paymentNumber,
            amount: normalizedAmount,
            method: normalizedMethod,
            status: PaymentStatus.COMPLETED,
            reference: reference?.trim() || null,
            notes: notes?.trim() || null,
            collectedByUserId: actorProfileId,
          },
        });

        const createdReceipt = await tx.receipt.create({
          data: {
            tenantId,
            campusId: invoice.campusId,
            studentId: invoice.studentId,
            paymentId: createdPayment.id,
            receiptNumber,
            amount: normalizedAmount,
            metadata: {
              invoiceId: invoice.id,
              paymentNumber,
            },
          },
        });

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: nextPaidAmount,
            dueAmount: nextDueAmount,
            status: nextStatus,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId: actorProfileId,
            action: "COLLECT_PAYMENT",
            entityType: "PAYMENT",
            entityId: createdPayment.id,
            details: {
              invoiceId: invoice.id,
              receiptId: createdReceipt.id,
              amount: normalizedAmount,
              method: normalizedMethod,
            },
          },
        });

        return tx.payment.findUniqueOrThrow({
          where: { id: createdPayment.id },
          include: {
            student: {
              select: {
                id: true,
                fullName: true,
                registrationNumber: true,
              },
            },
            invoice: {
              select: {
                id: true,
                invoiceNumber: true,
                title: true,
              },
            },
            receipt: {
              select: {
                id: true,
                receiptNumber: true,
                issuedAt: true,
              },
            },
          },
        });
      });

      return res.status(201).json(mapPayment(payment));
    } catch (error: any) {
      return res.status(500).json({
        error: { message: error?.message || "Failed to collect payment" },
      });
    }
  }

  static async listReceipts(req: Request, res: Response) {
    try {
      const { tenantId, campusId } = FinanceController.getScope(req as FinanceRequest, res);
      if (!tenantId) return;

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const search = (req.query.search as string | undefined)?.trim();
      const academicYear = getAcademicYear(req);
      const skip = (page - 1) * limit;

      const where: Prisma.ReceiptWhereInput = {
        ...buildScopedWhere(tenantId, campusId),
        ...(academicYear ? { student: { application: { academicYear } } } : {}),
      };

      if (search) {
        where.OR = [
          { receiptNumber: { contains: search, mode: "insensitive" } },
          { student: { fullName: { contains: search, mode: "insensitive" } } },
          { student: { registrationNumber: { contains: search, mode: "insensitive" } } },
          { payment: { paymentNumber: { contains: search, mode: "insensitive" } } },
        ];
      }

      const [items, total] = await prisma.$transaction([
        prisma.receipt.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ issuedAt: "desc" }],
          include: {
            student: {
              select: {
                id: true,
                fullName: true,
                registrationNumber: true,
              },
            },
            payment: {
              select: {
                id: true,
                paymentNumber: true,
                method: true,
                reference: true,
                paidAt: true,
              },
            },
          },
        }),
        prisma.receipt.count({ where }),
      ]);

      return res.json({
        data: items.map(mapReceipt),
        total,
        pagination: {
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        error: { message: error?.message || "Failed to load receipts" },
      });
    }
  }

  static async getReceipt(req: Request, res: Response) {
    try {
      const { tenantId, campusId } = FinanceController.getScope(req as FinanceRequest, res);
      if (!tenantId) return;

      const receiptId = req.params.receiptId;
      const receipt = await prisma.receipt.findFirst({
        where: {
          id: receiptId,
          tenantId,
          ...(campusId ? { campusId } : {}),
        },
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              registrationNumber: true,
              currentGrade: true,
            },
          },
          payment: {
            select: {
              id: true,
              paymentNumber: true,
              method: true,
              reference: true,
              paidAt: true,
              amount: true,
            },
          },
        },
      });

      if (!receipt) {
        return res.status(404).json({ error: { message: "Receipt not found" } });
      }

      return res.json(mapReceipt(receipt));
    } catch (error: any) {
      return res.status(500).json({
        error: { message: error?.message || "Failed to load receipt" },
      });
    }
  }

  static async getFeeAssignmentQueue(req: Request, res: Response) {
    try {
      const { tenantId, campusId } = FinanceController.getScope(req as FinanceRequest, res);
      if (!tenantId) return;

      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const search = (req.query.search as string | undefined)?.trim();
      const academicYear = (req.query.academicYear as string | undefined)?.trim();
      const skip = (page - 1) * limit;

      const where: any = {
        tenantId,
        ...(campusId ? { campusId } : {}),
        ...(academicYear ? { application: { academicYear } } : {}),
      };

      if (search) {
        where.OR = [
          { fullName: { contains: search, mode: "insensitive" } },
          { registrationNumber: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ];
      }

      const [students, total] = await prisma.$transaction([
        prisma.student.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            application: {
              select: {
                approvedAt: true,
                gradeApplyingFor: true,
                academicYear: true,
              },
            },
          },
        }),
        prisma.student.count({ where }),
      ]);

      const studentIds = students.map((student) => student.id);
      const assignments =
        studentIds.length > 0
          ? await prisma.studentFeeAssignment.findMany({
              where: {
                // Note: StudentFeeAssignment is scoped by studentId (students are already tenant-scoped above)
                studentId: { in: studentIds },
              },
              orderBy: { assignedAt: "desc" },
            })
          : [];

      const assignmentMap = new Map<string, (typeof assignments)[number]>();
      for (const assignment of assignments) {
        if (!assignmentMap.has(assignment.studentId)) {
          assignmentMap.set(assignment.studentId, assignment);
        }
      }

      return res.json({
        data: students.map((student) => {
          const assignment = assignmentMap.get(student.id);
          return {
            id: student.id,
            fullName: student.fullName,
            registrationNumber: student.registrationNumber,
            email: student.email,
            campusId: student.campusId,
            campusType: student.campusType,
            currentGrade: student.currentGrade,
            applicationId: student.applicationId,
            approvedAt: student.application?.approvedAt ?? null,
            academicYear: student.application?.academicYear ?? null,
            gradeApplyingFor: student.application?.gradeApplyingFor ?? null,
            hasFeeAssignment: Boolean(assignment),
            feeAssignment: assignment
              ? {
                  id: assignment.id,
                  structureName: assignment.structureName,
                  structureVersion: assignment.structureVersion,
                  assignedAt: assignment.assignedAt,
                }
              : null,
          };
        }),
        total,
        pagination: {
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      return res.status(500).json({
        error: { message: error?.message || "Failed to load fee assignment queue" },
      });
    }
  }

  static async getAssignableFeeStructures(req: Request, res: Response) {
    try {
      const { tenantId, campusId } = FinanceController.getScope(req as FinanceRequest, res);
      if (!tenantId) return;

      const studentId = req.query.studentId as string | undefined;
      if (!studentId) {
        return res.status(400).json({ error: { message: "studentId is required" } });
      }

      const student = await prisma.student.findFirst({
        where: {
          id: studentId,
          tenantId,
          ...(campusId ? { campusId } : {}),
        },
        select: {
          id: true,
          fullName: true,
          currentGrade: true,
          campusType: true,
          application: {
            select: {
              academicYear: true,
            },
          },
        },
      });

      if (!student) {
        return res.status(404).json({ error: { message: "Student not found" } });
      }

      const structures = await prisma.feeStructure.findMany({
        where: { tenantId },
        include: {
          versions: {
            orderBy: [{ isActive: "desc" }, { version: "desc" }],
          },
        },
        orderBy: { name: "asc" },
      });

      const options = structures
        .map((structure) => {
          const activeVersion = structure.versions.find((version) => version.isActive) ?? null;
          return {
            id: structure.id,
            name: structure.name,
            suggested: Boolean(activeVersion),
            versions: structure.versions.map((version) => ({
              id: version.id,
              version: version.version,
              isActive: version.isActive,
              content: version.content,
            })),
            activeVersionId: activeVersion?.id ?? null,
          };
        })
        .filter((structure) => structure.versions.length > 0);

      return res.json({
        student: {
          id: student.id,
          fullName: student.fullName,
          currentGrade: student.currentGrade,
          campusType: student.campusType,
          academicYear: student.application?.academicYear ?? null,
        },
        structures: options,
      });
    } catch (error: any) {
      return res.status(500).json({
        error: { message: error?.message || "Failed to load fee structures" },
      });
    }
  }

  static async assignFeeStructure(req: Request, res: Response) {
    try {
      const { tenantId, campusId, actorProfileId } = FinanceController.getScope(req as FinanceRequest, res);
      if (!tenantId) return;

      const { studentId, feeStructureVersionId } = req.body ?? {};

      if (!studentId || !feeStructureVersionId) {
        return res.status(400).json({
          error: { message: "studentId and feeStructureVersionId are required" },
        });
      }

      const student = await prisma.student.findFirst({
        where: {
          id: studentId,
          tenantId,
          ...(campusId ? { campusId } : {}),
        },
      });

      if (!student) {
        return res.status(404).json({ error: { message: "Student not found" } });
      }

      const existing = await prisma.studentFeeAssignment.findFirst({
        where: { tenantId, studentId },
        orderBy: { assignedAt: "desc" },
      });

      if (existing) {
        return res.status(409).json({
          error: { message: "Fee structure already assigned for this student" },
        });
      }

      const version = await prisma.feeStructureVersion.findFirst({
        where: {
          id: feeStructureVersionId,
          tenantId,
        },
        include: {
          feeStructure: true,
        },
      });

      if (!version) {
        return res.status(404).json({ error: { message: "Fee structure version not found" } });
      }

      const assignment = await prisma.$transaction(async (tx) => {
        const created = await tx.studentFeeAssignment.create({
          data: {
            tenantId,
            studentId,
            structureName: version.feeStructure.name,
            structureVersion: version.version,
            snapshotContent: version.content as Prisma.InputJsonValue,
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            action: "ASSIGN_FEE_STRUCTURE",
            entityType: "STUDENT_FEE_ASSIGNMENT",
            entityId: created.id,
            userId: actorProfileId,
            details: {
              studentId,
              feeStructureVersionId,
              structureName: version.feeStructure.name,
              structureVersion: version.version,
            },
          },
        });

        return created;
      });

      return res.status(201).json({
        id: assignment.id,
        studentId: assignment.studentId,
        structureName: assignment.structureName,
        structureVersion: assignment.structureVersion,
        assignedAt: assignment.assignedAt,
      });
    } catch (error: any) {
      return res.status(500).json({
        error: { message: error?.message || "Failed to assign fee structure" },
      });
    }
  }


  private static getScope(req: FinanceRequest, res: Response) {
    const tenantId = req.tenant?.tenantId;
    const campusId = req.campus?.campusId;
    const actorProfileId = req.user?.id;

    if (!tenantId) {
      res.status(400).json({ error: { message: "Tenant context missing" } });
      return { tenantId: undefined, campusId, actorProfileId };
    }

    return { tenantId, campusId, actorProfileId };
  }
}
