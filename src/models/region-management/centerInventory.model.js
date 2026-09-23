import mongoose, { Schema } from "mongoose";

// One document represents one physical asset installed at or assigned to a center.
const centerInventorySchema = new Schema(
  {
    centerId: {
      type: Schema.Types.ObjectId,
      ref: "Center",
      required: true,
      index: true,
    },
    itemName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    assetCode: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
      maxlength: 50,
    },
    serialNumber: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      maxlength: 100,
    },
    status: {
      type: String,
      enum: ["working", "maintenance", "faulty", "missing", "retired"],
      default: "working",
      required: true,
    },
    installedAt: {
      type: Date,
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

centerInventorySchema.index({ centerId: 1, itemName: 1 });

export const CenterInventory = mongoose.model(
  "CenterInventory",
  centerInventorySchema
);
