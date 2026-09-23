import mongoose from "mongoose";
import XLSX from "xlsx";

import { CallingDetails } from "../../models/calling-management/callingDetails.models.js";
import { CallingType } from "../../models/calling-management/callingType.models.js";

import { ApiError } from "../../utils/api-error.js";
import { ApiResponse } from "../../utils/api-response.js";
import { asyncHandler } from "../../utils/async-handler.js";

import { Student } from "../../models/student-management/student.models.js";
import { StudentEnrollment } from "../../models/student-management/studentEnrollment.models.js";
import { StudentAttendance } from "../../models/student-management/studentAttendance.models.js";


import {
    getCallingUserAccess,
    hasProgramAccess,
    hasBatchAccess,
    hasRegionAccess,
} from "../../utils/calling-access.utils.js";


// Create Calling Details
const createCallingDetails = asyncHandler(async (req, res) => {
    const {
        callingTypeId,
        enrollmentId,
        studentId,
        calledDistrict,
        calledBlock,
        calledCenter,
        assignedTo,
        calledTo,
        father,
        contact1,
        contact2,
        contact3,
        callingStatus,
        remark,
        comment,
        additionalInformation1,
        additionalInformation2,
        additionalInformation3,
        additionalInformation4,
        additionalInformation5,
        additionalInformation6,
        additionalInformation7,
        additionalInformation8,
        additionalInformation9,
        additionalInformation10,
        additionalInfo,
        callingData,
    } = req.body;


    if (!callingTypeId) {
        throw new ApiError(
            400,
            "callingTypeId is required"
        );
    }


    if (
        !mongoose.Types.ObjectId.isValid(
            callingTypeId
        )
    ) {
        throw new ApiError(
            400,
            "Invalid callingTypeId"
        );
    }


    if (!calledTo) {
        throw new ApiError(
            400,
            "calledTo is required"
        );
    }


    const callingType =
        await CallingType.findById(
            callingTypeId
        );


    if (!callingType) {
        throw new ApiError(
            404,
            "Calling type not found"
        );
    }


    if (
        enrollmentId &&
        !mongoose.Types.ObjectId.isValid(
            enrollmentId
        )
    ) {
        throw new ApiError(
            400,
            "Invalid enrollmentId"
        );
    }


    if (
        studentId &&
        !mongoose.Types.ObjectId.isValid(
            studentId
        )
    ) {
        throw new ApiError(
            400,
            "Invalid studentId"
        );
    }


    if (
        calledDistrict &&
        !mongoose.Types.ObjectId.isValid(
            calledDistrict
        )
    ) {
        throw new ApiError(
            400,
            "Invalid calledDistrict"
        );
    }


    if (
        calledBlock &&
        !mongoose.Types.ObjectId.isValid(
            calledBlock
        )
    ) {
        throw new ApiError(
            400,
            "Invalid calledBlock"
        );
    }


    if (
        calledCenter &&
        !mongoose.Types.ObjectId.isValid(
            calledCenter
        )
    ) {
        throw new ApiError(
            400,
            "Invalid calledCenter"
        );
    }


    if (assignedTo !== undefined) {
        if (!Array.isArray(assignedTo)) {
            throw new ApiError(
                400,
                "assignedTo must be an array"
            );
        }


        for (const userId of assignedTo) {
            if (
                !mongoose.Types.ObjectId.isValid(
                    userId
                )
            ) {
                throw new ApiError(
                    400,
                    "Invalid user ID in assignedTo"
                );
            }
        }
    }


    const callingDetails =
        await CallingDetails.create({
            callingTypeId,

            enrollmentId:
                enrollmentId || null,

            studentId:
                studentId || null,

            calledDistrict:
                calledDistrict || null,

            calledBlock:
                calledBlock || null,

            calledCenter:
                calledCenter || null,

            assignedTo:
                assignedTo || [],

            calledTo:
                calledTo.trim(),

            father:
                father?.trim() || "",

            contact1:
                contact1?.trim() || "",

            contact2:
                contact2?.trim() || "",

            contact3:
                contact3?.trim() || "",

            callingStatus:
                callingStatus?.trim() || "",

            remark:
                remark?.trim() || "",

            comment:
                comment?.trim() || "",

            additionalInformation1,
            additionalInformation2,
            additionalInformation3,
            additionalInformation4,
            additionalInformation5,
            additionalInformation6,
            additionalInformation7,
            additionalInformation8,
            additionalInformation9,
            additionalInformation10,

            additionalInfo:
                additionalInfo ?? null,

            callingData:
                callingData ?? null,
        });


    return res.status(201).json(
        new ApiResponse(
            201,
            { callingDetails },
            "Calling details created successfully"
        )
    );
});


// Get All Calling Details
const getCallingDetails = asyncHandler(async (req, res) => {
    let {
        page = 1,
        limit = 20,
        search = "",
        callingTypeId,
        studentId,
        enrollmentId,
        assignedTo,
        calledDistrict,
        calledBlock,
        calledCenter,
        callingStatus,
    } = req.query;


    page = Math.max(
        Number(page) || 1,
        1
    );


    limit = Math.min(
        Math.max(
            Number(limit) || 20,
            1
        ),
        100
    );


    const skip =
        (page - 1) * limit;

    const query = {};


    if (callingTypeId) {
        if (
            !mongoose.Types.ObjectId.isValid(
                callingTypeId
            )
        ) {
            throw new ApiError(
                400,
                "Invalid callingTypeId"
            );
        }

        query.callingTypeId =
            callingTypeId;
    }


    if (studentId) {
        if (
            !mongoose.Types.ObjectId.isValid(
                studentId
            )
        ) {
            throw new ApiError(
                400,
                "Invalid studentId"
            );
        }

        query.studentId =
            studentId;
    }


    if (enrollmentId) {
        if (
            !mongoose.Types.ObjectId.isValid(
                enrollmentId
            )
        ) {
            throw new ApiError(
                400,
                "Invalid enrollmentId"
            );
        }

        query.enrollmentId =
            enrollmentId;
    }


    if (assignedTo) {
        if (
            !mongoose.Types.ObjectId.isValid(
                assignedTo
            )
        ) {
            throw new ApiError(
                400,
                "Invalid assignedTo"
            );
        }

        query.assignedTo =
            assignedTo;
    }


    if (calledDistrict) {
        if (
            !mongoose.Types.ObjectId.isValid(
                calledDistrict
            )
        ) {
            throw new ApiError(
                400,
                "Invalid calledDistrict"
            );
        }

        query.calledDistrict =
            calledDistrict;
    }


    if (calledBlock) {
        if (
            !mongoose.Types.ObjectId.isValid(
                calledBlock
            )
        ) {
            throw new ApiError(
                400,
                "Invalid calledBlock"
            );
        }

        query.calledBlock =
            calledBlock;
    }


    if (calledCenter) {
        if (
            !mongoose.Types.ObjectId.isValid(
                calledCenter
            )
        ) {
            throw new ApiError(
                400,
                "Invalid calledCenter"
            );
        }

        query.calledCenter =
            calledCenter;
    }


    if (callingStatus) {
        query.callingStatus =
            callingStatus;
    }


    if (search.trim()) {
        query.$or = [
            {
                calledTo: {
                    $regex:
                        search.trim(),
                    $options: "i",
                },
            },
            {
                father: {
                    $regex:
                        search.trim(),
                    $options: "i",
                },
            },
            {
                contact1: {
                    $regex:
                        search.trim(),
                    $options: "i",
                },
            },
            {
                contact2: {
                    $regex:
                        search.trim(),
                    $options: "i",
                },
            },
            {
                contact3: {
                    $regex:
                        search.trim(),
                    $options: "i",
                },
            },
        ];
    }


    const [
        callingDetails,
        total,
    ] = await Promise.all([
        CallingDetails.find(query)
            .populate(
                "callingTypeId",
                "callingTitle callingTypeCode callingTo"
            )
            .populate(
                "assignedTo",
                "name email"
            )
            .sort({
                createdAt: -1,
            })
            .skip(skip)
            .limit(limit),

        CallingDetails.countDocuments(
            query
        ),
    ]);


    return res.status(200).json(
        new ApiResponse(
            200,
            {
                callingDetails,

                pagination: {
                    page,
                    limit,
                    total,
                    totalPages:
                        Math.ceil(
                            total / limit
                        ),
                },
            },
            "Calling details fetched successfully"
        )
    );
});


// Get Calling Details By ID
const getCallingDetailsById = asyncHandler(async (req, res) => {
    const {
        callingDetailsId,
    } = req.params;


    if (
        !mongoose.Types.ObjectId.isValid(
            callingDetailsId
        )
    ) {
        throw new ApiError(
            400,
            "Invalid callingDetailsId"
        );
    }


    const callingDetails =
        await CallingDetails.findById(
            callingDetailsId
        )
            .populate(
                "callingTypeId"
            )
            .populate(
                "assignedTo",
                "name email"
            );


    if (!callingDetails) {
        throw new ApiError(
            404,
            "Calling details not found"
        );
    }


    return res.status(200).json(
        new ApiResponse(
            200,
            { callingDetails },
            "Calling details fetched successfully"
        )
    );
});


// Update Calling Details
const updateCallingDetails = asyncHandler(async (req, res) => {
    const {
        callingDetailsId,
    } = req.params;


    if (
        !mongoose.Types.ObjectId.isValid(
            callingDetailsId
        )
    ) {
        throw new ApiError(
            400,
            "Invalid callingDetailsId"
        );
    }


    const callingDetails =
        await CallingDetails.findById(
            callingDetailsId
        );


    if (!callingDetails) {
        throw new ApiError(
            404,
            "Calling details not found"
        );
    }


    const {
        callingTypeId,
        enrollmentId,
        studentId,
        calledDistrict,
        calledBlock,
        calledCenter,
        assignedTo,
        calledTo,
        father,
        contact1,
        contact2,
        contact3,
        callingStatus,
        remark,
        comment,
        additionalInformation1,
        additionalInformation2,
        additionalInformation3,
        additionalInformation4,
        additionalInformation5,
        additionalInformation6,
        additionalInformation7,
        additionalInformation8,
        additionalInformation9,
        additionalInformation10,
        additionalInfo,
        callingData,
    } = req.body;


    if (callingTypeId !== undefined) {
        if (
            !mongoose.Types.ObjectId.isValid(
                callingTypeId
            )
        ) {
            throw new ApiError(
                400,
                "Invalid callingTypeId"
            );
        }


        const callingType =
            await CallingType.findById(
                callingTypeId
            );


        if (!callingType) {
            throw new ApiError(
                404,
                "Calling type not found"
            );
        }


        callingDetails.callingTypeId =
            callingTypeId;
    }


    if (enrollmentId !== undefined) {
        if (
            enrollmentId !== null &&
            !mongoose.Types.ObjectId.isValid(
                enrollmentId
            )
        ) {
            throw new ApiError(
                400,
                "Invalid enrollmentId"
            );
        }

        callingDetails.enrollmentId =
            enrollmentId || null;
    }


    if (studentId !== undefined) {
        if (
            studentId !== null &&
            !mongoose.Types.ObjectId.isValid(
                studentId
            )
        ) {
            throw new ApiError(
                400,
                "Invalid studentId"
            );
        }

        callingDetails.studentId =
            studentId || null;
    }


    if (calledDistrict !== undefined) {
        if (
            calledDistrict !== null &&
            !mongoose.Types.ObjectId.isValid(
                calledDistrict
            )
        ) {
            throw new ApiError(
                400,
                "Invalid calledDistrict"
            );
        }

        callingDetails.calledDistrict =
            calledDistrict || null;
    }


    if (calledBlock !== undefined) {
        if (
            calledBlock !== null &&
            !mongoose.Types.ObjectId.isValid(
                calledBlock
            )
        ) {
            throw new ApiError(
                400,
                "Invalid calledBlock"
            );
        }

        callingDetails.calledBlock =
            calledBlock || null;
    }


    if (calledCenter !== undefined) {
        if (
            calledCenter !== null &&
            !mongoose.Types.ObjectId.isValid(
                calledCenter
            )
        ) {
            throw new ApiError(
                400,
                "Invalid calledCenter"
            );
        }

        callingDetails.calledCenter =
            calledCenter || null;
    }


    if (assignedTo !== undefined) {
        if (!Array.isArray(assignedTo)) {
            throw new ApiError(
                400,
                "assignedTo must be an array"
            );
        }


        for (const userId of assignedTo) {
            if (
                !mongoose.Types.ObjectId.isValid(
                    userId
                )
            ) {
                throw new ApiError(
                    400,
                    "Invalid user ID in assignedTo"
                );
            }
        }


        callingDetails.assignedTo =
            assignedTo;
    }


    if (calledTo !== undefined) {
        if (!calledTo.trim()) {
            throw new ApiError(
                400,
                "calledTo cannot be empty"
            );
        }

        callingDetails.calledTo =
            calledTo.trim();
    }


    if (father !== undefined) {
        callingDetails.father =
            father?.trim() || "";
    }


    if (contact1 !== undefined) {
        callingDetails.contact1 =
            contact1?.trim() || "";
    }


    if (contact2 !== undefined) {
        callingDetails.contact2 =
            contact2?.trim() || "";
    }


    if (contact3 !== undefined) {
        callingDetails.contact3 =
            contact3?.trim() || "";
    }


    if (callingStatus !== undefined) {
        callingDetails.callingStatus =
            callingStatus?.trim() || "";
    }


    if (remark !== undefined) {
        callingDetails.remark =
            remark?.trim() || "";
    }


    if (comment !== undefined) {
        callingDetails.comment =
            comment?.trim() || "";
    }


    if (
        additionalInformation1 !==
        undefined
    ) {
        callingDetails.additionalInformation1 =
            additionalInformation1;
    }


    if (
        additionalInformation2 !==
        undefined
    ) {
        callingDetails.additionalInformation2 =
            additionalInformation2;
    }


    if (
        additionalInformation3 !==
        undefined
    ) {
        callingDetails.additionalInformation3 =
            additionalInformation3;
    }


    if (
        additionalInformation4 !==
        undefined
    ) {
        callingDetails.additionalInformation4 =
            additionalInformation4;
    }


    if (
        additionalInformation5 !==
        undefined
    ) {
        callingDetails.additionalInformation5 =
            additionalInformation5;
    }


    if (
        additionalInformation6 !==
        undefined
    ) {
        callingDetails.additionalInformation6 =
            additionalInformation6;
    }


    if (
        additionalInformation7 !==
        undefined
    ) {
        callingDetails.additionalInformation7 =
            additionalInformation7;
    }


    if (
        additionalInformation8 !==
        undefined
    ) {
        callingDetails.additionalInformation8 =
            additionalInformation8;
    }


    if (
        additionalInformation9 !==
        undefined
    ) {
        callingDetails.additionalInformation9 =
            additionalInformation9;
    }


    if (
        additionalInformation10 !==
        undefined
    ) {
        callingDetails.additionalInformation10 =
            additionalInformation10;
    }


    if (additionalInfo !== undefined) {
        callingDetails.additionalInfo =
            additionalInfo;
    }


    if (callingData !== undefined) {
        callingDetails.callingData =
            callingData;
    }


    await callingDetails.save();


    return res.status(200).json(
        new ApiResponse(
            200,
            { callingDetails },
            "Calling details updated successfully"
        )
    );
});


// Delete Calling Details
const deleteCallingDetails = asyncHandler(async (req, res) => {
    const {
        callingDetailsId,
    } = req.params;


    if (
        !mongoose.Types.ObjectId.isValid(
            callingDetailsId
        )
    ) {
        throw new ApiError(
            400,
            "Invalid callingDetailsId"
        );
    }


    const callingDetails =
        await CallingDetails.findByIdAndDelete(
            callingDetailsId
        );


    if (!callingDetails) {
        throw new ApiError(
            404,
            "Calling details not found"
        );
    }


    return res.status(200).json(
        new ApiResponse(
            200,
            { callingDetails },
            "Calling details deleted successfully"
        )
    );
});


// Download Calling Details CSV Template
const downloadCallingDetailsTemplate = asyncHandler(
    async (req, res) => {
        const {
            callingTypeId,
        } = req.query;


        if (!callingTypeId) {
            throw new ApiError(
                400,
                "callingTypeId is required"
            );
        }


        if (
            !mongoose.Types.ObjectId.isValid(
                callingTypeId
            )
        ) {
            throw new ApiError(
                400,
                "Invalid callingTypeId"
            );
        }


        const callingType =
            await CallingType.findById(
                callingTypeId
            );


        if (!callingType) {
            throw new ApiError(
                404,
                "Calling type not found"
            );
        }


        const headers = [
            "Calling Type",
            "Enrollment ID",
            "Student ID",
            "Called District",
            "Called Block",
            "Called Center",
            "Assigned To",
            "Called To",
            "Father",
            "Contact 1",
            "Contact 2",
            "Contact 3",
            "Calling Status",
            "Remark",
            "Comment",
            "Additional Information 1",
            "Additional Information 2",
            "Additional Information 3",
            "Additional Information 4",
            "Additional Information 5",
            "Additional Information 6",
            "Additional Information 7",
            "Additional Information 8",
            "Additional Information 9",
            "Additional Information 10",
            "Additional Info",
            "Calling Data",
        ];


        const row = [
    callingType._id.toString(),
    "",
    "",
    "",
    "",
    "",
    "",
    callingType.callingTo || "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
];


        const worksheet =
            XLSX.utils.aoa_to_sheet([
                headers,
                row,
            ]);


        worksheet["!cols"] = headers.map(
            (header) => ({
                wch: Math.max(
                    header.length + 3,
                    18
                ),
            })
        );


        const workbook =
            XLSX.utils.book_new();


        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Calling Details"
        );


        const csvData =
            XLSX.write(
                workbook,
                {
                    type: "buffer",
                    bookType: "csv",
                }
            );


        res.setHeader(
            "Content-Type",
            "text/csv; charset=utf-8"
        );


        res.setHeader(
            "Content-Disposition",
            `attachment; filename="calling-details-${callingType.callingTypeCode}.csv"`
        );


        return res.status(200).send(
            csvData
        );
    }
);


// Bulk Upload Calling Details CSV/XLSX
const bulkUploadCallingDetails = asyncHandler(
    async (req, res) => {
        // ============================================================
        // FILE VALIDATION
        // ============================================================

        if (!req.file) {
            throw new ApiError(
                400,
                "CSV or Excel file is required"
            );
        }


        // ============================================================
        // CALLING TYPE ID FROM FORM DATA
        // ============================================================

        const {
            callingTypeId,
        } = req.body;


        if (!callingTypeId) {
            throw new ApiError(
                400,
                "callingTypeId is required"
            );
        }


        if (
            !mongoose.Types.ObjectId.isValid(
                callingTypeId
            )
        ) {
            throw new ApiError(
                400,
                "Invalid callingTypeId"
            );
        }


        // ============================================================
        // FIND CALLING TYPE
        // ============================================================

        const callingType =
            await CallingType.findById(
                callingTypeId
            );


        if (!callingType) {
            throw new ApiError(
                404,
                "Calling type not found"
            );
        }


        // ============================================================
        // READ CSV / XLSX FILE
        // ============================================================

        const workbook =
            XLSX.read(
                req.file.buffer,
                {
                    type: "buffer",
                    cellDates: true,
                }
            );


        if (
            !workbook.SheetNames.length
        ) {
            throw new ApiError(
                400,
                "Uploaded file does not contain any sheet"
            );
        }


        const worksheet =
            workbook.Sheets[
                workbook.SheetNames[0]
            ];


        const rows =
            XLSX.utils.sheet_to_json(
                worksheet,
                {
                    defval: "",
                    raw: false,
                }
            );


        if (!rows.length) {
            throw new ApiError(
                400,
                "Uploaded file is empty"
            );
        }


        // ============================================================
        // REQUIRED COLUMNS
        // ============================================================

        const requiredColumns = [
            "Calling Type",
            "Called To",
        ];


        const uploadedColumns =
            Object.keys(
                rows[0]
            );


        const missingColumns =
            requiredColumns.filter(
                (column) =>
                    !uploadedColumns.includes(
                        column
                    )
            );


        if (
            missingColumns.length
        ) {
            throw new ApiError(
                400,
                `Missing columns: ${missingColumns.join(", ")}`
            );
        }


        // ============================================================
        // VALIDATE CALLING TYPE ID FROM CSV
        // ============================================================

        const csvCallingTypeIds = [
            ...new Set(
                rows
                    .map(
                        (row) =>
                            String(
                                row["Calling Type"] || ""
                            ).trim()
                    )
                    .filter(Boolean)
            ),
        ];


        if (
            csvCallingTypeIds.length !== 1
        ) {
            throw new ApiError(
                400,
                "All rows must contain the same Calling Type"
            );
        }


        const csvCallingTypeId =
            csvCallingTypeIds[0];


        if (
            !mongoose.Types.ObjectId.isValid(
                csvCallingTypeId
            )
        ) {
            throw new ApiError(
                400,
                "Invalid Calling Type ID in CSV"
            );
        }


        // ============================================================
        // CSV CALLING TYPE MUST MATCH SELECTED CALLING TYPE
        // ============================================================

        if (
            csvCallingTypeId !==
            callingTypeId.toString()
        ) {
            throw new ApiError(
                400,
                "Calling Type in CSV does not match the selected Calling Type"
            );
        }


        // ============================================================
        // PREPARE DATA
        // ============================================================

        const callingDetailsData = [];

        const errors = [];


        // ============================================================
        // PROCESS EACH ROW
        // ============================================================

        for (
            let index = 0;
            index < rows.length;
            index++
        ) {
            const row =
                rows[index];


            const rowNumber =
                index + 2;


            // ========================================================
            // CALLED TO
            // ========================================================

            const calledTo =
                String(
                    row["Called To"] || ""
                ).trim();


            if (!calledTo) {
                errors.push(
                    `Row ${rowNumber}: Called To is required`
                );

                continue;
            }


            // ========================================================
            // ENROLLMENT ID
            // ========================================================

            const enrollmentId =
                String(
                    row["Enrollment ID"] || ""
                ).trim();


            if (
                enrollmentId &&
                !mongoose.Types.ObjectId.isValid(
                    enrollmentId
                )
            ) {
                errors.push(
                    `Row ${rowNumber}: Invalid Enrollment ID`
                );

                continue;
            }


            // ========================================================
            // STUDENT ID
            // ========================================================

            const studentId =
                String(
                    row["Student ID"] || ""
                ).trim();


            if (
                studentId &&
                !mongoose.Types.ObjectId.isValid(
                    studentId
                )
            ) {
                errors.push(
                    `Row ${rowNumber}: Invalid Student ID`
                );

                continue;
            }


            // ========================================================
            // DISTRICT / BLOCK / CENTER
            // THESE ARE SIMPLE STRINGS
            // ========================================================

            const calledDistrict =
                String(
                    row["Called District"] || ""
                ).trim();


            const calledBlock =
                String(
                    row["Called Block"] || ""
                ).trim();


            const calledCenter =
                String(
                    row["Called Center"] || ""
                ).trim();


            // ========================================================
            // ASSIGNED TO
            // COMMA SEPARATED USER OBJECT IDS
            // ========================================================

            const assignedToValue =
                String(
                    row["Assigned To"] || ""
                ).trim();


            const assignedTo =
                assignedToValue
                    ? assignedToValue
                        .split(",")
                        .map(
                            (id) =>
                                id.trim()
                        )
                        .filter(Boolean)
                    : [];


            const invalidAssignedUser =
                assignedTo.find(
                    (userId) =>
                        !mongoose.Types.ObjectId.isValid(
                            userId
                        )
                );


            if (
                invalidAssignedUser
            ) {
                errors.push(
                    `Row ${rowNumber}: Invalid Assigned To user ID`
                );

                continue;
            }


            // ========================================================
            // CALLING STATUS
            // ========================================================

            const callingStatus =
                String(
                    row["Calling Status"] || ""
                ).trim();


            if (
                callingStatus &&
                callingType.callingStatus?.length &&
                !callingType.callingStatus.includes(
                    callingStatus
                )
            ) {
                errors.push(
                    `Row ${rowNumber}: Invalid Calling Status "${callingStatus}"`
                );

                continue;
            }


            // ========================================================
            // ADD CALLING DETAILS OBJECT
            // ========================================================

            callingDetailsData.push({
                callingTypeId:
                    callingType._id,

                enrollmentId:
                    enrollmentId || null,

                studentId:
                    studentId || null,

                calledDistrict:
                    calledDistrict || null,

                calledBlock:
                    calledBlock || null,

                calledCenter:
                    calledCenter || null,

                assignedTo,

                calledTo,

                father:
                    String(
                        row["Father"] || ""
                    ).trim(),

                contact1:
                    String(
                        row["Contact 1"] || ""
                    ).trim(),

                contact2:
                    String(
                        row["Contact 2"] || ""
                    ).trim(),

                contact3:
                    String(
                        row["Contact 3"] || ""
                    ).trim(),

                callingStatus,

                remark:
                    String(
                        row["Remark"] || ""
                    ).trim(),

                comment:
                    String(
                        row["Comment"] || ""
                    ).trim(),

                additionalInformation1:
                    row[
                        "Additional Information 1"
                    ] || null,

                additionalInformation2:
                    row[
                        "Additional Information 2"
                    ] || null,

                additionalInformation3:
                    row[
                        "Additional Information 3"
                    ] || null,

                additionalInformation4:
                    row[
                        "Additional Information 4"
                    ] || null,

                additionalInformation5:
                    row[
                        "Additional Information 5"
                    ] || null,

                additionalInformation6:
                    row[
                        "Additional Information 6"
                    ] || null,

                additionalInformation7:
                    row[
                        "Additional Information 7"
                    ] || null,

                additionalInformation8:
                    row[
                        "Additional Information 8"
                    ] || null,

                additionalInformation9:
                    row[
                        "Additional Information 9"
                    ] || null,

                additionalInformation10:
                    row[
                        "Additional Information 10"
                    ] || null,

                additionalInfo:
                    row[
                        "Additional Info"
                    ] || null,

                callingData:
                    row[
                        "Calling Data"
                    ] || null,
            });
        }


        // ============================================================
        // VALIDATION ERRORS
        // ============================================================

        if (errors.length) {

            throw new ApiError(
                400,
                "CSV validation failed",
                errors
            );
        }


        if (
            !callingDetailsData.length
        ) {
            throw new ApiError(
                400,
                "No valid calling details found in uploaded file"
            );
        }


        // ============================================================
        // BULK INSERT
        // ============================================================

        const createdCallingDetails =
            await CallingDetails.insertMany(
                callingDetailsData
            );


        // ============================================================
        // RESPONSE
        // ============================================================

        return res.status(201).json(
            new ApiResponse(
                201,
                {
                    createdCount:
                        createdCallingDetails.length,
                },
                "Calling details uploaded successfully"
            )
        );
    }
);









// Get My Calling Type Summary
const getMyCallingTypeSummary = asyncHandler(
    async (req, res) => {
        const userId =
            req.user._id;


        const summary =
            await CallingDetails.aggregate([
                {
                    $match: {
                        assignedTo: userId,
                    },
                },

                {
                    $group: {
                        _id: "$callingTypeId",

                        total: {
                            $sum: 1,
                        },

                        connected: {
                            $sum: {
                                $cond: [
                                    {
                                        $eq: [
                                            "$callingStatus",
                                            "Connected",
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },

                        notConnected: {
                            $sum: {
                                $cond: [
                                    {
                                        $eq: [
                                            "$callingStatus",
                                            "Not Connected",
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },

                        wrongNumber: {
                            $sum: {
                                $cond: [
                                    {
                                        $eq: [
                                            "$callingStatus",
                                            "Wrong Number",
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },

                        pending: {
                            $sum: {
                                $cond: [
                                    {
                                        $or: [
                                            {
                                                $eq: [
                                                    "$callingStatus",
                                                    "",
                                                ],
                                            },
                                            {
                                                $eq: [
                                                    "$callingStatus",
                                                    null,
                                                ],
                                            },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },
                    },
                },

                {
                    $lookup: {
                        from: "callingtypes",
                        localField: "_id",
                        foreignField: "_id",
                        as: "callingType",
                    },
                },

                {
                    $unwind: "$callingType",
                },

                {
                    $match: {
                        "callingType.isActive": true,
                    },
                },

                {
                    $project: {
                        _id: 0,

                        callingTypeId: "$_id",

                        callingTitle:
                            "$callingType.callingTitle",

                        callingTypeCode:
                            "$callingType.callingTypeCode",

                        callingTo:
                            "$callingType.callingTo",

                        callingStatus:
                            "$callingType.callingStatus",

                        callingRemark:
                            "$callingType.callingRemark",

                        total: 1,

                        connected: 1,

                        notConnected: 1,

                        wrongNumber: 1,

                        pending: 1,
                    },
                },

                {
                    $sort: {
                        callingTitle: 1,
                    },
                },
            ]);


        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    summary,
                },
                "Calling type summary fetched successfully"
            )
        );
    }
);
















// Export Calling Details as XLSX
const exportCallingDetails = asyncHandler(
    async (req, res) => {
        const {
            callingTypeId,
            studentId,
            enrollmentId,
            assignedTo,
            calledDistrict,
            calledBlock,
            calledCenter,
            callingStatus,
            search,
        } = req.query;


        // ============================================================
        // BUILD FILTER
        // ============================================================

        const filter = {};


        // ============================================================
        // CALLING TYPE
        // ============================================================

        if (callingTypeId) {
            if (
                !mongoose.Types.ObjectId.isValid(
                    callingTypeId
                )
            ) {
                throw new ApiError(
                    400,
                    "Invalid callingTypeId"
                );
            }

            filter.callingTypeId =
                callingTypeId;
        }


        // ============================================================
        // STUDENT ID
        // ============================================================

        if (studentId) {
            if (
                !mongoose.Types.ObjectId.isValid(
                    studentId
                )
            ) {
                throw new ApiError(
                    400,
                    "Invalid studentId"
                );
            }

            filter.studentId =
                studentId;
        }


        // ============================================================
        // ENROLLMENT ID
        // ============================================================

        if (enrollmentId) {
            if (
                !mongoose.Types.ObjectId.isValid(
                    enrollmentId
                )
            ) {
                throw new ApiError(
                    400,
                    "Invalid enrollmentId"
                );
            }

            filter.enrollmentId =
                enrollmentId;
        }


        // ============================================================
        // ASSIGNED TO
        // ============================================================

        if (assignedTo) {
            const assignedUserIds =
                assignedTo
                    .split(",")
                    .map(
                        (id) =>
                            id.trim()
                    )
                    .filter(Boolean);


            const invalidAssignedUser =
                assignedUserIds.find(
                    (id) =>
                        !mongoose.Types.ObjectId.isValid(
                            id
                        )
                );


            if (
                invalidAssignedUser
            ) {
                throw new ApiError(
                    400,
                    "Invalid assignedTo user ID"
                );
            }


            filter.assignedTo = {
                $in: assignedUserIds,
            };
        }


        // ============================================================
        // DISTRICT
        // ============================================================

        if (calledDistrict) {
            filter.calledDistrict =
                calledDistrict.trim();
        }


        // ============================================================
        // BLOCK
        // ============================================================

        if (calledBlock) {
            filter.calledBlock =
                calledBlock.trim();
        }


        // ============================================================
        // CENTER
        // ============================================================

        if (calledCenter) {
            filter.calledCenter =
                calledCenter.trim();
        }


        // ============================================================
        // CALLING STATUS
        // ============================================================

        if (callingStatus) {
            filter.callingStatus =
                callingStatus.trim();
        }


        // ============================================================
        // SEARCH
        // ============================================================

        if (search) {
            const searchRegex =
                new RegExp(
                    search.trim(),
                    "i"
                );


            filter.$or = [
                {
                    calledTo:
                        searchRegex,
                },
                {
                    father:
                        searchRegex,
                },
                {
                    contact1:
                        searchRegex,
                },
                {
                    contact2:
                        searchRegex,
                },
                {
                    contact3:
                        searchRegex,
                },
                {
                    remark:
                        searchRegex,
                },
                {
                    comment:
                        searchRegex,
                },
            ];
        }


        // ============================================================
        // FETCH DATA
        // ============================================================

        const callingDetails =
            await CallingDetails
                .find(filter)
                .populate(
                    "callingTypeId",
                    "callingTitle callingTypeCode callingTo"
                )
                .populate(
                    "assignedTo",
                    "name contact"
                )
                .sort({
                    createdAt: -1,
                })
                .lean();


        if (
            !callingDetails.length
        ) {
            throw new ApiError(
                404,
                "No calling details found for the selected filters"
            );
        }


        // ============================================================
        // PREPARE XLSX DATA
        // ============================================================

        const exportData =
            callingDetails.map(
                (callingDetail) => {

                    const assignedUsers =
                        Array.isArray(
                            callingDetail.assignedTo
                        )
                            ? callingDetail.assignedTo
                            : [];


                    const assignedToIds =
                        assignedUsers
                            .map(
                                (user) =>
                                    user?._id
                                        ?.toString() ||
                                    ""
                            )
                            .filter(Boolean)
                            .join(", ");


                    const assignedToNames =
                        assignedUsers
                            .map(
                                (user) =>
                                    user?.name ||
                                    ""
                            )
                            .filter(Boolean)
                            .join(", ");


                    const assignedToContacts =
                        assignedUsers
                            .map(
                                (user) =>
                                    user?.contact ||
                                    ""
                            )
                            .filter(Boolean)
                            .join(", ");


                    return {
                        "Calling Type":
                            callingDetail
                                .callingTypeId
                                ?.callingTitle ||
                            "",

                        "Calling Type ID":
                            callingDetail
                                .callingTypeId
                                ?._id
                                ?.toString() ||
                            "",

                        "AssignedTo Id":
                            assignedToIds,

                        "AssignedTo":
                            assignedToNames,

                        "AssignedTo Contact":
                            assignedToContacts,

                        "Calling Type Code":
                            callingDetail
                                .callingTypeId
                                ?.callingTypeCode ||
                            "",

                        "Enrollment ID":
                            callingDetail
                                .enrollmentId
                                ?.toString() ||
                            "",

                        "Student ID":
                            callingDetail
                                .studentId
                                ?.toString() ||
                            "",

                        "Called District":
                            callingDetail
                                .calledDistrict ||
                            "",

                        "Called Block":
                            callingDetail
                                .calledBlock ||
                            "",

                        "Called Center":
                            callingDetail
                                .calledCenter ||
                            "",

                        "Called To":
                            callingDetail
                                .calledTo ||
                            "",

                        "Father":
                            callingDetail
                                .father ||
                            "",

                        "Contact 1":
                            callingDetail
                                .contact1 ||
                            "",

                        "Contact 2":
                            callingDetail
                                .contact2 ||
                            "",

                        "Contact 3":
                            callingDetail
                                .contact3 ||
                            "",

                        "Calling Status":
                            callingDetail
                                .callingStatus ||
                            "",

                        "Remark":
                            callingDetail
                                .remark ||
                            "",

                        "Comment":
                            callingDetail
                                .comment ||
                            "",

                        "Additional Information 1":
                            callingDetail
                                .additionalInformation1 ??
                            "",

                        "Additional Information 2":
                            callingDetail
                                .additionalInformation2 ??
                            "",

                        "Additional Information 3":
                            callingDetail
                                .additionalInformation3 ??
                            "",

                        "Additional Information 4":
                            callingDetail
                                .additionalInformation4 ??
                            "",

                        "Additional Information 5":
                            callingDetail
                                .additionalInformation5 ??
                            "",

                        "Additional Information 6":
                            callingDetail
                                .additionalInformation6 ??
                            "",

                        "Additional Information 7":
                            callingDetail
                                .additionalInformation7 ??
                            "",

                        "Additional Information 8":
                            callingDetail
                                .additionalInformation8 ??
                            "",

                        "Additional Information 9":
                            callingDetail
                                .additionalInformation9 ??
                            "",

                        "Additional Information 10":
                            callingDetail
                                .additionalInformation10 ??
                            "",

                        "Additional Info":
                            callingDetail
                                .additionalInfo ??
                            "",

                        "Calling Data":
                            callingDetail
                                .callingData ??
                            "",

                        "Created At":
                            callingDetail.createdAt
                                ? new Date(
                                      callingDetail.createdAt
                                  ).toLocaleString(
                                      "en-IN"
                                  )
                                : "",

                        "Updated At":
                            callingDetail.updatedAt
                                ? new Date(
                                      callingDetail.updatedAt
                                  ).toLocaleString(
                                      "en-IN"
                                  )
                                : "",
                    };
                }
            );


        // ============================================================
        // CREATE WORKSHEET
        // ============================================================

        const worksheet =
            XLSX.utils.json_to_sheet(
                exportData
            );


        // ============================================================
        // AUTO COLUMN WIDTH
        // ============================================================

        const columnWidths =
            Object.keys(
                exportData[0]
            ).map(
                (key) => {

                    const maxLength =
                        Math.max(
                            key.length,

                            ...exportData.map(
                                (row) =>
                                    String(
                                        row[key] ??
                                        ""
                                    ).length
                            )
                        );


                    return {
                        wch: Math.min(
                            Math.max(
                                maxLength + 2,
                                12
                            ),
                            40
                        ),
                    };
                }
            );


        worksheet["!cols"] =
            columnWidths;


        // ============================================================
        // CREATE WORKBOOK
        // ============================================================

        const workbook =
            XLSX.utils.book_new();


        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "Calling Details"
        );


        // ============================================================
        // GENERATE XLSX BUFFER
        // ============================================================

        const buffer =
            XLSX.write(
                workbook,
                {
                    type: "buffer",
                    bookType: "xlsx",
                }
            );


        // ============================================================
        // FILE NAME
        // ============================================================

        const date =
            new Date()
                .toISOString()
                .split("T")[0];


        const fileName =
            `calling-details-${date}.xlsx`;


        // ============================================================
        // RESPONSE HEADERS
        // ============================================================

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );


        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${fileName}"`
        );


        res.setHeader(
            "Content-Length",
            buffer.length
        );


        return res.status(200).send(
            buffer
        );
    }
);












//Absentee callings

// ============================================================
// GET ABSENTEE CALLING STUDENTS
// ============================================================

const getAbsenteeCallingStudents = asyncHandler(
  async (req, res) => {
    const {
      date,
      batchId,
      districtId,
      blockId,
      centerId,
    } = req.query;

    // ============================================================
    // DATE
    // ============================================================

    const attendanceDate = date
      ? new Date(date)
      : new Date();

    if (Number.isNaN(attendanceDate.getTime())) {
      throw new ApiError(
        400,
        "Invalid date"
      );
    }

    const startOfDay = new Date(
      attendanceDate
    );

    startOfDay.setHours(
      0,
      0,
      0,
      0
    );

    const endOfDay = new Date(
      attendanceDate
    );

    endOfDay.setHours(
      23,
      59,
      59,
      999
    );

    // ============================================================
    // ENROLLMENT QUERY
    // ============================================================

    const enrollmentQuery = {
      status: "active",
    };

    if (batchId) {
      if (
        !mongoose.Types.ObjectId.isValid(
          batchId
        )
      ) {
        throw new ApiError(
          400,
          "Invalid batchId"
        );
      }

      enrollmentQuery.batchId =
        batchId;
    }

    if (districtId) {
      if (
        !mongoose.Types.ObjectId.isValid(
          districtId
        )
      ) {
        throw new ApiError(
          400,
          "Invalid districtId"
        );
      }

      enrollmentQuery.districtId =
        districtId;
    }

    if (blockId) {
      if (
        !mongoose.Types.ObjectId.isValid(
          blockId
        )
      ) {
        throw new ApiError(
          400,
          "Invalid blockId"
        );
      }

      enrollmentQuery.blockId =
        blockId;
    }

    if (centerId) {
      if (
        !mongoose.Types.ObjectId.isValid(
          centerId
        )
      ) {
        throw new ApiError(
          400,
          "Invalid centerId"
        );
      }

      enrollmentQuery.centerId =
        centerId;
    }

    // ============================================================
    // USER ACCESS
    // ============================================================

    if (!req.user.isAdmin) {
      const access =
        await getCallingUserAccess(
          req.user._id
        );

      if (!access.programIds?.length) {
        return res.status(200).json(
          new ApiResponse(
            200,
            {
              date: startOfDay,
              students: [],
              total: 0,
            },
            "No program access found"
          )
        );
      }

      if (!access.batchIds?.length) {
        return res.status(200).json(
          new ApiResponse(
            200,
            {
              date: startOfDay,
              students: [],
              total: 0,
            },
            "No batch access found"
          )
        );
      }

      /*
       * Program access is applied automatically.
       * Frontend only exposes Batch as the program/batch filter.
       */

      enrollmentQuery.programId = {
        $in: access.programIds,
      };

      if (batchId) {
        enrollmentQuery.batchId =
          batchId;
      } else {
        enrollmentQuery.batchId = {
          $in: access.batchIds,
        };
      }
    }

    // ============================================================
    // FETCH ACTIVE ENROLLMENTS
    // ============================================================

    const enrollments =
      await StudentEnrollment.find(
        enrollmentQuery
      )
        .populate(
          "studentId",
          "studentSrn rollNumber name fatherName personalContact parentContact otherContact isActive"
        )
        .populate(
          "districtId",
          "districtName districtId"
        )
        .populate(
          "blockId",
          "blockName blockId"
        )
        .populate(
          "centerId",
          "centerName centerCode"
        )
        .lean();

    // ============================================================
    // REGION ACCESS
    // ============================================================

    let accessibleEnrollments =
      enrollments;

    if (!req.user.isAdmin) {
      const access =
        await getCallingUserAccess(
          req.user._id
        );

      accessibleEnrollments =
        enrollments.filter(
          (enrollment) =>
            hasRegionAccess(
              access.regionAccess,
              {
                districtId:
                  enrollment
                    .districtId?._id,

                blockId:
                  enrollment
                    .blockId?._id,

                centerId:
                  enrollment
                    .centerId?._id,
              }
            )
        );
    }

    // ============================================================
    // PRESENT ATTENDANCE
    // ============================================================

    const enrollmentIds =
      accessibleEnrollments.map(
        (enrollment) =>
          enrollment._id
      );

    const presentAttendances =
      await StudentAttendance.find({
        enrollmentId: {
          $in: enrollmentIds,
        },

        date: {
          $gte: startOfDay,
          $lte: endOfDay,
        },

        status: "Present",
      })
        .select("enrollmentId")
        .lean();

    const presentEnrollmentIds =
      new Set(
        presentAttendances.map(
          (attendance) =>
            attendance.enrollmentId?.toString()
        )
      );

    // ============================================================
    // ABSENT ENROLLMENTS
    // ============================================================

    const absentEnrollments =
      accessibleEnrollments
        .filter(
          (enrollment) =>
            !presentEnrollmentIds.has(
              enrollment._id.toString()
            )
        )
        .filter(
          (enrollment) =>
            enrollment.studentId
        );

    // ============================================================
    // EXISTING ABSENTEE CALLING DETAILS
    // ============================================================

    const absentEnrollmentIds =
      absentEnrollments.map(
        (enrollment) =>
          enrollment._id
      );

    const existingCallingDetails =
      await CallingDetails.find({
        enrollmentId: {
          $in: absentEnrollmentIds,
        },

        callingData:
          "daily-absentee-calling",

        createdAt: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      })
        .sort({
          createdAt: -1,
        })
        .lean();

    // ============================================================
    // KEEP LATEST CALLING DETAIL PER ENROLLMENT
    // ============================================================

    const callingDetailMap =
      new Map();

    existingCallingDetails.forEach(
      (callingDetail) => {
        const key =
          callingDetail.enrollmentId?.toString();

        if (
          key &&
          !callingDetailMap.has(key)
        ) {
          callingDetailMap.set(
            key,
            callingDetail
          );
        }
      }
    );

    // ============================================================
    // FINAL RESPONSE
    // ============================================================

    const absentStudents =
      absentEnrollments.map(
        (enrollment) => {
          const callingDetail =
            callingDetailMap.get(
              enrollment._id.toString()
            );

          return {
            enrollmentId:
              enrollment._id,

            studentId:
              enrollment.studentId._id,

            studentSrn:
              enrollment.studentId
                .studentSrn,

            rollNumber:
              enrollment.studentId
                .rollNumber,

            name:
              enrollment.studentId
                .name,

            fatherName:
              enrollment.studentId
                .fatherName,

            personalContact:
              enrollment.studentId
                .personalContact,

            parentContact:
              enrollment.studentId
                .parentContact,

            otherContact:
              enrollment.studentId
                .otherContact,

            programId:
              enrollment.programId,

            batchId:
              enrollment.batchId,

            districtId:
              enrollment.districtId?._id,

            districtName:
              enrollment.districtId
                ?.districtName,

            blockId:
              enrollment.blockId?._id,

            blockName:
              enrollment.blockId
                ?.blockName,

            centerId:
              enrollment.centerId?._id,

            centerName:
              enrollment.centerId
                ?.centerName,

            centerCode:
              enrollment.centerId
                ?.centerCode,

            class:
              enrollment.class,

            board:
              enrollment.board,

            attendanceStatus:
              "Absent",

            // ==================================================
            // ABSENTEE CALLING STATUS
            // ==================================================

            callingDetailsId:
              callingDetail?._id ||
              null,

            callingStatus:
              callingDetail
                ?.callingStatus ||
              "",

            remark:
              callingDetail
                ?.remark ||
              "",

            comment:
              callingDetail
                ?.comment ||
              "",

            calledAt:
              callingDetail
                ?.createdAt ||
              null,
          };
        }
      );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          date: startOfDay,
          students:
            absentStudents,
          total:
            absentStudents.length,
        },
        "Absentee calling students fetched successfully"
      )
    );
  }
);

// ============================================================
// SAVE ABSENTEE CALLING DETAILS
// ============================================================

const saveAbsenteeCalling = asyncHandler(
  async (req, res) => {
    const {
      enrollmentId,
      callingStatus,
      remark,
      comment,
    } = req.body;

    // ============================================================
    // VALIDATION
    // ============================================================

    if (!enrollmentId) {
      throw new ApiError(
        400,
        "enrollmentId is required"
      );
    }

    if (
      !mongoose.Types.ObjectId.isValid(
        enrollmentId
      )
    ) {
      throw new ApiError(
        400,
        "Invalid enrollmentId"
      );
    }

    if (!callingStatus) {
      throw new ApiError(
        400,
        "callingStatus is required"
      );
    }

    const allowedStatuses = [
      "Connected",
      "Not Connected",
    ];

    if (
      !allowedStatuses.includes(
        callingStatus
      )
    ) {
      throw new ApiError(
        400,
        "Invalid callingStatus"
      );
    }

    const connectedRemarks = [
      "Sick",
      "Out of town",
      "Wants SLC",
      "Not interested",
      "Other",
    ];

    const notConnectedRemarks = [
      "Call not picked",
      "Wrong number",
      "Out of service",
      "Number Busy",
    ];

    const allowedRemarks =
      callingStatus ===
      "Connected"
        ? connectedRemarks
        : notConnectedRemarks;

    if (
      !remark ||
      !allowedRemarks.includes(
        remark
      )
    ) {
      throw new ApiError(
        400,
        "Invalid remark for selected calling status"
      );
    }

    // ============================================================
    // TODAY
    // ============================================================

    const today =
      new Date();

    const startOfDay =
      new Date(today);

    startOfDay.setHours(
      0,
      0,
      0,
      0
    );

    const endOfDay =
      new Date(today);

    endOfDay.setHours(
      23,
      59,
      59,
      999
    );

    // ============================================================
    // ACTIVE ENROLLMENT
    // ============================================================

    const enrollment =
      await StudentEnrollment.findOne({
        _id: enrollmentId,
        status: "active",
      })
        .populate(
          "studentId",
          "studentSrn rollNumber name fatherName personalContact parentContact otherContact isActive"
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
        .lean();

    if (!enrollment) {
      throw new ApiError(
        404,
        "Active student enrollment not found"
      );
    }

    if (!enrollment.studentId) {
      throw new ApiError(
        404,
        "Student not found"
      );
    }

    // ============================================================
    // USER ACCESS
    // ============================================================

    if (!req.user.isAdmin) {
      const access =
        await getCallingUserAccess(
          req.user._id
        );

      if (
        !hasProgramAccess(
          access,
          enrollment.programId
        )
      ) {
        throw new ApiError(
          403,
          "You do not have access to this student's program"
        );
      }

      if (
        !hasBatchAccess(
          access,
          enrollment.batchId
        )
      ) {
        throw new ApiError(
          403,
          "You do not have access to this student's batch"
        );
      }

      if (
        !hasRegionAccess(
          access.regionAccess,
          {
            districtId:
              enrollment.districtId?._id,

            blockId:
              enrollment.blockId?._id,

            centerId:
              enrollment.centerId?._id,
          }
        )
      ) {
        throw new ApiError(
          403,
          "You do not have access to this student's region"
        );
      }
    }

    // ============================================================
    // VERIFY ABSENT TODAY
    // ============================================================

    const presentAttendance =
      await StudentAttendance.findOne({
        enrollmentId:
          enrollment._id,

        date: {
          $gte: startOfDay,
          $lte: endOfDay,
        },

        status: "Present",
      }).lean();

    if (presentAttendance) {
      throw new ApiError(
        400,
        "This student is already marked Present today"
      );
    }

    // ============================================================
    // FIND TODAY'S EXISTING ABSENTEE RECORD
    // ============================================================

    let callingDetails =
      await CallingDetails.findOne({
        enrollmentId:
          enrollment._id,

        callingData:
          "daily-absentee-calling",

        createdAt: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      }).sort({
        createdAt: -1,
      });

    // ============================================================
    // DATA
    // ============================================================

    const callingData = {
      callingTypeId:
        null,

      enrollmentId:
        enrollment._id,

      studentId:
        enrollment.studentId._id,

      calledDistrict:
        enrollment.districtId
          ?.districtName ||
        null,

      calledBlock:
        enrollment.blockId
          ?.blockName ||
        null,

      calledCenter:
        enrollment.centerId
          ?.centerName ||
        null,

      assignedTo: [
        req.user._id,
      ],

      calledTo:
        enrollment.studentId
          .name,

      father:
        enrollment.studentId
          .fatherName ||
        "",

      contact1:
        enrollment.studentId
          .personalContact ||
        "",

      contact2:
        enrollment.studentId
          .parentContact ||
        "",

      contact3:
        enrollment.studentId
          .otherContact ||
        "",

      callingStatus:
        callingStatus.trim(),

      remark:
        remark.trim(),

      comment:
        comment?.trim() ||
        "",

      additionalInformation1:
        null,

      additionalInformation2:
        null,

      additionalInformation3:
        null,

      additionalInformation4:
        null,

      additionalInformation5:
        null,

      additionalInformation6:
        null,

      additionalInformation7:
        null,

      additionalInformation8:
        null,

      additionalInformation9:
        null,

      additionalInformation10:
        null,

      additionalInfo:
        null,

      callingData:
        "daily-absentee-calling",
    };

    // ============================================================
    // UPDATE EXISTING / CREATE NEW
    // ============================================================

    if (callingDetails) {
      Object.assign(
        callingDetails,
        callingData
      );

      await callingDetails.save();
    } else {
      callingDetails =
        await CallingDetails.create(
          callingData
        );
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          callingDetails,
        },
        "Absentee calling details saved successfully"
      )
    );
  }
);







export {
    createCallingDetails,
    getCallingDetails,
    getCallingDetailsById,
    updateCallingDetails,
    deleteCallingDetails,
    downloadCallingDetailsTemplate,
    bulkUploadCallingDetails,
    getMyCallingTypeSummary,
    exportCallingDetails,
   
    getAbsenteeCallingStudents,
    saveAbsenteeCalling,
};
    
    
