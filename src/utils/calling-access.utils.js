import mongoose from "mongoose";

import { UserAccess } from "../models/user-management/userAccess.models.js";
import { UserRegionAccess } from "../models/user-management/userRegionAccess.models.js";


/*
|--------------------------------------------------------------------------
| CHECK OBJECT ID
|--------------------------------------------------------------------------
*/

export const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};


/*
|--------------------------------------------------------------------------
| GET USER CALLING ACCESS
|--------------------------------------------------------------------------
|
| Returns the complete program, batch and region access
| of a user.
|
*/

export const getCallingUserAccess = async (userId) => {
  if (!userId) {
    throw new Error("userId is required");
  }

  const [
    userAccess,
    regionAccess,
  ] = await Promise.all([
    UserAccess.findOne({
      userId,
    }).lean(),

    UserRegionAccess.find({
      userId,
    }).lean(),
  ]);

  return {
    programIds:
      userAccess?.programIds || [],

    batchIds:
      userAccess?.batchIds || [],

    regionAccess:
      regionAccess || [],
  };
};


/*
|--------------------------------------------------------------------------
| CHECK PROGRAM ACCESS
|--------------------------------------------------------------------------
*/

export const hasProgramAccess = (
  userAccess,
  programId
) => {
  if (!programId) {
    return false;
  }

  return (userAccess.programIds || []).some(
    (id) =>
      id.toString() ===
      programId.toString()
  );
};


/*
|--------------------------------------------------------------------------
| CHECK BATCH ACCESS
|--------------------------------------------------------------------------
*/

export const hasBatchAccess = (
  userAccess,
  batchId
) => {
  if (!batchId) {
    return false;
  }

  return (userAccess.batchIds || []).some(
    (id) =>
      id.toString() ===
      batchId.toString()
  );
};


/*
|--------------------------------------------------------------------------
| CHECK REGION ACCESS
|--------------------------------------------------------------------------
|
| global
|   → everything
|
| district
|   → assigned district + all blocks + all centers
|
| block
|   → assigned block + all centers
|
| center
|   → assigned center only
|
*/

export const hasRegionAccess = (
  regionAccess,
  {
    districtId,
    blockId,
    centerId,
  }
) => {
  if (!Array.isArray(regionAccess)) {
    return false;
  }

  /*
   * No region restriction supplied.
   */
  if (
    !districtId &&
    !blockId &&
    !centerId
  ) {
    return false;
  }


  for (const access of regionAccess) {

    /*
     * GLOBAL
     *
     * User can access every district,
     * block and center.
     */

    if (access.scope === "global") {
      return true;
    }


    /*
     * DISTRICT
     *
     * Access to:
     * assigned district
     * all blocks under it
     * all centers under it
     */

    if (
      access.scope === "district" &&
      districtId &&
      access.districtId?.toString() ===
        districtId.toString()
    ) {
      return true;
    }


    /*
     * BLOCK
     *
     * Access to:
     * assigned block
     * all centers under it
     */

    if (
      access.scope === "block" &&
      blockId &&
      access.blockId?.toString() ===
        blockId.toString()
    ) {
      return true;
    }


    /*
     * CENTER
     *
     * Access only to the assigned center.
     */

    if (
      access.scope === "center" &&
      centerId &&
      access.centerId?.toString() ===
        centerId.toString()
    ) {
      return true;
    }
  }

  return false;
};


/*
|--------------------------------------------------------------------------
| CHECK COMPLETE TARGET ACCESS
|--------------------------------------------------------------------------
|
| Program + Batch + Region
|
*/

export const canAccessCallingTarget = async ({
  userId,
  programId,
  batchId,
  districtId,
  blockId,
  centerId,
}) => {

  const access =
    await getCallingUserAccess(
      userId
    );


  /*
   * Program access
   */

  if (
    programId &&
    !hasProgramAccess(
      access,
      programId
    )
  ) {
    return {
      allowed: false,
      reason:
        "User does not have access to this program",
    };
  }


  /*
   * Batch access
   */

  if (
    batchId &&
    !hasBatchAccess(
      access,
      batchId
    )
  ) {
    return {
      allowed: false,
      reason:
        "User does not have access to this batch",
    };
  }


  /*
   * Region access
   */

  if (
    !hasRegionAccess(
      access.regionAccess,
      {
        districtId,
        blockId,
        centerId,
      }
    )
  ) {
    return {
      allowed: false,
      reason:
        "User does not have access to this region",
    };
  }


  return {
    allowed: true,
    reason: null,
  };
};


/*
|--------------------------------------------------------------------------
| BUILD REGION QUERY
|--------------------------------------------------------------------------
|
| This helper is useful for GET APIs.
|
| Example:
|
| global
|   → {}
|
| district
|   → {
|       districtId: { $in: [...] }
|     }
|
| block
|   → {
|       blockId: { $in: [...] }
|     }
|
| center
|   → {
|       centerId: { $in: [...] }
|     }
|
*/

export const buildCallingRegionQuery = (
  regionAccess
) => {
  if (
    !Array.isArray(regionAccess) ||
    regionAccess.length === 0
  ) {
    return null;
  }


  /*
   * Global access means no region restriction.
   */

  const hasGlobalAccess =
    regionAccess.some(
      (access) =>
        access.scope === "global"
    );

  if (hasGlobalAccess) {
    return {};
  }


  const districtIds = [];
  const blockIds = [];
  const centerIds = [];


  for (const access of regionAccess) {

    if (
      access.scope === "district" &&
      access.districtId
    ) {
      districtIds.push(
        access.districtId
      );
    }

    if (
      access.scope === "block" &&
      access.blockId
    ) {
      blockIds.push(
        access.blockId
      );
    }

    if (
      access.scope === "center" &&
      access.centerId
    ) {
      centerIds.push(
        access.centerId
      );
    }
  }


  const conditions = [];


  /*
   * District access.
   *
   * Since district access includes every block
   * and center under that district, districtId
   * is enough for documents containing districtId.
   */

  if (districtIds.length > 0) {
    conditions.push({
      districtId: {
        $in: districtIds,
      },
    });
  }


  /*
   * Block access.
   *
   * Block access includes all centers under
   * that block.
   */

  if (blockIds.length > 0) {
    conditions.push({
      blockId: {
        $in: blockIds,
      },
    });
  }


  /*
   * Center access.
   */

  if (centerIds.length > 0) {
    conditions.push({
      centerId: {
        $in: centerIds,
      },
    });
  }


  /*
   * No valid region access.
   */

  if (conditions.length === 0) {
    return null;
  }


  /*
   * Multiple region assignments mean OR.
   *
   * Example:
   *
   * District Gurugram
   * OR
   * Block Rewari
   * OR
   * Center ABC
   */

  return {
    $or: conditions,
  };
};