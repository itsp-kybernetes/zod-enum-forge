// Compatibility layer for Zod v3 and v4
import * as z3 from "zod/v3";
import * as z4 from "zod/v4";

let z: any;
let zodVersion: 'v3' | 'v4';

// Detect version by checking structure
const testSchema = z4.z.string();
zodVersion = (testSchema as any)._zod ? 'v4' : 'v3';
z = zodVersion === 'v4' ? z4.z : z3.z;

// --- Type definitions ---

type ZodEnumValues = [string, ...string[]];

// --- Compatibility helpers ---

function getDef(schema: any): any {
  if (zodVersion === 'v4') {
    return schema._zod?.def || schema.def;
  } else {
    return schema._def;
  }
}

function setMetadata(schema: any, metadata: any): void {
  if (zodVersion === 'v4') {
    if (schema._zod?.def) {
      schema._zod.def.metadata = metadata;
    } else if (schema.def) {
      schema.def.metadata = metadata;
    }
  } else if (zodVersion === 'v3' && schema._def) {
    schema._def.metadata = metadata;
  }
}

function getEnumValues(enumDef: any): string[] {
  if (zodVersion === 'v4') {
    // Check for v4 _zod.values Set
    if (enumDef._zod?.values) {
      return Array.from(enumDef._zod.values);
    }
    // Check for .enum property (should exist in v4)
    if (enumDef.enum) {
      return Object.values(enumDef.enum);
    }
    // Check def entries
    const def = getDef(enumDef);
    if (def?.entries) {
      return Object.values(def.entries);
    }
  } else {
    // v3 uses .enum property
    if (enumDef.enum) {
      return Object.values(enumDef.enum);
    }
    // Fallback to internal def structure
    const def = getDef(enumDef);
    if (def?.values) {
      return def.values;
    }
  }
  
  throw new Error('Unable to extract enum values');
}

function getShape(schema: any): any {
  return schema.shape;
}

function extendSchema(schema: any, fields: any): any {
  return schema.extend(fields);
}

// --- Type Guards ---

function isZodObject(x: unknown): boolean {
  if (zodVersion === 'v4') {
    return (x as any)?._zod?.traits?.has('ZodObject') || (x as any)?._zod?.traits?.has('$ZodObject');
  } else {
    const def = getDef(x);
    return def?.typeName === 'ZodObject';
  }
}

function isZodEnum(x: unknown): boolean {
  if (zodVersion === 'v4') {
    return (x as any)?._zod?.traits?.has('ZodEnum') || (x as any)?._zod?.traits?.has('$ZodEnum');
  } else {
    const def = getDef(x);
    return def?.typeName === 'ZodEnum';
  }
}

function isZodUnion(x: unknown): boolean {
  if (zodVersion === 'v4') {
    return (x as any)?._zod?.traits?.has('ZodUnion') || (x as any)?._zod?.traits?.has('$ZodUnion');
  } else {
    const def = getDef(x);
    return def?.typeName === 'ZodUnion';
  }
}

function isZodString(x: unknown): boolean {
  if (zodVersion === 'v4') {
    return (x as any)?._zod?.traits?.has('ZodString') || (x as any)?._zod?.traits?.has('$ZodString');
  } else {
    const def = getDef(x);
    return def?.typeName === 'ZodString';
  }
}

function isZodOptional(x: unknown): boolean {
  if (zodVersion === 'v4') {
    return (x as any)?._zod?.traits?.has('ZodOptional') || (x as any)?._zod?.traits?.has('$ZodOptional');
  } else {
    const def = getDef(x);
    return def?.typeName === 'ZodOptional';
  }
}

function unwrapOptional(x: any): any {
  if (isZodOptional(x)) {
    const def = getDef(x);
    return def?.innerType;
  }
  return x;
}

function isFlexEnum(x: unknown): boolean {
    const def = getDef(x);
    const meta = def.metadata;
    
    // Check if it's a union (enum.or(string)) with enumForge metadata
    if (isZodUnion(x)) {
        const options = def.options;
        if (options.length !== 2) return false;
        const hasEnum = isZodEnum(options[0]);
        const hasString = isZodString(options[1]);
        return hasEnum && hasString && meta?.enumForge === true;
    }
    
    // Check if it's a plain enum with enumForge metadata (from flexEnum mode 1)
    if (isZodEnum(x)) {
        return meta?.enumForge === true;
    }
    
    return false;
}

function toTuple(values: string[]): ZodEnumValues {
    const uniqueValues = [...new Set(values)];
    if (uniqueValues.length === 0) {
        throw new Error("Enum must have at least one value.");
    }
    return uniqueValues as ZodEnumValues;
}

// --- flexEnum ---

const DEFAULT_DESC = "A new, previously undefined element compared to previous enum values.";

/**
 * Creates a flexible enum that allows for dynamic extension.
 */
export function flexEnum(values: string[], description?: string): any;
export function flexEnum(enumDef: any, description?: string): any;
export function flexEnum(schema: any, dataJson: unknown): any;

export function flexEnum(...args: any[]): any {
  const [firstArg, secondArg] = args;

  // Overload 1 & 2: (values | ZodEnum, description?)
  if (Array.isArray(firstArg) || isZodEnum(firstArg)) {
    const enumDef = Array.isArray(firstArg) ? z.enum(toTuple(firstArg)) : firstArg;
    const description = (secondArg as string) || DEFAULT_DESC;
    
    // Store description for future use when extending
    setMetadata(enumDef, { enumForge: true, description });
    return enumDef;
  }

  // Overload 3: (schema, dataJson)
  if (isZodObject(firstArg) && secondArg) {
    return updateSchemaFromData(firstArg, secondArg);
  }

  throw new Error(
    "Invalid flexEnum signature. Use: flexEnum(values, desc?), flexEnum(z.enum(...), desc?) or flexEnum(schema, dataJson)."
  );
}

function updateSchemaFromData(schema: any, data: any): any {
    const shape = getShape(schema);
    const modifiedFields: Record<string, any> = {};

    for (const key in shape) {
        if (Object.prototype.hasOwnProperty.call(shape, key)) {
            const field = shape[key];
            const value = data?.[key];

            // Unwrap optional fields to get the underlying type
            const unwrappedField = unwrapOptional(field);
            const isOptional = isZodOptional(field);

            if (isZodObject(unwrappedField) && value) {
                const newField = updateSchemaFromData(unwrappedField, value);
                if (newField !== unwrappedField) {
                    // If it was optional, wrap the new field back in optional
                    const finalField = isOptional ? newField.optional() : newField;
                    modifiedFields[key] = finalField;
                }
            } else if (isFlexEnum(unwrappedField)) {
                const def = getDef(unwrappedField);
                
                if (isZodUnion(unwrappedField)) {
                    // Handle union type (enum.or(string))
                    const enumPart = def.options[0];
                    const stringPart = def.options[1];
                    const currentValues = getEnumValues(enumPart);

                    if (typeof value === 'string' && !currentValues.includes(value)) {
                        const newEnumValues = [...currentValues, value];
                        const newEnum = z.enum(toTuple(newEnumValues));
                        const newUnion = newEnum.or(stringPart);
                        setMetadata(newUnion, { enumForge: true });
                        // If it was optional, wrap the new union back in optional
                        const finalField = isOptional ? newUnion.optional() : newUnion;
                        modifiedFields[key] = finalField;
                    }
                } else if (isZodEnum(unwrappedField)) {
                    // Handle plain enum with flexEnum metadata
                    const currentValues = getEnumValues(unwrappedField);
                    const metadata = def.metadata;
                    
                    if (typeof value === 'string' && !currentValues.includes(value)) {
                        const newEnumValues = [...currentValues, value];
                        const newEnum = z.enum(toTuple(newEnumValues));
                        const description = metadata?.description || DEFAULT_DESC;
                        const newUnion = newEnum.or(z.string().describe(description));
                        setMetadata(newUnion, { enumForge: true });
                        // If it was optional, wrap the new union back in optional
                        const finalField = isOptional ? newUnion.optional() : newUnion;
                        modifiedFields[key] = finalField;
                    }
                }
            } else if (isZodEnum(unwrappedField)) {
                // Handle regular ZodEnum - convert to flexEnum and add new value
                const currentValues = getEnumValues(unwrappedField);
                
                if (typeof value === 'string' && !currentValues.includes(value)) {
                    const newEnumValues = [...currentValues, value];
                    const newEnum = z.enum(toTuple(newEnumValues));
                    const newUnion = newEnum.or(z.string().describe(DEFAULT_DESC));
                    setMetadata(newUnion, { enumForge: true });
                    // If it was optional, wrap the new union back in optional
                    const finalField = isOptional ? newUnion.optional() : newUnion;
                    modifiedFields[key] = finalField;
                }
            }
        }
    }

    return Object.keys(modifiedFields).length > 0 ? extendSchema(schema, modifiedFields) : schema;
}

// --- forgeEnum ---

/**
 * Extends a ZodEnum with new values.
 */
export function forgeEnum(values: string[], add: string[] | string): any;
export function forgeEnum(enumDef: any, add: string[] | string): any;
export function forgeEnum(schema: any, key: string, add: string[] | string): any;

export function forgeEnum(...args: any[]): any {
    const [arg1, arg2, arg3] = args;

    const getNewValues = (base: string[], add: string | string[]): ZodEnumValues => {
        const toAdd = Array.isArray(add) ? add : [add];
        return toTuple([...base, ...toAdd]);
    };

    // Overload 1: (values, add)
    if (Array.isArray(arg1)) {
        const newValues = getNewValues(arg1, arg2);
        return z.enum(newValues);
    }

    // Overload 2: (enumDef, add)
    if (isZodEnum(arg1)) {
        const baseValues = getEnumValues(arg1);
        const newValues = getNewValues(baseValues, arg2);
        return z.enum(newValues);
    }

    // Overload 3: (schema, key, add)
    if (isZodObject(arg1) && typeof arg2 === 'string') {
        const schema = arg1;
        const key = arg2;
        const field = getShape(schema)[key];

        if (!isZodEnum(field)) {
            throw new Error(`Field "${key}" is not a ZodEnum.`);
        }
        
        const baseValues = getEnumValues(field);
        const newValues = getNewValues(baseValues, arg3);
        
        return extendSchema(schema, {
            [key]: z.enum(newValues),
        });
    }

    throw new Error(
        "Invalid forgeEnum signature. Use: forgeEnum(values, add), forgeEnum(z.enum(...), add) or forgeEnum(schema, 'key', add)."
    );
}
