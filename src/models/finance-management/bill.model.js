import mongoose, { Schema } from "mongoose";

const expenseItemSchema = new Schema(
  {
    category: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "office-expense",
        "travel-expense",
        "orientation",
        "stationery",
      ],
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    expenseDate: {
      type: Date,
      required: true,
    },

    description: {
      type: String,
      trim: true,
    },

    // Used for travel expenses
    travel: {
      from: {
        type: String,
        trim: true,
      },

      to: {
        type: String,
        trim: true,
      },

      travelDate: {
        type: Date,
      },

      purpose: {
        type: String,
        trim: true,
      },

      modeOfTravel: {
        type: String,
        trim: true,
      },

      distance: {
        type: Number,
        min: 0,
      },
    },
  },
  {
    _id: true,
  }
);

const billSchema = new Schema(
  {
    billNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    billDate: {
      type: Date,
      required: true,
    },

    /*
     * Multiple expense categories/items
     * can be submitted under one bill.
     */
    expenses: {
      type: [expenseItemSchema],
      required: true,
      validate: {
        validator: function (expenses) {
          return expenses && expenses.length > 0;
        },
        message: "At least one expense item is required",
      },
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "INR",
      trim: true,
      uppercase: true,
    },

    vendor: {
      name: {
        type: String,
        trim: true,
      },

      contact: {
        type: String,
        trim: true,
      },

      address: {
        type: String,
        trim: true,
      },

      gstNumber: {
        type: String,
        trim: true,
        uppercase: true,
      },
    },

    attachments: [
      {
        url: {
          type: String,
          trim: true,
        },

        publicId: {
          type: String,
          required: true,
          trim: true,
        },

        fileName: {
          type: String,
          required: true,
          trim: true,
        },

        mimeType: {
          type: String,
          trim: true,
        },

        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    submittedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },

    status: {
      type: String,
      required: true,
      enum: [
        "draft",
        "verification-pending",
        "verified",
        "approval-pending",
        "approved",
        "payment-pending",
        "paid",
        "rejected",
      ],
      default: "draft",
      trim: true,
    },

    verification: {
      verifiedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      verifiedAt: {
        type: Date,
        default: null,
      },

      remarks: {
        type: String,
        trim: true,
      },
    },

    approval: {
      approvedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      approvedAt: {
        type: Date,
        default: null,
      },

      remarks: {
        type: String,
        trim: true,
      },
    },

    rejection: {
      rejectedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      rejectedAt: {
        type: Date,
        default: null,
      },

      stage: {
        type: String,
        enum: ["verification", "approval"],
        default: null,
      },

      remarks: {
        type: String,
        trim: true,
      },
    },

    payment: {
      paidBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },

      paidAt: {
        type: Date,
        default: null,
      },

      paymentReference: {
        type: String,
        trim: true,
      },

      paymentMode: {
        type: String,
        enum: [
          "bank-transfer",
          "upi",
          "cash",
          "cheque",
          "other",
        ],
        default: null,
      },

      remarks: {
        type: String,
        trim: true,
      },
    },

    /*
     * Number of times this same bill
     * has been resubmitted after rejection.
     */
    resubmissionCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastResubmittedAt: {
      type: Date,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

/*
 * Useful indexes
 */
billSchema.index({
  submittedBy: 1,
  createdAt: -1,
});

billSchema.index({
  status: 1,
  createdAt: -1,
});

billSchema.index({
  billDate: -1,
});

billSchema.index({
  "verification.verifiedBy": 1,
});

billSchema.index({
  "approval.approvedBy": 1,
});

billSchema.index({
  "payment.paidBy": 1,
});

export const Bills = mongoose.model("Bills", billSchema);