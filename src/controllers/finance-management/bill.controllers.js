import crypto from "crypto";
import mongoose from "mongoose";

import {
  S3Client,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { Bills } from "../../models/finance-management/bill.model.js";
import { BillHistory } from "../../models/finance-management/billHistory.models.js";
import { BillAuditor } from "../../models/finance-management/billAuditor.models.js";

import { UserRole } from "../../models/user-management/userRole.models.js";
import { UserRegionAccess } from "../../models/user-management/userRegionAccess.models.js";

import { Block } from "../../models/region-management/block.models.js";
import { Center } from "../../models/region-management/center.models.js";

import {
  uploadToSpaces,
  deleteFromSpaces,
} from "../../utils/space.utils.js";


/*
|--------------------------------------------------------------------------
| CONSTANTS
|--------------------------------------------------------------------------
*/

const FINANCE_BILL_FOLDER =
  "finance-bills";

const ALLOWED_PAYMENT_MODES = [
  "bank-transfer",
  "upi",
  "cash",
  "cheque",
  "other",
];


/*
|--------------------------------------------------------------------------
| DIGITALOCEAN SPACES CLIENT
|--------------------------------------------------------------------------
*/

const spacesClient =
  new S3Client({
    region:
      process.env.SPACES_REGION,

    endpoint:
      process.env.SPACES_ENDPOINT,

    credentials: {
      accessKeyId:
        process.env.SPACES_ACCESS_KEY,

      secretAccessKey:
        process.env.SPACES_SECRET_KEY,
    },
  });


/*
|--------------------------------------------------------------------------
| HELPER FUNCTIONS
|--------------------------------------------------------------------------
*/

const isValidBillId = (
  billId
) => {
  return mongoose.Types.ObjectId.isValid(
    billId
  );
};


const calculateTotalAmount = (
  expenses
) => {
  return expenses.reduce(
    (total, expense) => {
      return (
        total +
        Number(
          expense.amount || 0
        )
      );
    },
    0
  );
};


const parseExpenses = (
  expenses
) => {
  if (
    Array.isArray(
      expenses
    )
  ) {
    return expenses;
  }

  if (
    typeof expenses ===
    "string"
  ) {
    try {
      const parsedExpenses =
        JSON.parse(
          expenses
        );

      return Array.isArray(
        parsedExpenses
      )
        ? parsedExpenses
        : null;
    } catch (error) {
      return null;
    }
  }

  return null;
};


const parseJsonField = (
  value
) => {
  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  if (
    typeof value !==
    "string"
  ) {
    return value;
  }

  try {
    return JSON.parse(
      value
    );
  } catch (error) {
    return undefined;
  }
};


const validateExpenses = (
  expenses
) => {
  if (
    !Array.isArray(
      expenses
    ) ||
    expenses.length === 0
  ) {
    return "At least one expense item is required";
  }

  for (
    const expense of expenses
  ) {
    if (
      !expense.category
    ) {
      return "Expense category is required";
    }

    if (
      expense.amount ===
        undefined ||
      expense.amount ===
        null ||
      Number.isNaN(
        Number(
          expense.amount
        )
      ) ||
      Number(
        expense.amount
      ) < 0
    ) {
      return "Valid expense amount is required";
    }

    if (
      !expense.expenseDate
    ) {
      return "Expense date is required";
    }

    if (
      expense.category ===
      "travel-expense"
    ) {
      if (
        !expense.travel?.from
      ) {
        return "From is required for travel expense";
      }

      if (
        !expense.travel?.to
      ) {
        return "To is required for travel expense";
      }

      if (
        !expense.travel
          ?.travelDate
      ) {
        return "Travel date is required for travel expense";
      }

      if (
        !expense.travel?.purpose
      ) {
        return "Purpose is required for travel expense";
      }
    }
  }

  return null;
};


/*
|--------------------------------------------------------------------------
| ATTACHMENT SIGNED URL
|--------------------------------------------------------------------------
|
| DigitalOcean Spaces files are private.
| This creates a temporary URL for viewing/downloading.
|
*/

const getAttachmentSignedUrl =
  async (
    publicId
  ) => {
    if (!publicId) {
      return null;
    }

    const command =
      new GetObjectCommand({
        Bucket:
          process.env.SPACES_BUCKET,

        Key:
          publicId,
      });

    return getSignedUrl(
      spacesClient,
      command,
      {
        expiresIn:
          60 * 10,
      }
    );
  };


/*
|--------------------------------------------------------------------------
| USER ROLE HELPERS
|--------------------------------------------------------------------------
*/

const getUserRoleCodes =
  async (
    userId
  ) => {
    const userRoles =
      await UserRole.find({
        userId,
        isActive: true,
      })
        .populate(
          "roleId",
          "roleCode roleName isActive"
        )
        .lean();

    return userRoles
      .filter(
        (userRole) =>
          userRole.roleId &&
          userRole.roleId
            .isActive !== false
      )
      .map(
        (userRole) =>
          userRole.roleId.roleCode?.toLowerCase()
      )
      .filter(Boolean);
  };


const userHasRole =
  async (
    userId,
    roleCode
  ) => {
    const roleCodes =
      await getUserRoleCodes(
        userId
      );

    return roleCodes.includes(
      roleCode.toLowerCase()
    );
  };


/*
|--------------------------------------------------------------------------
| USER REGION ACCESS
|--------------------------------------------------------------------------
|
| Existing UserRegionAccess records may contain only the
| directly selected region.
|
| Example:
|
| center:
| {
|   centerId,
|   districtId: null,
|   blockId: null
| }
|
| Therefore we resolve:
|
| center -> block -> district
| block  -> district
|
| WITHOUT changing UserRegionAccess.
|
|--------------------------------------------------------------------------
*/

const getUserRegionAccess =
  async (
    userId
  ) => {
    const regionAccesses =
      await UserRegionAccess.find({
        userId,
      }).lean();

    if (
      regionAccesses.length ===
      0
    ) {
      return [];
    }

    const blockIds = [];
    const centerIds = [];

    for (
      const regionAccess of regionAccesses
    ) {
      if (
        regionAccess.blockId
      ) {
        blockIds.push(
          regionAccess.blockId.toString()
        );
      }

      if (
        regionAccess.centerId
      ) {
        centerIds.push(
          regionAccess.centerId.toString()
        );
      }
    }

    const uniqueBlockIds =
      [
        ...new Set(
          blockIds
        ),
      ];

    const uniqueCenterIds =
      [
        ...new Set(
          centerIds
        ),
      ];

    const [
      blocks,
      centers,
    ] =
      await Promise.all([
        uniqueBlockIds.length >
        0
          ? Block.find({
              _id: {
                $in:
                  uniqueBlockIds,
              },
            })
              .select(
                "_id districtId"
              )
              .lean()
          : [],

        uniqueCenterIds.length >
        0
          ? Center.find({
              _id: {
                $in:
                  uniqueCenterIds,
              },
            })
              .select(
                "_id districtId blockId"
              )
              .lean()
          : [],
      ]);

    const blockMap =
      new Map(
        blocks.map(
          (block) => [
            block._id.toString(),
            block,
          ]
        )
      );

    const centerMap =
      new Map(
        centers.map(
          (center) => [
            center._id.toString(),
            center,
          ]
        )
      );

    return regionAccesses.map(
      (regionAccess) => {
        let districtId =
          regionAccess.districtId ||
          null;

        let blockId =
          regionAccess.blockId ||
          null;

        const centerId =
          regionAccess.centerId ||
          null;

        /*
         * CENTER -> BLOCK -> DISTRICT
         */
        if (centerId) {
          const center =
            centerMap.get(
              centerId.toString()
            );

          if (center) {
            blockId =
              center.blockId ||
              blockId ||
              null;

            districtId =
              center.districtId ||
              districtId ||
              null;

            /*
             * Fallback:
             * if Center doesn't have districtId,
             * resolve it through Block.
             */
            if (
              !districtId &&
              blockId
            ) {
              const block =
                blockMap.get(
                  blockId.toString()
                );

              if (block) {
                districtId =
                  block.districtId ||
                  null;
              }
            }
          }
        }

        /*
         * BLOCK -> DISTRICT
         */
        if (
          blockId &&
          !districtId
        ) {
          const block =
            blockMap.get(
              blockId.toString()
            );

          if (block) {
            districtId =
              block.districtId ||
              null;
          }
        }

        return {
          ...regionAccess,

          districtId,

          blockId,

          centerId,
        };
      }
    );
  };


/*
|--------------------------------------------------------------------------
| BILL AUDITOR AUTHORIZATION
|--------------------------------------------------------------------------
*/

const hasBillAuditorAccess =
  async ({
    bill,
    userId,
    action,
  }) => {
    /*
     * A user cannot verify/approve
     * their own bill.
     */
    const submittedById =
      bill.submittedBy?._id ||
      bill.submittedBy;

    if (
      submittedById &&
      submittedById.toString() ===
        userId.toString()
    ) {
      return false;
    }

    /*
     * Find mappings assigned to
     * the logged-in auditor.
     */
    const auditorMappings =
      await BillAuditor.find({
        userId,
        action,
        isActive: true,
      }).lean();

    if (
      auditorMappings.length ===
      0
    ) {
      return false;
    }

    /*
     * Get bill submitter role
     * and region access.
     */
    const [
      submitterRoleCodes,
      submitterRegionAccess,
    ] =
      await Promise.all([
        getUserRoleCodes(
          submittedById
        ),

        getUserRegionAccess(
          submittedById
        ),
      ]);

    if (
      submitterRoleCodes.length ===
      0
    ) {
      return false;
    }

    /*
     * Check every mapping.
     *
     * Any matching mapping
     * grants access.
     */
    for (
      const mapping of auditorMappings
    ) {
      /*
       * ROLE CHECK
       */
      const mappedRole =
        mapping.roleAccess?.toLowerCase();

      if (
        !submitterRoleCodes.includes(
          mappedRole
        )
      ) {
        continue;
      }

      /*
       * GLOBAL
       */
      if (
        mapping.regionScope ===
        "global"
      ) {
        return true;
      }

      if (
        !Array.isArray(
          submitterRegionAccess
        ) ||
        submitterRegionAccess.length ===
          0
      ) {
        continue;
      }

      /*
       * DISTRICT
       */
      if (
        mapping.regionScope ===
        "district"
      ) {
        if (
          !mapping.districtId
        ) {
          continue;
        }

        const hasDistrictAccess =
          submitterRegionAccess.some(
            (regionAccess) =>
              regionAccess.districtId &&
              regionAccess.districtId.toString() ===
                mapping.districtId.toString()
          );

        if (
          hasDistrictAccess
        ) {
          return true;
        }

        continue;
      }

      /*
       * BLOCK
       */
      if (
        mapping.regionScope ===
        "block"
      ) {
        if (
          !mapping.blockId
        ) {
          continue;
        }

        const hasBlockAccess =
          submitterRegionAccess.some(
            (regionAccess) =>
              regionAccess.blockId &&
              regionAccess.blockId.toString() ===
                mapping.blockId.toString()
          );

        if (
          hasBlockAccess
        ) {
          return true;
        }

        continue;
      }

      /*
       * CENTER
       */
      if (
        mapping.regionScope ===
        "center"
      ) {
        if (
          !mapping.centerId
        ) {
          continue;
        }

        const hasCenterAccess =
          submitterRegionAccess.some(
            (regionAccess) =>
              regionAccess.centerId &&
              regionAccess.centerId.toString() ===
                mapping.centerId.toString()
          );

        if (
          hasCenterAccess
        ) {
          return true;
        }

        continue;
      }
    }

    return false;
  };


/*
|--------------------------------------------------------------------------
| GET ELIGIBLE SUBMITTER USERS
|--------------------------------------------------------------------------
|
| Used by:
|
| GET /verification
| GET /approval
|
|--------------------------------------------------------------------------
*/

const getEligibleSubmitterUserIds =
  async ({
    auditorUserId,
    action,
  }) => {
    const mappings =
      await BillAuditor.find({
        userId:
          auditorUserId,

        action,

        isActive: true,
      }).lean();

    if (
      mappings.length ===
      0
    ) {
      return [];
    }

    const eligibleUserIds =
      new Set();

    /*
     * Fetch active role assignments once.
     */
    const roleUsers =
      await UserRole.find({
        isActive: true,
      })
        .populate(
          "roleId",
          "roleCode isActive"
        )
        .lean();

    /*
     * Process every auditor mapping.
     */
    for (
      const mapping of mappings
    ) {
      /*
       * Find users having
       * required submitter role.
       */
      const roleUserIds =
        roleUsers
          .filter(
            (userRole) =>
              userRole.roleId &&
              userRole.roleId
                .isActive !== false &&
              userRole.roleId.roleCode?.toLowerCase() ===
                mapping.roleAccess?.toLowerCase()
          )
          .map(
            (userRole) =>
              userRole.userId.toString()
          );

      if (
        roleUserIds.length ===
        0
      ) {
        continue;
      }

      /*
       * GLOBAL
       */
      if (
        mapping.regionScope ===
        "global"
      ) {
        roleUserIds.forEach(
          (id) =>
            eligibleUserIds.add(
              id
            )
        );

        continue;
      }

      /*
       * Get region assignments
       * for matching-role users.
       */
      const submitterRegionAccesses =
        await UserRegionAccess.find({
          userId: {
            $in:
              roleUserIds,
          },
        }).lean();

      if (
        submitterRegionAccesses.length ===
        0
      ) {
        continue;
      }

      const blockIds = [];
      const centerIds = [];

      for (
        const regionAccess of submitterRegionAccesses
      ) {
        if (
          regionAccess.blockId
        ) {
          blockIds.push(
            regionAccess.blockId.toString()
          );
        }

        if (
          regionAccess.centerId
        ) {
          centerIds.push(
            regionAccess.centerId.toString()
          );
        }
      }

      const uniqueBlockIds =
        [
          ...new Set(
            blockIds
          ),
        ];

      const uniqueCenterIds =
        [
          ...new Set(
            centerIds
          ),
        ];

      const [
        blocks,
        centers,
      ] =
        await Promise.all([
          uniqueBlockIds.length >
          0
            ? Block.find({
                _id: {
                  $in:
                    uniqueBlockIds,
                },
              })
                .select(
                  "_id districtId"
                )
                .lean()
            : [],

          uniqueCenterIds.length >
          0
            ? Center.find({
                _id: {
                  $in:
                    uniqueCenterIds,
                },
              })
                .select(
                  "_id districtId blockId"
                )
                .lean()
            : [],
        ]);

      const blockMap =
        new Map(
          blocks.map(
            (block) => [
              block._id.toString(),
              block,
            ]
          )
        );

      const centerMap =
        new Map(
          centers.map(
            (center) => [
              center._id.toString(),
              center,
            ]
          )
        );

      /*
       * Match region mapping.
       */
      for (
        const regionAccess of submitterRegionAccesses
      ) {
        let districtId =
          regionAccess.districtId ||
          null;

        let blockId =
          regionAccess.blockId ||
          null;

        const centerId =
          regionAccess.centerId ||
          null;

        /*
         * CENTER -> BLOCK -> DISTRICT
         */
        if (centerId) {
          const center =
            centerMap.get(
              centerId.toString()
            );

          if (center) {
            blockId =
              center.blockId ||
              blockId ||
              null;

            districtId =
              center.districtId ||
              districtId ||
              null;

            if (
              !districtId &&
              blockId
            ) {
              const block =
                blockMap.get(
                  blockId.toString()
                );

              if (block) {
                districtId =
                  block.districtId ||
                  null;
              }
            }
          }
        }

        /*
         * BLOCK -> DISTRICT
         */
        if (
          blockId &&
          !districtId
        ) {
          const block =
            blockMap.get(
              blockId.toString()
            );

          if (block) {
            districtId =
              block.districtId ||
              null;
          }
        }

        /*
         * DISTRICT MAPPING
         */
        if (
          mapping.regionScope ===
          "district"
        ) {
          if (
            districtId &&
            mapping.districtId &&
            districtId.toString() ===
              mapping.districtId.toString()
          ) {
            eligibleUserIds.add(
              regionAccess.userId.toString()
            );
          }

          continue;
        }

        /*
         * BLOCK MAPPING
         */
        if (
          mapping.regionScope ===
          "block"
        ) {
          if (
            blockId &&
            mapping.blockId &&
            blockId.toString() ===
              mapping.blockId.toString()
          ) {
            eligibleUserIds.add(
              regionAccess.userId.toString()
            );
          }

          continue;
        }

        /*
         * CENTER MAPPING
         */
        if (
          mapping.regionScope ===
          "center"
        ) {
          if (
            centerId &&
            mapping.centerId &&
            centerId.toString() ===
              mapping.centerId.toString()
          ) {
            eligibleUserIds.add(
              regionAccess.userId.toString()
            );
          }

          continue;
        }
      }
    }

    return Array.from(
      eligibleUserIds
    ).map(
      (id) =>
        new mongoose.Types.ObjectId(
          id
        )
    );
  };


/*
|--------------------------------------------------------------------------
| CAN VIEW BILL
|--------------------------------------------------------------------------
*/

const canViewBill =
  async ({
    bill,
    userId,
  }) => {
    /*
     * Important:
     * submittedBy may be populated.
     *
     * So always extract ObjectId.
     */
    const submittedById =
      bill.submittedBy?._id ||
      bill.submittedBy;

    /*
     * BILL OWNER
     *
     * Owner can always view
     * their own bill.
     */
    if (
      submittedById &&
      submittedById.toString() ===
        userId.toString()
    ) {
      return true;
    }

    /*
     * ADMIN
     */
    if (
      await userHasRole(
        userId,
        "admin"
      )
    ) {
      return true;
    }

    /*
     * VERIFICATION
     */
    if (
      bill.status ===
      "verification-pending"
    ) {
      return hasBillAuditorAccess({
        bill,
        userId,
        action:
          "verify",
      });
    }

    /*
     * APPROVAL
     */
    if (
      bill.status ===
      "approval-pending"
    ) {
      return hasBillAuditorAccess({
        bill,
        userId,
        action:
          "approve",
      });
    }

    /*
     * Other stages:
     * owner/admin only.
     */
    return false;
  };


/*
|--------------------------------------------------------------------------
| UPLOAD BILL ATTACHMENTS
|--------------------------------------------------------------------------
*/

const uploadBillAttachments =
  async ({
    files,
    billId,
  }) => {
    if (
      !Array.isArray(
        files
      ) ||
      files.length === 0
    ) {
      return [];
    }

    const uploadedFiles =
      [];

    try {
      const now =
        new Date();

      const year =
        now.getFullYear();

      const month =
        String(
          now.getMonth() + 1
        ).padStart(
          2,
          "0"
        );

      for (
        const file of files
      ) {
        const extension =
          file.originalname.includes(
            "."
          )
            ? file.originalname.substring(
                file.originalname.lastIndexOf(
                  "."
                )
              )
            : "";

        const uniqueFileName =
          `${crypto.randomUUID()}${extension}`;

        const folder =
          `${FINANCE_BILL_FOLDER}/` +
          `${year}/${month}/${billId}`;

        const uploadedFile =
          await uploadToSpaces({
            file,

            folder,

            fileName:
              uniqueFileName,
          });

        uploadedFiles.push({
          url:
            uploadedFile.url,

          publicId:
            uploadedFile.key,

          fileName:
            file.originalname,

          mimeType:
            file.mimetype,

          uploadedAt:
            new Date(),
        });
      }

      return uploadedFiles;
    } catch (error) {
      /*
       * Rollback uploaded files.
       */
      for (
        const uploadedFile of uploadedFiles
      ) {
        try {
          await deleteFromSpaces(
            uploadedFile.publicId
          );
        } catch (deleteError) {
          console.error(
            "ROLLBACK BILL ATTACHMENT DELETE ERROR:",
            deleteError
          );
        }
      }

      throw error;
    }
  };


/*
|--------------------------------------------------------------------------
| CREATE BILL
|--------------------------------------------------------------------------
*/

export const createBill =
  async (
    req,
    res
  ) => {
    let uploadedAttachments =
      [];

    try {
      const {
        billNumber,
        title,
        description,
        billDate,
        expenses,
        currency,
        vendor,
      } = req.body;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      if (
        !billNumber?.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Bill number is required",
        });
      }

      if (
        !title?.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Bill title is required",
        });
      }

      if (!billDate) {
        return res.status(400).json({
          success: false,
          message:
            "Bill date is required",
        });
      }

      const parsedExpenses =
        parseExpenses(
          expenses
        );

      if (!parsedExpenses) {
        return res.status(400).json({
          success: false,
          message:
            "Expenses must be a valid JSON array",
        });
      }

      const expenseValidationError =
        validateExpenses(
          parsedExpenses
        );

      if (
        expenseValidationError
      ) {
        return res.status(400).json({
          success: false,
          message:
            expenseValidationError,
        });
      }

      const totalAmount =
        calculateTotalAmount(
          parsedExpenses
        );

      const parsedVendor =
        parseJsonField(
          vendor
        );

      const existingBill =
        await Bills.findOne({
          billNumber:
            billNumber.trim(),
        });

      if (existingBill) {
        return res.status(409).json({
          success: false,
          message:
            "Bill number already exists",
        });
      }

      const bill =
        new Bills({
          billNumber:
            billNumber.trim(),

          title:
            title.trim(),

          description,

          billDate,

          expenses:
            parsedExpenses,

          totalAmount,

          currency:
            currency ||
            "INR",

          vendor:
            parsedVendor,

          attachments: [],

          submittedBy:
            userId,

          submittedAt:
            null,

          status:
            "draft",
        });

      await bill.save();

      /*
       * Upload attachments.
       */
      try {
        uploadedAttachments =
          await uploadBillAttachments({
            files:
              req.files,

            billId:
              bill._id,
          });
      } catch (uploadError) {
        await Bills.findByIdAndDelete(
          bill._id
        );

        throw uploadError;
      }

      /*
       * Save attachment metadata.
       */
      if (
        uploadedAttachments.length >
        0
      ) {
        bill.attachments =
          uploadedAttachments;

        await bill.save();
      }

      /*
       * History.
       */
      await BillHistory.create({
        billId:
          bill._id,

        action:
          "created",

        stage:
          "submission",

        previousStatus:
          null,

        newStatus:
          "draft",

        actionBy:
          userId,

        remarks:
          "Bill created",

        metadata: {
          attachmentCount:
            uploadedAttachments.length,
        },
      });

      const populatedBill =
        await Bills.findById(
          bill._id
        )
          .populate(
            "submittedBy",
            "name email"
          )
          .lean();

      /*
       * Generate signed URLs
       * in response.
       */
      if (
        Array.isArray(
          populatedBill.attachments
        )
      ) {
        populatedBill.attachments =
          await Promise.all(
            populatedBill.attachments.map(
              async (
                attachment
              ) => ({
                ...attachment,

                url:
                  await getAttachmentSignedUrl(
                    attachment.publicId
                  ),
              })
            )
          );
      }

      return res.status(201).json({
        success: true,

        message:
          "Bill created successfully",

        data:
          populatedBill,
      });
    } catch (error) {
      console.error(
        "CREATE BILL ERROR:",
        error
      );

      if (
        uploadedAttachments.length >
        0
      ) {
        for (
          const attachment of uploadedAttachments
        ) {
          try {
            await deleteFromSpaces(
              attachment.publicId
            );
          } catch (
            deleteError
          ) {
            console.error(
              "CREATE BILL ROLLBACK ERROR:",
              deleteError
            );
          }
        }
      }

      if (
        error.code ===
        11000
      ) {
        return res.status(409).json({
          success: false,
          message:
            "Bill number already exists",
        });
      }

      return res.status(500).json({
        success: false,
        message:
          "Failed to create bill",

        error:
          error.message,
      });
    }
  };


/*
|--------------------------------------------------------------------------
| SUBMIT / RESUBMIT BILL
|--------------------------------------------------------------------------
*/

export const submitBill =
  async (
    req,
    res
  ) => {
    try {
      const { billId } =
        req.params;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      if (
        !isValidBillId(
          billId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid bill ID",
        });
      }

      const bill =
        await Bills.findById(
          billId
        );

      if (!bill) {
        return res.status(404).json({
          success: false,
          message:
            "Bill not found",
        });
      }

      if (
        bill.submittedBy.toString() !==
        userId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to submit this bill",
        });
      }

      if (
        ![
          "draft",
          "rejected",
        ].includes(
          bill.status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Bill cannot be submitted from ${bill.status} status`,
        });
      }

      const expenseValidationError =
        validateExpenses(
          bill.expenses
        );

      if (
        expenseValidationError
      ) {
        return res.status(400).json({
          success: false,
          message:
            expenseValidationError,
        });
      }

      const previousStatus =
        bill.status;

      bill.totalAmount =
        calculateTotalAmount(
          bill.expenses
        );

      bill.status =
        "verification-pending";

      bill.submittedAt =
        new Date();

      if (
        previousStatus ===
        "rejected"
      ) {
        bill.resubmissionCount +=
          1;

        bill.lastResubmittedAt =
          new Date();

        bill.rejection = {
          rejectedBy:
            null,

          rejectedAt:
            null,

          stage:
            null,

          remarks:
            null,
        };

        bill.verification = {
          verifiedBy:
            null,

          verifiedAt:
            null,

          remarks:
            null,
        };

        bill.approval = {
          approvedBy:
            null,

          approvedAt:
            null,

          remarks:
            null,
        };
      }

      await bill.save();

      await BillHistory.create({
        billId:
          bill._id,

        action:
          previousStatus ===
          "rejected"
            ? "resubmitted"
            : "submitted",

        stage:
          "submission",

        previousStatus,

        newStatus:
          "verification-pending",

        actionBy:
          userId,

        remarks:
          previousStatus ===
          "rejected"
            ? "Bill resubmitted after rejection"
            : "Bill submitted for verification",
      });

      const populatedBill =
        await Bills.findById(
          bill._id
        )
          .populate(
            "submittedBy",
            "name email"
          )
          .lean();

      return res.status(200).json({
        success: true,

        message:
          previousStatus ===
          "rejected"
            ? "Bill resubmitted successfully"
            : "Bill submitted successfully",

        data:
          populatedBill,
      });
    } catch (error) {
      console.error(
        "SUBMIT BILL ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to submit bill",

        error:
          error.message,
      });
    }
  };


/*
|--------------------------------------------------------------------------
| VERIFY BILL
|--------------------------------------------------------------------------
*/

export const verifyBill =
  async (
    req,
    res
  ) => {
    try {
      const { billId } =
        req.params;

      const { remarks } =
        req.body;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      if (
        !isValidBillId(
          billId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid bill ID",
        });
      }

      const bill =
        await Bills.findById(
          billId
        );

      if (!bill) {
        return res.status(404).json({
          success: false,
          message:
            "Bill not found",
        });
      }

      if (
        bill.status !==
        "verification-pending"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Only bills pending verification can be verified",
        });
      }

      const isAdmin =
        await userHasRole(
          userId,
          "admin"
        );

      let authorized =
        false;

      if (!isAdmin) {
        authorized =
          await hasBillAuditorAccess({
            bill,

            userId,

            action:
              "verify",
          });
      }

      if (
        !authorized &&
        !isAdmin
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to verify this bill",
        });
      }

      const previousStatus =
        bill.status;

      bill.status =
        "approval-pending";

      bill.verification = {
        verifiedBy:
          userId,

        verifiedAt:
          new Date(),

        remarks:
          remarks?.trim() ||
          null,
      };

      await bill.save();

      await BillHistory.create({
        billId:
          bill._id,

        action:
          "verified",

        stage:
          "verification",

        previousStatus,

        newStatus:
          "approval-pending",

        actionBy:
          userId,

        remarks:
          remarks?.trim() ||
          "Bill verified and moved to approval",
      });

      const populatedBill =
        await Bills.findById(
          bill._id
        )
          .populate(
            "submittedBy",
            "name email"
          )
          .populate(
            "verification.verifiedBy",
            "name email"
          )
          .lean();

      return res.status(200).json({
        success: true,

        message:
          "Bill verified and moved to approval successfully",

        data:
          populatedBill,
      });
    } catch (error) {
      console.error(
        "VERIFY BILL ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to verify bill",

        error:
          error.message,
      });
    }
  };


/*
|--------------------------------------------------------------------------
| REJECT BILL
|--------------------------------------------------------------------------
*/

export const rejectBill =
  async (
    req,
    res
  ) => {
    try {
      const { billId } =
        req.params;

      const { remarks } =
        req.body;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      if (
        !isValidBillId(
          billId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid bill ID",
        });
      }

      if (
        !remarks?.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Rejection remarks are required",
        });
      }

      const bill =
        await Bills.findById(
          billId
        );

      if (!bill) {
        return res.status(404).json({
          success: false,
          message:
            "Bill not found",
        });
      }

      let stage;
      let action;

      if (
        bill.status ===
        "verification-pending"
      ) {
        stage =
          "verification";

        action =
          "verify";
      } else if (
        bill.status ===
        "approval-pending"
      ) {
        stage =
          "approval";

        action =
          "approve";
      } else {
        return res.status(400).json({
          success: false,
          message:
            "Bill cannot be rejected from its current status",
        });
      }

      const isAdmin =
        await userHasRole(
          userId,
          "admin"
        );

      let authorized =
        false;

      if (!isAdmin) {
        authorized =
          await hasBillAuditorAccess({
            bill,

            userId,

            action,
          });
      }

      if (
        !authorized &&
        !isAdmin
      ) {
        return res.status(403).json({
          success: false,

          message:
            `You are not authorized to reject this bill at ${stage} stage`,
        });
      }

      const previousStatus =
        bill.status;

      bill.status =
        "rejected";

      bill.rejection = {
        rejectedBy:
          userId,

        rejectedAt:
          new Date(),

        stage,

        remarks:
          remarks.trim(),
      };

      await bill.save();

      await BillHistory.create({
        billId:
          bill._id,

        action:
          "rejected",

        stage,

        previousStatus,

        newStatus:
          "rejected",

        actionBy:
          userId,

        remarks:
          remarks.trim(),
      });

      return res.status(200).json({
        success: true,

        message:
          "Bill rejected successfully",

        data:
          bill,
      });
    } catch (error) {
      console.error(
        "REJECT BILL ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to reject bill",

        error:
          error.message,
      });
    }
  };


/*
|--------------------------------------------------------------------------
| APPROVE BILL
|--------------------------------------------------------------------------
*/

export const approveBill =
  async (
    req,
    res
  ) => {
    try {
      const { billId } =
        req.params;

      const { remarks } =
        req.body;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      if (
        !isValidBillId(
          billId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid bill ID",
        });
      }

      const bill =
        await Bills.findById(
          billId
        );

      if (!bill) {
        return res.status(404).json({
          success: false,
          message:
            "Bill not found",
        });
      }

      if (
        bill.status !==
        "approval-pending"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Only bills pending approval can be approved",
        });
      }

      const isAdmin =
        await userHasRole(
          userId,
          "admin"
        );

      let authorized =
        false;

      if (!isAdmin) {
        authorized =
          await hasBillAuditorAccess({
            bill,

            userId,

            action:
              "approve",
          });
      }

      if (
        !authorized &&
        !isAdmin
      ) {
        return res.status(403).json({
          success: false,

          message:
            "You are not authorized to approve this bill",
        });
      }

      const previousStatus =
        bill.status;

      bill.status =
        "approved";

      bill.approval = {
        approvedBy:
          userId,

        approvedAt:
          new Date(),

        remarks:
          remarks?.trim() ||
          null,
      };

      await bill.save();

      await BillHistory.create({
        billId:
          bill._id,

        action:
          "approved",

        stage:
          "approval",

        previousStatus,

        newStatus:
          "approved",

        actionBy:
          userId,

        remarks:
          remarks?.trim() ||
          "Bill approved",
      });

      const populatedBill =
        await Bills.findById(
          bill._id
        )
          .populate(
            "submittedBy",
            "name email"
          )
          .populate(
            "approval.approvedBy",
            "name email"
          )
          .lean();

      return res.status(200).json({
        success: true,

        message:
          "Bill approved successfully",

        data:
          populatedBill,
      });
    } catch (error) {
      console.error(
        "APPROVE BILL ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to approve bill",

        error:
          error.message,
      });
    }
  };


/*
|--------------------------------------------------------------------------
| MARK PAYMENT PENDING
|--------------------------------------------------------------------------
*/

export const markPaymentPending =
  async (
    req,
    res
  ) => {
    try {
      const { billId } =
        req.params;

      const { remarks } =
        req.body;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      if (
        !isValidBillId(
          billId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid bill ID",
        });
      }

      const bill =
        await Bills.findById(
          billId
        );

      if (!bill) {
        return res.status(404).json({
          success: false,
          message:
            "Bill not found",
        });
      }

      if (
        bill.status !==
        "approved"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Only approved bills can be marked as payment pending",
        });
      }

      const isAdmin =
        await userHasRole(
          userId,
          "admin"
        );

      const isOwner =
        bill.submittedBy.toString() ===
        userId.toString();

      if (
        !isAdmin &&
        !isOwner
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not authorized to move this bill to payment pending",
        });
      }

      const previousStatus =
        bill.status;

      bill.status =
        "payment-pending";

      await bill.save();

      await BillHistory.create({
        billId:
          bill._id,

        action:
          "marked-payment-pending",

        stage:
          "payment",

        previousStatus,

        newStatus:
          "payment-pending",

        actionBy:
          userId,

        remarks:
          remarks?.trim() ||
          "Bill moved to payment pending",
      });

      return res.status(200).json({
        success: true,

        message:
          "Bill marked as payment pending",

        data:
          bill,
      });
    } catch (error) {
      console.error(
        "MARK PAYMENT PENDING ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to mark bill as payment pending",

        error:
          error.message,
      });
    }
  };


/*
|--------------------------------------------------------------------------
| MARK BILL PAID
|--------------------------------------------------------------------------
*/

export const markBillPaid =
  async (
    req,
    res
  ) => {
    try {
      const { billId } =
        req.params;

      const {
        paymentReference,
        paymentMode,
        remarks,
      } = req.body;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      if (
        !isValidBillId(
          billId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid bill ID",
        });
      }

      const bill =
        await Bills.findById(
          billId
        );

      if (!bill) {
        return res.status(404).json({
          success: false,
          message:
            "Bill not found",
        });
      }

      if (
        bill.status !==
        "payment-pending"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Only payment-pending bills can be marked as paid",
        });
      }

      if (
        paymentMode &&
        !ALLOWED_PAYMENT_MODES.includes(
          paymentMode
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid payment mode",
        });
      }

      const isAdmin =
        await userHasRole(
          userId,
          "admin"
        );

      const isOwner =
        bill.submittedBy.toString() ===
        userId.toString();

      if (
        !isAdmin &&
        !isOwner
      ) {
        return res.status(403).json({
          success: false,

          message:
            "You are not authorized to mark this bill as paid",
        });
      }

      const previousStatus =
        bill.status;

      bill.status =
        "paid";

      bill.payment = {
        paidBy:
          userId,

        paidAt:
          new Date(),

        paymentReference:
          paymentReference?.trim() ||
          null,

        paymentMode:
          paymentMode ||
          null,

        remarks:
          remarks?.trim() ||
          null,
      };

      await bill.save();

      await BillHistory.create({
        billId:
          bill._id,

        action:
          "paid",

        stage:
          "payment",

        previousStatus,

        newStatus:
          "paid",

        actionBy:
          userId,

        remarks:
          remarks?.trim() ||
          "Bill marked as paid",

        paymentReference:
          paymentReference?.trim() ||
          null,

        metadata: {
          paymentMode:
            paymentMode ||
            null,
        },
      });

      const populatedBill =
        await Bills.findById(
          bill._id
        )
          .populate(
            "submittedBy",
            "name email"
          )
          .populate(
            "payment.paidBy",
            "name email"
          )
          .lean();

      return res.status(200).json({
        success: true,

        message:
          "Bill marked as paid successfully",

        data:
          populatedBill,
      });
    } catch (error) {
      console.error(
        "MARK BILL PAID ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to mark bill as paid",

        error:
          error.message,
      });
    }
  };


/*
|--------------------------------------------------------------------------
| GET BILLS
|--------------------------------------------------------------------------
|
| Non-admin:
|   Own bills only
|
| Admin:
|   All bills
|
| Verification / Approval:
|   Dedicated queues
|
|--------------------------------------------------------------------------
*/

export const getBills =
  async (
    req,
    res
  ) => {
    try {
      const {
        status,
        submittedBy,
        billNumber,
        page = 1,
        limit = 10,
      } = req.query;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      const isAdmin =
        await userHasRole(
          userId,
          "admin"
        );

      const match = {};

      if (isAdmin) {
        if (submittedBy) {
          if (
            !isValidBillId(
              submittedBy
            )
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid submittedBy",
            });
          }

          match.submittedBy =
            submittedBy;
        }
      } else {
        /*
         * Normal Bills page:
         * non-admin sees own bills.
         */
        match.submittedBy =
          userId;
      }

      if (status) {
        match.status =
          status;
      }

      if (billNumber) {
        match.billNumber = {
          $regex:
            billNumber,

          $options:
            "i",
        };
      }

      const pageNumber =
        Math.max(
          Number(page),
          1
        );

      const limitNumber =
        Math.min(
          Math.max(
            Number(limit),
            1
          ),
          100
        );

      const skip =
        (pageNumber - 1) *
        limitNumber;

      const [
        bills,
        total,
      ] =
        await Promise.all([
          Bills.find(match)
            .populate(
              "submittedBy",
              "name email"
            )
            .sort({
              createdAt:
                -1,
            })
            .skip(skip)
            .limit(
              limitNumber
            )
            .lean(),

          Bills.countDocuments(
            match
          ),
        ]);

      return res.status(200).json({
        success: true,

        message:
          "Bills fetched successfully",

        data: {
          bills,

          pagination: {
            total,

            page:
              pageNumber,

            limit:
              limitNumber,

            totalPages:
              Math.ceil(
                total /
                  limitNumber
              ),
          },
        },
      });
    } catch (error) {
      console.error(
        "GET BILLS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to fetch bills",

        error:
          error.message,
      });
    }
  };


/*
|--------------------------------------------------------------------------
| GET BILL BY ID
|--------------------------------------------------------------------------
*/

export const getBillById =
  async (
    req,
    res
  ) => {
    try {
      const { billId } =
        req.params;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      if (
        !isValidBillId(
          billId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid bill ID",
        });
      }

      const bill =
        await Bills.findById(
          billId
        )
          .populate(
            "submittedBy",
            "name email"
          )
          .populate(
            "verification.verifiedBy",
            "name email"
          )
          .populate(
            "approval.approvedBy",
            "name email"
          )
          .populate(
            "rejection.rejectedBy",
            "name email"
          )
          .populate(
            "payment.paidBy",
            "name email"
          )
          .lean();

      if (!bill) {
        return res.status(404).json({
          success: false,
          message:
            "Bill not found",
        });
      }

      /*
       * Owner/admin/auditor authorization.
       */
      const authorized =
        await canViewBill({
          bill,

          userId,
        });

      if (!authorized) {
        return res.status(403).json({
          success: false,

          message:
            "You are not allowed to view this bill",
        });
      }

      /*
       * Generate temporary signed URLs
       * for private attachments.
       */
      if (
        Array.isArray(
          bill.attachments
        ) &&
        bill.attachments.length >
          0
      ) {
        bill.attachments =
          await Promise.all(
            bill.attachments.map(
              async (
                attachment
              ) => ({
                ...attachment,

                url:
                  await getAttachmentSignedUrl(
                    attachment.publicId
                  ),
              })
            )
          );
      }

      return res.status(200).json({
        success: true,

        message:
          "Bill fetched successfully",

        data:
          bill,
      });
    } catch (error) {
      console.error(
        "GET BILL BY ID ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to fetch bill",

        error:
          error.message,
      });
    }
  };


/*
|--------------------------------------------------------------------------
| GET BILL HISTORY
|--------------------------------------------------------------------------
*/

export const getBillHistory =
  async (
    req,
    res
  ) => {
    try {
      const { billId } =
        req.params;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      if (
        !isValidBillId(
          billId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid bill ID",
        });
      }

      const bill =
        await Bills.findById(
          billId
        )
          .select(
            "submittedBy status"
          )
          .lean();

      if (!bill) {
        return res.status(404).json({
          success: false,
          message:
            "Bill not found",
        });
      }

      const authorized =
        await canViewBill({
          bill,

          userId,
        });

      if (!authorized) {
        return res.status(403).json({
          success: false,

          message:
            "You are not allowed to view this bill history",
        });
      }

      const history =
        await BillHistory.find({
          billId,
        })
          .populate(
            "actionBy",
            "name email"
          )
          .sort({
            createdAt:
              1,
          })
          .lean();

      return res.status(200).json({
        success: true,

        message:
          "Bill history fetched successfully",

        data:
          history,
      });
    } catch (error) {
      console.error(
        "GET BILL HISTORY ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to fetch bill history",

        error:
          error.message,
      });
    }
  };


/*
|--------------------------------------------------------------------------
| GET BILLS FOR VERIFICATION
|--------------------------------------------------------------------------
*/

export const getBillsForVerification =
  async (
    req,
    res
  ) => {
    try {
      const {
        billNumber,
        page = 1,
        limit = 10,
      } = req.query;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      const isAdmin =
        await userHasRole(
          userId,
          "admin"
        );

      const match = {
        status:
          "verification-pending",
      };

      /*
       * Admin:
       * all verification-pending bills.
       */
      if (!isAdmin) {
        const eligibleUserIds =
          await getEligibleSubmitterUserIds({
            auditorUserId:
              userId,

            action:
              "verify",
          });

        if (
          eligibleUserIds.length ===
          0
        ) {
          return res.status(200).json({
            success: true,

            message:
              "Verification bills fetched successfully",

            data: {
              bills: [],

              pagination: {
                total: 0,

                page:
                  Number(page) ||
                  1,

                limit:
                  Number(limit) ||
                  10,

                totalPages:
                  0,
              },
            },
          });
        }

        match.submittedBy = {
          $in:
            eligibleUserIds,
        };
      }

      if (billNumber) {
        match.billNumber = {
          $regex:
            billNumber,

          $options:
            "i",
        };
      }

      const pageNumber =
        Math.max(
          Number(page),
          1
        );

      const limitNumber =
        Math.min(
          Math.max(
            Number(limit),
            1
          ),
          100
        );

      const skip =
        (pageNumber - 1) *
        limitNumber;

      const [
        bills,
        total,
      ] =
        await Promise.all([
          Bills.find(match)
            .populate(
              "submittedBy",
              "name email"
            )
            .populate(
              "verification.verifiedBy",
              "name email"
            )
            .sort({
              createdAt:
                -1,
            })
            .skip(skip)
            .limit(
              limitNumber
            )
            .lean(),

          Bills.countDocuments(
            match
          ),
        ]);

      return res.status(200).json({
        success: true,

        message:
          "Verification bills fetched successfully",

        data: {
          bills,

          pagination: {
            total,

            page:
              pageNumber,

            limit:
              limitNumber,

            totalPages:
              Math.ceil(
                total /
                  limitNumber
              ),
          },
        },
      });
    } catch (error) {
      console.error(
        "GET BILLS FOR VERIFICATION ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to fetch verification bills",

        error:
          error.message,
      });
    }
  };


/*
|--------------------------------------------------------------------------
| GET BILLS FOR APPROVAL
|--------------------------------------------------------------------------
*/

export const getBillsForApproval =
  async (
    req,
    res
  ) => {
    try {
      const {
        billNumber,
        page = 1,
        limit = 10,
      } = req.query;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      const isAdmin =
        await userHasRole(
          userId,
          "admin"
        );

      const match = {
        status:
          "approval-pending",
      };

      /*
       * Admin:
       * all approval-pending bills.
       */
      if (!isAdmin) {
        const eligibleUserIds =
          await getEligibleSubmitterUserIds({
            auditorUserId:
              userId,

            action:
              "approve",
          });

        if (
          eligibleUserIds.length ===
          0
        ) {
          return res.status(200).json({
            success: true,

            message:
              "Approval bills fetched successfully",

            data: {
              bills: [],

              pagination: {
                total: 0,

                page:
                  Number(page) ||
                  1,

                limit:
                  Number(limit) ||
                  10,

                totalPages:
                  0,
              },
            },
          });
        }

        match.submittedBy = {
          $in:
            eligibleUserIds,
        };
      }

      if (billNumber) {
        match.billNumber = {
          $regex:
            billNumber,

          $options:
            "i",
        };
      }

      const pageNumber =
        Math.max(
          Number(page),
          1
        );

      const limitNumber =
        Math.min(
          Math.max(
            Number(limit),
            1
          ),
          100
        );

      const skip =
        (pageNumber - 1) *
        limitNumber;

      const [
        bills,
        total,
      ] =
        await Promise.all([
          Bills.find(match)
            .populate(
              "submittedBy",
              "name email"
            )
            .populate(
              "verification.verifiedBy",
              "name email"
            )
            .populate(
              "approval.approvedBy",
              "name email"
            )
            .sort({
              createdAt:
                -1,
            })
            .skip(skip)
            .limit(
              limitNumber
            )
            .lean(),

          Bills.countDocuments(
            match
          ),
        ]);

      return res.status(200).json({
        success: true,

        message:
          "Approval bills fetched successfully",

        data: {
          bills,

          pagination: {
            total,

            page:
              pageNumber,

            limit:
              limitNumber,

            totalPages:
              Math.ceil(
                total /
                  limitNumber
              ),
          },
        },
      });
    } catch (error) {
      console.error(
        "GET BILLS FOR APPROVAL ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to fetch approval bills",

        error:
          error.message,
      });
    }
  };






/*
|--------------------------------------------------------------------------
| UPDATE BILL
|--------------------------------------------------------------------------
|
| Only bill owner can edit.
|
| Editable statuses:
|   draft
|   rejected
|
| Editing does NOT automatically resubmit the bill.
|
| Attachment behaviour:
|
| - Existing attachments remain by default.
| - Frontend can send removedAttachmentIds.
| - Selected existing attachments are deleted from
|   DigitalOcean Spaces and MongoDB.
| - Newly uploaded attachments are appended.
|
|--------------------------------------------------------------------------
*/

export const updateBill = async (
  req,
  res
) => {
  let uploadedAttachments = [];

  try {
    const {
      billNumber,
      title,
      description,
      billDate,
      expenses,
      currency,
      vendor,
      removedAttachmentIds,
    } = req.body;

    const {
      billId,
    } = req.params;

    const userId =
      req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Unauthorized",
      });
    }

    if (
      !isValidBillId(
        billId
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid bill ID",
      });
    }

    const bill =
      await Bills.findById(
        billId
      );

    if (!bill) {
      return res.status(404).json({
        success: false,
        message:
          "Bill not found",
      });
    }

    /*
     * Only owner can edit.
     */
    if (
      bill.submittedBy.toString() !==
      userId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You are not allowed to edit this bill",
      });
    }

    /*
     * Only draft/rejected bills
     * can be edited.
     */
    if (
      ![
        "draft",
        "rejected",
      ].includes(
        bill.status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Only draft or rejected bills can be edited",
      });
    }

    /*
     * Basic validation.
     */

    if (!billNumber?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Bill number is required",
      });
    }

    if (!title?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "Bill title is required",
      });
    }

    if (!billDate) {
      return res.status(400).json({
        success: false,
        message:
          "Bill date is required",
      });
    }

    /*
     * Parse expenses.
     */

    const parsedExpenses =
      parseExpenses(
        expenses
      );

    if (!parsedExpenses) {
      return res.status(400).json({
        success: false,
        message:
          "Expenses must be a valid JSON array",
      });
    }

    /*
     * Validate expenses.
     */

    const expenseValidationError =
      validateExpenses(
        parsedExpenses
      );

    if (
      expenseValidationError
    ) {
      return res.status(400).json({
        success: false,
        message:
          expenseValidationError,
      });
    }

    /*
     * Check duplicate bill number.
     *
     * Current bill itself is excluded.
     */

    const existingBill =
      await Bills.findOne({
        billNumber:
          billNumber.trim(),

        _id: {
          $ne:
            bill._id,
        },
      });

    if (existingBill) {
      return res.status(409).json({
        success: false,
        message:
          "Bill number already exists",
      });
    }

    /*
     * Parse vendor.
     */

    const parsedVendor =
      parseJsonField(
        vendor
      );

    /*
     * Calculate total again
     * on backend.
     */

    const totalAmount =
      calculateTotalAmount(
        parsedExpenses
      );

    /*
     * --------------------------------------------------------------
     * PARSE REMOVED ATTACHMENTS
     * --------------------------------------------------------------
     */

    let parsedRemovedAttachmentIds =
      [];

    if (
      removedAttachmentIds
    ) {
      try {
        parsedRemovedAttachmentIds =
          Array.isArray(
            removedAttachmentIds
          )
            ? removedAttachmentIds
            : JSON.parse(
                removedAttachmentIds
              );
      } catch (error) {
        return res.status(400).json({
          success: false,
          message:
            "removedAttachmentIds must be a valid JSON array",
        });
      }
    }

    if (
      !Array.isArray(
        parsedRemovedAttachmentIds
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "removedAttachmentIds must be a valid JSON array",
      });
    }

    /*
     * Validate every attachment ID.
     */

    for (
      const attachmentId of
        parsedRemovedAttachmentIds
    ) {
      if (
        !mongoose.Types.ObjectId.isValid(
          attachmentId
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Invalid attachment ID: ${attachmentId}`,
        });
      }
    }

    /*
     * --------------------------------------------------------------
     * FIND EXISTING ATTACHMENTS TO REMOVE
     * --------------------------------------------------------------
     *
     * We only allow deleting attachments
     * which actually belong to this bill.
     */

    const attachmentsToRemove =
      (
        bill.attachments ||
        []
      ).filter(
        (attachment) =>
          parsedRemovedAttachmentIds.includes(
            attachment._id.toString()
          )
      );

    /*
     * If frontend sends an attachment ID
     * which does not belong to this bill,
     * reject the request.
     */

    if (
      attachmentsToRemove.length !==
      parsedRemovedAttachmentIds.length
    ) {
      return res.status(400).json({
        success: false,
        message:
          "One or more attachment IDs do not belong to this bill",
      });
    }

    /*
     * --------------------------------------------------------------
     * ATTACHMENT COUNT VALIDATION
     * --------------------------------------------------------------
     *
     * Existing attachments after removal
     * + newly uploaded attachments
     * must not exceed 10.
     */

    const remainingExistingCount =
      (
        bill.attachments ||
        []
      ).length -
      attachmentsToRemove.length;

    const newAttachmentCount =
      Array.isArray(
        req.files
      )
        ? req.files.length
        : 0;

    if (
      remainingExistingCount +
        newAttachmentCount >
      10
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Maximum 10 attachments are allowed",
      });
    }

    /*
     * --------------------------------------------------------------
     * UPLOAD NEW ATTACHMENTS FIRST
     * --------------------------------------------------------------
     *
     * This is done before deleting old files.
     *
     * If upload fails, existing attachments
     * remain untouched.
     */

    if (
      Array.isArray(
        req.files
      ) &&
      req.files.length >
        0
    ) {
      uploadedAttachments =
        await uploadBillAttachments({
          files:
            req.files,

          billId:
            bill._id,
        });
    }

    /*
     * --------------------------------------------------------------
     * UPDATE NORMAL BILL FIELDS
     * --------------------------------------------------------------
     */

    const previousStatus =
      bill.status;

    bill.billNumber =
      billNumber.trim();

    bill.title =
      title.trim();

    bill.description =
      description;

    bill.billDate =
      billDate;

    bill.expenses =
      parsedExpenses;

    bill.totalAmount =
      totalAmount;

    bill.currency =
      currency ||
      "INR";

    bill.vendor =
      parsedVendor;

    /*
     * --------------------------------------------------------------
     * UPDATE ATTACHMENTS ARRAY
     * --------------------------------------------------------------
     */

    const remainingAttachments =
      (
        bill.attachments ||
        []
      ).filter(
        (attachment) =>
          !parsedRemovedAttachmentIds.includes(
            attachment._id.toString()
          )
      );

    bill.attachments = [
      ...remainingAttachments,

      ...uploadedAttachments,
    ];

    /*
     * Save updated bill.
     */

    await bill.save();

    /*
     * --------------------------------------------------------------
     * DELETE REMOVED FILES FROM SPACES
     * --------------------------------------------------------------
     *
     * MongoDB is already updated.
     *
     * If Spaces deletion fails, we log the
     * error instead of failing the complete
     * bill update because the DB state is
     * already correct.
     */

    for (
      const attachment of
        attachmentsToRemove
    ) {
      if (
        !attachment.publicId
      ) {
        continue;
      }

      try {
        await deleteFromSpaces(
          attachment.publicId
        );
      } catch (deleteError) {
        console.error(
          "UPDATE BILL ATTACHMENT DELETE ERROR:",
          deleteError
        );
      }
    }

    /*
     * --------------------------------------------------------------
     * GET UPDATED BILL
     * --------------------------------------------------------------
     */

    const populatedBill =
      await Bills.findById(
        bill._id
      )
        .populate(
          "submittedBy",
          "name email"
        )
        .populate(
          "verification.verifiedBy",
          "name email"
        )
        .populate(
          "approval.approvedBy",
          "name email"
        )
        .lean();

    /*
     * --------------------------------------------------------------
     * SIGNED URLS
     * --------------------------------------------------------------
     *
     * Keep the same private Spaces
     * attachment behaviour.
     */

    if (
      Array.isArray(
        populatedBill.attachments
      )
    ) {
      populatedBill.attachments =
        await Promise.all(
          populatedBill.attachments.map(
            async (
              attachment
            ) => ({
              ...attachment,

              url:
                await getAttachmentSignedUrl(
                  attachment.publicId
                ),
            })
          )
        );
    }

    /*
     * --------------------------------------------------------------
     * RESPONSE
     * --------------------------------------------------------------
     */

    return res.status(200).json({
      success: true,

      message:
        previousStatus ===
        "rejected"
          ? "Rejected bill updated successfully. Please resubmit the bill."
          : "Bill updated successfully",

      data:
        populatedBill,
    });
  } catch (error) {
    console.error(
      "UPDATE BILL ERROR:",
      error
    );

    /*
     * If new attachment upload happened
     * but something failed before completion,
     * rollback newly uploaded files.
     */

    if (
      uploadedAttachments.length >
      0
    ) {
      for (
        const attachment of
          uploadedAttachments
      ) {
        try {
          await deleteFromSpaces(
            attachment.publicId
          );
        } catch (deleteError) {
          console.error(
            "UPDATE BILL ROLLBACK ERROR:",
            deleteError
          );
        }
      }
    }

    if (
      error.code ===
      11000
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Bill number already exists",
      });
    }

    return res.status(500).json({
      success: false,
      message:
        "Failed to update bill",
      error:
        error.message,
    });
  }
};

















// backend/src/controllers/finance-management/bill.controllers.js

/*
|--------------------------------------------------------------------------
| BILL DASHBOARD HELPERS
|--------------------------------------------------------------------------
*/

/*
 * Get all active roles of a user.
 *
 * Returns:
 * ["cc"]
 * ["aci"]
 * ["cm"]
 * ["admin"]
 */
const getDashboardUserRoleCodes = async (userId) => {
  const userRoles = await UserRole.find({
    userId,
    isActive: true,
  })
    .populate(
      "roleId",
      "roleCode roleName isActive"
    )
    .lean();

  return userRoles
    .filter(
      (userRole) =>
        userRole.roleId &&
        userRole.roleId.isActive !== false
    )
    .map(
      (userRole) =>
        userRole.roleId.roleCode?.toLowerCase()
    )
    .filter(Boolean);
};


/*
|--------------------------------------------------------------------------
| RESOLVE USER REGION ACCESS
|--------------------------------------------------------------------------
|
| Same logic as existing getUserRegionAccess().
|
| This helper returns resolved:
|
| districtId
| blockId
| centerId
|
| even when UserRegionAccess stores only
| centerId or blockId.
|
|--------------------------------------------------------------------------
*/

const getDashboardUserRegionAccess = async (userId) => {
  const regionAccesses =
    await UserRegionAccess.find({
      userId,
    }).lean();

  if (
    regionAccesses.length === 0
  ) {
    return [];
  }

  const blockIds = [];
  const centerIds = [];

  for (
    const regionAccess of regionAccesses
  ) {
    if (regionAccess.blockId) {
      blockIds.push(
        regionAccess.blockId.toString()
      );
    }

    if (regionAccess.centerId) {
      centerIds.push(
        regionAccess.centerId.toString()
      );
    }
  }

  const uniqueBlockIds = [
    ...new Set(blockIds),
  ];

  const uniqueCenterIds = [
    ...new Set(centerIds),
  ];

  const [
    blocks,
    centers,
  ] = await Promise.all([
    uniqueBlockIds.length > 0
      ? Block.find({
          _id: {
            $in: uniqueBlockIds,
          },
        })
          .select(
            "_id districtId"
          )
          .lean()
      : [],

    uniqueCenterIds.length > 0
      ? Center.find({
          _id: {
            $in: uniqueCenterIds,
          },
        })
          .select(
            "_id districtId blockId"
          )
          .lean()
      : [],
  ]);

  const blockMap = new Map(
    blocks.map(
      (block) => [
        block._id.toString(),
        block,
      ]
    )
  );

  const centerMap = new Map(
    centers.map(
      (center) => [
        center._id.toString(),
        center,
      ]
    )
  );

  return regionAccesses.map(
    (regionAccess) => {
      let districtId =
        regionAccess.districtId ||
        null;

      let blockId =
        regionAccess.blockId ||
        null;

      const centerId =
        regionAccess.centerId ||
        null;

      /*
       * CENTER -> BLOCK -> DISTRICT
       */
      if (centerId) {
        const center =
          centerMap.get(
            centerId.toString()
          );

        if (center) {
          blockId =
            center.blockId ||
            blockId ||
            null;

          districtId =
            center.districtId ||
            districtId ||
            null;

          if (
            !districtId &&
            blockId
          ) {
            const block =
              blockMap.get(
                blockId.toString()
              );

            if (block) {
              districtId =
                block.districtId ||
                null;
            }
          }
        }
      }

      /*
       * BLOCK -> DISTRICT
       */
      if (
        blockId &&
        !districtId
      ) {
        const block =
          blockMap.get(
            blockId.toString()
          );

        if (block) {
          districtId =
            block.districtId ||
            null;
        }
      }

      return {
        ...regionAccess,
        districtId,
        blockId,
        centerId,
      };
    }
  );
};


/*
|--------------------------------------------------------------------------
| CHECK DASHBOARD MAPPING
|--------------------------------------------------------------------------
|
| Checks whether a bill submitter matches
| one of the logged-in user's BillAuditor
| mappings.
|
| Unlike hasBillAuditorAccess(), this is
| used for dashboard visibility and can
| work for historical bill statuses too.
|
|--------------------------------------------------------------------------
*/

const hasDashboardMappingAccess = async ({
  bill,
  auditorUserId,
}) => {
  const submittedById =
    bill.submittedBy?._id ||
    bill.submittedBy;

  if (!submittedById) {
    return false;
  }

  /*
   * Owner is handled separately.
   */
  if (
    submittedById.toString() ===
    auditorUserId.toString()
  ) {
    return false;
  }

  const mappings =
    await BillAuditor.find({
      userId:
        auditorUserId,

      isActive:
        true,
    }).lean();

  if (
    mappings.length === 0
  ) {
    return false;
  }

  const [
    submitterRoleCodes,
    submitterRegionAccess,
  ] = await Promise.all([
    getDashboardUserRoleCodes(
      submittedById
    ),

    getDashboardUserRegionAccess(
      submittedById
    ),
  ]);

  for (
    const mapping of mappings
  ) {
    /*
     * ROLE
     */
    const mappedRole =
      mapping.roleAccess?.toLowerCase();

    if (
      !submitterRoleCodes.includes(
        mappedRole
      )
    ) {
      continue;
    }

    /*
     * GLOBAL
     */
    if (
      mapping.regionScope ===
      "global"
    ) {
      return true;
    }

    /*
     * REGION ACCESS
     */
    for (
      const regionAccess of
        submitterRegionAccess
    ) {
      /*
       * DISTRICT
       */
      if (
        mapping.regionScope ===
        "district"
      ) {
        if (
          mapping.districtId &&
          regionAccess.districtId &&
          mapping.districtId.toString() ===
            regionAccess.districtId.toString()
        ) {
          return true;
        }
      }

      /*
       * BLOCK
       */
      if (
        mapping.regionScope ===
        "block"
      ) {
        if (
          mapping.blockId &&
          regionAccess.blockId &&
          mapping.blockId.toString() ===
            regionAccess.blockId.toString()
        ) {
          return true;
        }
      }

      /*
       * CENTER
       */
      if (
        mapping.regionScope ===
        "center"
      ) {
        if (
          mapping.centerId &&
          regionAccess.centerId &&
          mapping.centerId.toString() ===
            regionAccess.centerId.toString()
        ) {
          return true;
        }
      }
    }
  }

  return false;
};


/*
|--------------------------------------------------------------------------
| GET DASHBOARD VISIBLE SUBMITTERS
|--------------------------------------------------------------------------
|
| Returns users whose bills the logged-in
| user is allowed to see on dashboard.
|
|--------------------------------------------------------------------------
*/

const getDashboardVisibleSubmitterIds =
  async (userId) => {
    const mappings =
      await BillAuditor.find({
        userId,
        isActive: true,
      }).lean();

    if (
      mappings.length === 0
    ) {
      return [];
    }

    const roleUsers =
      await UserRole.find({
        isActive: true,
      })
        .populate(
          "roleId",
          "roleCode roleName isActive"
        )
        .lean();

    const eligibleUserIds =
      new Set();

    for (
      const mapping of mappings
    ) {
      const roleUserIds =
        roleUsers
          .filter(
            (userRole) =>
              userRole.roleId &&
              userRole.roleId
                .isActive !== false &&
              userRole.roleId.roleCode
                ?.toLowerCase() ===
                mapping.roleAccess
                  ?.toLowerCase()
          )
          .map(
            (userRole) =>
              userRole.userId.toString()
          );

      if (
        roleUserIds.length ===
        0
      ) {
        continue;
      }

      /*
       * GLOBAL
       */
      if (
        mapping.regionScope ===
        "global"
      ) {
        roleUserIds.forEach(
          (id) =>
            eligibleUserIds.add(
              id
            )
        );

        continue;
      }

      const regionAccesses =
        await UserRegionAccess.find({
          userId: {
            $in:
              roleUserIds,
          },
        }).lean();

      if (
        regionAccesses.length ===
        0
      ) {
        continue;
      }

      const blockIds =
        [
          ...new Set(
            regionAccesses
              .filter(
                (item) =>
                  item.blockId
              )
              .map(
                (item) =>
                  item.blockId.toString()
              )
          ),
        ];

      const centerIds =
        [
          ...new Set(
            regionAccesses
              .filter(
                (item) =>
                  item.centerId
              )
              .map(
                (item) =>
                  item.centerId.toString()
              )
          ),
        ];

      const [
        blocks,
        centers,
      ] = await Promise.all([
        blockIds.length > 0
          ? Block.find({
              _id: {
                $in:
                  blockIds,
              },
            })
              .select(
                "_id districtId"
              )
              .lean()
          : [],

        centerIds.length > 0
          ? Center.find({
              _id: {
                $in:
                  centerIds,
              },
            })
              .select(
                "_id districtId blockId"
              )
              .lean()
          : [],
      ]);

      const blockMap =
        new Map(
          blocks.map(
            (block) => [
              block._id.toString(),
              block,
            ]
          )
        );

      const centerMap =
        new Map(
          centers.map(
            (center) => [
              center._id.toString(),
              center,
            ]
          )
        );

      for (
        const regionAccess of
          regionAccesses
      ) {
        let districtId =
          regionAccess.districtId ||
          null;

        let blockId =
          regionAccess.blockId ||
          null;

        const centerId =
          regionAccess.centerId ||
          null;

        /*
         * CENTER -> BLOCK -> DISTRICT
         */
        if (centerId) {
          const center =
            centerMap.get(
              centerId.toString()
            );

          if (center) {
            blockId =
              center.blockId ||
              blockId ||
              null;

            districtId =
              center.districtId ||
              districtId ||
              null;

            if (
              !districtId &&
              blockId
            ) {
              const block =
                blockMap.get(
                  blockId.toString()
                );

              if (block) {
                districtId =
                  block.districtId ||
                  null;
              }
            }
          }
        }

        /*
         * BLOCK -> DISTRICT
         */
        if (
          blockId &&
          !districtId
        ) {
          const block =
            blockMap.get(
              blockId.toString()
            );

          if (block) {
            districtId =
              block.districtId ||
              null;
          }
        }

        /*
         * DISTRICT
         */
        if (
          mapping.regionScope ===
            "district" &&
          mapping.districtId &&
          districtId &&
          mapping.districtId.toString() ===
            districtId.toString()
        ) {
          eligibleUserIds.add(
            regionAccess.userId.toString()
          );
        }

        /*
         * BLOCK
         */
        if (
          mapping.regionScope ===
            "block" &&
          mapping.blockId &&
          blockId &&
          mapping.blockId.toString() ===
            blockId.toString()
        ) {
          eligibleUserIds.add(
            regionAccess.userId.toString()
          );
        }

        /*
         * CENTER
         */
        if (
          mapping.regionScope ===
            "center" &&
          mapping.centerId &&
          centerId &&
          mapping.centerId.toString() ===
            centerId.toString()
        ) {
          eligibleUserIds.add(
            regionAccess.userId.toString()
          );
        }
      }
    }

    return Array.from(
      eligibleUserIds
    ).map(
      (id) =>
        new mongoose.Types.ObjectId(
          id
        )
    );
  };


/*
|--------------------------------------------------------------------------
| GET BILL DASHBOARD
|--------------------------------------------------------------------------
|
| GET
| /finance-management/bills/dashboard
|
| Filters:
|
| status
| submittedByRole
| submittedBy
| action
| districtId
| blockId
| centerId
| fromDate
| toDate
| billNumber
| page
| limit
|
|--------------------------------------------------------------------------
*/

export const getBillDashboard =
  async (
    req,
    res
  ) => {
    try {
      const {
        status,
        submittedByRole,
        submittedBy,
        action,
        districtId,
        blockId,
        centerId,
        fromDate,
        toDate,
        billNumber,
        page = 1,
        limit = 20,
      } = req.query;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      /*
       * Validate IDs.
       */
      const idFields = [
        [
          "submittedBy",
          submittedBy,
        ],
        [
          "districtId",
          districtId,
        ],
        [
          "blockId",
          blockId,
        ],
        [
          "centerId",
          centerId,
        ],
      ];

      for (
        const [field, value] of
          idFields
      ) {
        if (
          value &&
          !isValidBillId(
            value
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              `Invalid ${field}`,
          });
        }
      }

      /*
       * Date validation.
       */
      let startDate = null;
      let endDate = null;

      if (fromDate) {
        startDate =
          new Date(
            `${fromDate}T00:00:00.000Z`
          );

        if (
          Number.isNaN(
            startDate.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid fromDate",
          });
        }
      }

      if (toDate) {
        endDate =
          new Date(
            `${toDate}T23:59:59.999Z`
          );

        if (
          Number.isNaN(
            endDate.getTime()
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid toDate",
          });
        }
      }

      /*
       * Allowed statuses.
       */
      const allowedStatuses = [
        "draft",
        "verification-pending",
        "verified",
        "approval-pending",
        "approved",
        "payment-pending",
        "paid",
        "rejected",
      ];

      if (
        status &&
        !allowedStatuses.includes(
          status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid bill status",
        });
      }

      /*
       * Allowed roles.
       */
      const allowedRoles = [
        "cc",
        "aci",
        "cm",
      ];

      if (
        submittedByRole &&
        !allowedRoles.includes(
          submittedByRole.toLowerCase()
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid submittedByRole",
        });
      }

      /*
       * Allowed actions.
       */
      if (
        action &&
        ![
          "verify",
          "approve",
        ].includes(
          action
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid action",
        });
      }

      const isAdmin =
        await userHasRole(
          userId,
          "admin"
        );

      /*
       * --------------------------------------------------------------
       * DETERMINE VISIBLE USERS
       * --------------------------------------------------------------
       */

      let visibleSubmitterIds =
        null;

      if (!isAdmin) {
        /*
         * User can always see own bills.
         */
        const visibleIds =
          new Set([
            userId.toString(),
          ]);

        /*
         * Add users covered by
         * BillAuditor mappings.
         */
        const mappedIds =
          await getDashboardVisibleSubmitterIds(
            userId
          );

        mappedIds.forEach(
          (id) =>
            visibleIds.add(
              id.toString()
            )
        );

        visibleSubmitterIds =
          Array.from(
            visibleIds
          ).map(
            (id) =>
              new mongoose.Types.ObjectId(
                id
              )
          );
      }

      /*
       * --------------------------------------------------------------
       * BUILD MONGO MATCH
       * --------------------------------------------------------------
       */

      const match = {};

      if (
        visibleSubmitterIds
      ) {
        match.submittedBy = {
          $in:
            visibleSubmitterIds,
        };
      }

      /*
       * Specific submittedBy filter.
       */
      if (submittedBy) {
        const requestedUser =
          new mongoose.Types.ObjectId(
            submittedBy
          );

        if (
          !isAdmin &&
          !visibleSubmitterIds.some(
            (id) =>
              id.toString() ===
              requestedUser.toString()
          )
        ) {
          /*
           * Requested user is outside
           * logged-in user's visibility.
           */
          match.submittedBy = {
            $in: [],
          };
        } else {
          match.submittedBy =
            requestedUser;
        }
      }

      /*
       * Status.
       */
      if (status) {
        match.status =
          status;
      }

      /*
       * Bill number.
       */
      if (billNumber) {
        match.billNumber = {
          $regex:
            billNumber,
          $options:
            "i",
        };
      }

      /*
       * Date range uses billDate.
       */
      if (
        startDate ||
        endDate
      ) {
        match.billDate = {};

        if (startDate) {
          match.billDate.$gte =
            startDate;
        }

        if (endDate) {
          match.billDate.$lte =
            endDate;
        }
      }

      /*
       * --------------------------------------------------------------
       * ROLE FILTER
       * --------------------------------------------------------------
       *
       * UserRole is a separate collection,
       * therefore resolve matching users.
       */

      if (submittedByRole) {
        const roleUsers =
          await UserRole.find({
            isActive: true,
          })
            .populate(
              "roleId",
              "roleCode isActive"
            )
            .lean();

        const roleUserIds =
          roleUsers
            .filter(
              (userRole) =>
                userRole.roleId &&
                userRole.roleId
                  .isActive !== false &&
                userRole.roleId.roleCode
                  ?.toLowerCase() ===
                  submittedByRole.toLowerCase()
            )
            .map(
              (userRole) =>
                userRole.userId.toString()
            );

        let filteredIds =
          roleUserIds;

        if (
          visibleSubmitterIds
        ) {
          const visibleSet =
            new Set(
              visibleSubmitterIds.map(
                (id) =>
                  id.toString()
              )
            );

          filteredIds =
            filteredIds.filter(
              (id) =>
                visibleSet.has(id)
            );
        }

        match.submittedBy = {
          $in:
            filteredIds.map(
              (id) =>
                new mongoose.Types.ObjectId(
                  id
                )
            ),
        };
      }

      /*
       * --------------------------------------------------------------
       * REGION FILTER
       * --------------------------------------------------------------
       *
       * Bill does not directly store region IDs.
       *
       * We resolve submitter region and then
       * restrict submittedBy.
       */

      if (
        districtId ||
        blockId ||
        centerId
      ) {
        const regionMatch = {};

        if (districtId) {
          regionMatch.districtId =
            districtId;
        }

        if (blockId) {
          regionMatch.blockId =
            blockId;
        }

        if (centerId) {
          regionMatch.centerId =
            centerId;
        }

        const regionAccesses =
          await UserRegionAccess.find(
            {}
          ).lean();

        const matchingUserIds =
          new Set();

        for (
          const regionAccess of
            regionAccesses
        ) {
          let resolvedDistrictId =
            regionAccess.districtId ||
            null;

          let resolvedBlockId =
            regionAccess.blockId ||
            null;

          const resolvedCenterId =
            regionAccess.centerId ||
            null;

          /*
           * Resolve center hierarchy.
           */
          if (
            resolvedCenterId
          ) {
            const center =
              await Center.findById(
                resolvedCenterId
              )
                .select(
                  "_id districtId blockId"
                )
                .lean();

            if (center) {
              resolvedBlockId =
                center.blockId ||
                resolvedBlockId ||
                null;

              resolvedDistrictId =
                center.districtId ||
                resolvedDistrictId ||
                null;
            }
          }

          /*
           * Resolve block hierarchy.
           */
          if (
            resolvedBlockId &&
            !resolvedDistrictId
          ) {
            const block =
              await Block.findById(
                resolvedBlockId
              )
                .select(
                  "_id districtId"
                )
                .lean();

            if (block) {
              resolvedDistrictId =
                block.districtId ||
                null;
            }
          }

          let matches = true;

          if (
            districtId &&
            (!resolvedDistrictId ||
              resolvedDistrictId.toString() !==
                districtId.toString())
          ) {
            matches = false;
          }

          if (
            blockId &&
            (!resolvedBlockId ||
              resolvedBlockId.toString() !==
                blockId.toString())
          ) {
            matches = false;
          }

          if (
            centerId &&
            (!resolvedCenterId ||
              resolvedCenterId.toString() !==
                centerId.toString())
          ) {
            matches = false;
          }

          if (matches) {
            matchingUserIds.add(
              regionAccess.userId.toString()
            );
          }
        }

        const regionUserIds =
          Array.from(
            matchingUserIds
          );

        if (
          visibleSubmitterIds
        ) {
          const visibleSet =
            new Set(
              visibleSubmitterIds.map(
                (id) =>
                  id.toString()
              )
            );

          const allowedRegionIds =
            regionUserIds.filter(
              (id) =>
                visibleSet.has(id)
            );

          match.submittedBy = {
            $in:
              allowedRegionIds.map(
                (id) =>
                  new mongoose.Types.ObjectId(
                    id
                  )
              ),
          };
        } else {
          match.submittedBy = {
            $in:
              regionUserIds.map(
                (id) =>
                  new mongoose.Types.ObjectId(
                    id
                  )
              ),
          };
        }
      }

      /*
       * --------------------------------------------------------------
       * ACTION FILTER
       * --------------------------------------------------------------
       *
       * This means:
       *
       * verify  -> verification-pending
       * approve -> approval-pending
       *
       * For non-admin, visibility is additionally
       * restricted through BillAuditor mappings.
       */

      if (action) {
        if (
          action === "verify"
        ) {
          match.status =
            "verification-pending";
        }

        if (
          action === "approve"
        ) {
          match.status =
            "approval-pending";
        }

        if (!isAdmin) {
          const actionSubmitterIds =
            await getEligibleSubmitterUserIds({
              auditorUserId:
                userId,

              action,
            });

          const existingIds =
            match.submittedBy?.$in;

          if (
            existingIds
          ) {
            const actionSet =
              new Set(
                actionSubmitterIds.map(
                  (id) =>
                    id.toString()
                )
              );

            match.submittedBy.$in =
              existingIds.filter(
                (id) =>
                  actionSet.has(
                    id.toString()
                  )
              );
          } else {
            match.submittedBy = {
              $in:
                actionSubmitterIds,
            };
          }
        }
      }

      /*
       * --------------------------------------------------------------
       * PAGINATION
       * --------------------------------------------------------------
       */

      const pageNumber =
        Math.max(
          Number(page),
          1
        );

      const limitNumber =
        Math.min(
          Math.max(
            Number(limit),
            1
          ),
          100
        );

      const skip =
        (pageNumber - 1) *
        limitNumber;

      /*
       * --------------------------------------------------------------
       * FETCH BILLS
       * --------------------------------------------------------------
       */

      const [
        bills,
        total,
      ] = await Promise.all([
        Bills.find(match)
          .populate(
            "submittedBy",
            "name email"
          )
          .populate(
            "verification.verifiedBy",
            "name email"
          )
          .populate(
            "approval.approvedBy",
            "name email"
          )
          .populate(
            "rejection.rejectedBy",
            "name email"
          )
          .populate(
            "payment.paidBy",
            "name email"
          )
          .sort({
            billDate:
              -1,
            createdAt:
              -1,
          })
          .skip(skip)
          .limit(
            limitNumber
          )
          .lean(),

        Bills.countDocuments(
          match
        ),
      ]);

      /*
       * --------------------------------------------------------------
       * ADD SUBMITTER ROLE + REGION INFORMATION
       * --------------------------------------------------------------
       */

      const submitterIds =
        bills
          .map(
            (bill) =>
              bill.submittedBy?._id
          )
          .filter(Boolean);

      const [
        submitterRoles,
        submitterRegions,
      ] = await Promise.all([
        UserRole.find({
          userId: {
            $in:
              submitterIds,
          },
          isActive: true,
        })
          .populate(
            "roleId",
            "roleCode roleName isActive"
          )
          .lean(),

        UserRegionAccess.find({
          userId: {
            $in:
              submitterIds,
          },
        }).lean(),
      ]);

      const roleMap =
        new Map();

      for (
        const userRole of
          submitterRoles
      ) {
        if (
          !userRole.roleId ||
          userRole.roleId
            .isActive === false
        ) {
          continue;
        }

        const userIdString =
          userRole.userId.toString();

        if (
          !roleMap.has(
            userIdString
          )
        ) {
          roleMap.set(
            userIdString,
            []
          );
        }

        roleMap
          .get(userIdString)
          .push({
            roleCode:
              userRole.roleId
                .roleCode,
            roleName:
              userRole.roleId
                .roleName,
          });
      }

      const regionMap =
        new Map();

      for (
        const region of
          submitterRegions
      ) {
        const userIdString =
          region.userId.toString();

        if (
          !regionMap.has(
            userIdString
          )
        ) {
          regionMap.set(
            userIdString,
            []
          );
        }

        regionMap
          .get(userIdString)
          .push(region);
      }

      const enrichedBills =
        bills.map(
          (bill) => {
            const submitterId =
              bill.submittedBy?._id?.toString();

            return {
              ...bill,

              submittedByRole:
                roleMap.get(
                  submitterId
                ) || [],

              regionAccess:
                regionMap.get(
                  submitterId
                ) || [],
            };
          }
        );

      /*
       * --------------------------------------------------------------
       * SUMMARY
       * --------------------------------------------------------------
       */

      const summaryResult =
        await Bills.aggregate([
          {
            $match:
              match,
          },

          {
            $group: {
              _id:
                "$status",

              count: {
                $sum: 1,
              },

              amount: {
                $sum:
                  "$totalAmount",
              },
            },
          },
        ]);

      const summary = {
        total: total,

        draft: 0,

        verificationPending: 0,

        verified: 0,

        approvalPending: 0,

        approved: 0,

        paymentPending: 0,

        paid: 0,

        rejected: 0,

        totalAmount: 0,
      };

      for (
        const item of
          summaryResult
      ) {
        const keyMap = {
          "verification-pending":
            "verificationPending",

          "approval-pending":
            "approvalPending",

          "payment-pending":
            "paymentPending",
        };

        const key =
          keyMap[item._id] ||
          item._id;

        if (
          Object.prototype.hasOwnProperty.call(
            summary,
            key
          )
        ) {
          summary[key] =
            item.count;
        }

        summary.totalAmount +=
          Number(
            item.amount || 0
          );
      }

      return res.status(200).json({
        success: true,

        message:
          "Bill dashboard fetched successfully",

        data: {
          bills:
            enrichedBills,

          pagination: {
            total,

            page:
              pageNumber,

            limit:
              limitNumber,

            totalPages:
              Math.ceil(
                total /
                  limitNumber
              ),
          },

          summary,
        },
      });
    } catch (error) {
      console.error(
        "GET BILL DASHBOARD ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to fetch bill dashboard",

        error:
          error.message,
      });
    }
  };


/*
|--------------------------------------------------------------------------
| BULK VERIFY
|--------------------------------------------------------------------------
*/

export const bulkVerifyBills =
  async (
    req,
    res
  ) => {
    try {
      const {
        billIds,
        remarks,
      } = req.body;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      if (
        !Array.isArray(
          billIds
        ) ||
        billIds.length ===
          0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "billIds must be a non-empty array",
        });
      }

      const uniqueBillIds =
        [
          ...new Set(
            billIds.map(
              (id) =>
                id?.toString()
            )
          ),
        ];

      for (
        const billId of
          uniqueBillIds
      ) {
        if (
          !isValidBillId(
            billId
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              `Invalid bill ID: ${billId}`,
          });
        }
      }

      const isAdmin =
        await userHasRole(
          userId,
          "admin"
        );

      const successful = [];
      const failed = [];

      for (
        const billId of
          uniqueBillIds
      ) {
        try {
          const bill =
            await Bills.findById(
              billId
            );

          if (!bill) {
            failed.push({
              billId,
              reason:
                "Bill not found",
            });

            continue;
          }

          if (
            bill.status !==
            "verification-pending"
          ) {
            failed.push({
              billId,
              reason:
                `Bill is ${bill.status}, not verification-pending`,
            });

            continue;
          }

          if (
            !isAdmin
          ) {
            const authorized =
              await hasBillAuditorAccess({
                bill,

                userId,

                action:
                  "verify",
              });

            if (!authorized) {
              failed.push({
                billId,
                reason:
                  "You are not authorized to verify this bill",
              });

              continue;
            }
          }

          const previousStatus =
            bill.status;

          bill.status =
            "approval-pending";

          bill.verification = {
            verifiedBy:
              userId,

            verifiedAt:
              new Date(),

            remarks:
              remarks?.trim() ||
              null,
          };

          await bill.save();

          await BillHistory.create({
            billId:
              bill._id,

            action:
              "verified",

            stage:
              "verification",

            previousStatus,

            newStatus:
              "approval-pending",

            actionBy:
              userId,

            remarks:
              remarks?.trim() ||
              "Bill verified and moved to approval",
          });

          successful.push(
            billId
          );
        } catch (error) {
          failed.push({
            billId,

            reason:
              error.message,
          });
        }
      }

      return res.status(200).json({
        success: true,

        message:
          "Bulk verification completed",

        data: {
          total:
            uniqueBillIds.length,

          successfulCount:
            successful.length,

          failedCount:
            failed.length,

          successful,

          failed,
        },
      });
    } catch (error) {
      console.error(
        "BULK VERIFY BILLS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to bulk verify bills",

        error:
          error.message,
      });
    }
  };


/*
|--------------------------------------------------------------------------
| BULK APPROVE
|--------------------------------------------------------------------------
*/

export const bulkApproveBills =
  async (
    req,
    res
  ) => {
    try {
      const {
        billIds,
        remarks,
      } = req.body;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      if (
        !Array.isArray(
          billIds
        ) ||
        billIds.length ===
          0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "billIds must be a non-empty array",
        });
      }

      const uniqueBillIds =
        [
          ...new Set(
            billIds.map(
              (id) =>
                id?.toString()
            )
          ),
        ];

      for (
        const billId of
          uniqueBillIds
      ) {
        if (
          !isValidBillId(
            billId
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              `Invalid bill ID: ${billId}`,
          });
        }
      }

      const isAdmin =
        await userHasRole(
          userId,
          "admin"
        );

      const successful = [];
      const failed = [];

      for (
        const billId of
          uniqueBillIds
      ) {
        try {
          const bill =
            await Bills.findById(
              billId
            );

          if (!bill) {
            failed.push({
              billId,
              reason:
                "Bill not found",
            });

            continue;
          }

          if (
            bill.status !==
            "approval-pending"
          ) {
            failed.push({
              billId,
              reason:
                `Bill is ${bill.status}, not approval-pending`,
            });

            continue;
          }

          if (
            !isAdmin
          ) {
            const authorized =
              await hasBillAuditorAccess({
                bill,

                userId,

                action:
                  "approve",
              });

            if (!authorized) {
              failed.push({
                billId,
                reason:
                  "You are not authorized to approve this bill",
              });

              continue;
            }
          }

          const previousStatus =
            bill.status;

          bill.status =
            "approved";

          bill.approval = {
            approvedBy:
              userId,

            approvedAt:
              new Date(),

            remarks:
              remarks?.trim() ||
              null,
          };

          await bill.save();

          await BillHistory.create({
            billId:
              bill._id,

            action:
              "approved",

            stage:
              "approval",

            previousStatus,

            newStatus:
              "approved",

            actionBy:
              userId,

            remarks:
              remarks?.trim() ||
              "Bill approved",
          });

          successful.push(
            billId
          );
        } catch (error) {
          failed.push({
            billId,

            reason:
              error.message,
          });
        }
      }

      return res.status(200).json({
        success: true,

        message:
          "Bulk approval completed",

        data: {
          total:
            uniqueBillIds.length,

          successfulCount:
            successful.length,

          failedCount:
            failed.length,

          successful,

          failed,
        },
      });
    } catch (error) {
      console.error(
        "BULK APPROVE BILLS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to bulk approve bills",

        error:
          error.message,
      });
    }
  };


/*
|--------------------------------------------------------------------------
| BULK REJECT
|--------------------------------------------------------------------------
*/

export const bulkRejectBills =
  async (
    req,
    res
  ) => {
    try {
      const {
        billIds,
        remarks,
      } = req.body;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      if (
        !Array.isArray(
          billIds
        ) ||
        billIds.length ===
          0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "billIds must be a non-empty array",
        });
      }

      if (
        !remarks?.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Rejection remarks are required",
        });
      }

      const uniqueBillIds =
        [
          ...new Set(
            billIds.map(
              (id) =>
                id?.toString()
            )
          ),
        ];

      for (
        const billId of
          uniqueBillIds
      ) {
        if (
          !isValidBillId(
            billId
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              `Invalid bill ID: ${billId}`,
          });
        }
      }

      const isAdmin =
        await userHasRole(
          userId,
          "admin"
        );

      const successful = [];
      const failed = [];

      for (
        const billId of
          uniqueBillIds
      ) {
        try {
          const bill =
            await Bills.findById(
              billId
            );

          if (!bill) {
            failed.push({
              billId,
              reason:
                "Bill not found",
            });

            continue;
          }

          let action;
          let stage;

          if (
            bill.status ===
            "verification-pending"
          ) {
            action =
              "verify";

            stage =
              "verification";
          } else if (
            bill.status ===
            "approval-pending"
          ) {
            action =
              "approve";

            stage =
              "approval";
          } else {
            failed.push({
              billId,
              reason:
                `Bill is ${bill.status} and cannot be rejected`,
            });

            continue;
          }

          if (
            !isAdmin
          ) {
            const authorized =
              await hasBillAuditorAccess({
                bill,

                userId,

                action,
              });

            if (!authorized) {
              failed.push({
                billId,
                reason:
                  `You are not authorized to reject this bill at ${stage} stage`,
              });

              continue;
            }
          }

          const previousStatus =
            bill.status;

          bill.status =
            "rejected";

          bill.rejection = {
            rejectedBy:
              userId,

            rejectedAt:
              new Date(),

            stage,

            remarks:
              remarks.trim(),
          };

          await bill.save();

          await BillHistory.create({
            billId:
              bill._id,

            action:
              "rejected",

            stage,

            previousStatus,

            newStatus:
              "rejected",

            actionBy:
              userId,

            remarks:
              remarks.trim(),
          });

          successful.push(
            billId
          );
        } catch (error) {
          failed.push({
            billId,

            reason:
              error.message,
          });
        }
      }

      return res.status(200).json({
        success: true,

        message:
          "Bulk rejection completed",

        data: {
          total:
            uniqueBillIds.length,

          successfulCount:
            successful.length,

          failedCount:
            failed.length,

          successful,

          failed,
        },
      });
    } catch (error) {
      console.error(
        "BULK REJECT BILLS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to bulk reject bills",

        error:
          error.message,
      });
    }
  };


/*
|--------------------------------------------------------------------------
| EXPORT BILL DASHBOARD CSV
|--------------------------------------------------------------------------
|
| GET
| /finance-management/bills/dashboard/export
|
| Uses the same dashboard filters.
|
|--------------------------------------------------------------------------
*/

export const exportBillDashboard =
  async (
    req,
    res
  ) => {
    try {
      /*
       * Reuse dashboard logic by
       * fetching the request filters.
       *
       * We intentionally create the
       * same visibility/filtering here.
       */

      const {
        status,
        submittedByRole,
        submittedBy,
        action,
        districtId,
        blockId,
        centerId,
        fromDate,
        toDate,
        billNumber,
      } = req.query;

      const userId =
        req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      /*
       * For export, use dashboard endpoint
       * filtering rules by internally building
       * a synthetic query.
       *
       * Since export should contain all matching
       * records, no pagination is used.
       */

      const isAdmin =
        await userHasRole(
          userId,
          "admin"
        );

      const match = {};

      /*
       * Non-admin visibility.
       */
      if (!isAdmin) {
        const visibleIds =
          new Set([
            userId.toString(),
          ]);

        const mappedIds =
          await getDashboardVisibleSubmitterIds(
            userId
          );

        mappedIds.forEach(
          (id) =>
            visibleIds.add(
              id.toString()
            )
        );

        match.submittedBy = {
          $in:
            Array.from(
              visibleIds
            ).map(
              (id) =>
                new mongoose.Types.ObjectId(
                  id
                )
            ),
        };
      }

      /*
       * Submitted user.
       */
      if (submittedBy) {
        if (
          !isValidBillId(
            submittedBy
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid submittedBy",
          });
        }

        match.submittedBy =
          new mongoose.Types.ObjectId(
            submittedBy
          );
      }

      /*
       * Status.
       */
      if (status) {
        match.status =
          status;
      }

      /*
       * Action.
       */
      if (action) {
        if (
          ![
            "verify",
            "approve",
          ].includes(
            action
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid action",
          });
        }

        match.status =
          action ===
          "verify"
            ? "verification-pending"
            : "approval-pending";

        if (!isAdmin) {
          const actionUserIds =
            await getEligibleSubmitterUserIds({
              auditorUserId:
                userId,

              action,
            });

          const currentIds =
            match.submittedBy?.$in;

          if (
            currentIds
          ) {
            const actionSet =
              new Set(
                actionUserIds.map(
                  (id) =>
                    id.toString()
                )
              );

            match.submittedBy.$in =
              currentIds.filter(
                (id) =>
                  actionSet.has(
                    id.toString()
                  )
              );
          } else {
            match.submittedBy = {
              $in:
                actionUserIds,
            };
          }
        }
      }

      /*
       * Bill number.
       */
      if (billNumber) {
        match.billNumber = {
          $regex:
            billNumber,

          $options:
            "i",
        };
      }

      /*
       * Date range.
       */
      if (
        fromDate ||
        toDate
      ) {
        match.billDate = {};

        if (fromDate) {
          const start =
            new Date(
              `${fromDate}T00:00:00.000Z`
            );

          if (
            Number.isNaN(
              start.getTime()
            )
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid fromDate",
            });
          }

          match.billDate.$gte =
            start;
        }

        if (toDate) {
          const end =
            new Date(
              `${toDate}T23:59:59.999Z`
            );

          if (
            Number.isNaN(
              end.getTime()
            )
          ) {
            return res.status(400).json({
              success: false,
              message:
                "Invalid toDate",
            });
          }

          match.billDate.$lte =
            end;
        }
      }

      /*
       * Role filter.
       */
      if (submittedByRole) {
        const roleUsers =
          await UserRole.find({
            isActive: true,
          })
            .populate(
              "roleId",
              "roleCode isActive"
            )
            .lean();

        const roleUserIds =
          roleUsers
            .filter(
              (userRole) =>
                userRole.roleId &&
                userRole.roleId
                  .isActive !== false &&
                userRole.roleId.roleCode
                  ?.toLowerCase() ===
                  submittedByRole.toLowerCase()
            )
            .map(
              (userRole) =>
                userRole.userId
            );

        if (
          match.submittedBy?.$in
        ) {
          const allowed =
            new Set(
              match.submittedBy.$in.map(
                (id) =>
                  id.toString()
              )
            );

          match.submittedBy.$in =
            roleUserIds.filter(
              (id) =>
                allowed.has(
                  id.toString()
                )
            );
        } else {
          match.submittedBy = {
            $in:
              roleUserIds,
          };
        }
      }

      /*
       * Region filtering.
       *
       * Resolve all UserRegionAccess
       * and hierarchy.
       */
      if (
        districtId ||
        blockId ||
        centerId
      ) {
        const accesses =
          await UserRegionAccess.find(
            {}
          ).lean();

        const blockIds =
          [
            ...new Set(
              accesses
                .filter(
                  (item) =>
                    item.blockId
                )
                .map(
                  (item) =>
                    item.blockId
                )
            ),
          ];

        const centerIds =
          [
            ...new Set(
              accesses
                .filter(
                  (item) =>
                    item.centerId
                )
                .map(
                  (item) =>
                    item.centerId
                )
            ),
          ];

        const [
          blocks,
          centers,
        ] = await Promise.all([
          blockIds.length
            ? Block.find({
                _id: {
                  $in:
                    blockIds,
                },
              })
                .select(
                  "_id districtId"
                )
                .lean()
            : [],

          centerIds.length
            ? Center.find({
                _id: {
                  $in:
                    centerIds,
                },
              })
                .select(
                  "_id districtId blockId"
                )
                .lean()
            : [],
        ]);

        const blockMap =
          new Map(
            blocks.map(
              (block) => [
                block._id.toString(),
                block,
              ]
            )
          );

        const centerMap =
          new Map(
            centers.map(
              (center) => [
                center._id.toString(),
                center,
              ]
            )
          );

        const regionUserIds =
          new Set();

        for (
          const access of
            accesses
        ) {
          let resolvedDistrictId =
            access.districtId ||
            null;

          let resolvedBlockId =
            access.blockId ||
            null;

          const resolvedCenterId =
            access.centerId ||
            null;

          if (
            resolvedCenterId
          ) {
            const center =
              centerMap.get(
                resolvedCenterId.toString()
              );

            if (center) {
              resolvedBlockId =
                center.blockId ||
                resolvedBlockId;

              resolvedDistrictId =
                center.districtId ||
                resolvedDistrictId;

              if (
                !resolvedDistrictId &&
                resolvedBlockId
              ) {
                const block =
                  blockMap.get(
                    resolvedBlockId.toString()
                  );

                if (block) {
                  resolvedDistrictId =
                    block.districtId;
                }
              }
            }
          }

          if (
            resolvedBlockId &&
            !resolvedDistrictId
          ) {
            const block =
              blockMap.get(
                resolvedBlockId.toString()
              );

            if (block) {
              resolvedDistrictId =
                block.districtId;
            }
          }

          let matches = true;

          if (
            districtId &&
            resolvedDistrictId?.toString() !==
              districtId.toString()
          ) {
            matches = false;
          }

          if (
            blockId &&
            resolvedBlockId?.toString() !==
              blockId.toString()
          ) {
            matches = false;
          }

          if (
            centerId &&
            resolvedCenterId?.toString() !==
              centerId.toString()
          ) {
            matches = false;
          }

          if (matches) {
            regionUserIds.add(
              access.userId.toString()
            );
          }
        }

        const ids =
          Array.from(
            regionUserIds
          ).map(
            (id) =>
              new mongoose.Types.ObjectId(
                id
              )
          );

        if (
          match.submittedBy?.$in
        ) {
          const allowed =
            new Set(
              match.submittedBy.$in.map(
                (id) =>
                  id.toString()
              )
            );

          match.submittedBy.$in =
            ids.filter(
              (id) =>
                allowed.has(
                  id.toString()
                )
            );
        } else {
          match.submittedBy = {
            $in:
              ids,
          };
        }
      }

      /*
       * Fetch all matching bills.
       */
      const bills =
        await Bills.find(match)
          .populate(
            "submittedBy",
            "name email"
          )
          .sort({
            billDate:
              -1,
            createdAt:
              -1,
          })
          .lean();

      /*
       * Get roles.
       */
      const userIds =
        bills
          .map(
            (bill) =>
              bill.submittedBy?._id
          )
          .filter(Boolean);

      const userRoles =
        await UserRole.find({
          userId: {
            $in:
              userIds,
          },
          isActive: true,
        })
          .populate(
            "roleId",
            "roleCode roleName isActive"
          )
          .lean();

      const roleMap =
        new Map();

      for (
        const userRole of
          userRoles
      ) {
        if (
          !userRole.roleId ||
          userRole.roleId
            .isActive === false
        ) {
          continue;
        }

        const id =
          userRole.userId.toString();

        if (
          !roleMap.has(id)
        ) {
          roleMap.set(
            id,
            []
          );
        }

        roleMap
          .get(id)
          .push(
            userRole.roleId.roleCode
          );
      }

      /*
       * CSV escape helper.
       */
      const escapeCsv = (
        value
      ) => {
        if (
          value ===
            null ||
          value ===
            undefined
        ) {
          return "";
        }

        const stringValue =
          String(value);

        if (
          stringValue.includes(
            ","
          ) ||
          stringValue.includes(
            '"'
          ) ||
          stringValue.includes(
            "\n"
          )
        ) {
          return `"${stringValue.replace(
            /"/g,
            '""'
          )}"`;
        }

        return stringValue;
      };

      const headers = [
        "Bill Number",
        "Title",
        "Submitted By",
        "Submitted By Email",
        "Submitted By Role",
        "Bill Date",
        "Total Amount",
        "Currency",
        "Status",
        "Verification Remarks",
        "Approval Remarks",
        "Rejection Remarks",
        "Payment Reference",
        "Payment Mode",
        "Created At",
      ];

      const rows =
        bills.map(
          (bill) => {
            const submitterId =
              bill.submittedBy?._id?.toString();

            const roles =
              roleMap.get(
                submitterId
              ) || [];

            return [
              bill.billNumber,
              bill.title,
              bill.submittedBy?.name,
              bill.submittedBy?.email,
              roles.join(
                " | "
              ),
              bill.billDate
                ? new Date(
                    bill.billDate
                  ).toISOString()
                : "",
              bill.totalAmount,
              bill.currency,
              bill.status,
              bill.verification
                ?.remarks,
              bill.approval
                ?.remarks,
              bill.rejection
                ?.remarks,
              bill.payment
                ?.paymentReference,
              bill.payment
                ?.paymentMode,
              bill.createdAt
                ? new Date(
                    bill.createdAt
                  ).toISOString()
                : "",
            ];
          }
        );

      const csv = [
        headers,
        ...rows,
      ]
        .map(
          (row) =>
            row
              .map(
                escapeCsv
              )
              .join(",")
        )
        .join("\n");

      res.setHeader(
        "Content-Type",
        "text/csv; charset=utf-8"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="bill-dashboard-${Date.now()}.csv"`
      );

      return res.status(200).send(
        csv
      );
    } catch (error) {
      console.error(
        "EXPORT BILL DASHBOARD ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Failed to export bill dashboard",

        error:
          error.message,
      });
    }
  };
















  /*
|--------------------------------------------------------------------------
| BULK MARK PAYMENT PENDING
|--------------------------------------------------------------------------
|
| approved → payment-pending
|
| Body:
| {
|   billIds: [],
|   remarks: ""
| }
|--------------------------------------------------------------------------
*/

export const bulkMarkPaymentPending = async (
  req,
  res
) => {
  try {
    const userId = req.user?._id;

    const {
      billIds,
      remarks,
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (
      !Array.isArray(billIds) ||
      billIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "billIds must be a non-empty array",
      });
    }

    /*
     * Remove duplicate IDs
     */
    const uniqueBillIds = [
      ...new Set(
        billIds.map((id) =>
          String(id)
        )
      ),
    ];

    /*
     * Validate all IDs
     */
    const invalidIds =
      uniqueBillIds.filter(
        (billId) =>
          !isValidBillId(billId)
      );

    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "One or more bill IDs are invalid",
        invalidIds,
      });
    }

    const successful = [];
    const failed = [];

    /*
     * Process each bill independently.
     */
    for (
      const billId of uniqueBillIds
    ) {
      try {
        const bill =
          await Bills.findById(
            billId
          );

        if (!bill) {
          failed.push({
            billId,
            reason: "Bill not found",
          });

          continue;
        }

        /*
         * Same status rule as individual API.
         */
        if (
          bill.status !==
          "approved"
        ) {
          failed.push({
            billId,
            billNumber:
              bill.billNumber,
            reason:
              "Only approved bills can be marked as payment pending",
            currentStatus:
              bill.status,
          });

          continue;
        }

        const previousStatus =
          bill.status;

        bill.status =
          "payment-pending";

        await bill.save();

        /*
         * Create history for every bill.
         */
        await BillHistory.create({
          billId: bill._id,
          action:
            "marked-payment-pending",
          stage: "payment",
          previousStatus,
          newStatus:
            "payment-pending",
          actionBy: userId,
          remarks:
            remarks?.trim() ||
            "Bill moved to payment pending",
          metadata: {
            bulkAction: true,
          },
        });

        successful.push({
          billId:
            bill._id,
          billNumber:
            bill.billNumber,
        });
      } catch (error) {
        console.error(
          `BULK PAYMENT PENDING ERROR FOR BILL ${billId}:`,
          error
        );

        failed.push({
          billId,
          reason:
            "Failed to update bill",
        });
      }
    }

    return res.status(200).json({
      success: true,
      message:
        "Bulk payment pending action completed",
      data: {
        successfulCount:
          successful.length,
        failedCount:
          failed.length,
        successful,
        failed,
      },
    });
  } catch (error) {
    console.error(
      "BULK MARK PAYMENT PENDING ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to process bulk payment pending action",
      error: error.message,
    });
  }
};


/*
|--------------------------------------------------------------------------
| BULK MARK BILLS PAID
|--------------------------------------------------------------------------
|
| payment-pending → paid
|
| Body:
| {
|   billIds: [],
|   paymentReference: "",
|   paymentMode: "",
|   remarks: ""
| }
|--------------------------------------------------------------------------
*/

export const bulkMarkBillsPaid = async (
  req,
  res
) => {
  try {
    const userId = req.user?._id;

    const {
      billIds,
      paymentReference,
      paymentMode,
      remarks,
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (
      !Array.isArray(billIds) ||
      billIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "billIds must be a non-empty array",
      });
    }

    /*
     * Payment mode is required exactly
     * like individual markBillPaid.
     */
    if (!paymentMode) {
      return res.status(400).json({
        success: false,
        message:
          "Payment mode is required",
      });
    }

    const allowedPaymentModes = [
      "bank-transfer",
      "upi",
      "cash",
      "cheque",
      "other",
    ];

    if (
      !allowedPaymentModes.includes(
        paymentMode
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid payment mode",
      });
    }

    /*
     * Remove duplicate IDs.
     */
    const uniqueBillIds = [
      ...new Set(
        billIds.map((id) =>
          String(id)
        )
      ),
    ];

    /*
     * Validate IDs.
     */
    const invalidIds =
      uniqueBillIds.filter(
        (billId) =>
          !isValidBillId(billId)
      );

    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "One or more bill IDs are invalid",
        invalidIds,
      });
    }

    const successful = [];
    const failed = [];

    /*
     * Process each bill independently.
     */
    for (
      const billId of uniqueBillIds
    ) {
      try {
        const bill =
          await Bills.findById(
            billId
          );

        if (!bill) {
          failed.push({
            billId,
            reason: "Bill not found",
          });

          continue;
        }

        /*
         * Same status rule as individual API.
         */
        if (
          bill.status !==
          "payment-pending"
        ) {
          failed.push({
            billId,
            billNumber:
              bill.billNumber,
            reason:
              "Only payment-pending bills can be marked as paid",
            currentStatus:
              bill.status,
          });

          continue;
        }

        const previousStatus =
          bill.status;

        bill.status = "paid";

        bill.payment = {
          paidBy: userId,
          paidAt: new Date(),
          paymentReference:
            paymentReference?.trim() ||
            null,
          paymentMode,
          remarks:
            remarks?.trim() ||
            null,
        };

        await bill.save();

        /*
         * Create history for every bill.
         */
        await BillHistory.create({
          billId: bill._id,
          action: "paid",
          stage: "payment",
          previousStatus,
          newStatus: "paid",
          actionBy: userId,
          remarks:
            remarks?.trim() ||
            "Bill marked as paid",
          paymentReference:
            paymentReference?.trim() ||
            null,
          metadata: {
            paymentMode,
            bulkAction: true,
          },
        });

        successful.push({
          billId:
            bill._id,
          billNumber:
            bill.billNumber,
        });
      } catch (error) {
        console.error(
          `BULK MARK PAID ERROR FOR BILL ${billId}:`,
          error
        );

        failed.push({
          billId,
          reason:
            "Failed to update bill",
        });
      }
    }

    return res.status(200).json({
      success: true,
      message:
        "Bulk mark paid action completed",
      data: {
        successfulCount:
          successful.length,
        failedCount:
          failed.length,
        successful,
        failed,
      },
    });
  } catch (error) {
    console.error(
      "BULK MARK BILLS PAID ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to process bulk paid action",
      error: error.message,
    });
  }
};





