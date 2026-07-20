export function canSubscribeContainer(
  containerId: string,
  containers: { id: string; projectId: string | null }[],
): boolean {
  const match = containers.find((c) => c.id === containerId)
  return match?.projectId != null
}
