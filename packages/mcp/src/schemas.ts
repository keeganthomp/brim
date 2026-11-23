import { Effect, Schema } from 'effect';
import { McpFailure } from './errors.js';

export const EmptyInput = Schema.Record(Schema.String, Schema.Never);
export const FetchInput = Schema.Struct({
  url: Schema.String.check(
    Schema.isBetweenLength(1, 4096),
    Schema.isPattern(/^https?:\/\/[^\s]+$/),
  ),
  method: Schema.optionalKey(Schema.Literals(['GET', 'POST'])),
  body: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(16_384))),
});
export const MAX_RESPONSE_BYTES = 65_536;

export function toolInput<S extends Schema.Constraint>(schema: S, value: unknown) {
  return Schema.decodeUnknownEffect(schema, { onExcessProperty: 'error' })(value).pipe(
    Effect.mapError(
      () =>
        new McpFailure({
          code: 'INVALID_ARGUMENTS',
          message:
            'Use only the documented tool arguments. Vault config, key, and RPC settings belong in server configuration.',
        }),
    ),
  );
}

// The advertised JSON Schema is generated from the same Effect schemas used at runtime.
export function inputJsonSchema(schema: Schema.Constraint) {
  const document = Schema.toJsonSchemaDocument(schema);
  return { ...document.schema, type: 'object' as const, additionalProperties: false };
}
