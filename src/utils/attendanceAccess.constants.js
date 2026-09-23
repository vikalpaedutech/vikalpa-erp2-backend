// export const ATTENDANCE_ACCESS_HIERARCHY = {
//   ACI: ["CC"],
//   "COMMUNITY MANAGER": ["ACI", "CC"],
//   "PROJECT COORDINATOR": ["CC"],
// };

// 






export const ATTENDANCE_ACCESS_HIERARCHY = {
  aci: ["cc"],

  cm: ["aci", "cc"],

  pc: ["cc"],
  
  admin:["aci", "cc","cm", "pc"]
};