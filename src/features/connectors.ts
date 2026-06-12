// No shape or style overrides: stamped arrows use Miro's SDK defaults, so
// they are indistinguishable from manually drawn ones.

export async function connect(fromId: string, toId: string) {
  return miro.board.createConnector({
    start: { item: fromId },
    end: { item: toId },
  });
}
