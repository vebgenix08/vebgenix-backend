import mongoose, { Schema } from "mongoose";

const StudentPaymentSchema = new Schema(
  {
    tenant_id: {
      type: Schema.Types.ObjectId,
      ref: "tenants",
      required: true,
      index: true,
    },

    campus_id: {
      type: Schema.Types.ObjectId,
      ref: "campuses",
      required: true,
      index: true,
    },

    academic_year_id: {
      type: Schema.Types.ObjectId,
      ref: "academic_years",
      required: true,
      index: true,
    },

    receipt_no: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    student_id: {
      type: Schema.Types.ObjectId,
      ref: "students",
      required: true,
      index: true,
    },

    class_id: {
      type: Schema.Types.ObjectId,
      ref: "classes",
      required: true,
    },

    section_id: {
      type: Schema.Types.ObjectId,
      ref: "sections",
      default: null,
    },

    payment_date: {
      type: Date,
      default: Date.now,
      index: true,
    },

    payment_mode: {
      type: String,
      enum: [
        "CASH",
        "UPI",
        "CARD",
        "CHEQUE",
        "BANK_TRANSFER",
        "ONLINE"
      ],
      required: true,
    },

    payment_gateway: {
      type: String,
      default: null,
    },

    gateway_transaction_id: {
      type: String,
      default: null,
      index: true,
    },

    bank_name: {
      type: String,
      default: null,
    },

    cheque_no: {
      type: String,
      default: null,
    },

    reference_no: {
      type: String,
      default: null,
    },

    orders: [
      {
        order_id: {
          type: Schema.Types.ObjectId,
          ref: "student_fee_orders",
          required: true,
        },

        order_no: {
          type: String,
          required: true,
        },

        paid_amount: {
          type: Number,
          required: true,
        },
      },
    ],

    total_paid_amount: {
      type: Number,
      required: true,
    },

    excess_amount: {
      type: Number,
      default: 0,
    },

    refund_amount: {
      type: Number,
      default: 0,
    },

    remarks: {
      type: String,
      default: null,
    },

    payment_status: {
      type: String,
      enum: [
        "SUCCESS",
        "FAILED",
        "PENDING",
        "PARTIAL",
        "REFUNDED",
        "CANCELLED"
      ],
      default: "SUCCESS",
      index: true,
    },

    collected_by: {
      type: Schema.Types.ObjectId,
      ref: "users",
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },

    created_by: {
      type: Schema.Types.ObjectId,
      ref: "users",
    },

    updated_by: {
      type: Schema.Types.ObjectId,
      ref: "users",
    },
  },
  {
    timestamps: true,
  }
);

StudentPaymentSchema.index({
  tenant_id: 1,
  campus_id: 1,
  academic_year_id: 1,
  student_id: 1,
});

export default mongoose.model(
  "student_payments",
  StudentPaymentSchema
);