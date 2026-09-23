import mongoose from "mongoose";

import { UserRegionAccess } from "../../models/user-management/userRegionAccess.models.js";
import { District } from "../../models/region-management/district.models.js";
import { Block } from "../../models/region-management/block.models.js";
import { Center } from "../../models/region-management/center.models.js";
import { ApiError } from "../../utils/api-error.js";

/**
 * Get all region access assignments of a user
 *
 * @param {String} userId - MongoDB User ID
 * @returns {Promise<Array>} User region access assignments
 */
const getUserRegionAccess = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }


  const userRegionAccess = await UserRegionAccess.find({
    userId,
  })
    .populate("districtId", "districtName districtId")
    .populate("blockId", "blockName blockId districtId")
    .populate("centerId", "centerName centerCode districtId blockId")
    .sort({ createdAt: 1 });

  return userRegionAccess;
};

/**
 * Check whether a user has global region access
 *
 * @param {String} userId - MongoDB User ID
 * @returns {Promise<Boolean>} True if user has global access
 */
const hasGlobalAccess = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const globalAccess = await UserRegionAccess.exists({
    userId,
    scope: "global",
  });

  return Boolean(globalAccess);
};

/**
 * Check whether a user has access to a specific district
 *
 * Access is granted when:
 * - User has global access
 * - User has direct access to the district
 *
 * @param {String} userId - MongoDB User ID
 * @param {String} districtId - MongoDB District ID
 * @returns {Promise<Boolean>} True if user can access district
 */
const hasDistrictAccess = async (userId, districtId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  if (!mongoose.Types.ObjectId.isValid(districtId)) {
    throw new ApiError(400, "Invalid district ID");
  }

  const hasAccess = await UserRegionAccess.exists({
    userId,
    $or: [
      {
        scope: "global",
      },
      {
        scope: "district",
        districtId,
      },
    ],
  });

  return Boolean(hasAccess);
};

/**
 * Check whether a user has access to a specific block
 *
 * Access is granted when:
 * - User has global access
 * - User has access to the block's district
 * - User has direct access to the block
 *
 * @param {String} userId - MongoDB User ID
 * @param {String} blockId - MongoDB Block ID
 * @returns {Promise<Boolean>} True if user can access block
 */
const hasBlockAccess = async (userId, blockId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  if (!mongoose.Types.ObjectId.isValid(blockId)) {
    throw new ApiError(400, "Invalid block ID");
  }

  const block = await Block.findById(blockId).select("districtId");

  if (!block) {
    throw new ApiError(404, "Block not found");
  }

  const hasAccess = await UserRegionAccess.exists({
    userId,
    $or: [
      {
        scope: "global",
      },
      {
        scope: "district",
        districtId: block.districtId,
      },
      {
        scope: "block",
        blockId,
      },
    ],
  });

  return Boolean(hasAccess);
};

/**
 * Check whether a user has access to a specific center
 *
 * Access is granted when:
 * - User has global access
 * - User has access to the center's district
 * - User has access to the center's block
 * - User has direct access to the center
 *
 * @param {String} userId - MongoDB User ID
 * @param {String} centerId - MongoDB Center ID
 * @returns {Promise<Boolean>} True if user can access center
 */
const hasCenterAccess = async (userId, centerId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  if (!mongoose.Types.ObjectId.isValid(centerId)) {
    throw new ApiError(400, "Invalid center ID");
  }

  const center = await Center.findById(centerId).select(
    "districtId blockId"
  );

  if (!center) {
    throw new ApiError(404, "Center not found");
  }

  const hasAccess = await UserRegionAccess.exists({
    userId,
    $or: [
      {
        scope: "global",
      },
      {
        scope: "district",
        districtId: center.districtId,
      },
      {
        scope: "block",
        blockId: center.blockId,
      },
      {
        scope: "center",
        centerId,
      },
    ],
  });

  return Boolean(hasAccess);
};

/**
 * Check whether a user can access a specific region based on scope
 *
 * @param {String} userId - MongoDB User ID
 * @param {String} scope - Region scope
 * @param {String} regionId - Region ID
 * @returns {Promise<Boolean>} True if user has access
 */
const canAccessRegion = async (userId, scope, regionId = null) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  const validScopes = ["global", "district", "block", "center"];

  if (!validScopes.includes(scope)) {
    throw new ApiError(400, "Invalid region scope");
  }

  switch (scope) {
    case "global":
      return await hasGlobalAccess(userId);

    case "district":
      return await hasDistrictAccess(userId, regionId);

    case "block":
      return await hasBlockAccess(userId, regionId);

    case "center":
      return await hasCenterAccess(userId, regionId);

    default:
      return false;
  }
};











/**
 * Get merged effective region access of a user
 *
 * The response combines all region scopes assigned to the user.
 *
 * Scope inheritance:
 *
 * global:
 *    all districts
 *    all blocks
 *    all centers
 *
 * district:
 *    selected district
 *    all blocks under district
 *    all centers under district
 *
 * block:
 *    selected block
 *    all centers under block
 *
 * center:
 *    selected center
 *    parent district
 *    parent block
 *
 * Duplicate regions are removed.
 *
 * @param {String} userId - MongoDB User ID
 * @returns {Promise<Object>} Merged region access
 */
const getMergedUserRegionAccess = async (userId) => {
  // ============================================================
  // VALIDATE USER ID
  // ============================================================

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(
      400,
      "Invalid user ID"
    );
  }

  // ============================================================
  // GET USER REGION ACCESS
  // ============================================================

  const userRegionAccess =
    await UserRegionAccess.find({
      userId,
    }).lean();

  if (!userRegionAccess.length) {
    return {
      scope: [],
      region: [],
    };
  }

  // ============================================================
  // GET EFFECTIVE SCOPES
  // ============================================================

  const scopeSet = new Set(
    userRegionAccess.map(
      (access) => access.scope
    )
  );

  // ============================================================
  // GLOBAL ACCESS
  // ============================================================

  if (scopeSet.has("global")) {
    const [
      districts,
      blocks,
      centers,
    ] = await Promise.all([
      District.find({})
        .select(
          "_id districtId districtName"
        )
        .lean(),

      Block.find({})
        .select(
          "_id blockId blockName districtId"
        )
        .lean(),

      Center.find({})
        .select(
          "_id centerCode centerName districtId blockId"
        )
        .lean(),
    ]);

    // ----------------------------------------------------------
    // CREATE LOOKUP MAPS
    // ----------------------------------------------------------

    const districtMap =
      new Map(
        districts.map(
          (district) => [
            String(district._id),
            district,
          ]
        )
      );

    const blockMap =
      new Map(
        blocks.map(
          (block) => [
            String(block._id),
            block,
          ]
        )
      );

    // ----------------------------------------------------------
    // BUILD REGION
    // ----------------------------------------------------------

    const regionMap =
      new Map();

    centers.forEach(
      (center) => {
        const district =
          districtMap.get(
            String(
              center.districtId
            )
          );

        const block =
          blockMap.get(
            String(
              center.blockId
            )
          );

        regionMap.set(
          String(center._id),
          {
            districtId:
              district?._id ||
              center.districtId ||
              null,

            districtName:
              district?.districtName ||
              "",

            blockId:
              block?._id ||
              center.blockId ||
              null,

            blockName:
              block?.blockName ||
              "",

            centerId:
              center._id,

            centerName:
              center.centerName ||
              "",

            centerCode:
              center.centerCode ||
              "",
          }
        );
      }
    );

    // ----------------------------------------------------------
    // PRESERVE BLOCKS WITHOUT CENTERS
    // ----------------------------------------------------------

    blocks.forEach(
      (block) => {
        const hasCenter =
          centers.some(
            (center) =>
              String(
                center.blockId
              ) ===
              String(
                block._id
              )
          );

        if (!hasCenter) {
          const district =
            districtMap.get(
              String(
                block.districtId
              )
            );

          regionMap.set(
            `block-${block._id}`,
            {
              districtId:
                district?._id ||
                block.districtId ||
                null,

              districtName:
                district?.districtName ||
                "",

              blockId:
                block._id,

              blockName:
                block.blockName ||
                "",

              centerId:
                null,

              centerName:
                "",

              centerCode:
                "",
            }
          );
        }
      }
    );

    // ----------------------------------------------------------
    // PRESERVE DISTRICTS WITHOUT BLOCKS
    // ----------------------------------------------------------

    districts.forEach(
      (district) => {
        const hasBlock =
          blocks.some(
            (block) =>
              String(
                block.districtId
              ) ===
              String(
                district._id
              )
          );

        if (!hasBlock) {
          regionMap.set(
            `district-${district._id}`,
            {
              districtId:
                district._id,

              districtName:
                district.districtName ||
                "",

              blockId:
                null,

              blockName:
                "",

              centerId:
                null,

              centerName:
                "",

              centerCode:
                "",
            }
          );
        }
      }
    );

    return {
      scope: ["global"],
      region: Array.from(
        regionMap.values()
      ),
    };
  }

  // ============================================================
  // NON-GLOBAL ACCESS
  // ============================================================

  // IMPORTANT:
  //
  // District access  -> expand district -> blocks -> centers
  // Block access     -> expand block -> centers
  // Center access    -> ONLY assigned center
  //
  // Center access MUST NOT be converted into district access.
  // ============================================================

  const assignedDistrictIds =
    new Set();

  const assignedBlockIds =
    new Set();

  const assignedCenterIds =
    new Set();

  // ============================================================
  // COLLECT DIRECT ASSIGNMENTS
  // ============================================================

  userRegionAccess.forEach(
    (access) => {
      // --------------------------------------------------------
      // DISTRICT ACCESS
      // --------------------------------------------------------

      if (
        access.scope === "district" &&
        access.districtId
      ) {
        assignedDistrictIds.add(
          String(
            access.districtId
          )
        );
      }

      // --------------------------------------------------------
      // BLOCK ACCESS
      // --------------------------------------------------------

      if (
        access.scope === "block" &&
        access.blockId
      ) {
        assignedBlockIds.add(
          String(
            access.blockId
          )
        );
      }

      // --------------------------------------------------------
      // CENTER ACCESS
      // --------------------------------------------------------

      if (
        access.scope === "center" &&
        access.centerId
      ) {
        assignedCenterIds.add(
          String(
            access.centerId
          )
        );
      }
    }
  );

  // ============================================================
  // GET DIRECTLY ASSIGNED DATA
  // ============================================================

  const [
    assignedDistricts,
    assignedBlocks,
    assignedCenters,
  ] = await Promise.all([
    assignedDistrictIds.size
      ? District.find({
          _id: {
            $in:
              Array.from(
                assignedDistrictIds
              ),
          },
        })
          .select(
            "_id districtId districtName"
          )
          .lean()
      : [],

    assignedBlockIds.size
      ? Block.find({
          _id: {
            $in:
              Array.from(
                assignedBlockIds
              ),
          },
        })
          .select(
            "_id blockId blockName districtId"
          )
          .lean()
      : [],

    assignedCenterIds.size
      ? Center.find({
          _id: {
            $in:
              Array.from(
                assignedCenterIds
              ),
          },
        })
          .select(
            "_id centerCode centerName districtId blockId"
          )
          .lean()
      : [],
  ]);

  // ============================================================
  // ACCESSIBLE BLOCK IDS
  // ============================================================
  //
  // Only district access and direct block access
  // can expand to blocks.
  //
  // Center access does NOT expand anything.
  // ============================================================

  const accessibleBlockIds =
    new Set(
      assignedBlockIds
    );

  // ------------------------------------------------------------
  // GET ALL BLOCKS UNDER ASSIGNED DISTRICTS
  // ------------------------------------------------------------

  const districtScopeBlocks =
    assignedDistrictIds.size
      ? await Block.find({
          districtId: {
            $in:
              Array.from(
                assignedDistrictIds
              ),
          },
        })
          .select(
            "_id blockId blockName districtId"
          )
          .lean()
      : [];

  // ------------------------------------------------------------
  // ADD DISTRICT BLOCKS
  // ------------------------------------------------------------

  districtScopeBlocks.forEach(
    (block) => {
      accessibleBlockIds.add(
        String(
          block._id
        )
      );
    }
  );

  // ============================================================
  // GET ALL ACCESSIBLE BLOCKS
  // ============================================================

  const allAccessibleBlocks =
    accessibleBlockIds.size
      ? await Block.find({
          _id: {
            $in:
              Array.from(
                accessibleBlockIds
              ),
          },
        })
          .select(
            "_id blockId blockName districtId"
          )
          .lean()
      : [];

  // ============================================================
  // GET CENTERS FROM DISTRICT/BLOCK ACCESS
  // ============================================================
  //
  // These are expanded centers.
  //
  // IMPORTANT:
  // We do NOT use center's districtId here to expand.
  // ============================================================

  const expandedCenters =
    accessibleBlockIds.size
      ? await Center.find({
          blockId: {
            $in:
              Array.from(
                accessibleBlockIds
              ),
          },
        })
          .select(
            "_id centerCode centerName districtId blockId"
          )
          .lean()
      : [];

  // ============================================================
  // MERGE EXPLICIT CENTER ACCESS
  // ============================================================
  //
  // Explicit center access is added directly.
  //
  // Example:
  //
  // scope = center
  // centerId = Center 40
  //
  // Only Center 40 is added.
  // ============================================================

  const finalCenterMap =
    new Map();

  // Centers coming from district/block access
  expandedCenters.forEach(
    (center) => {
      finalCenterMap.set(
        String(
          center._id
        ),
        center
      );
    }
  );

  // Explicitly assigned centers
  assignedCenters.forEach(
    (center) => {
      finalCenterMap.set(
        String(
          center._id
        ),
        center
      );
    }
  );

  const finalCenters =
    Array.from(
      finalCenterMap.values()
    );

  // ============================================================
  // DISTRICT IDS REQUIRED FOR FINAL RESPONSE
  // ============================================================

  const finalDistrictIds =
    new Set();

  // Direct district access
  assignedDistrictIds.forEach(
    (id) => {
      finalDistrictIds.add(id);
    }
  );

  // Blocks accessible through district/block access
  allAccessibleBlocks.forEach(
    (block) => {
      if (
        block.districtId
      ) {
        finalDistrictIds.add(
          String(
            block.districtId
          )
        );
      }
    }
  );

  // Explicit center access
  //
  // We need its district only so we can
  // display districtName.
  //
  // We DO NOT use this to expand centers.
  assignedCenters.forEach(
    (center) => {
      if (
        center.districtId
      ) {
        finalDistrictIds.add(
          String(
            center.districtId
          )
        );
      }
    }
  );

  // ============================================================
  // GET FINAL DISTRICTS
  // ============================================================

  const finalDistricts =
    finalDistrictIds.size
      ? await District.find({
          _id: {
            $in:
              Array.from(
                finalDistrictIds
              ),
          },
        })
          .select(
            "_id districtId districtName"
          )
          .lean()
      : [];

  // ============================================================
  // LOOKUP MAPS
  // ============================================================

  const districtMap =
    new Map();

  finalDistricts.forEach(
    (district) => {
      districtMap.set(
        String(
          district._id
        ),
        district
      );
    }
  );

  const blockMap =
    new Map();

  allAccessibleBlocks.forEach(
    (block) => {
      blockMap.set(
        String(
          block._id
        ),
        block
      );
    }
  );

  // ============================================================
  // ADD BLOCKS OF EXPLICIT CENTER ACCESS
  // ============================================================
  //
  // This is ONLY for displaying blockName.
  //
  // It does NOT expand the center access.
  // ============================================================

  const explicitCenterBlockIds =
    new Set();

  assignedCenters.forEach(
    (center) => {
      if (
        center.blockId
      ) {
        explicitCenterBlockIds.add(
          String(
            center.blockId
          )
        );
      }
    }
  );

  const explicitCenterBlocks =
    explicitCenterBlockIds.size
      ? await Block.find({
          _id: {
            $in:
              Array.from(
                explicitCenterBlockIds
              ),
          },
        })
          .select(
            "_id blockId blockName districtId"
          )
          .lean()
      : [];

  explicitCenterBlocks.forEach(
    (block) => {
      blockMap.set(
        String(
          block._id
        ),
        block
      );
    }
  );

  // ============================================================
  // BUILD FINAL REGION
  // ============================================================

  const regionMap =
    new Map();

  finalCenters.forEach(
    (center) => {
      const district =
        districtMap.get(
          String(
            center.districtId
          )
        );

      const block =
        blockMap.get(
          String(
            center.blockId
          )
        );

      const region = {
        districtId:
          district?._id ||
          center.districtId ||
          null,

        districtName:
          district?.districtName ||
          "",

        blockId:
          block?._id ||
          center.blockId ||
          null,

        blockName:
          block?.blockName ||
          "",

        centerId:
          center._id,

        centerName:
          center.centerName ||
          "",

        centerCode:
          center.centerCode ||
          "",
      };

      // Center ID is the uniqueness key.
      regionMap.set(
        String(
          center._id
        ),
        region
      );
    }
  );

  // ============================================================
  // PRESERVE BLOCKS WITHOUT CENTERS
  // ============================================================
  //
  // Only blocks obtained through district/block access
  // are considered here.
  //
  // Explicit center access should NOT create
  // a block-only row.
  // ============================================================

  allAccessibleBlocks.forEach(
    (block) => {
      const hasCenter =
        finalCenters.some(
          (center) =>
            String(
              center.blockId
            ) ===
            String(
              block._id
            )
        );

      if (!hasCenter) {
        const district =
          districtMap.get(
            String(
              block.districtId
            )
          );

        regionMap.set(
          `block-${block._id}`,
          {
            districtId:
              district?._id ||
              block.districtId ||
              null,

            districtName:
              district?.districtName ||
              "",

            blockId:
              block._id,

            blockName:
              block.blockName ||
              "",

            centerId:
              null,

            centerName:
              "",

            centerCode:
              "",
          }
        );
      }
    }
  );

  // ============================================================
  // PRESERVE DISTRICTS WITHOUT BLOCKS
  // ============================================================

  assignedDistricts.forEach(
    (district) => {
      const hasBlock =
        allAccessibleBlocks.some(
          (block) =>
            String(
              block.districtId
            ) ===
            String(
              district._id
            )
        );

      if (!hasBlock) {
        regionMap.set(
          `district-${district._id}`,
          {
            districtId:
              district._id,

            districtName:
              district.districtName ||
              "",

            blockId:
              null,

            blockName:
              "",

            centerId:
              null,

            centerName:
              "",

            centerCode:
              "",
          }
        );
      }
    }
  );

  // ============================================================
  // FINAL RESPONSE
  // ============================================================

  return {
    scope: Array.from(
      scopeSet
    ),

    region: Array.from(
      regionMap.values()
    ),
  };
};
export {
  getUserRegionAccess,
  hasGlobalAccess,
  hasDistrictAccess,
  hasBlockAccess,
  hasCenterAccess,
  canAccessRegion,
  getMergedUserRegionAccess 
};