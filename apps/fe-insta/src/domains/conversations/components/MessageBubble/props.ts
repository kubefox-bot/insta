import type { Props as ListProps } from "../MessageList/props";
export type Props = Readonly<
  Pick<ListProps, "actorId" | "locale" | "copy"> & {
    message: ListProps["items"][number];
  }
>;
