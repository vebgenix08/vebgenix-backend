"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseAdmissionsRepository = void 0;
const client_1 = __importDefault(require("../prisma/client"));
class SupabaseAdmissionsRepository {
    async createEnquiry(data) {
        const result = await client_1.default.enquiry.create({
            data: {
                fullName: data.fullName,
                email: data.email,
                phone: data.phone,
                gradeApplied: data.gradeApplied,
                status: data.status || 'NEW',
                campusScope: data.campusScope,
                notes: data.notes,
                studentDob: data.studentDob,
                previousSchool: data.previousSchool,
                parentName: data.parentName
            }
        });
        return this.mapEnquiry(result);
    }
    async getEnquiries(filters) {
        const where = {};
        if (filters.status)
            where.status = filters.status;
        if (filters.campusScope)
            where.campusScope = filters.campusScope;
        const page = filters.page || 1;
        const limit = filters.limit || 10;
        const skip = (page - 1) * limit;
        const [data, total] = await client_1.default.$transaction([
            client_1.default.enquiry.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { assignedTo: true }
            }),
            client_1.default.enquiry.count({ where })
        ]);
        return {
            data: data.map(this.mapEnquiry),
            total
        };
    }
    async getEnquiryById(id) {
        const result = await client_1.default.enquiry.findUnique({
            where: { id },
            include: { assignedTo: true }
        });
        if (!result)
            return null;
        return this.mapEnquiry(result);
    }
    async updateEnquiryStatus(id, status, notes) {
        const result = await client_1.default.enquiry.update({
            where: { id },
            data: {
                status: status,
                notes: notes ? notes : undefined
            }
        });
        return this.mapEnquiry(result);
    }
    async createApplication(data) {
        const result = await client_1.default.application.create({
            data: {
                enquiryId: data.enquiryId,
                fullName: data.fullName,
                email: data.email,
                phone: data.phone,
                gradeApplyingFor: data.gradeApplyingFor,
                academicYear: data.academicYear,
                campusScope: data.campusScope,
                address: data.address,
                dob: data.dob,
                status: 'DRAFT',
                gender: data.gender,
                nationality: data.nationality,
                bloodGroup: data.bloodGroup,
                fatherName: data.fatherName,
                fatherPhone: data.fatherPhone,
                motherName: data.motherName,
                motherPhone: data.motherPhone,
                stream: data.stream,
                previousSchool: data.previousSchool,
                previousGradePercentage: data.previousGradePercentage
            }
        });
        return this.mapApplication(result);
    }
    async getApplications(filters) {
        const where = {};
        if (filters.status)
            where.status = filters.status;
        if (filters.campusScope)
            where.campusScope = filters.campusScope;
        const page = filters.page || 1;
        const limit = filters.limit || 10;
        const skip = (page - 1) * limit;
        const [data, total] = await client_1.default.$transaction([
            client_1.default.application.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' }
            }),
            client_1.default.application.count({ where })
        ]);
        return {
            data: data.map(this.mapApplication),
            total
        };
    }
    async getApplicationById(id) {
        const result = await client_1.default.application.findUnique({ where: { id } });
        if (!result)
            return null;
        return this.mapApplication(result);
    }
    async updateApplicationStatus(id, status) {
        const result = await client_1.default.application.update({
            where: { id },
            data: { status: status }
        });
        return this.mapApplication(result);
    }
    async enrollStudent(applicationId, userId) {
        return await client_1.default.$transaction(async (tx) => {
            var _a;
            const regNumResult = await tx.$queryRaw `SELECT generate_reg_number()`;
            const regNum = (_a = regNumResult[0]) === null || _a === void 0 ? void 0 : _a.generate_reg_number;
            if (!regNum)
                throw new Error('Failed to generate registration number');
            const app = await tx.application.findUnique({ where: { id: applicationId } });
            if (!app)
                throw new Error('Application not found');
            if (app.status === 'APPROVED' || app.status === 'MIGRATED') {
                throw new Error('Application is already processed');
            }
            const student = await tx.student.create({
                data: {
                    applicationId: applicationId,
                    portalAuthUserId: userId || null,
                    registrationNumber: regNum,
                    fullName: app.fullName,
                    currentGrade: app.gradeApplyingFor,
                    campusType: app.campusScope,
                    status: 'ACTIVE',
                    email: app.email,
                    parentPhone: app.phone,
                    dob: app.dob,
                }
            });
            await tx.application.update({
                where: { id: applicationId },
                data: {
                    status: 'APPROVED',
                    approvedAt: new Date()
                }
            });
            await tx.auditLog.create({
                data: {
                    action: 'APPROVE_APPLICATION',
                    entityType: 'STUDENT',
                    entityId: student.id,
                    details: { applicationId, registrationNumber: regNum },
                    userId: userId
                }
            });
            return student.id;
        });
    }
    mapEnquiry(raw) {
        return {
            id: raw.id,
            fullName: raw.fullName,
            email: raw.email,
            phone: raw.phone,
            gradeApplied: raw.gradeApplied,
            status: raw.status,
            campusScope: raw.campusScope,
            notes: raw.notes,
            assignedTo: raw.assignedToId,
            createdAt: raw.createdAt,
            updatedAt: raw.updatedAt,
            studentDob: raw.studentDob ? new Date(raw.studentDob) : undefined,
            previousSchool: raw.previousSchool,
            parentName: raw.parentName
        };
    }
    mapApplication(raw) {
        return {
            id: raw.id,
            fullName: raw.fullName,
            firstName: raw.fullName.split(' ')[0],
            lastName: raw.fullName.split(' ').slice(1).join(' '),
            dob: raw.dob,
            gender: raw.gender,
            email: raw.email,
            phone: raw.phone,
            address: raw.address,
            gradeApplyingFor: raw.gradeApplyingFor,
            academicYear: raw.academicYear,
            status: raw.status,
            campusScope: raw.campusScope,
            createdAt: raw.createdAt,
            updatedAt: raw.updatedAt,
            nationality: raw.nationality,
            bloodGroup: raw.bloodGroup,
            stream: raw.stream,
            previousSchool: raw.previousSchool,
            previousGradePercentage: raw.previousGradePercentage ? Number(raw.previousGradePercentage) : undefined
        };
    }
}
exports.SupabaseAdmissionsRepository = SupabaseAdmissionsRepository;
//# sourceMappingURL=SupabaseAdmissionsRepository.js.map