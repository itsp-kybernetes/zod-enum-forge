// src/index.ts
import * as z3 from "zod/v3";
import * as z4 from "zod/v4";
var z5 = z3.z;
var zodVersion = "v3";
function detectGlobalZod() {
  if (typeof window !== "undefined" && window.z) {
    return window.z;
  }
  try {
    return z3.z;
  } catch {
    return z4.z;
  }
}
z5 = detectGlobalZod();
zodVersion = z5.string()._zod ? "v4" : "v3";
function detectZodVersion(schema) {
  if (schema && schema._zod) {
    return "v4";
  }
  return "v3";
}
function getZodInstanceFromSchema(schema) {
  if (schema && schema.constructor) {
    const ctor = schema.constructor;
    if (schema._zod) {
      return z4.z;
    } else {
      return z3.z;
    }
  }
  return z5;
}
function updateZodInstance(version) {
  if (zodVersion !== version) {
    zodVersion = version;
    z5 = zodVersion === "v4" ? z4.z : z3.z;
  }
}
function getDef(schema) {
  return schema._zod?.def || schema._def || schema.def;
}
function setMetadata(schema, metadata) {
  if (schema._zod?.def) {
    schema._zod.def.metadata = metadata;
  } else if (schema._def) {
    schema._def.metadata = metadata;
  } else if (schema.def) {
    schema.def.metadata = metadata;
  }
}
function getEnumValues(enumDef) {
  const tryExtractValues = (...extractors) => {
    for (const extractor of extractors) {
      try {
        const result = extractor();
        if (result) {
          return Array.isArray(result) ? result : Object.values(result);
        }
      } catch {
      }
    }
    return [];
  };
  const values = tryExtractValues(
    () => enumDef._zod?.values && Array.from(enumDef._zod.values),
    // v4 Set
    () => enumDef.enum,
    // Common .enum property
    () => getDef(enumDef)?.entries,
    // v4 def entries
    () => getDef(enumDef)?.values
    // v3 def values
  );
  if (values.length === 0) {
    throw new Error("Unable to extract enum values");
  }
  return values;
}
function createZodTypeGuard(typeName) {
  return function(x) {
    const def = x?._def || x?._zod?.def;
    return def?.typeName === typeName || x?._zod?.traits?.has(typeName) || x?._zod?.traits?.has(`$${typeName}`);
  };
}
var isZodObject = createZodTypeGuard("ZodObject");
var isZodEnum = createZodTypeGuard("ZodEnum");
var isZodUnion = createZodTypeGuard("ZodUnion");
var isZodString = createZodTypeGuard("ZodString");
var isZodOptional = createZodTypeGuard("ZodOptional");
var isZodNullable = createZodTypeGuard("ZodNullable");
function unwrapZodType(x, typeGuard) {
  if (typeGuard(x)) {
    const def = getDef(x);
    return def?.innerType;
  }
  return x;
}
var unwrapOptional = (x) => unwrapZodType(x, isZodOptional);
var unwrapNullable = (x) => unwrapZodType(x, isZodNullable);
function unwrapOptionalAndNullable(x) {
  let schema = x;
  let isOptional = false;
  let isNullable = false;
  if (isZodOptional(schema)) {
    isOptional = true;
    schema = unwrapOptional(schema);
  }
  if (isZodNullable(schema)) {
    isNullable = true;
    schema = unwrapNullable(schema);
  }
  if (isZodOptional(schema)) {
    isOptional = true;
    schema = unwrapOptional(schema);
  }
  return { schema, isOptional, isNullable };
}
function isFlexEnum(x) {
  const def = getDef(x);
  const meta = def.metadata;
  if (isZodUnion(x)) {
    const options = def.options;
    if (options.length !== 2) return false;
    const hasEnum = isZodEnum(options[0]);
    const hasString = isZodString(options[1]);
    return hasEnum && hasString && meta?.enumForge === true;
  }
  if (isZodEnum(x)) {
    return meta?.enumForge === true;
  }
  return false;
}
function toTuple(values) {
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length === 0) {
    throw new Error("Enum must have at least one value.");
  }
  return uniqueValues;
}
var DEFAULT_DESC = "If none of the existing enum values match, provide a new appropriate value for this field. Don't copy this description to the new value.";
function sanitizeEnumValue(value) {
  if (value === DEFAULT_DESC || value.includes(DEFAULT_DESC)) {
    return "unknown";
  }
  return value;
}
function flexEnum(...args) {
  const [firstArg, secondArg, thirdArg] = args;
  if (args.length >= 2 && typeof firstArg === "object" && firstArg.enum && firstArg.string && firstArg.object) {
    const zodInstance = firstArg;
    if (Array.isArray(secondArg) || isZodEnum(secondArg)) {
      const enumDef = Array.isArray(secondArg) ? zodInstance.enum(toTuple(secondArg)) : secondArg;
      const description = thirdArg || DEFAULT_DESC;
      const stringSchema = zodInstance.string().describe(description);
      const flexibleEnum = enumDef.or(stringSchema);
      setMetadata(flexibleEnum, { enumForge: true, description });
      return flexibleEnum;
    }
  }
  if (Array.isArray(firstArg) || isZodEnum(firstArg)) {
    let zodInstance = z5;
    if (!Array.isArray(firstArg)) {
      zodInstance = getZodInstanceFromSchema(firstArg);
      const detectedVersion = detectZodVersion(firstArg);
      updateZodInstance(detectedVersion);
    }
    const enumDef = Array.isArray(firstArg) ? zodInstance.enum(toTuple(firstArg)) : firstArg;
    const description = secondArg || DEFAULT_DESC;
    const stringSchema = zodInstance.string().describe(description);
    const flexibleEnum = enumDef.or(stringSchema);
    setMetadata(flexibleEnum, { enumForge: true, description });
    return flexibleEnum;
  }
  if (isZodObject(firstArg) && secondArg) {
    const zodInstance = getZodInstanceFromSchema(firstArg);
    const detectedVersion = detectZodVersion(firstArg);
    updateZodInstance(detectedVersion);
    return updateSchemaFromData(firstArg, secondArg, zodInstance);
  }
  throw new Error(
    "Invalid flexEnum signature. Use: flexEnum(values, desc?), flexEnum(z.enum(...), desc?), flexEnum(schema, dataJson), or flexEnum(z, values, desc?)."
  );
}
function updateSchemaFromData(schema, data, zodInstance) {
  const zod = zodInstance || z5;
  const shape = schema.shape;
  const modifiedFields = {};
  for (const key in shape) {
    if (Object.prototype.hasOwnProperty.call(shape, key)) {
      const field = shape[key];
      const value = data?.[key];
      const { schema: unwrappedField, isOptional, isNullable } = unwrapOptionalAndNullable(field);
      if (isZodObject(unwrappedField) && value) {
        const newField = updateSchemaFromData(unwrappedField, value, zod);
        if (newField !== unwrappedField) {
          let finalField = newField;
          if (isNullable) finalField = finalField.nullable();
          if (isOptional) finalField = finalField.optional();
          modifiedFields[key] = finalField;
        }
      } else if (isFlexEnum(unwrappedField)) {
        const def = getDef(unwrappedField);
        if (isZodUnion(unwrappedField)) {
          const enumPart = def.options[0];
          const stringPart = def.options[1];
          const currentValues = getEnumValues(enumPart);
          if (typeof value === "string" && !currentValues.includes(value)) {
            const sanitizedValue = sanitizeEnumValue(value);
            const newEnumValues = [...currentValues, sanitizedValue];
            const newEnum = zod.enum(toTuple(newEnumValues));
            const stringDef = getDef(stringPart);
            const description = stringDef?.description || DEFAULT_DESC;
            const newStringPart = zod.string().describe(description);
            const newUnion = newEnum.or(newStringPart);
            setMetadata(newUnion, { enumForge: true });
            let finalField = newUnion;
            if (isNullable) finalField = finalField.nullable();
            if (isOptional) finalField = finalField.optional();
            modifiedFields[key] = finalField;
          }
        } else if (isZodEnum(unwrappedField)) {
          const currentValues = getEnumValues(unwrappedField);
          const metadata = def.metadata;
          if (typeof value === "string" && !currentValues.includes(value)) {
            const sanitizedValue = sanitizeEnumValue(value);
            const newEnumValues = [...currentValues, sanitizedValue];
            const newEnum = zod.enum(toTuple(newEnumValues));
            const description = metadata?.description || DEFAULT_DESC;
            const newUnion = newEnum.or(zod.string().describe(description));
            setMetadata(newUnion, { enumForge: true });
            let finalField = newUnion;
            if (isNullable) finalField = finalField.nullable();
            if (isOptional) finalField = finalField.optional();
            modifiedFields[key] = finalField;
          }
        }
      } else if (isZodEnum(unwrappedField)) {
        const currentValues = getEnumValues(unwrappedField);
        if (typeof value === "string" && !currentValues.includes(value)) {
          const sanitizedValue = sanitizeEnumValue(value);
          const newEnumValues = [...currentValues, sanitizedValue];
          const newEnum = zod.enum(toTuple(newEnumValues));
          const newUnion = newEnum.or(zod.string().describe(DEFAULT_DESC));
          setMetadata(newUnion, { enumForge: true });
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
function forgeEnum(...args) {
  const [arg1, arg2, arg3] = args;
  const getNewValues = (base, add) => {
    const toAdd = Array.isArray(add) ? add : [add];
    const sanitizedToAdd = toAdd.map((value) => sanitizeEnumValue(value));
    return toTuple([...base, ...sanitizedToAdd]);
  };
  if (Array.isArray(arg1)) {
    const newValues = getNewValues(arg1, arg2);
    return z5.enum(newValues);
  }
  if (isZodEnum(arg1)) {
    const baseValues = getEnumValues(arg1);
    const newValues = getNewValues(baseValues, arg2);
    return z5.enum(newValues);
  }
  if (isZodObject(arg1) && typeof arg2 === "string") {
    const schema = arg1;
    const key = arg2;
    const field = schema.shape[key];
    const { schema: unwrappedField, isOptional, isNullable } = unwrapOptionalAndNullable(field);
    if (!isZodEnum(unwrappedField)) {
      throw new Error(`Field "${key}" is not a ZodEnum.`);
    }
    const baseValues = getEnumValues(unwrappedField);
    const newValues = getNewValues(baseValues, arg3);
    let newEnum = z5.enum(newValues);
    if (isNullable) newEnum = newEnum.nullable();
    if (isOptional) newEnum = newEnum.optional();
    return schema.extend({
      // Direct call instead of extendSchema helper
      [key]: newEnum
    });
  }
  throw new Error(
    "Invalid forgeEnum signature. Use: forgeEnum(values, add), forgeEnum(z.enum(...), add) or forgeEnum(schema, 'key', add)."
  );
}
export {
  flexEnum,
  forgeEnum
};
