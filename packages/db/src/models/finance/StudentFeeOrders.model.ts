import mongoose, { Schema } from "mongoose";

const StudentFeeOrderSchema = new Schema(
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
      index: true,
    },

    section_id: {
      type: Schema.Types.ObjectId,
      ref: "sections",
      default: null,
    },

    fee_schedule_id: {
      type: Schema.Types.ObjectId,
      ref: "fee_schedules",
      required: true,
      index: true,
    },

    fee_structure_id: {
      type: Schema.Types.ObjectId,
      ref: "fee_structures",
      required: true,
      index: true,
    },

    fee_structure_class_mapping_id: {
      type: Schema.Types.ObjectId,
      ref: "fee_structure_class_mappings",
      required: true,
    },

    order_no: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    installment_no: {
      type: Number,
      required: true,
    },

    installment_title: {
      type: String,
      required: true,
    },

    due_date: {
      type: Date,
      required: true,
      index: true,
    },

    fee_heads: [
      {
        fee_head_id: {
          type: Schema.Types.ObjectId,
          ref: "fee_heads",
          required: true,
        },

        fee_head_name: {
          type: String,
          required: true,
        },

        original_amount: {
          type: Number,
          required: true,
        },

        concession_amount: {
          type: Number,
          default: 0,
        },

        late_fee_amount: {
          type: Number,
          default: 0,
        },

        paid_amount: {
          type: Number,
          default: 0,
        },

        balance_amount: {
          type: Number,
          required: true,
        },

        final_amount: {
          type: Number,
          required: true,
        },

        status: {
          type: String,
          enum: [
            "PENDING",
            "PARTIAL",
            "PAID"
          ],
          default: "PENDING",
        },
      },
    ],

    gross_amount: {
      type: Number,
      required: true,
    },

    concession_amount: {
      type: Number,
      default: 0,
    },

    late_fee_amount: {
      type: Number,
      default: 0,
    },

    payable_amount: {
      type: Number,
      required: true,
    },

    paid_amount: {
      type: Number,
      default: 0,
    },

    balance_amount: {
      type: Number,
      required: true,
    },

    payment_completion_percentage: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: [
        "PENDING",
        "PARTIAL",
        "PAID",
        "OVERDUE",
        "CANCELLED",
        "REFUNDED"
      ],
      default: "PENDING",
      index: true,
    },

    payment_status: {
      type: String,
      enum: [
        "UNPAID",
        "PARTIAL",
        "PAID"
      ],
      default: "UNPAID",
    },

    generated_at: {
      type: Date,
      default: Date.now,
    },

    remarks: {
      type: String,
      default: null,
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

StudentFeeOrderSchema.index({
  tenant_id: 1,
  campus_id: 1,
  academic_year_id: 1,
  student_id: 1,
});

export default mongoose.model(
  "student_fee_orders",
  StudentFeeOrderSchema
);