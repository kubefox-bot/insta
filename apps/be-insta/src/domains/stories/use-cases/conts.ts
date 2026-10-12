// A slot owns the complete upload/provider lifetime, including cancellation.
// Keep physical buffering finite before entering the separate decoder pool.
export const publicationCapacity = { maxConcurrentUploads: 2 } as const;
