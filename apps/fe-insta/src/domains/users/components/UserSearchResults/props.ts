import type { Props as SearchProps } from "../UserSearch/props";
import type { SearchView } from "../UserSearch/types";

export type Props = Readonly<{
  copy: SearchProps["copy"];
  view: SearchView;
  opening: boolean;
  openingFailed: boolean;
  select: (recipientId: string) => Promise<void>;
  retry: () => Promise<void>;
}>;
