"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  flexEnum: () => flexEnum,
  forgeEnum: () => forgeEnum
});
module.exports = __toCommonJS(index_exports);
var z3 = __toESM(require("zod/v3"), 1);
var z4 = __toESM(require("zod/v4"), 1);
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
  if (zodVersion === "v4") {
    if (enumDef._zod?.values) {
      return Array.from(enumDef._zod.values);
    }
    if (enumDef.enum) {
      return Object.values(enumDef.enum);
    }
    const def = getDef(enumDef);
    if (def?.entries) {
      return Object.values(def.entries);
    }
  } else {
    if (enumDef.enum) {
      return Object.values(enumDef.enum);
    }
    const def = getDef(enumDef);
    if (def?.values) {
      return def.values;
    }
  }
  throw new Error("Unable to extract enum values");
}
function getShape(schema) {
  return schema.shape;
}
function extendSchema(schema, fields) {
  return schema.extend(fields);
}
function isZodObject(x) {
  const def = x?._def || x?._zod?.def;
  return def?.typeName === "ZodObject" || x?._zod?.traits?.has("ZodObject") || x?._zod?.traits?.has("$ZodObject");
}
function isZodEnum(x) {
  const def = x?._def || x?._zod?.def;
  return def?.typeName === "ZodEnum" || x?._zod?.traits?.has("ZodEnum") || x?._zod?.traits?.has("$ZodEnum");
}
function isZodUnion(x) {
  const def = x?._def || x?._zod?.def;
  return def?.typeName === "ZodUnion" || x?._zod?.traits?.has("ZodUnion") || x?._zod?.traits?.has("$ZodUnion");
}
function isZodString(x) {
  const def = x?._def || x?._zod?.def;
  return def?.typeName === "ZodString" || x?._zod?.traits?.has("ZodString") || x?._zod?.traits?.has("$ZodString");
}
function isZodOptional(x) {
  const def = x?._def || x?._zod?.def;
  return def?.typeName === "ZodOptional" || x?._zod?.traits?.has("ZodOptional") || x?._zod?.traits?.has("$ZodOptional");
}
function isZodNullable(x) {
  const def = x?._def || x?._zod?.def;
  return def?.typeName === "ZodNullable" || x?._zod?.traits?.has("ZodNullable") || x?._zod?.traits?.has("$ZodNullable");
}
function unwrapOptional(x) {
  if (isZodOptional(x)) {
    const def = getDef(x);
    return def?.innerType;
  }
  return x;
}
function unwrapNullable(x) {
  if (isZodNullable(x)) {
    const def = getDef(x);
    return def?.innerType;
  }
  return x;
}
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
  const shape = getShape(schema);
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
  return Object.keys(modifiedFields).length > 0 ? extendSchema(schema, modifiedFields) : schema;
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
    const field = getShape(schema)[key];
    const { schema: unwrappedField, isOptional, isNullable } = unwrapOptionalAndNullable(field);
    if (!isZodEnum(unwrappedField)) {
      throw new Error(`Field "${key}" is not a ZodEnum.`);
    }
    const baseValues = getEnumValues(unwrappedField);
    const newValues = getNewValues(baseValues, arg3);
    let newEnum = z5.enum(newValues);
    if (isNullable) newEnum = newEnum.nullable();
    if (isOptional) newEnum = newEnum.optional();
    return extendSchema(schema, {
      [key]: newEnum
    });
  }
  throw new Error(
    "Invalid forgeEnum signature. Use: forgeEnum(values, add), forgeEnum(z.enum(...), add) or forgeEnum(schema, 'key', add)."
  );
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  flexEnum,
  forgeEnum
});
