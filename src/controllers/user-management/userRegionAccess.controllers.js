// import mongoose from "mongoose";

// import { User } from "../../models/user.models.js";
// import { District } from "../../models/region-management/district.models.js";
// import { Block } from "../../models/region-management/block.models.js";
// import { Center } from "../../models/region-management/center.models.js";
// import { UserRegionAccess } from "../../models/user-management/userRegionAccess.models.js";

// import { asyncHandler } from "../../utils/async-handler.js";
// import { ApiError } from "../../utils/api-error.js";
// import { ApiResponse } from "../../utils/api-response.js";

// import { getUserRegionAccess } from "../../services/user-managment/userRegionAccess.services.js";

// /**
//  * @desc    Create region access for a user
//  * @route   POST /api/v1/user-management/user-region-access
//  * @access  Private
//  */
// const createUserRegionAccess = asyncHandler(async (req, res) => {
//   const {
//     userId,
//     scope, //available scope: global, district, block, center
//     districtId = null,
//     blockId = null,
//     centerId = null,
//   } = req.body;

//   
//   // ---------------------------------------------------------
//   // Validate user
//   // ---------------------------------------------------------

//   if (!userId) {
//     throw new ApiError(400, "User ID is required");
//   }

//   if (!mongoose.Types.ObjectId.isValid(userId)) {
//     throw new ApiError(400, "Invalid user ID");
//   }


//   // ---------------------------------------------------------
//   // Validate scope
//   // ---------------------------------------------------------

//   const allowedScopes = [
//     "global",
//     "district",
//     "block",
//     "center",
//   ];

//   if (!scope) {
//     throw new ApiError(400, "Scope is required");
//   }

//   if (!allowedScopes.includes(scope)) {
//     throw new ApiError(
//       400,
//       "Invalid scope. Allowed values are global, district, block, center"
//     );
//   }


//   // ---------------------------------------------------------
//   // Check user
//   // ---------------------------------------------------------

//   const user = await User.findById(userId);

//   if (!user) {
//     throw new ApiError(404, "User not found");
//   }

//   if (!user.isActive) {
//     throw new ApiError(
//       400,
//       "Cannot assign region access to an inactive user"
//     );
//   }


//   // ---------------------------------------------------------
//   // Validate scope-specific IDs
//   // ---------------------------------------------------------

//   if (scope === "global") {
//     if (districtId || blockId || centerId) {
//       throw new ApiError(
//         400,
//         "Global access cannot contain district, block, or center ID"
//       );
//     }
//   }


//   if (scope === "district") {
//     if (!districtId) {
//       throw new ApiError(
//         400,
//         "District ID is required for district scope"
//       );
//     }

//     if (!mongoose.Types.ObjectId.isValid(districtId)) {
//       throw new ApiError(400, "Invalid district ID");
//     }

//     if (blockId || centerId) {
//       throw new ApiError(
//         400,
//         "District scope cannot contain block or center ID"
//       );
//     }

//     const district = await District.findById(districtId);

//     if (!district) {
//       throw new ApiError(404, "District not found");
//     }
//   }


//   if (scope === "block") {
//     if (!blockId) {
//       throw new ApiError(
//         400,
//         "Block ID is required for block scope"
//       );
//     }

//     if (!mongoose.Types.ObjectId.isValid(blockId)) {
//       throw new ApiError(400, "Invalid block ID");
//     }

//     if (districtId || centerId) {
//       throw new ApiError(
//         400,
//         "Block scope cannot contain district or center ID"
//       );
//     }

//     const block = await Block.findById(blockId);

//     if (!block) {
//       throw new ApiError(404, "Block not found");
//     }
//   }


//   if (scope === "center") {
//     if (!centerId) {
//       throw new ApiError(
//         400,
//         "Center ID is required for center scope"
//       );
//     }

//     if (!mongoose.Types.ObjectId.isValid(centerId)) {
//       throw new ApiError(400, "Invalid center ID");
//     }

//     if (districtId || blockId) {
//       throw new ApiError(
//         400,
//         "Center scope cannot contain district or block ID"
//       );
//     }

//     const center = await Center.findById(centerId);

//     if (!center) {
//       throw new ApiError(404, "Center not found");
//     }
//   }


//   // ---------------------------------------------------------
//   // Check duplicate access
//   // ---------------------------------------------------------

//   const duplicateQuery = {
//     userId,
//     scope,
//   };

//   if (scope === "district") {
//     duplicateQuery.districtId = districtId;
//   }

//   if (scope === "block") {
//     duplicateQuery.blockId = blockId;
//   }

//   if (scope === "center") {
//     duplicateQuery.centerId = centerId;
//   }

//   if (scope === "global") {
//     const existingGlobalAccess =
//       await UserRegionAccess.findOne({
//         userId,
//         scope: "global",
//       });

//     if (existingGlobalAccess) {
//       throw new ApiError(
//         409,
//         "Global region access already exists for this user"
//       );
//     }
//   } else {
//     const existingAccess =
//       await UserRegionAccess.findOne(duplicateQuery);

//     if (existingAccess) {
//       throw new ApiError(
//         409,
//         `${scope} access already exists for this user`
//       );
//     }
//   }


//   // ---------------------------------------------------------
//   // Create access
//   // ---------------------------------------------------------

//   const userRegionAccess =
//     await UserRegionAccess.create({
//       userId,
//       scope,
//       districtId:
//         scope === "district" ? districtId : null,
//       blockId:
//         scope === "block" ? blockId : null,
//       centerId:
//         scope === "center" ? centerId : null,
//     });


//   // ---------------------------------------------------------
//   // Get created access
//   // ---------------------------------------------------------

//   const createdAccess =
//     await UserRegionAccess.findById(
//       userRegionAccess._id
//     )
//       .populate("userId", "-password -refreshToken")
//       .populate("districtId")
//       .populate("blockId")
//       .populate("centerId");


//   return res.status(201).json(
//     new ApiResponse(
//       201,
//       createdAccess,
//       "User region access created successfully"
//     )
//   );
// });


// /**
//  * @desc    Get all user region access records
//  * @route   GET /api/v1/user-management/user-region-access
//  * @access  Private
//  */
// const getAllUserRegionAccess = asyncHandler(async (req, res) => {
//   const {
//     page = 1,
//     limit = 10,
//     scope,
//   } = req.query;

//   const pageNumber = Math.max(
//     parseInt(page) || 1,
//     1
//   );

//   const limitNumber = Math.min(
//     Math.max(parseInt(limit) || 10, 1),
//     100
//   );

//   const skip = (pageNumber - 1) * limitNumber;


//   const filter = {};

//   if (scope) {
//     const allowedScopes = [
//       "global",
//       "district",
//       "block",
//       "center",
//     ];

//     if (!allowedScopes.includes(scope)) {
//       throw new ApiError(
//         400,
//         "Invalid scope"
//       );
//     }

//     filter.scope = scope;
//   }


//   const [userRegionAccess, totalRecords] =
//     await Promise.all([
//       UserRegionAccess.find(filter)
//         .populate("userId", "-password -refreshToken")
//         .populate("districtId")
//         .populate("blockId")
//         .populate("centerId")
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(limitNumber),

//       UserRegionAccess.countDocuments(filter),
//     ]);


//   return res.status(200).json(
//     new ApiResponse(
//       200,
//       {
//         userRegionAccess,
//         pagination: {
//           totalRecords,
//           currentPage: pageNumber,
//           totalPages: Math.ceil(
//             totalRecords / limitNumber
//           ),
//           limit: limitNumber,
//         },
//       },
//       "User region access records fetched successfully"
//     )
//   );
// });


// /**
//  * @desc    Get all region access assignments of a user
//  * @route   GET /api/v1/user-management/user-region-access/user/:userId
//  * @access  Private
//  */
// const getUserRegionAccessByUserId = asyncHandler(
//   async (req, res) => {
//     const { userId } = req.params;

//     if (!mongoose.Types.ObjectId.isValid(userId)) {
//       throw new ApiError(
//         400,
//         "Invalid user ID"
//       );
//     }

//     const user = await User.findById(userId);

//     if (!user) {
//       throw new ApiError(
//         404,
//         "User not found"
//       );
//     }


//     const userRegionAccess =
//       await UserRegionAccess.find({ userId })
//         .populate("districtId")
//         .populate("blockId")
//         .populate("centerId")
//         .sort({ createdAt: -1 });


//     if (userRegionAccess.length === 0) {
//       throw new ApiError(
//         404,
//         "Region access not found for this user"
//       );
//     }


//     return res.status(200).json(
//       new ApiResponse(
//         200,
//         userRegionAccess,
//         "User region access fetched successfully"
//       )
//     );
//   }
// );


// /**
//  * @desc    Update a specific region access assignment
//  * @route   PATCH /api/v1/user-management/user-region-access/:userRegionAccessId
//  * @access  Private
//  */
// const updateUserRegionAccess = asyncHandler(
//   async (req, res) => {
//     const { userRegionAccessId } = req.params;

//     const {
//       scope,
//       districtId = null,
//       blockId = null,
//       centerId = null,
//     } = req.body;


//     if (
//       !mongoose.Types.ObjectId.isValid(
//         userRegionAccessId
//       )
//     ) {
//       throw new ApiError(
//         400,
//         "Invalid user region access ID"
//       );
//     }


//     const allowedScopes = [
//       "global",
//       "district",
//       "block",
//       "center",
//     ];

//     if (!scope) {
//       throw new ApiError(
//         400,
//         "Scope is required"
//       );
//     }

//     if (!allowedScopes.includes(scope)) {
//       throw new ApiError(
//         400,
//         "Invalid scope"
//       );
//     }


//     const userRegionAccess =
//       await UserRegionAccess.findById(
//         userRegionAccessId
//       );


//     if (!userRegionAccess) {
//       throw new ApiError(
//         404,
//         "User region access not found"
//       );
//     }


//     // -------------------------------------------------------
//     // Validate scope-specific data
//     // -------------------------------------------------------

//     if (scope === "global") {
//       if (districtId || blockId || centerId) {
//         throw new ApiError(
//           400,
//           "Global access cannot contain district, block, or center ID"
//         );
//       }
//     }


//     if (scope === "district") {
//       if (!districtId) {
//         throw new ApiError(
//           400,
//           "District ID is required for district scope"
//         );
//       }

//       if (!mongoose.Types.ObjectId.isValid(districtId)) {
//         throw new ApiError(
//           400,
//           "Invalid district ID"
//         );
//       }

//       if (blockId || centerId) {
//         throw new ApiError(
//           400,
//           "District scope cannot contain block or center ID"
//         );
//       }

//       const district =
//         await District.findById(districtId);

//       if (!district) {
//         throw new ApiError(
//           404,
//           "District not found"
//         );
//       }
//     }


//     if (scope === "block") {
//       if (!blockId) {
//         throw new ApiError(
//           400,
//           "Block ID is required for block scope"
//         );
//       }

//       if (!mongoose.Types.ObjectId.isValid(blockId)) {
//         throw new ApiError(
//           400,
//           "Invalid block ID"
//         );
//       }

//       if (districtId || centerId) {
//         throw new ApiError(
//           400,
//           "Block scope cannot contain district or center ID"
//         );
//       }

//       const block =
//         await Block.findById(blockId);

//       if (!block) {
//         throw new ApiError(
//           404,
//           "Block not found"
//         );
//       }
//     }


//     if (scope === "center") {
//       if (!centerId) {
//         throw new ApiError(
//           400,
//           "Center ID is required for center scope"
//         );
//       }

//       if (!mongoose.Types.ObjectId.isValid(centerId)) {
//         throw new ApiError(
//           400,
//           "Invalid center ID"
//         );
//       }

//       if (districtId || blockId) {
//         throw new ApiError(
//           400,
//           "Center scope cannot contain district or block ID"
//         );
//       }

//       const center =
//         await Center.findById(centerId);

//       if (!center) {
//         throw new ApiError(
//           404,
//           "Center not found"
//         );
//       }
//     }


//     // -------------------------------------------------------
//     // Check duplicate assignment
//     // -------------------------------------------------------

//     const duplicateQuery = {
//       userId: userRegionAccess.userId,
//       scope,
//       _id: {
//         $ne: userRegionAccessId,
//       },
//     };


//     if (scope === "district") {
//       duplicateQuery.districtId = districtId;
//     }

//     if (scope === "block") {
//       duplicateQuery.blockId = blockId;
//     }

//     if (scope === "center") {
//       duplicateQuery.centerId = centerId;
//     }


//     const duplicateAccess =
//       await UserRegionAccess.findOne(
//         duplicateQuery
//       );


//     if (duplicateAccess) {
//       throw new ApiError(
//         409,
//         "This region access already exists for the user"
//       );
//     }


//     // -------------------------------------------------------
//     // Update assignment
//     // -------------------------------------------------------

//     userRegionAccess.scope = scope;

//     userRegionAccess.districtId =
//       scope === "district"
//         ? districtId
//         : null;

//     userRegionAccess.blockId =
//       scope === "block"
//         ? blockId
//         : null;

//     userRegionAccess.centerId =
//       scope === "center"
//         ? centerId
//         : null;


//     await userRegionAccess.save();


//     const updatedAccess =
//       await UserRegionAccess.findById(
//         userRegionAccess._id
//       )
//         .populate("userId", "-password -refreshToken")
//         .populate("districtId")
//         .populate("blockId")
//         .populate("centerId");


//     return res.status(200).json(
//       new ApiResponse(
//         200,
//         updatedAccess,
//         "User region access updated successfully"
//       )
//     );
//   }
// );


// /**
//  * @desc    Delete a user's region access assignment
//  * @route   DELETE /api/v1/user-management/user-region-access/:userRegionAccessId
//  * @access  Private
//  */
// const deleteUserRegionAccess = asyncHandler(
//   async (req, res) => {
//     const { userRegionAccessId } = req.params;


//     if (
//       !mongoose.Types.ObjectId.isValid(
//         userRegionAccessId
//       )
//     ) {
//       throw new ApiError(
//         400,
//         "Invalid user region access ID"
//       );
//     }


//     const userRegionAccess =
//       await UserRegionAccess.findById(
//         userRegionAccessId
//       );


//     if (!userRegionAccess) {
//       throw new ApiError(
//         404,
//         "User region access not found"
//       );
//     }


//     await UserRegionAccess.findByIdAndDelete(
//       userRegionAccessId
//     );


//     return res.status(200).json(
//       new ApiResponse(
//         200,
//         null,
//         "User region access deleted successfully"
//       )
//     );
//   }
// );


// /**
//  * Get region access of the currently logged-in user
//  *
//  * @desc    Get my region access
//  * @route   GET /api/v1/user-management/user-region-access/me
//  * @access  Private
//  */
// const getMyRegionAccess = asyncHandler(async (req, res) => {
//   const userRegionAccess = await getUserRegionAccess(req.user._id);

//   return res
//     .status(200)
//     .json(
//       new ApiResponse(
//         200,
//         userRegionAccess,
//         "User region access fetched successfully"
//       )
//     );
// });



// export {
//   createUserRegionAccess,
//   getAllUserRegionAccess,
//   getUserRegionAccessByUserId,
//   updateUserRegionAccess,
//   deleteUserRegionAccess,
//   getMyRegionAccess
// };










import mongoose from "mongoose";

import { User } from "../../models/user.models.js";
import { District } from "../../models/region-management/district.models.js";
import { Block } from "../../models/region-management/block.models.js";
import { Center } from "../../models/region-management/center.models.js";
import { UserRegionAccess } from "../../models/user-management/userRegionAccess.models.js";

import { asyncHandler } from "../../utils/async-handler.js";
import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";

import {
  getUserRegionAccess,
  getMergedUserRegionAccess,
} from "../../services/user-managment/userRegionAccess.services.js";

/**
 * @desc    Create region access for a user
 * @route   POST /api/v1/user-management/user-region-access
 * @access  Private
 */
const createUserRegionAccess = asyncHandler(async (req, res) => {
  const {
    userId,
    scope, // available scope: global, district, block, center
    districtId = null,
    blockId = null,
    centerId = null,
  } = req.body;


  // ---------------------------------------------------------
  // Validate user
  // ---------------------------------------------------------

  if (!userId) {
    throw new ApiError(400, "User ID is required");
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user ID");
  }

  // ---------------------------------------------------------
  // Validate scope
  // ---------------------------------------------------------

  const allowedScopes = [
    "global",
    "district",
    "block",
    "center",
  ];

  if (!scope) {
    throw new ApiError(400, "Scope is required");
  }

  if (!allowedScopes.includes(scope)) {
    throw new ApiError(
      400,
      "Invalid scope. Allowed values are global, district, block, center"
    );
  }

  // ---------------------------------------------------------
  // Check user
  // ---------------------------------------------------------

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!user.isActive) {
    throw new ApiError(
      400,
      "Cannot assign region access to an inactive user"
    );
  }

  // ---------------------------------------------------------
  // Resolved region IDs
  // ---------------------------------------------------------
  //
  // These are the IDs that will actually be stored.
  //
  // global:
  //   districtId = null
  //   blockId    = null
  //   centerId   = null
  //
  // district:
  //   districtId = assigned district
  //   blockId    = null
  //   centerId   = null
  //
  // block:
  //   districtId = block's district
  //   blockId    = assigned block
  //   centerId   = null
  //
  // center:
  //   districtId = center's district
  //   blockId    = center's block
  //   centerId   = assigned center
  //
  // ---------------------------------------------------------

  let resolvedDistrictId = null;
  let resolvedBlockId = null;
  let resolvedCenterId = null;

  // ---------------------------------------------------------
  // Validate scope-specific IDs
  // ---------------------------------------------------------

  if (scope === "global") {
    if (districtId || blockId || centerId) {
      throw new ApiError(
        400,
        "Global access cannot contain district, block, or center ID"
      );
    }

    resolvedDistrictId = null;
    resolvedBlockId = null;
    resolvedCenterId = null;
  }

  // ---------------------------------------------------------
  // DISTRICT SCOPE
  // ---------------------------------------------------------

  if (scope === "district") {
    if (!districtId) {
      throw new ApiError(
        400,
        "District ID is required for district scope"
      );
    }

    if (!mongoose.Types.ObjectId.isValid(districtId)) {
      throw new ApiError(400, "Invalid district ID");
    }

    if (blockId || centerId) {
      throw new ApiError(
        400,
        "District scope cannot contain block or center ID"
      );
    }

    const district = await District.findById(districtId);

    if (!district) {
      throw new ApiError(404, "District not found");
    }

    resolvedDistrictId = district._id;
    resolvedBlockId = null;
    resolvedCenterId = null;
  }

  // ---------------------------------------------------------
  // BLOCK SCOPE
  // ---------------------------------------------------------

  if (scope === "block") {
    if (!blockId) {
      throw new ApiError(
        400,
        "Block ID is required for block scope"
      );
    }

    if (!mongoose.Types.ObjectId.isValid(blockId)) {
      throw new ApiError(400, "Invalid block ID");
    }

    if (districtId || centerId) {
      throw new ApiError(
        400,
        "Block scope cannot contain district or center ID"
      );
    }

    const block = await Block.findById(blockId);

    if (!block) {
      throw new ApiError(404, "Block not found");
    }

    // Block itself tells us its district.
    resolvedDistrictId = block.districtId;
    resolvedBlockId = block._id;
    resolvedCenterId = null;
  }

  // ---------------------------------------------------------
  // CENTER SCOPE
  // ---------------------------------------------------------

  if (scope === "center") {
    if (!centerId) {
      throw new ApiError(
        400,
        "Center ID is required for center scope"
      );
    }

    if (!mongoose.Types.ObjectId.isValid(centerId)) {
      throw new ApiError(400, "Invalid center ID");
    }

    if (districtId || blockId) {
      throw new ApiError(
        400,
        "Center scope cannot contain district or block ID"
      );
    }

    const center = await Center.findById(centerId);

    if (!center) {
      throw new ApiError(404, "Center not found");
    }

    // Center itself tells us its district and block.
    resolvedDistrictId = center.districtId;
    resolvedBlockId = center.blockId;
    resolvedCenterId = center._id;
  }

  // ---------------------------------------------------------
  // Check duplicate access
  // ---------------------------------------------------------

  const duplicateQuery = {
    userId,
    scope,
  };

  if (scope === "district") {
    duplicateQuery.districtId = resolvedDistrictId;
  }

  if (scope === "block") {
    duplicateQuery.blockId = resolvedBlockId;
  }

  if (scope === "center") {
    duplicateQuery.centerId = resolvedCenterId;
  }

  if (scope === "global") {
    const existingGlobalAccess =
      await UserRegionAccess.findOne({
        userId,
        scope: "global",
      });

    if (existingGlobalAccess) {
      throw new ApiError(
        409,
        "Global region access already exists for this user"
      );
    }
  } else {
    const existingAccess =
      await UserRegionAccess.findOne(duplicateQuery);

    if (existingAccess) {
      throw new ApiError(
        409,
        `${scope} access already exists for this user`
      );
    }
  }

  // ---------------------------------------------------------
  // Create access
  // ---------------------------------------------------------

  const userRegionAccess =
    await UserRegionAccess.create({
      userId,
      scope,

      districtId: resolvedDistrictId,
      blockId: resolvedBlockId,
      centerId: resolvedCenterId,
    });

  // ---------------------------------------------------------
  // Get created access
  // ---------------------------------------------------------

  const createdAccess =
    await UserRegionAccess.findById(
      userRegionAccess._id
    )
      .populate("userId", "-password -refreshToken")
      .populate("districtId")
      .populate("blockId")
      .populate("centerId");

  return res.status(201).json(
    new ApiResponse(
      201,
      createdAccess,
      "User region access created successfully"
    )
  );
});

/**
 * @desc    Get all user region access records
 * @route   GET /api/v1/user-management/user-region-access
 * @access  Private
 */
const getAllUserRegionAccess = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    scope,
  } = req.query;

  const pageNumber = Math.max(
    parseInt(page) || 1,
    1
  );

  const limitNumber = Math.min(
    Math.max(parseInt(limit) || 10, 1),
    100
  );

  const skip = (pageNumber - 1) * limitNumber;

  const filter = {};

  if (scope) {
    const allowedScopes = [
      "global",
      "district",
      "block",
      "center",
    ];

    if (!allowedScopes.includes(scope)) {
      throw new ApiError(
        400,
        "Invalid scope"
      );
    }

    filter.scope = scope;
  }

  const [userRegionAccess, totalRecords] =
    await Promise.all([
      UserRegionAccess.find(filter)
        .populate("userId", "-password -refreshToken")
        .populate("districtId")
        .populate("blockId")
        .populate("centerId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNumber),

      UserRegionAccess.countDocuments(filter),
    ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        userRegionAccess,
        pagination: {
          totalRecords,
          currentPage: pageNumber,
          totalPages: Math.ceil(
            totalRecords / limitNumber
          ),
          limit: limitNumber,
        },
      },
      "User region access records fetched successfully"
    )
  );
});

/**
 * @desc    Get all region access assignments of a user
 * @route   GET /api/v1/user-management/user-region-access/user/:userId
 * @access  Private
 */
const getUserRegionAccessByUserId = asyncHandler(
  async (req, res) => {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ApiError(
        400,
        "Invalid user ID"
      );
    }

    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(
        404,
        "User not found"
      );
    }

    const userRegionAccess =
      await UserRegionAccess.find({ userId })
        .populate("districtId")
        .populate("blockId")
        .populate("centerId")
        .sort({ createdAt: -1 });

    if (userRegionAccess.length === 0) {
      throw new ApiError(
        404,
        "Region access not found for this user"
      );
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        userRegionAccess,
        "User region access fetched successfully"
      )
    );
  }
);

/**
 * @desc    Update a specific region access assignment
 * @route   PATCH /api/v1/user-management/user-region-access/:userRegionAccessId
 * @access  Private
 */
const updateUserRegionAccess = asyncHandler(
  async (req, res) => {
    const { userRegionAccessId } = req.params;

    const {
      scope,
      districtId = null,
      blockId = null,
      centerId = null,
    } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(
        userRegionAccessId
      )
    ) {
      throw new ApiError(
        400,
        "Invalid user region access ID"
      );
    }

    const allowedScopes = [
      "global",
      "district",
      "block",
      "center",
    ];

    if (!scope) {
      throw new ApiError(
        400,
        "Scope is required"
      );
    }

    if (!allowedScopes.includes(scope)) {
      throw new ApiError(
        400,
        "Invalid scope"
      );
    }

    const userRegionAccess =
      await UserRegionAccess.findById(
        userRegionAccessId
      );

    if (!userRegionAccess) {
      throw new ApiError(
        404,
        "User region access not found"
      );
    }

    // -------------------------------------------------------
    // Resolved region IDs
    // -------------------------------------------------------

    let resolvedDistrictId = null;
    let resolvedBlockId = null;
    let resolvedCenterId = null;

    // -------------------------------------------------------
    // GLOBAL
    // -------------------------------------------------------

    if (scope === "global") {
      if (districtId || blockId || centerId) {
        throw new ApiError(
          400,
          "Global access cannot contain district, block, or center ID"
        );
      }

      resolvedDistrictId = null;
      resolvedBlockId = null;
      resolvedCenterId = null;
    }

    // -------------------------------------------------------
    // DISTRICT
    // -------------------------------------------------------

    if (scope === "district") {
      if (!districtId) {
        throw new ApiError(
          400,
          "District ID is required for district scope"
        );
      }

      if (!mongoose.Types.ObjectId.isValid(districtId)) {
        throw new ApiError(
          400,
          "Invalid district ID"
        );
      }

      if (blockId || centerId) {
        throw new ApiError(
          400,
          "District scope cannot contain block or center ID"
        );
      }

      const district =
        await District.findById(districtId);

      if (!district) {
        throw new ApiError(
          404,
          "District not found"
        );
      }

      resolvedDistrictId = district._id;
      resolvedBlockId = null;
      resolvedCenterId = null;
    }

    // -------------------------------------------------------
    // BLOCK
    // -------------------------------------------------------

    if (scope === "block") {
      if (!blockId) {
        throw new ApiError(
          400,
          "Block ID is required for block scope"
        );
      }

      if (!mongoose.Types.ObjectId.isValid(blockId)) {
        throw new ApiError(
          400,
          "Invalid block ID"
        );
      }

      if (districtId || centerId) {
        throw new ApiError(
          400,
          "Block scope cannot contain district or center ID"
        );
      }

      const block =
        await Block.findById(blockId);

      if (!block) {
        throw new ApiError(
          404,
          "Block not found"
        );
      }

      // Resolve district automatically from block.
      resolvedDistrictId = block.districtId;
      resolvedBlockId = block._id;
      resolvedCenterId = null;
    }

    // -------------------------------------------------------
    // CENTER
    // -------------------------------------------------------

    if (scope === "center") {
      if (!centerId) {
        throw new ApiError(
          400,
          "Center ID is required for center scope"
        );
      }

      if (!mongoose.Types.ObjectId.isValid(centerId)) {
        throw new ApiError(
          400,
          "Invalid center ID"
        );
      }

      if (districtId || blockId) {
        throw new ApiError(
          400,
          "Center scope cannot contain district or block ID"
        );
      }

      const center =
        await Center.findById(centerId);

      if (!center) {
        throw new ApiError(
          404,
          "Center not found"
        );
      }

      // Resolve district and block automatically from center.
      resolvedDistrictId = center.districtId;
      resolvedBlockId = center.blockId;
      resolvedCenterId = center._id;
    }

    // -------------------------------------------------------
    // Check duplicate assignment
    // -------------------------------------------------------

    const duplicateQuery = {
      userId: userRegionAccess.userId,
      scope,
      _id: {
        $ne: userRegionAccessId,
      },
    };

    if (scope === "district") {
      duplicateQuery.districtId =
        resolvedDistrictId;
    }

    if (scope === "block") {
      duplicateQuery.blockId =
        resolvedBlockId;
    }

    if (scope === "center") {
      duplicateQuery.centerId =
        resolvedCenterId;
    }

    const duplicateAccess =
      await UserRegionAccess.findOne(
        duplicateQuery
      );

    if (duplicateAccess) {
      throw new ApiError(
        409,
        "This region access already exists for the user"
      );
    }

    // -------------------------------------------------------
    // Update assignment
    // -------------------------------------------------------

    userRegionAccess.scope = scope;

    userRegionAccess.districtId =
      resolvedDistrictId;

    userRegionAccess.blockId =
      resolvedBlockId;

    userRegionAccess.centerId =
      resolvedCenterId;

    await userRegionAccess.save();

    // -------------------------------------------------------
    // Get updated access
    // -------------------------------------------------------

    const updatedAccess =
      await UserRegionAccess.findById(
        userRegionAccess._id
      )
        .populate("userId", "-password -refreshToken")
        .populate("districtId")
        .populate("blockId")
        .populate("centerId");

    return res.status(200).json(
      new ApiResponse(
        200,
        updatedAccess,
        "User region access updated successfully"
      )
    );
  }
);

/**
 * @desc    Delete a user's region access assignment
 * @route   DELETE /api/v1/user-management/user-region-access/:userRegionAccessId
 * @access  Private
 */
const deleteUserRegionAccess = asyncHandler(
  async (req, res) => {
    const { userRegionAccessId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(
        userRegionAccessId
      )
    ) {
      throw new ApiError(
        400,
        "Invalid user region access ID"
      );
    }

    const userRegionAccess =
      await UserRegionAccess.findById(
        userRegionAccessId
      );

    if (!userRegionAccess) {
      throw new ApiError(
        404,
        "User region access not found"
      );
    }

    await UserRegionAccess.findByIdAndDelete(
      userRegionAccessId
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        null,
        "User region access deleted successfully"
      )
    );
  }
);

/**
 * Get region access of the currently logged-in user
 *
 * @desc    Get my region access
 * @route   GET /api/v1/user-management/user-region-access/me
 * @access  Private
 */
const getMyRegionAccess = asyncHandler(async (req, res) => {
  const userRegionAccess =
    await getUserRegionAccess(req.user._id);

  return res.status(200).json(
    new ApiResponse(
      200,
      userRegionAccess,
      "User region access fetched successfully"
    )
  );
});





/**
 * @desc    Get merged effective region access of logged-in user
 * @route   GET /api/v1/user-management/user-region-access/me/regions
 * @access  Private
 */

const getMyMergedRegionAccess = asyncHandler(
  async (req, res) => {
    // ==========================================================
    // LOGGED-IN USER
    // ==========================================================

    const userId =
      req.user?._id;


    if (!userId) {
      throw new ApiError(
        401,
        "Authenticated user not found"
      );
    }

    // ==========================================================
    // GET MERGED REGION ACCESS
    // ==========================================================

    const regionAccess =
      await getMergedUserRegionAccess(
        userId
      );

    // ==========================================================
    // RESPONSE
    // ==========================================================

    return res.status(200).json(
      new ApiResponse(
        200,
        regionAccess,
        "Merged user region access fetched successfully"
      )
    );
  }
);

export {
  createUserRegionAccess,
  getAllUserRegionAccess,
  getUserRegionAccessByUserId,
  updateUserRegionAccess,
  deleteUserRegionAccess,
  getMyRegionAccess,

  getMyMergedRegionAccess
};