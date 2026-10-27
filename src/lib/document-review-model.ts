/** Reading progress is granted only for successfully rendered, complete content. */
export function documentReachedEnd({ scrollTop, clientHeight, scrollHeight, ready }: {
  scrollTop: number; clientHeight: number; scrollHeight: number; ready: boolean;
}): boolean {
  return ready && clientHeight > 0 && scrollHeight > 0 && scrollTop + clientHeight >= scrollHeight - 24;
}