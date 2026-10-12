/** Retains the last authenticated owner across logout without treating session refresh as an account switch. */
export const createAccountNavigation = ({
  initialUserId,
  isDetail,
  navigate,
}: Readonly<{
  initialUserId: string | null;
  isDetail: () => boolean;
  navigate: (path: string) => Promise<void>;
}>) => {
  const owner = { userId: initialUserId };
  return {
    reconcile: async (actor: Readonly<{ userId: string }> | null) => {
      if (!actor) return;
      const previous = owner.userId;
      owner.userId = actor.userId;
      if (previous && previous !== actor.userId && isDetail())
        await navigate("/conversations");
    },
  };
};
