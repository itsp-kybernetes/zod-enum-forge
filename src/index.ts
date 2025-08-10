// Compatibility layer for Zod v3 and v4
import * as z3 from "zod/v3";
import * as z4 from "zod/v4";

// We'll detect the version dynamically based on the schemas passed to us
let z: any = z3.z; // Default to v3
let zodVersion: 'v3' | 'v4' = 'v3';

// Try to detect global Zod instance
function detectGlobalZod(): any {
  // Try to find Zod in the global scope (for browser) or require cache (for Node)
  if (typeof window !== 'undefined' && (window as any).z) {
    return (window as any).z;
  }
  
  // In Node.js, default to v3 for better compatibility
  // Most existing projects use v3, and v4 is newer
  try {
    return z3.z;
  } catch {
    return z4.z;
  }
}

// Initialize with best guess
z = detectGlobalZod();
zodVersion = (z.string()._zod) ? 'v4' : 'v3';

// Dynamic version detection based on schema objects
function detectZodVersion(schema: any): 'v3' | 'v4' {
  if (schema && (schema as any)._zod) {
    return 'v4';
  }
  return 'v3';
}

// Get the Zod instance from a schema's constructor
function getZodInstanceFromSchema(schema: any): any {
  if (schema && schema.constructor) {
    // Try to get the global z from the same context as the schema
    const ctor = schema.constructor;
    
    // Check if it's v4 by looking for _zod property
    if ((schema as any)._zod) {
      return z4.z;
    } else {
      return z3.z;
    }
  }
  
  // Fallback to our default
  return z;
}

// Update the z instance based on detected version
function updateZodInstance(version: 'v3' | 'v4') {
  if (zodVersion !== version) {
    zodVersion = version;
    z = zodVersion === 'v4' ? z4.z : z3.z;
  }
}

// --- Type definitions ---

type ZodEnumValues = [string, ...string[]];

// --- Compatibility helpers ---

function getDef(schema: any): any {
  // Try both v4 and v3 structures
  return schema._zod?.def || schema._def || schema.def;
}

function setMetadata(schema: any, metadata: any): void {
  // Try v4 first, then v3
  if (schema._zod?.def) {
    schema._zod.def.metadata = metadata;
  } else if (schema._def) {
    schema._def.metadata = metadata;
  } else if (schema.def) {
    schema.def.metadata = metadata;
  }
}

function getEnumValues(enumDef: any): string[] {
  // Helper function to try different enum value extraction strategies
  const tryExtractValues = (...extractors: (() => any)[]): string[] => {
    for (const extractor of extractors) {
      try {
        const result = extractor();
        if (result) {
          return Array.isArray(result) ? result : Object.values(result);
        }
      } catch {
        // Continue to next extractor
      }
    }
    return [];
  };

  const values = tryExtractValues(
    () => enumDef._zod?.values && Array.from(enumDef._zod.values), // v4 Set
    () => enumDef.enum,                                            // Common .enum property
    () => getDef(enumDef)?.entries,                               // v4 def entries
    () => getDef(enumDef)?.values                                 // v3 def values
  );

  if (values.length === 0) {
    throw new Error('Unable to extract enum values');
  }
  
  return values;
}

// --- Type Guards ---

/**
 * Generic type guard factory for Zod types
 * Works with both v3 and v4 by checking typeName in def and traits in _zod
 */
function createZodTypeGuard(typeName: string) {
  return function(x: unknown): boolean {
    // Try both v3 and v4 detection
    const def = (x as any)?._def || (x as any)?._zod?.def;
    return def?.typeName === typeName || 
           (x as any)?._zod?.traits?.has(typeName) || 
           (x as any)?._zod?.traits?.has(`$${typeName}`);
  };
}

// Generate all type guards using the factory
const isZodObject = createZodTypeGuard('ZodObject');
const isZodEnum = createZodTypeGuard('ZodEnum');
const isZodUnion = createZodTypeGuard('ZodUnion');
const isZodString = createZodTypeGuard('ZodString');
const isZodOptional = createZodTypeGuard('ZodOptional');
const isZodNullable = createZodTypeGuard('ZodNullable');

/**
 * Generic unwrapper for Zod wrapper types (optional, nullable, etc.)
 */
function unwrapZodType(x: any, typeGuard: (x: unknown) => boolean): any {
  if (typeGuard(x)) {
    const def = getDef(x);
    return def?.innerType;
  }
  return x;
}

// Create specific unwrappers using the generic function
const unwrapOptional = (x: any) => unwrapZodType(x, isZodOptional);
const unwrapNullable = (x: any) => unwrapZodType(x, isZodNullable);

function unwrapOptionalAndNullable(x: any): { schema: any; isOptional: boolean; isNullable: boolean } {
  let schema = x;
  let isOptional = false;
  let isNullable = false;

  // Check for optional wrapper
  if (isZodOptional(schema)) {
    isOptional = true;
    schema = unwrapOptional(schema);
  }

  // Check for nullable wrapper
  if (isZodNullable(schema)) {
    isNullable = true;
    schema = unwrapNullable(schema);
  }

  // Check again for optional after nullable (in case of .nullable().optional())
  if (isZodOptional(schema)) {
    isOptional = true;
    schema = unwrapOptional(schema);
  }

  return { schema, isOptional, isNullable };
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

const DEFAULT_DESC = "If none of the existing enum values match, provide a new appropriate value for this field. Don't copy this description to the new value.";

/**
 * Sanitizes a value to prevent DEFAULT_DESC from being added as an enum value
 */
function sanitizeEnumValue(value: string): string {
    if (value === DEFAULT_DESC || value.includes(DEFAULT_DESC)) {
        return "unknown";
    }
    return value;
}

/**
 * Creates a flexible enum that allows for dynamic extension.
 */
export function flexEnum(values: string[], description?: string): any;
export function flexEnum(enumDef: any, description?: string): any;
export function flexEnum(schema: any, dataJson: unknown): any;
export function flexEnum(zodInstance: any, values: string[], description?: string): any;
export function flexEnum(zodInstance: any, enumDef: any, description?: string): any;

export function flexEnum(...args: any[]): any {
  const [firstArg, secondArg, thirdArg] = args;

  // New overloads: (zodInstance, values | ZodEnum, description?)
  if (args.length >= 2 && typeof firstArg === 'object' && 
      firstArg.enum && firstArg.string && firstArg.object) {
    // First arg looks like a Zod instance
    const zodInstance = firstArg;
    
    if (Array.isArray(secondArg) || isZodEnum(secondArg)) {
      const enumDef = Array.isArray(secondArg) ? zodInstance.enum(toTuple(secondArg)) : secondArg;
      const description = (thirdArg as string) || DEFAULT_DESC;
      
      // Create a union with string to make it truly flexible
      const stringSchema = zodInstance.string().describe(description);
      const flexibleEnum = enumDef.or(stringSchema);
      
      // Store metadata on the union
      setMetadata(flexibleEnum, { enumForge: true, description });
      return flexibleEnum;
    }
  }

  // Overload 1 & 2: (values | ZodEnum, description?)
  if (Array.isArray(firstArg) || isZodEnum(firstArg)) {
    let zodInstance = z; // Default
    
    // If we have a ZodEnum, use the same Zod instance
    if (!Array.isArray(firstArg)) {
      zodInstance = getZodInstanceFromSchema(firstArg);
      const detectedVersion = detectZodVersion(firstArg);
      updateZodInstance(detectedVersion);
    }
    
    const enumDef = Array.isArray(firstArg) ? zodInstance.enum(toTuple(firstArg)) : firstArg;
    const description = (secondArg as string) || DEFAULT_DESC;
    
    // Create a union with string to make it truly flexible
    const stringSchema = zodInstance.string().describe(description);
    const flexibleEnum = enumDef.or(stringSchema);
    
    // Store metadata on the union
    setMetadata(flexibleEnum, { enumForge: true, description });
    return flexibleEnum;
  }

  // Overload 3: (schema, dataJson)
  if (isZodObject(firstArg) && secondArg) {
    // Detect version from the schema object and update our instance
    const zodInstance = getZodInstanceFromSchema(firstArg);
    const detectedVersion = detectZodVersion(firstArg);
    updateZodInstance(detectedVersion);
    
    return updateSchemaFromData(firstArg, secondArg, zodInstance);
  }

  throw new Error(
    "Invalid flexEnum signature. Use: flexEnum(values, desc?), flexEnum(z.enum(...), desc?), flexEnum(schema, dataJson), or flexEnum(z, values, desc?)."
  );
}

function updateSchemaFromData(schema: any, data: any, zodInstance?: any): any {
    const zod = zodInstance || z; // Use passed instance or fallback to global
    const shape = schema.shape; // Direct access instead of getShape helper
    const modifiedFields: Record<string, any> = {};

    for (const key in shape) {
        if (Object.prototype.hasOwnProperty.call(shape, key)) {
            const field = shape[key];
            const value = data?.[key];

            // Unwrap optional and nullable fields to get the underlying type
            const { schema: unwrappedField, isOptional, isNullable } = unwrapOptionalAndNullable(field);

            if (isZodObject(unwrappedField) && value) {
                const newField = updateSchemaFromData(unwrappedField, value, zod);
                if (newField !== unwrappedField) {
                    // Wrap the new field back with nullable/optional in the same order
                    // IMPORTANT: Use the same Zod instance that created the new field
                    let finalField = newField;
                    if (isNullable) finalField = finalField.nullable();
                    if (isOptional) finalField = finalField.optional();
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
                        const sanitizedValue = sanitizeEnumValue(value);
                        const newEnumValues = [...currentValues, sanitizedValue];
                        const newEnum = zod.enum(toTuple(newEnumValues));
                        // Create new string part using the same Zod instance for consistency
                        const stringDef = getDef(stringPart);
                        const description = stringDef?.description || DEFAULT_DESC;
                        const newStringPart = zod.string().describe(description);
                        const newUnion = newEnum.or(newStringPart);
                        setMetadata(newUnion, { enumForge: true });
                        // Wrap the new union back with nullable/optional in the same order
                        // Use the passed Zod instance to maintain version consistency
                        let finalField = newUnion;
                        if (isNullable) finalField = finalField.nullable();
                        if (isOptional) finalField = finalField.optional();
                        modifiedFields[key] = finalField;
                    }
                } else if (isZodEnum(unwrappedField)) {
                    // Handle plain enum with flexEnum metadata
                    const currentValues = getEnumValues(unwrappedField);
                    const metadata = def.metadata;
                    
                    if (typeof value === 'string' && !currentValues.includes(value)) {
                        const sanitizedValue = sanitizeEnumValue(value);
                        const newEnumValues = [...currentValues, sanitizedValue];
                        const newEnum = zod.enum(toTuple(newEnumValues));
                        const description = metadata?.description || DEFAULT_DESC;
                        const newUnion = newEnum.or(zod.string().describe(description));
                        setMetadata(newUnion, { enumForge: true });
                        // Wrap the new union back with nullable/optional in the same order
                        let finalField = newUnion;
                        if (isNullable) finalField = finalField.nullable();
                        if (isOptional) finalField = finalField.optional();
                        modifiedFields[key] = finalField;
                    }
                }
            } else if (isZodEnum(unwrappedField)) {
                // Handle regular ZodEnum - convert to flexEnum and add new value
                const currentValues = getEnumValues(unwrappedField);
                
                if (typeof value === 'string' && !currentValues.includes(value)) {
                    const sanitizedValue = sanitizeEnumValue(value);
                    const newEnumValues = [...currentValues, sanitizedValue];
                    const newEnum = zod.enum(toTuple(newEnumValues));
                    const newUnion = newEnum.or(zod.string().describe(DEFAULT_DESC));
                    setMetadata(newUnion, { enumForge: true });
                    // Wrap the new union back with nullable/optional in the same order
                    let finalField = newUnion;
                    if (isNullable) finalField = finalField.nullable();
                    if (isOptional) finalField = finalField.optional();
                    modifiedFields[key] = finalField;
                }
            }
        }
    }

    return Object.keys(modifiedFields).length > 0 ? schema.extend(modifiedFields) : schema;
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
        const sanitizedToAdd = toAdd.map(value => sanitizeEnumValue(value));
        return toTuple([...base, ...sanitizedToAdd]);
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
        const field = schema.shape[key]; // Direct access instead of getShape helper

        // Unwrap optional and nullable to get the underlying enum
        const { schema: unwrappedField, isOptional, isNullable } = unwrapOptionalAndNullable(field);

        if (!isZodEnum(unwrappedField)) {
            throw new Error(`Field "${key}" is not a ZodEnum.`);
        }
        
        const baseValues = getEnumValues(unwrappedField);
        const newValues = getNewValues(baseValues, arg3);
        
        // Create new enum and wrap back with nullable/optional in the same order
        let newEnum = z.enum(newValues);
        if (isNullable) newEnum = newEnum.nullable();
        if (isOptional) newEnum = newEnum.optional();
        
        return schema.extend({ // Direct call instead of extendSchema helper
            [key]: newEnum,
        });
    }

    throw new Error(
        "Invalid forgeEnum signature. Use: forgeEnum(values, add), forgeEnum(z.enum(...), add) or forgeEnum(schema, 'key', add)."
    );
}
