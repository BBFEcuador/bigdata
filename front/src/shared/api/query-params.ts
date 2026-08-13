export type QueryValue = string | number | boolean | null | undefined
export type QueryParams = Record<string, QueryValue>

export function compactQuery<T extends QueryParams>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  ) as Partial<T>
}
