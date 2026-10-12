export const statusPaths = {
  clock: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "M12 7v5l3 2"],
  check: ["m5 12 4 4L19 6"],
  doubleCheck: ["m2 12 4 4L16 6", "m12 16 10-10"],
  error: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z", "M12 7v6M12 17h.01"],
} as const;
