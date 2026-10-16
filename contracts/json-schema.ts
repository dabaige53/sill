export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  format?: string;
  enum?: unknown[];
  const?: unknown;
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
};

export function matchesSchema(schema: JsonSchema, value: unknown): boolean {
  if (schema.allOf?.some(child => !matchesSchema(child, value))) return false;
  if (schema.anyOf && !schema.anyOf.some(child => matchesSchema(child, value))) return false;
  if (schema.enum && !schema.enum.some(option => option === value)) return false;
  if ('const' in schema && schema.const !== value) return false;
  if (Array.isArray(schema.type)) return schema.type.some(type => matchesSchema({ ...schema, type }, value));
  if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity)) return false;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
    if (schema.format === 'uri') { try { new URL(value); } catch { return false; } }
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || schema.type === 'integer' && !Number.isInteger(value)) return false;
    if (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) return false;
  } else if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') return false;
  } else if (schema.type === 'null') {
    if (value !== null) return false;
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) return false;
    if (schema.items && value.some(entry => !matchesSchema(schema.items, entry))) return false;
  } else if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>;
    if (schema.required?.some(key => !Object.hasOwn(object, key))) return false;
    for (const [key, entry] of Object.entries(object)) {
      const child = schema.properties?.[key];
      if (child && !matchesSchema(child, entry)) return false;
      if (!child && schema.additionalProperties === false) return false;
      if (!child && typeof schema.additionalProperties === 'object' && !matchesSchema(schema.additionalProperties, entry)) return false;
    }
  }
  return true;
}
