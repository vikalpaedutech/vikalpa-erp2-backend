import {
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import spacesClient from "../config/spaces.js";


// ============================================================
// UPLOAD FILE TO DIGITALOCEAN SPACES
// ============================================================

export const uploadToSpaces = async ({
  file,
  folder,
  fileName,
}) => {
  if (!file?.buffer) {
    throw new Error("File buffer is required");
  }

  if (!folder) {
    throw new Error("Folder is required");
  }

  if (!fileName) {
    throw new Error("File name is required");
  }

  const key = `${folder}/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: process.env.SPACES_BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
    ContentLength: file.size,
    ACL: "private",
  });

  await spacesClient.send(command);

  const fileUrl = `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}/${key}`;

  return {
    key,
    url: fileUrl,
    fileName: file.originalname,
  };
};


// ============================================================
// DELETE FILE FROM DIGITALOCEAN SPACES
// ============================================================

export const deleteFromSpaces = async (key) => {
  if (!key) {
    throw new Error("File key is required");
  }

  const command = new DeleteObjectCommand({
    Bucket: process.env.SPACES_BUCKET,
    Key: key,
  });

  await spacesClient.send(command);

  return true;
};

export const getSignedUrlForSpacesKey = async (
  key,
  expiresIn = 3600
) => {
  if (!key) {
    throw new Error("Spaces object key is required");
  }

  const command = new GetObjectCommand({
    Bucket: process.env.SPACES_BUCKET,
    Key: key,
  });

  return await getSignedUrl(
    spacesClient,
    command,
    { expiresIn }
  );
};
