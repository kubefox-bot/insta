type Options = Readonly<{
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (frame: number) => void;
  reveal: () => void;
}>;

/**
 * Откладывает reveal на два animation frame после mount; teardown инвалидирует callbacks и
 * отменяет последний запрошенный frame через переданный порт.
 */
export const revealAfterPaint = ({
  requestFrame,
  cancelFrame,
  reveal,
}: Options) => {
  let active = true;
  let frame = requestFrame(() => {
    if (!active) return;
    frame = requestFrame(() => {
      if (active) reveal();
    });
  });
  return () => {
    active = false;
    cancelFrame(frame);
  };
};
