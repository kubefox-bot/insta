export const supportMail = {
  from: "Insta <support@insta.test>",
  subject: "Insta: техническая проблема",
  domain: "support.insta.test",
} as const;
export const htmlEscapes = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
} as const;
