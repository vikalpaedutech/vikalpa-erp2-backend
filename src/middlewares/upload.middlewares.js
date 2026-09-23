// import multer from "multer";

// const storage = multer.memoryStorage();

// const pdfFileFilter = (req, file, cb) => {
//   if (file.mimetype !== "application/pdf") {
//     return cb(
//       new Error("Only PDF files are allowed"),
//       false
//     );
//   }

//   cb(null, true);
// };

// export const uploadPdf = multer({
//   storage,
//   fileFilter: pdfFileFilter,
//   limits: {
//     fileSize: 10 * 1024 * 1024,
//   },
// });















import multer from "multer";

const storage = multer.memoryStorage();


// ============================================================
// PDF FILE FILTER
// ============================================================

const pdfFileFilter = (req, file, cb) => {
  if (file.mimetype !== "application/pdf") {
    return cb(
      new Error("Only PDF files are allowed"),
      false
    );
  }

  cb(null, true);
};


// ============================================================
// IMAGE FILE FILTER
// ============================================================

const imageFileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    return cb(
      new Error("Only image files are allowed"),
      false
    );
  }

  cb(null, true);
};


// ============================================================
// PDF UPLOAD
// EXISTING SETUP - UNCHANGED
// ============================================================

export const uploadPdf = multer({
  storage,
  fileFilter: pdfFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});


// ============================================================
// IMAGE UPLOAD
// ============================================================

export const uploadImage = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// ============================================================
// LEAVE ATTACHMENTS - PDF + IMAGES
// ============================================================

const leaveAttachmentFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/jpg",
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(
      new Error("Only PDF and image attachments are allowed."),
      false
    );
  }

  cb(null, true);
};

export const uploadLeaveAttachments = multer({
  storage,
  fileFilter: leaveAttachmentFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
});


// ============================================================
// BULK USER ONBOARDING - XLSX / XLS / CSV
// ============================================================

const spreadsheetFileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ];

  const extension = String(file.originalname || "")
    .split(".")
    .pop()
    .toLowerCase();

  if (
    !allowedMimeTypes.includes(file.mimetype) &&
    !["csv", "xls", "xlsx"].includes(extension)
  ) {
    return cb(
      new Error("Only CSV, XLS and XLSX files are allowed."),
      false
    );
  }

  cb(null, true);
};

export const uploadSpreadsheet = multer({
  storage,
  fileFilter: spreadsheetFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});
