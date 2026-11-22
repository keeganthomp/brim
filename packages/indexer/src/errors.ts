import { Data } from 'effect';

/** Codes contain no endpoint, credential, raw database error, or untrusted payload. */
export class IndexerConfigurationError extends Data.TaggedError('IndexerConfigurationError')<{
  code: string;
}> {
  override get message() {
    return this.code;
  }
}
export class IndexerValidationError extends Data.TaggedError('IndexerValidationError')<{
  code: string;
}> {
  override get message() {
    return this.code;
  }
}
export class IndexerRpcError extends Data.TaggedError('IndexerRpcError')<{ code: string }> {
  override get message() {
    return this.code;
  }
}
export class IndexerPersistenceError extends Data.TaggedError('IndexerPersistenceError')<{
  code: string;
}> {
  override get message() {
    return this.code;
  }
}
export class WebhookRequestError extends Data.TaggedError('WebhookRequestError')<{
  code: string;
  status: number;
}> {
  override get message() {
    return this.code;
  }
}
export type IndexerError =
  IndexerConfigurationError | IndexerValidationError | IndexerRpcError | IndexerPersistenceError;
