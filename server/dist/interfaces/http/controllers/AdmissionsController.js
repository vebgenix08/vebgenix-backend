"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrollStudent = exports.updateApplicationStatus = exports.getApplicationById = exports.getApplications = exports.createApplication = exports.updateEnquiryStatus = exports.getEnquiries = exports.createEnquiry = void 0;
const SupabaseAdmissionsRepository_1 = require("../../../infrastructure/repositories/SupabaseAdmissionsRepository");
const repository = new SupabaseAdmissionsRepository_1.SupabaseAdmissionsRepository();
const createEnquiry = async (req, res) => {
    try {
        const enquiryData = req.tenant && req.campus ? Object.assign(Object.assign({}, req.body), { tenant_id: req.tenant.tenantId, campus_id: req.campus.campusId }) : req.body;
        const enquiry = await repository.createEnquiry(enquiryData);
        res.status(201).json(enquiry);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.createEnquiry = createEnquiry;
const getEnquiries = async (req, res) => {
    var _a, _b;
    try {
        const filters = {
            status: req.query.status,
            campusScope: req.query.campusScope,
            page: req.query.page ? parseInt(req.query.page) : 1,
            limit: req.query.limit ? parseInt(req.query.limit) : 10,
            tenant_id: (_a = req.tenant) === null || _a === void 0 ? void 0 : _a.tenantId,
            campus_id: (_b = req.campus) === null || _b === void 0 ? void 0 : _b.campusId,
        };
        const result = await repository.getEnquiries(filters);
        res.json(result);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.getEnquiries = getEnquiries;
const updateEnquiryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;
        if (!status) {
            res.status(400).json({ error: 'Status is required' });
            return;
        }
        const enquiry = await repository.updateEnquiryStatus(id, status, notes);
        res.json(enquiry);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.updateEnquiryStatus = updateEnquiryStatus;
const createApplication = async (req, res) => {
    try {
        const applicationData = Object.assign(Object.assign({}, req.body), { tenant_id: req.tenant.tenantId, campus_id: req.campus.campusId });
        const application = await repository.createApplication(applicationData);
        res.status(201).json(application);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.createApplication = createApplication;
const getApplications = async (req, res) => {
    var _a, _b;
    try {
        const filters = {
            status: req.query.status,
            campusScope: req.query.campusScope,
            page: req.query.page ? parseInt(req.query.page) : 1,
            limit: req.query.limit ? parseInt(req.query.limit) : 10,
            tenant_id: (_a = req.tenant) === null || _a === void 0 ? void 0 : _a.tenantId,
            campus_id: (_b = req.campus) === null || _b === void 0 ? void 0 : _b.campusId,
        };
        const result = await repository.getApplications(filters);
        res.json(result);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.getApplications = getApplications;
const getApplicationById = async (req, res) => {
    try {
        const { id } = req.params;
        const application = await repository.getApplicationById(id);
        if (!application) {
            res.status(404).json({ error: 'Application not found' });
            return;
        }
        res.json(application);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.getApplicationById = getApplicationById;
const updateApplicationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!status) {
            res.status(400).json({ error: 'Status is required' });
            return;
        }
        const application = await repository.updateApplicationStatus(id, status);
        res.json(application);
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.updateApplicationStatus = updateApplicationStatus;
const enrollStudent = async (req, res) => {
    try {
        const { id } = req.params;
        const studentId = await repository.enrollStudent(id, undefined);
        res.status(200).json({ message: 'Student successfully enrolled', studentId });
    }
    catch (error) {
        res.status(400).json({ error: error.message });
    }
};
exports.enrollStudent = enrollStudent;
//# sourceMappingURL=AdmissionsController.js.map