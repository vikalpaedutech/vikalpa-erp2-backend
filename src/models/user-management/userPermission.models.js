import mongoose, { Schema } from "mongoose";

const userPermissionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    permissionIds: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "Permission",
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

userPermissionSchema.index({ userId: 1 }, { unique: true });

export const UserPermission = mongoose.model(
  "UserPermission",
  userPermissionSchema
);
