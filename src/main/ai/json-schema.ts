/** A small JSON Schema builder and checker, covering what structured output needs. */

export type JsonSchema =
  | { type: 'string'; enum?: string[] }
  | { type: 'integer' }
  | { type: 'array'; items: JsonSchema }
  | { type: 'object'; properties: Record<string, JsonSchema>; required: string[]; additionalProperties: false }

export const text: JsonSchema = { type: 'string' }
export const integer: JsonSchema = { type: 'integer' }
export const oneOf = (...values: string[]): JsonSchema => ({ type: 'string', enum: values })
export const list = (items: JsonSchema): JsonSchema => ({ type: 'array', items })
export const object = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false
})

/** Model output is untrusted, even when constrained, so its shape is always checked. */
export function matchesSchema(schema: JsonSchema, value: unknown): boolean {
  switch (schema.type) {
    case 'string':
      return typeof value === 'string' && (!schema.enum || schema.enum.includes(value))
    case 'integer':
      return Number.isSafeInteger(value)
    case 'array':
      return Array.isArray(value) && value.every((item) => matchesSchema(schema.items, item))
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
      const record = value as Record<string, unknown>
      return schema.required.every((key) => matchesSchema(schema.properties[key]!, record[key]))
    }
  }
}
