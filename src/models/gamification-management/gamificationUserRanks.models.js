import mongoose, { Schema } from "mongoose";

const eventBreakdownSchema = new Schema(
  {
    eventType: { type: String, required: true },
    totalPoint: { type: Number, default: 0 },
    todaysPoint: { type: Number, default: 0 },
    pointClassification: {
      type: String,
      enum: ["Positive", "Neutral", "Negative"],
      default: "Neutral",
    },
  },
  { _id: false }
);

const gamificationUserRankSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
      index: true,
    },

    year: {
      type: Number,
      required: true,
      index: true,
    },

    startDate: {
      type: Date,
      required: true,
      index: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    rank: {
      type: Number,
      required: true,
    },

    todayRank: {
      type: Number,
      required: true,
    },

    monthRank: {
      type: Number,
      required: true,
    },

    eventBreakdown: {
      type: [eventBreakdownSchema],
      default: [],
    },

    totalPoints: {
      type: Number,
      default: 0,
    },

    positivePoints: {
      type: Number,
      default: 0,
    },

    negativePoints: {
      type: Number,
      default: 0,
    },

    eventCount: {
      type: Number,
      default: 0,
    },

    todayPoints: {
      type: Number,
      default: 0,
    },

    todayEventCount: {
      type: Number,
      default: 0,
    },

    pointClassification: {
      type: String,
      enum: ["Positive", "Neutral", "Negative"],
      default: "Neutral",
    },

    calculationRunId: {
      type: String,
      default: null,
    },

    rankingDate: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

gamificationUserRankSchema.index(
  { userId: 1, year: 1, month: 1 },
  { unique: true }
);

gamificationUserRankSchema.index({
  year: 1,
  month: 1,
  monthRank: 1,
});

export const GamificationUserRank = mongoose.model(
  "GamificationUserRank",
  gamificationUserRankSchema
);
