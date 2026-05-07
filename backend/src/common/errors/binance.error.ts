export class BinanceApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number | string,
    public readonly status?: number,
  ) {
    super(message);
  }
}
