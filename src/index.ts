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

// --- Helpers for new functionality ---
interface FlexityInfo { values: string[]; description?: string }
export type FlexityLayer = Record<string, FlexityInfo>;

function extractEnumPartFromFlexEnum(flex: any): any {
  const def = getDef(flex);
  if (isZodUnion(flex)) {
    // flexEnum union structure enum.or(string)
    return def.options[0];
  }
  if (isZodEnum(flex)) return flex; // plain enum possibly with metadata
  throw new Error('Not a flex enum');
}

function cloneEnumWithValues(zodInstance: any, baseEnum: any, newValues: string[]): any {
  // Create fresh enum (safer than mutating existing)
  return zodInstance.enum(toTuple(newValues));
}

function wrapEnumLike(original: any, replacementEnum: any, isOptional: boolean, isNullable: boolean): any {
  let out = replacementEnum;
  if (isNullable) out = out.nullable();
  if (isOptional) out = out.optional();
  return out;
}

// --- forgeEnum alias ---
export function addToEnum(...args: any[]) { return (forgeEnum as any)(...args); }

// --- limitEnum / deleteFromEnum ---
export function limitEnum(values: string[], remove: string|string[]): any;
export function limitEnum(enumOrFlex: any, remove: string|string[]): any;
export function limitEnum(schema: any, key: string, remove: string|string[]): any;
export function limitEnum(...args: any[]): any {
  const [a1,a2,a3] = args;
  const toRemove = (r: string|string[]) => new Set((Array.isArray(r) ? r : [r]).map(x=>x));
  const filterValues = (vals: string[], rem: Set<string>) => vals.filter(v => !rem.has(v));

  const processFlexOrEnum = (target: any, remove: string|string[], zodInstance: any): any => {
    const remSet = toRemove(remove);
    if (isZodEnum(target)) {
      const current = getEnumValues(target);
      const next = filterValues(current, remSet);
      if (next.length === 0) throw new Error('Resulting enum would be empty.');
      return zodInstance.enum(toTuple(next));
    }
    if (isFlexEnum(target)) {
      const def = getDef(target);
      if (isZodUnion(target)) {
        const enumPart = def.options[0];
        const stringPart = def.options[1];
        const current = getEnumValues(enumPart);
        const next = filterValues(current, remSet);
        if (next.length === 0) throw new Error('Resulting enum would be empty.');
        const newEnum = zodInstance.enum(toTuple(next));
        const stringDef = getDef(stringPart);
        const description = stringDef?.description || DEFAULT_DESC;
        const newUnion = newEnum.or(zodInstance.string().describe(description));
        setMetadata(newUnion, { enumForge: true, description });
        return newUnion;
      }
      // plain enum with metadata
      const current = getEnumValues(target);
      const next = filterValues(current, remSet);
      if (next.length === 0) throw new Error('Resulting enum would be empty.');
      const newEnum = zodInstance.enum(toTuple(next));
      // preserve metadata? keep it as flex for consistency
      setMetadata(newEnum, { enumForge: true, description: getDef(target)?.metadata?.description });
      return newEnum;
    }
    throw new Error('limitEnum: unsupported target type.');
  };

  // Overload 1: array
  if (Array.isArray(a1)) {
    const rem = a2;
    const remSet = toRemove(rem);
    const next = (a1 as string[]).filter(v => !remSet.has(v));
    if (next.length === 0) throw new Error('Resulting enum would be empty.');
    return z.enum(toTuple(next));
  }

  // Overload 2: enum or flexEnum
  if (a1 && (isZodEnum(a1) || isFlexEnum(a1))) {
    return processFlexOrEnum(a1, a2, getZodInstanceFromSchema(a1));
  }

  // Overload 3: schema, key, remove
  if (isZodObject(a1) && typeof a2 === 'string') {
    const schema = a1; const key = a2 as string; const rem = a3;
    const field = schema.shape[key];
    const { schema: unwrapped, isOptional, isNullable } = unwrapOptionalAndNullable(field);
    const zodInstance = getZodInstanceFromSchema(unwrapped);
    if (!(isZodEnum(unwrapped) || isFlexEnum(unwrapped))) throw new Error(`Field "${key}" is not a ZodEnum / flexEnum.`);
    const updated = processFlexOrEnum(unwrapped, rem, zodInstance);
    const finalField = wrapEnumLike(field, updated, isOptional, isNullable); // field contains wrappers already; we rebuild through unwrapped? Simplify by rewrapping on updated
    return schema.extend({ [key]: finalField });
  }

  throw new Error('Invalid limitEnum signature.');
}
export function deleteFromEnum(...args: any[]) { return (limitEnum as any)(...args); }

// --- strictEnum / deflexStructure ---
export function strictEnum(schemaOrFlex: any): any {
  // Single flex/enum case
  if (isFlexEnum(schemaOrFlex) || isZodEnum(schemaOrFlex)) {
    return _strictOne(schemaOrFlex);
  }
  if (isZodObject(schemaOrFlex)) {
    return _strictTraverse(schemaOrFlex);
  }
  throw new Error('strictEnum expects a flexEnum / enum / ZodObject structure');
}

function _strictOne(x: any): any {
  let isOptional = false, isNullable = false;
  // unwrap wrappers if any (user might pass wrapped field directly)
  const { schema: unwrapped, isOptional: opt, isNullable: nul } = unwrapOptionalAndNullable(x);
  isOptional = opt; isNullable = nul;
  if (isFlexEnum(unwrapped)) {
    if (isZodUnion(unwrapped)) {
      const enumPart = extractEnumPartFromFlexEnum(unwrapped);
      // remove metadata if present
      setMetadata(enumPart, undefined);
      let rebuilt = enumPart;
      if (isNullable) rebuilt = rebuilt.nullable();
      if (isOptional) rebuilt = rebuilt.optional();
      return rebuilt;
    }
    // plain enum with metadata
    setMetadata(unwrapped, undefined);
    let rebuilt = unwrapped;
    if (isNullable) rebuilt = rebuilt.nullable();
    if (isOptional) rebuilt = rebuilt.optional();
    return rebuilt;
  }
  // already simple enum - just remove metadata if any
  setMetadata(unwrapped, undefined);
  let rebuilt = unwrapped;
  if (isNullable) rebuilt = rebuilt.nullable();
  if (isOptional) rebuilt = rebuilt.optional();
  return rebuilt;
}

function _strictTraverse(schema: any): any {
  const shape = schema.shape;
  const modified: Record<string, any> = {};
  for (const key in shape) {
    const field = shape[key];
    const { schema: unwrapped, isOptional, isNullable } = unwrapOptionalAndNullable(field);
    if (isFlexEnum(unwrapped)) {
      const cleaned = _strictOne(unwrapped);
      let finalField = cleaned;
      if (isNullable) finalField = finalField.nullable();
      if (isOptional) finalField = finalField.optional();
      if (finalField !== field) modified[key] = finalField;
    } else if (isZodObject(unwrapped)) {
      const nested = _strictTraverse(unwrapped);
      if (nested !== unwrapped) {
        let finalField = nested;
        if (isNullable) finalField = finalField.nullable();
        if (isOptional) finalField = finalField.optional();
        modified[key] = finalField;
      }
    }
  }
  return Object.keys(modified).length ? schema.extend(modified) : schema;
}

export function deflexStructure(schema: any): any { return strictEnum(schema); }

// --- separateFlexibility ---
export function separateFlexibility(schema: any): { schema: any; flexityLayer: FlexityLayer } {
  if (!isZodObject(schema)) throw new Error('separateFlexibility expects a ZodObject');
  const layer: FlexityLayer = {};
  const cleaned = _separateTraverse(schema, layer, []);
  return { schema: cleaned, flexityLayer: layer };
}

function _separateTraverse(schema: any, layer: FlexityLayer, path: string[]): any {
  const shape = schema.shape;
  const modified: Record<string, any> = {};
  for (const key in shape) {
    const field = shape[key];
    const newPath = [...path, key];
    const pathStr = newPath.join('.');
    const { schema: unwrapped, isOptional, isNullable } = unwrapOptionalAndNullable(field);
    if (isFlexEnum(unwrapped)) {
      const def = getDef(unwrapped);
      let description: string|undefined;
      if (isZodUnion(unwrapped)) {
        const stringPart = getDef(unwrapped).options[1];
        description = getDef(stringPart)?.description || getDef(unwrapped)?.metadata?.description;
      } else {
        description = def?.metadata?.description;
      }
      const enumPart = isZodUnion(unwrapped) ? getDef(unwrapped).options[0] : unwrapped;
      const values = getEnumValues(enumPart);
      layer[pathStr] = { values: [...values], description };
      const cleaned = strictEnum(unwrapped);
      let finalField = cleaned;
      if (isNullable) finalField = finalField.nullable();
      if (isOptional) finalField = finalField.optional();
      modified[key] = finalField;
    } else if (isZodObject(unwrapped)) {
      const nested = _separateTraverse(unwrapped, layer, newPath);
      if (nested !== unwrapped) {
        let finalField = nested;
        if (isNullable) finalField = finalField.nullable();
        if (isOptional) finalField = finalField.optional();
        modified[key] = finalField;
      }
    }
  }
  return Object.keys(modified).length ? schema.extend(modified) : schema;
}

// --- integrateFlexibility ---
export function integrateFlexibility(schema: any, flexityLayer: FlexityLayer): any {
  if (!isZodObject(schema)) throw new Error('integrateFlexibility expects a ZodObject');
  return _integrateTraverse(schema, flexityLayer, []);
}

function _integrateTraverse(schema: any, layer: FlexityLayer, path: string[]): any {
  const shape = schema.shape;
  const modified: Record<string, any> = {};
  for (const key in shape) {
    const field = shape[key];
    const newPath = [...path, key];
    const pathStr = newPath.join('.');
    const { schema: unwrapped, isOptional, isNullable } = unwrapOptionalAndNullable(field);
    if (layer[pathStr]) {
      // We expect unwrapped to be a ZodEnum now
      if (!isZodEnum(unwrapped)) {
        // If it's still flex maybe, just continue
        continue;
      }
      const info = layer[pathStr];
      const zodInstance = getZodInstanceFromSchema(unwrapped);
      // Ensure values are union of current + stored (in case of drift)
      const existingValues = getEnumValues(unwrapped);
      const unionValues = Array.from(new Set([...existingValues, ...info.values]));
      const baseEnum = zodInstance.enum(toTuple(unionValues));
      const stringSchema = zodInstance.string().describe(info.description || DEFAULT_DESC);
      const flex = baseEnum.or(stringSchema);
      setMetadata(flex, { enumForge: true, description: info.description || DEFAULT_DESC });
      let finalField = flex;
      if (isNullable) finalField = finalField.nullable();
      if (isOptional) finalField = finalField.optional();
      modified[key] = finalField;
    } else if (isZodObject(unwrapped)) {
      const nested = _integrateTraverse(unwrapped, layer, newPath);
      if (nested !== unwrapped) {
        let finalField = nested; if (isNullable) finalField = finalField.nullable(); if (isOptional) finalField = finalField.optional();
        modified[key] = finalField;
      }
    }
  }
  return Object.keys(modified).length ? schema.extend(modified) : schema;
}

export { isFlexEnum };
