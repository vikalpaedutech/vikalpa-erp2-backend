import mongoose from "mongoose";
import { UserAccess } from "../models/user-management/userAccess.models.js";
import { UserRegionAccess } from "../models/user-management/userRegionAccess.models.js";

const oid = (value) =>
  value && mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(value)
    : null;

export const isAdminUser = (req) =>
  req.user?.isAdmin === true ||
  String(req.user?.roleCode || "").trim().toLowerCase() === "admin" ||
  String(req.user?.roleCode || "").trim().toLowerCase() === "administrator" ||
  String(req.user?.roleName || "").trim().toLowerCase() === "administrator";

export async function getUserScope(userId) {
  const [programAccess, regionAccess] = await Promise.all([
    UserAccess.findOne({ userId }).lean(),
    UserRegionAccess.find({ userId }).lean(),
  ]);

  return {
    programIds: (programAccess?.programIds || []).map(String),
    batchIds: (programAccess?.batchIds || []).map(String),
    regionAccess,
  };
}

export function buildRegionClauses(regionAccess = []) {
  const clauses = [];

  for (const access of regionAccess) {
    const scope = String(access.scope || "").toLowerCase();

    if (scope === "global") return { global: true, clauses: [] };

    if (scope === "district" && access.districtId) {
      clauses.push({ districtId: access.districtId });
    }

    if (scope === "block" && access.blockId) {
      clauses.push({ blockId: access.blockId });
    }

    if (scope === "center" && access.centerId) {
      clauses.push({ centerId: access.centerId });
    }
  }

  return { global: false, clauses };
}

function intersectIdFilter(existing, requested) {
  if (!requested) return existing;
  if (!existing) return requested;

  const ids = existing.$in;
  if (Array.isArray(ids)) {
    const match = ids.filter((id) => String(id) === String(requested));
    return { $in: match };
  }

  return String(existing) === String(requested)
    ? existing
    : { $in: [] };
}

/**
 * Builds a Mongo filter that can never widen the user's access.
 * Empty program/batch access means "not restricted by that dimension".
 * Region access is always restrictive for non-admin users.
 */
export async function buildEnrollmentAccessFilter(req, query = {}, options = {}) {
  const filter = { status: options.status || "active" };

  if (isAdminUser(req)) {
    for (const field of ["programId", "batchId", "districtId", "blockId", "centerId"]) {
      const value = oid(query[field]);
      if (value) filter[field] = value;
    }
    return filter;
  }

  const { programIds, batchIds, regionAccess } = await getUserScope(req.user._id);

  // Dashboard data is access-scoped. A non-admin without any program/batch
  // assignment must never receive the full dataset by default.
  if (!programIds.length && !batchIds.length) return { _id: { $in: [] } };
  if (programIds.length) filter.programId = { $in: programIds.map(oid).filter(Boolean) };
  if (batchIds.length) filter.batchId = { $in: batchIds.map(oid).filter(Boolean) };

  const region = buildRegionClauses(regionAccess);
  if (!region.global) {
    if (!region.clauses.length) return { _id: { $in: [] } };
    filter.$or = region.clauses;
  }

  // These filters are always ANDed with the user's access filter, so they
  // can only narrow the result set and can never grant additional access.
  for (const field of ["programId", "batchId", "districtId", "blockId", "centerId"]) {
    const value = oid(query[field]);
    if (value) filter[field] = intersectIdFilter(filter[field], value);
  }

  return filter;
}

export async function buildRegionDocumentFilter(req, query = {}) {
  const filter = {};

  if (isAdminUser(req)) {
    for (const field of ["districtId", "blockId", "centerId"]) {
      const value = oid(query[field]);
      if (value) filter[field] = value;
    }
    return filter;
  }

  const { regionAccess } = await getUserScope(req.user._id);
  const region = buildRegionClauses(regionAccess);

  if (!region.global) {
    if (!region.clauses.length) return { _id: { $in: [] } };
    filter.$or = region.clauses;
  }

  // Requested district/block/center is an additional AND restriction.
  // MongoDB therefore returns an empty set for a region outside the user's
  // assigned scope without exposing any records.
  for (const field of ["districtId", "blockId", "centerId"]) {
    const value = oid(query[field]);
    if (value) filter[field] = value;
  }

  return filter;
}
