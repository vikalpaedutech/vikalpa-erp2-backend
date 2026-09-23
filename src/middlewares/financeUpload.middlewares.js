import multer from "multer";

const storage = multer.memoryStorage();

const allowedMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const financeFileFilter = (req, file, cb) => {
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(
      new Error(
        "Only PDF, JPG, JPEG, PNG and WEBP files are allowed"
      ),
      false
    );
  }

  cb(null, true);
};

export const uploadFinanceAttachments = multer({
  storage,
  fileFilter: financeFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 10,
  },
});