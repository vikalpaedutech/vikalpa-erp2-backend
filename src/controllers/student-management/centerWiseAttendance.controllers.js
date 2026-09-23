import mongoose from "mongoose";
import crypto from "crypto";

import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { CenterWiseAttendance } from "../../models/student-management/centerWiseAttendance.models.js";
import { Center } from "../../models/region-management/center.models.js";
import { UserAccess } from "../../models/user-management/userAccess.models.js";
import { UserRegionAccess } from "../../models/user-management/userRegionAccess.models.js";
import spacesClient from "../../config/spaces.js";

import PDFDocument from "pdfkit";
import { StudentEnrollment } from "../../models/student-management/studentEnrollment.models.js";



// ============================================================
// HELPER FUNCTIONS
// ============================================================

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

const getUserId = (req) => {
  return req.user?._id || req.user?.id;
};

const isAdminUser = (req) => {
  return (
    req.user?.isAdmin === true ||
    req.user?.roleCode === "admin" ||
    req.user?.roles?.some((role) => role.roleCode === "admin")
  );
};


// ============================================================
// CHECK PROGRAM + BATCH ACCESS
// ============================================================

const checkBatchAccess = async ({
  userId,
  batchId,
}) => {
  const userAccess = await UserAccess.findOne({
    userId,
  }).lean();

  if (!userAccess) {
    return false;
  }

  return (userAccess.batchIds || []).some(
    (id) => id.toString() === batchId.toString()
  );
};


// ============================================================
// CHECK REGION ACCESS
// ============================================================

const checkRegionAccess = async ({
  userId,
  districtId,
  blockId,
  centerId,
}) => {
  const regionAccess = await UserRegionAccess.find({
    userId,
  }).lean();

  if (!regionAccess.length) {
    return false;
  }

  return regionAccess.some((access) => {
    if (access.scope === "global") {
      return true;
    }

    if (
      access.scope === "district" &&
      access.districtId &&
      access.districtId.toString() === districtId.toString()
    ) {
      return true;
    }

    if (
      access.scope === "block" &&
      access.blockId &&
      access.blockId.toString() === blockId.toString()
    ) {
      return true;
    }

    if (
      access.scope === "center" &&
      access.centerId &&
      access.centerId.toString() === centerId.toString()
    ) {
      return true;
    }

    return false;
  });
};


// ============================================================
// CREATE CENTER-WISE ATTENDANCE
// ============================================================

export const createCenterWiseAttendance = async (req, res) => {
  try {
    const userId = getUserId(req);

    const {
      districtId,
      blockId,
      centerId,
      batchId,
      date,
    } = req.body;

    // --------------------------------------------------------
    // Required fields
    // --------------------------------------------------------

    if (
      !districtId ||
      !blockId ||
      !centerId ||
      !batchId ||
      !date
    ) {
      return res.status(400).json({
        success: false,
        message:
          "districtId, blockId, centerId, batchId and date are required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Attendance PDF file is required",
      });
    }

    // --------------------------------------------------------
    // ObjectId validation
    // --------------------------------------------------------

    if (
      !isValidObjectId(districtId) ||
      !isValidObjectId(blockId) ||
      !isValidObjectId(centerId) ||
      !isValidObjectId(batchId)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid districtId, blockId, centerId or batchId",
      });
    }

    // --------------------------------------------------------
    // Date validation
    // --------------------------------------------------------

    const attendanceDate = new Date(date);

    if (Number.isNaN(attendanceDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date",
      });
    }

    // --------------------------------------------------------
    // Verify center hierarchy
    // --------------------------------------------------------

    const center = await Center.findById(centerId).lean();

    if (!center) {
      return res.status(404).json({
        success: false,
        message: "Center not found",
      });
    }

    if (
      center.districtId.toString() !== districtId.toString()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Center does not belong to the given district",
      });
    }

    if (
      center.blockId.toString() !== blockId.toString()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Center does not belong to the given block",
      });
    }

    // --------------------------------------------------------
    // Authorization
    // --------------------------------------------------------

    if (!isAdminUser(req)) {
      const batchAllowed = await checkBatchAccess({
        userId,
        batchId,
      });

      if (!batchAllowed) {
        return res.status(403).json({
          success: false,
          message:
            "You do not have access to this batch",
        });
      }

      const regionAllowed = await checkRegionAccess({
        userId,
        districtId,
        blockId,
        centerId,
      });

      if (!regionAllowed) {
        return res.status(403).json({
          success: false,
          message:
            "You do not have access to this center",
        });
      }
    }

    // --------------------------------------------------------
    // Duplicate check
    // --------------------------------------------------------

    const existingAttendance =
      await CenterWiseAttendance.findOne({
        centerId,
        batchId,
        date: attendanceDate,
      }).lean();

    if (existingAttendance) {
      return res.status(409).json({
        success: false,
        message:
          "Attendance PDF already exists for this center, batch and date",
      });
    }

    // --------------------------------------------------------
    // Generate unique Spaces key
    // --------------------------------------------------------

    const uniqueId = crypto.randomUUID();

    const year = attendanceDate.getFullYear();

    const month = String(
      attendanceDate.getMonth() + 1
    ).padStart(2, "0");

    const key =
      `center-wise-attendance/${year}/${month}/` +
      `${centerId}/${batchId}/${uniqueId}.pdf`;

    // --------------------------------------------------------
    // Upload to DigitalOcean Spaces
    // --------------------------------------------------------

    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: "application/pdf",
      ContentLength: req.file.size,
      ACL: "private",
    });

    await spacesClient.send(uploadCommand);

    // --------------------------------------------------------
    // Create MongoDB record
    // --------------------------------------------------------

    let attendanceRecord;

    try {
      attendanceRecord =
        await CenterWiseAttendance.create({
          districtId,
          blockId,
          centerId,
          batchId,

          file: {
            url: `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}/${key}`,
            publicId: key,
            fileName: req.file.originalname,
          },

          date: attendanceDate,
          uploadedBy: userId,
        });
    } catch (dbError) {
      // ------------------------------------------------------
      // Rollback Spaces upload if MongoDB fails
      // ------------------------------------------------------

      try {
        await spacesClient.send(
          new DeleteObjectCommand({
            Bucket: process.env.SPACES_BUCKET,
            Key: key,
          })
        );
      } catch (deleteError) {
        console.error(
          "Failed to rollback Spaces file:",
          deleteError
        );
      }

      throw dbError;
    }

    // --------------------------------------------------------
    // Populate response
    // --------------------------------------------------------

    const populatedRecord =
      await CenterWiseAttendance.findById(
        attendanceRecord._id
      )
        .populate(
          "districtId",
          "districtName"
        )
        .populate(
          "blockId",
          "blockName"
        )
        .populate(
          "centerId",
          "centerName centerCode"
        )
        .populate(
          "batchId",
          "batchName startYear endYear"
        )
        .populate(
          "uploadedBy",
          "name email"
        )
        .lean();

    return res.status(201).json({
      success: true,
      message:
        "Center-wise attendance uploaded successfully",
      data: populatedRecord,
    });
  } catch (error) {
    console.error(
      "createCenterWiseAttendance error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to upload center-wise attendance",
      error: error.message,
    });
  }
};


// ============================================================
// GET CENTER-WISE ATTENDANCE
// ============================================================
export const getCenterWiseAttendances = async (req, res) => {


 
  try {
    const userId = getUserId(req);

    const {
      page = 1,
      limit = 20,
      districtId,
      blockId,
      centerId,
      batchId,
      uploadedBy,
      date,
    } = req.query;


    const pageNumber = Math.max(
      Number(page) || 1,
      1
    );

    const limitNumber = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const skip =
      (pageNumber - 1) * limitNumber;

    const match = {};

    // --------------------------------------------------------
    // Validate filters
    // --------------------------------------------------------

    const objectIdFilters = {
      districtId,
      blockId,
      centerId,
      batchId,
      uploadedBy,
    };

    for (const [field, value] of Object.entries(
      objectIdFilters
    )) {
      if (value && !isValidObjectId(value)) {
        return res.status(400).json({
          success: false,
          message: `Invalid ${field}`,
        });
      }
    }

    // --------------------------------------------------------
    // Direct filters
    // --------------------------------------------------------

    if (districtId) {
      match.districtId = districtId;
    }

    if (blockId) {
      match.blockId = blockId;
    }

    if (centerId) {
      match.centerId = centerId;
    }

    if (batchId) {
      match.batchId = batchId;
    }

    if (uploadedBy) {
      match.uploadedBy = uploadedBy;
    }

    // --------------------------------------------------------
    // Date filter
    // --------------------------------------------------------

    if (date) {
      const startDate = new Date(date);

      if (Number.isNaN(startDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date",
        });
      }

      const endDate = new Date(startDate);

      endDate.setDate(
        endDate.getDate() + 1
      );

      match.date = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    // --------------------------------------------------------
    // Non-admin access
    // --------------------------------------------------------

    if (!isAdminUser(req)) {
      const userAccess =
        await UserAccess.findOne({
          userId,
        }).lean();

      if (!userAccess) {
        return res.status(200).json({
          success: true,
          data: {
            attendances: [],
            pagination: {
              page: pageNumber,
              limit: limitNumber,
              total: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPreviousPage:
                pageNumber > 1,
            },
          },
        });
      }

      // ------------------------------------------------------
      // Batch access
      // ------------------------------------------------------

      const batchIds =
        userAccess.batchIds || [];

      if (batchId) {
        const hasBatchAccess =
          batchIds.some(
            (id) =>
              id.toString() ===
              batchId.toString()
          );

        if (!hasBatchAccess) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this batch",
          });
        }
      }

      // ------------------------------------------------------
      // Region access
      // ------------------------------------------------------

      const regionAccess =
        await UserRegionAccess.find({
          userId,
        }).lean();

      if (!regionAccess.length) {
        return res.status(200).json({
          success: true,
          data: {
            attendances: [],
            pagination: {
              page: pageNumber,
              limit: limitNumber,
              total: 0,
              totalPages: 0,
              hasNextPage: false,
              hasPreviousPage:
                pageNumber > 1,
            },
          },
        });
      }

      const hasGlobalAccess =
        regionAccess.some(
          (access) =>
            access.scope === "global"
        );

      if (!hasGlobalAccess) {
        const districtIds =
          regionAccess
            .filter(
              (access) =>
                access.scope === "district" &&
                access.districtId
            )
            .map(
              (access) =>
                access.districtId
            );

        const blockIds =
          regionAccess
            .filter(
              (access) =>
                access.scope === "block" &&
                access.blockId
            )
            .map(
              (access) =>
                access.blockId
            );

        const centerIds =
          regionAccess
            .filter(
              (access) =>
                access.scope === "center" &&
                access.centerId
            )
            .map(
              (access) =>
                access.centerId
            );

        const regionConditions = [];

        if (districtIds.length) {
          regionConditions.push({
            districtId: {
              $in: districtIds,
            },
          });
        }

        if (blockIds.length) {
          regionConditions.push({
            blockId: {
              $in: blockIds,
            },
          });
        }

        if (centerIds.length) {
          regionConditions.push({
            centerId: {
              $in: centerIds,
            },
          });
        }

        if (!regionConditions.length) {
          return res.status(200).json({
            success: true,
            data: {
              attendances: [],
              pagination: {
                page: pageNumber,
                limit: limitNumber,
                total: 0,
                totalPages: 0,
                hasNextPage: false,
                hasPreviousPage:
                  pageNumber > 1,
              },
            },
          });
        }

        match.$or = regionConditions;
      }

      // ------------------------------------------------------
      // Batch access restriction
      // ------------------------------------------------------

      if (!batchId) {
        match.batchId = {
          $in: batchIds,
        };
      }
    }

    // --------------------------------------------------------
    // Query
    // --------------------------------------------------------

    const [
      total,
      attendances,
    ] = await Promise.all([
      CenterWiseAttendance.countDocuments(
        match
      ),

      CenterWiseAttendance.find(match)
        .populate(
          "districtId",
          "districtName"
        )
        .populate(
          "blockId",
          "blockName"
        )
        .populate(
          "centerId",
          "centerName centerCode"
        )
        .populate(
          "batchId",
          "batchName startYear endYear"
        )
        .populate(
          "uploadedBy",
          "name email"
        )
        .sort({
          date: -1,
          createdAt: -1,
          _id: -1,
        })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
    ]);

    const totalPages =
      Math.ceil(
        total / limitNumber
      );

    return res.status(200).json({
      success: true,
      data: {
        attendances,
        pagination: {
          page: pageNumber,
          limit: limitNumber,
          total,
          totalPages,
          hasNextPage:
            pageNumber < totalPages,
          hasPreviousPage:
            pageNumber > 1,
        },
      },
    });
  } catch (error) {
    console.error(
      "getCenterWiseAttendances error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to fetch center-wise attendance",
      error: error.message,
    });
  }
};


// ============================================================
// GET SINGLE CENTER-WISE ATTENDANCE
// ============================================================

export const getCenterWiseAttendanceById =
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const { attendanceId } = req.params;

      if (!isValidObjectId(attendanceId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid attendanceId",
        });
      }

      const attendance =
        await CenterWiseAttendance.findById(
          attendanceId
        )
          .populate(
            "districtId",
            "districtName"
          )
          .populate(
            "blockId",
            "blockName"
          )
          .populate(
            "centerId",
            "centerName centerCode"
          )
          .populate(
            "batchId",
            "batchName startYear endYear"
          )
          .populate(
            "uploadedBy",
            "name email"
          )
          .lean();

      if (!attendance) {
        return res.status(404).json({
          success: false,
          message:
            "Center-wise attendance not found",
        });
      }

      // ------------------------------------------------------
      // Authorization
      // ------------------------------------------------------

      if (!isAdminUser(req)) {
        const batchAllowed =
          await checkBatchAccess({
            userId,
            batchId: attendance.batchId._id,
          });

        if (!batchAllowed) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this batch",
          });
        }

        const regionAllowed =
          await checkRegionAccess({
            userId,
            districtId:
              attendance.districtId._id,
            blockId:
              attendance.blockId._id,
            centerId:
              attendance.centerId._id,
          });

        if (!regionAllowed) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this center",
          });
        }
      }

      return res.status(200).json({
        success: true,
        data: attendance,
      });
    } catch (error) {
      console.error(
        "getCenterWiseAttendanceById error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to fetch center-wise attendance",
        error: error.message,
      });
    }
  };


// ============================================================
// GET SIGNED URL
// ============================================================

export const getCenterWiseAttendanceFileUrl =
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const { attendanceId } = req.params;

      if (!isValidObjectId(attendanceId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid attendanceId",
        });
      }

      const attendance =
        await CenterWiseAttendance.findById(
          attendanceId
        ).lean();

      if (!attendance) {
        return res.status(404).json({
          success: false,
          message:
            "Center-wise attendance not found",
        });
      }

      // ------------------------------------------------------
      // Authorization
      // ------------------------------------------------------

      if (!isAdminUser(req)) {
        const batchAllowed =
          await checkBatchAccess({
            userId,
            batchId: attendance.batchId,
          });

        if (!batchAllowed) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this batch",
          });
        }

        const regionAllowed =
          await checkRegionAccess({
            userId,
            districtId:
              attendance.districtId,
            blockId:
              attendance.blockId,
            centerId:
              attendance.centerId,
          });

        if (!regionAllowed) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this center",
          });
        }
      }

      // ------------------------------------------------------
      // Generate temporary signed URL
      // ------------------------------------------------------

      const command =
        new GetObjectCommand({
          Bucket:
            process.env.SPACES_BUCKET,

          Key:
            attendance.file.publicId,
        });

      const signedUrl =
        await getSignedUrl(
          spacesClient,
          command,
          {
            expiresIn: 900,
          }
        );

      return res.status(200).json({
        success: true,
        data: {
          url: signedUrl,
          expiresIn: 900,
        },
      });
    } catch (error) {
      console.error(
        "getCenterWiseAttendanceFileUrl error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to generate attendance file URL",
        error: error.message,
      });
    }
  };


// ============================================================
// DELETE CENTER-WISE ATTENDANCE
// ============================================================

export const deleteCenterWiseAttendance =
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const { attendanceId } = req.params;

      if (!isValidObjectId(attendanceId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid attendanceId",
        });
      }

      const attendance =
        await CenterWiseAttendance.findById(
          attendanceId
        ).lean();

      if (!attendance) {
        return res.status(404).json({
          success: false,
          message:
            "Center-wise attendance not found",
        });
      }

      // ------------------------------------------------------
      // Authorization
      // ------------------------------------------------------

      if (!isAdminUser(req)) {
        const batchAllowed =
          await checkBatchAccess({
            userId,
            batchId: attendance.batchId,
          });

        if (!batchAllowed) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this batch",
          });
        }

        const regionAllowed =
          await checkRegionAccess({
            userId,
            districtId:
              attendance.districtId,
            blockId:
              attendance.blockId,
            centerId:
              attendance.centerId,
          });

        if (!regionAllowed) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this center",
          });
        }
      }

      // ------------------------------------------------------
      // Delete from Spaces
      // ------------------------------------------------------

      if (attendance.file?.publicId) {
        await spacesClient.send(
          new DeleteObjectCommand({
            Bucket:
              process.env.SPACES_BUCKET,

            Key:
              attendance.file.publicId,
          })
        );
      }

      // ------------------------------------------------------
      // Delete MongoDB record
      // ------------------------------------------------------

      await CenterWiseAttendance.findByIdAndDelete(
        attendanceId
      );

      return res.status(200).json({
        success: true,
        message:
          "Center-wise attendance deleted successfully",
      });
    } catch (error) {
      console.error(
        "deleteCenterWiseAttendance error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to delete center-wise attendance",
        error: error.message,
      });
    }
  };





  

  // ========================================================
// Download Center Wise Attendance PDF
// Program + Batch + Center Wise
// ========================================================

export const downloadCenterWiseAttendanceTemplate =
  async (req, res) => {
    try {
      const userId = getUserId(req);

      const {
        programId,
        batchId,
        centerId,
      } = req.params;

      // ----------------------------------------------------
      // Validate IDs
      // ----------------------------------------------------

      const objectIdFields = {
        programId,
        batchId,
        centerId,
      };

      for (const [field, value] of Object.entries(
        objectIdFields
      )) {
        if (
          !value ||
          !isValidObjectId(value)
        ) {
          return res.status(400).json({
            success: false,
            message: `Invalid ${field}`,
          });
        }
      }

      // ----------------------------------------------------
      // Get Center
      // ----------------------------------------------------

      const center =
        await Center.findById(
          centerId
        ).lean();

      if (!center) {
        return res.status(404).json({
          success: false,
          message: "Center not found",
        });
      }

      // ----------------------------------------------------
      // Non-admin access
      // ----------------------------------------------------

      if (!isAdminUser(req)) {
        const userAccess =
          await UserAccess.findOne({
            userId,
          }).lean();

        if (!userAccess) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this center",
          });
        }

        // --------------------------------------------------
        // Program access
        // --------------------------------------------------

        const programIds =
          userAccess.programIds || [];

        const hasProgramAccess =
          programIds.some(
            (id) =>
              id.toString() ===
              programId.toString()
          );

        if (!hasProgramAccess) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this program",
          });
        }

        // --------------------------------------------------
        // Batch access
        // --------------------------------------------------

        const batchIds =
          userAccess.batchIds || [];

        const hasBatchAccess =
          batchIds.some(
            (id) =>
              id.toString() ===
              batchId.toString()
          );

        if (!hasBatchAccess) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this batch",
          });
        }

        // --------------------------------------------------
        // Region access
        // --------------------------------------------------

        const regionAccess =
          await UserRegionAccess.find({
            userId,
          }).lean();

        if (!regionAccess.length) {
          return res.status(403).json({
            success: false,
            message:
              "You do not have access to this center",
          });
        }

        const hasGlobalAccess =
          regionAccess.some(
            (access) =>
              access.scope === "global"
          );

        if (!hasGlobalAccess) {
          const hasRegionAccess =
            regionAccess.some(
              (access) => {
                if (
                  access.scope ===
                    "district" &&
                  access.districtId
                ) {
                  return (
                    access.districtId.toString() ===
                    center.districtId?.toString()
                  );
                }

                if (
                  access.scope ===
                    "block" &&
                  access.blockId
                ) {
                  return (
                    access.blockId.toString() ===
                    center.blockId?.toString()
                  );
                }

                if (
                  access.scope ===
                    "center" &&
                  access.centerId
                ) {
                  return (
                    access.centerId.toString() ===
                    centerId.toString()
                  );
                }

                return false;
              }
            );

          if (!hasRegionAccess) {
            return res.status(403).json({
              success: false,
              message:
                "You do not have access to this center",
            });
          }
        }
      }

      // ----------------------------------------------------
      // Get ONLY active students
      // Program + Batch + Center
      // ----------------------------------------------------

      const enrollments =
        await StudentEnrollment.find({
          programId,
          batchId,
          centerId,
          status: "active",
        })
          .populate(
            "studentId",
            "studentSrn rollNumber name fatherName"
          )
          .populate(
            "programId",
            "programName programCode"
          )
          .populate(
            "batchId",
            "batchName startYear endYear"
          )
          .lean();

      if (!enrollments.length) {
        return res.status(404).json({
          success: false,
          message:
            "No active students found for this program, batch and center",
        });
      }

      // ----------------------------------------------------
      // Sort students by Roll Number
      // ----------------------------------------------------

      enrollments.sort(
        (a, b) => {
          const rollA =
            a.studentId?.rollNumber?.toString() ||
            "";

          const rollB =
            b.studentId?.rollNumber?.toString() ||
            "";

          return rollA.localeCompare(
            rollB,
            undefined,
            {
              numeric: true,
              sensitivity: "base",
            }
          );
        }
      );

      // ----------------------------------------------------
      // Program / Batch information
      // ----------------------------------------------------

      const program =
        enrollments[0]?.programId;

      const batch =
        enrollments[0]?.batchId;

      const programName =
        program?.programName ||
        program?.programCode ||
        "Program";

      let batchName = "";

      if (batch?.batchName) {
        batchName =
          batch.batchName;
      } else if (
        batch?.startYear &&
        batch?.endYear
      ) {
        batchName =
          `${batch.startYear}-${String(
            batch.endYear
          ).slice(-2)}`;
      }

      // ----------------------------------------------------
      // Create PDF
      // ----------------------------------------------------

      const doc = new PDFDocument({
        size: "A4",
        margin: 0,
        bufferPages: true,
      });

      const pageWidth = 595.28;
      const pageHeight = 841.89;

      const left = 15;
      const right = 15;

      const contentWidth =
        pageWidth -
        left -
        right;

      // ----------------------------------------------------
      // Helper: Draw Cell
      // ----------------------------------------------------

      const drawCell = (
        x,
        y,
        width,
        height,
        text,
        options = {}
      ) => {
        const {
          align = "left",
          fontSize = 7,
          bold = false,
        } = options;

        doc
          .rect(
            x,
            y,
            width,
            height
          )
          .stroke();

        doc
          .font(
            bold
              ? "Helvetica-Bold"
              : "Helvetica"
          )
          .fontSize(fontSize)
          .text(
            text || "",
            x + 4,
            y + 4,
            {
              width:
                width - 8,
              height:
                height - 8,
              align,
              ellipsis: true,
            }
          );
      };

      // ----------------------------------------------------
      // Table Header
      // ----------------------------------------------------

      const drawTableHeader = (
        y
      ) => {
        const rowHeight = 26;

        const columns = [
          {
            title: "S.NO",
            width: 40,
          },
          {
            title: "RollNO",
            width: 82,
          },
          {
            title: "SRN",
            width: 100,
          },
          {
            title: "Student Name",
            width: 110,
          },
          {
            title: "Father Name",
            width: 110,
          },
          {
            title: "Signature",
            width:
              contentWidth -
              40 -
              82 -
              100 -
              110 -
              110,
          },
        ];

        let x = left;

        columns.forEach(
          (column) => {
            drawCell(
              x,
              y,
              column.width,
              rowHeight,
              column.title,
              {
                align: "center",
                fontSize: 7,
                bold: true,
              }
            );

            x += column.width;
          }
        );

        return rowHeight;
      };

      // ----------------------------------------------------
      // Student Row
      // ----------------------------------------------------

      const drawStudentRow = (
        y,
        enrollment,
        serialNumber
      ) => {
        const rowHeight = 20;

        const student =
          enrollment.studentId ||
          {};

        const columns = [
          {
            value: serialNumber,
            width: 40,
          },
          {
            value:
              student.rollNumber ||
              "",
            width: 82,
          },
          {
            // IMPORTANT:
            // Student model field is studentSrn
            value:
              student.studentSrn ||
              "",
            width: 100,
          },
          {
            value:
              student.name ||
              "",
            width: 110,
          },
          {
            value:
              student.fatherName ||
              "",
            width: 110,
          },
          {
            value: "",
            width:
              contentWidth -
              40 -
              82 -
              100 -
              110 -
              110,
          },
        ];

        let x = left;

        columns.forEach(
          (column) => {
            drawCell(
              x,
              y,
              column.width,
              rowHeight,
              column.value,
              {
                fontSize: 7,
              }
            );

            x += column.width;
          }
        );

        return rowHeight;
      };

      // ----------------------------------------------------
      // PAGE 1 HEADER
      // ----------------------------------------------------

      let y = 20;

      doc
        .font("Helvetica-Bold")
        .fontSize(15)
        .text(
          center.centerName ||
            "CENTER",
          left,
          y,
          {
            width:
              contentWidth,
            align: "center",
          }
        );

      y += 20;

      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(
          "ATTENDANCE SHEET",
          left,
          y,
          {
            width:
              contentWidth,
            align: "center",
          }
        );

      y += 16;

      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(
          `Batch : ${batchName}`,
          left,
          y,
          {
            width:
              contentWidth,
            align: "center",
          }
        );

      y += 28;

      // ----------------------------------------------------
      // Details
      // ----------------------------------------------------

      doc
        .font("Helvetica")
        .fontSize(8);

      doc.text(
        "Center In-charge Name ______________________________",
        left,
        y
      );

      // Date intentionally left blank
      doc.text(
        "Date : ____________________",
        pageWidth - 145,
        y
      );

      y += 22;

      doc.text(
        "Role ____________________",
        left,
        y
      );

      // Lecture Number & Subject intentionally removed

      y += 22;

      doc.text(
        "Remarks (if any) ____________________________",
        left,
        y
      );

      y += 32;

      // ----------------------------------------------------
      // Attendance Summary
      // ----------------------------------------------------

      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(
          "ATTENDANCE SUMMARY",
          left,
          y
        );

      y += 18;

      const summaryWidth =
        contentWidth / 3;

      const summaryHeaderHeight = 25;
      const summaryValueHeight = 25;

      drawCell(
        left,
        y,
        summaryWidth,
        summaryHeaderHeight,
        "Total Students",
        {
          align: "center",
          fontSize: 8,
          bold: true,
        }
      );

      drawCell(
        left +
          summaryWidth,
        y,
        summaryWidth,
        summaryHeaderHeight,
        "Total Present",
        {
          align: "center",
          fontSize: 8,
          bold: true,
        }
      );

      drawCell(
        left +
          summaryWidth * 2,
        y,
        summaryWidth,
        summaryHeaderHeight,
        "Total Absent",
        {
          align: "center",
          fontSize: 8,
          bold: true,
        }
      );

      y +=
        summaryHeaderHeight;

      drawCell(
        left,
        y,
        summaryWidth,
        summaryValueHeight,
        String(
          enrollments.length
        ),
        {
          align: "center",
          fontSize: 8,
        }
      );

      drawCell(
        left +
          summaryWidth,
        y,
        summaryWidth,
        summaryValueHeight,
        "",
        {
          align: "center",
          fontSize: 8,
        }
      );

      drawCell(
        left +
          summaryWidth * 2,
        y,
        summaryWidth,
        summaryValueHeight,
        "",
        {
          align: "center",
          fontSize: 8,
        }
      );

      y += 42;

      // ----------------------------------------------------
      // Signature
      // ----------------------------------------------------

      doc
        .font("Helvetica")
        .fontSize(8)
        .text(
          "Signature: __________________________",
          left,
          y
        );

      y += 28;

      doc.text(
        "Centre-Incharge Signature:",
        left,
        y
      );

      y += 20;

      doc.text(
        "Name ________________________________",
        left,
        y
      );

      y += 20;

      doc.text(
        "Date _________________________________",
        left,
        y
      );

      y += 35;

      // ----------------------------------------------------
      // Student Table
      // ----------------------------------------------------

      const tableHeaderHeight =
        drawTableHeader(y);

      y += tableHeaderHeight;

      // Same format as supplied PDF
      const studentsPerFirstPage = 23;

      const firstPageStudents =
        enrollments.slice(
          0,
          studentsPerFirstPage
        );

      const remainingStudents =
        enrollments.slice(
          studentsPerFirstPage
        );

      firstPageStudents.forEach(
        (
          enrollment,
          index
        ) => {
          drawStudentRow(
            y,
            enrollment,
            index + 1
          );

          y += 20;
        }
      );

      // ----------------------------------------------------
      // Remaining Pages
      // ----------------------------------------------------

      let serialNumber =
        studentsPerFirstPage +
        1;

      let remainingIndex = 0;

      while (
        remainingIndex <
        remainingStudents.length
      ) {
        doc.addPage();

        y = 20;

        const headerHeight =
          drawTableHeader(y);

        y += headerHeight;

        while (
          remainingIndex <
            remainingStudents.length &&
          y <
            pageHeight - 45
        ) {
          drawStudentRow(
            y,
            remainingStudents[
              remainingIndex
            ],
            serialNumber
          );

          y += 20;

          remainingIndex += 1;
          serialNumber += 1;
        }
      }

      // ----------------------------------------------------
      // Page Numbers
      // ----------------------------------------------------

      const range =
        doc.bufferedPageRange();

      for (
        let i = range.start;
        i <
        range.start +
          range.count;
        i++
      ) {
        doc.switchToPage(i);

        doc
          .font("Helvetica")
          .fontSize(8)
          .text(
            `Page ${i + 1}`,
            pageWidth - 55,
            pageHeight - 25
          );
      }

      // ----------------------------------------------------
      // File Name
      // ----------------------------------------------------

      const safeProgramName =
        programName
          .replace(
            /[^a-zA-Z0-9-_ ]/g,
            ""
          )
          .trim()
          .replace(
            /\s+/g,
            "_"
          );

      const safeCenterName =
        (
          center.centerName ||
          "Center"
        )
          .replace(
            /[^a-zA-Z0-9-_ ]/g,
            ""
          )
          .trim()
          .replace(
            /\s+/g,
            "_"
          );

      const safeBatchName =
        (
          batchName ||
          "Batch"
        )
          .replace(
            /[^a-zA-Z0-9-_]/g,
            ""
          )
          .trim();

      const fileName =
        `${safeProgramName}_${safeBatchName}_${safeCenterName}.pdf`;

      // ----------------------------------------------------
      // Response
      // ----------------------------------------------------

      res.setHeader(
        "Content-Type",
        "application/pdf"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );

      doc.pipe(res);

      doc.end();
    } catch (error) {
      console.error(
        "downloadCenterWiseAttendanceTemplate error:",
        error
      );

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message:
            "Failed to generate attendance PDF",
          error: error.message,
        });
      }

      res.end();
    }
  };