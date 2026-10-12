export type ParsedSubject = Readonly<{
  value: string;
  hasConventionalFormat: boolean;
  prefix: string;
  type: string;
  scope: string;
  description: string;
}>;

export type ValidationIssue = Readonly<{
  code:
    | "commit-format"
    | "commit-type-missing"
    | "commit-type"
    | "scope-format"
    | "description-missing"
    | "description-short"
    | "description-words"
    | "description-generic";
  message: string;
}>;
