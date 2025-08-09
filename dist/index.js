// src/index.ts
import * as z3 from "zod/v3";
import * as z4 from "zod/v4";
var z5;
var zodVersion;
var testSchema = z4.z.string();
zodVersion = testSchema._zod ? "v4" : "v3";
z5 = zodVersion === "v4" ? z4.z : z3.z;
function getDef(schema) {
  if (zodVersion === "v4") {
    return schema._zod?.def || schema.def;
  } else {
    return schema._def;
  }
}
function setMetadata(schema, metadata) {
  if (zodVersion === "v4") {
    if (schema._zod?.def) {
      schema._zod.def.metadata = metadata;
    } else if (schema.def) {
      schema.def.metadata = metadata;
    }
  } else if (zodVersion === "v3" && schema._def) {
    schema._def.metadata = metadata;
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
  if (zodVersion === "v4") {
    return x?._zod?.traits?.has("ZodObject") || x?._zod?.traits?.has("$ZodObject");
  } else {
    const def = getDef(x);
    return def?.typeName === "ZodObject";
  }
}
function isZodEnum(x) {
  if (zodVersion === "v4") {
    return x?._zod?.traits?.has("ZodEnum") || x?._zod?.traits?.has("$ZodEnum");
  } else {
    const def = getDef(x);
    return def?.typeName === "ZodEnum";
  }
}
function isZodUnion(x) {
  if (zodVersion === "v4") {
    return x?._zod?.traits?.has("ZodUnion") || x?._zod?.traits?.has("$ZodUnion");
  } else {
    const def = getDef(x);
    return def?.typeName === "ZodUnion";
  }
}
function isZodString(x) {
  if (zodVersion === "v4") {
    return x?._zod?.traits?.has("ZodString") || x?._zod?.traits?.has("$ZodString");
  } else {
    const def = getDef(x);
    return def?.typeName === "ZodString";
  }
}
function isZodOptional(x) {
  if (zodVersion === "v4") {
    return x?._zod?.traits?.has("ZodOptional") || x?._zod?.traits?.has("$ZodOptional");
  } else {
    const def = getDef(x);
    return def?.typeName === "ZodOptional";
  }
}
function unwrapOptional(x) {
  if (isZodOptional(x)) {
    const def = getDef(x);
    return def?.innerType;
  }
  return x;
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
var DEFAULT_DESC = "A new, previously undefined element compared to previous enum values.";
function flexEnum(...args) {
  const [firstArg, secondArg] = args;
  if (Array.isArray(firstArg) || isZodEnum(firstArg)) {
    const enumDef = Array.isArray(firstArg) ? z5.enum(toTuple(firstArg)) : firstArg;
    const description = secondArg || DEFAULT_DESC;
    setMetadata(enumDef, { enumForge: true, description });
    return enumDef;
  }
  if (isZodObject(firstArg) && secondArg) {
    return updateSchemaFromData(firstArg, secondArg);
  }
  throw new Error(
    "Invalid flexEnum signature. Use: flexEnum(values, desc?), flexEnum(z.enum(...), desc?) or flexEnum(schema, dataJson)."
  );
}
function updateSchemaFromData(schema, data) {
  const shape = getShape(schema);
  const modifiedFields = {};
  for (const key in shape) {
    if (Object.prototype.hasOwnProperty.call(shape, key)) {
      const field = shape[key];
      const value = data?.[key];
      const unwrappedField = unwrapOptional(field);
      const isOptional = isZodOptional(field);
      if (isZodObject(unwrappedField) && value) {
        const newField = updateSchemaFromData(unwrappedField, value);
        if (newField !== unwrappedField) {
          const finalField = isOptional ? newField.optional() : newField;
          modifiedFields[key] = finalField;
        }
      } else if (isFlexEnum(unwrappedField)) {
        const def = getDef(unwrappedField);
        if (isZodUnion(unwrappedField)) {
          const enumPart = def.options[0];
          const stringPart = def.options[1];
          const currentValues = getEnumValues(enumPart);
          if (typeof value === "string" && !currentValues.includes(value)) {
            const newEnumValues = [...currentValues, value];
            const newEnum = z5.enum(toTuple(newEnumValues));
            const newUnion = newEnum.or(stringPart);
            setMetadata(newUnion, { enumForge: true });
            const finalField = isOptional ? newUnion.optional() : newUnion;
            modifiedFields[key] = finalField;
          }
        } else if (isZodEnum(unwrappedField)) {
          const currentValues = getEnumValues(unwrappedField);
          const metadata = def.metadata;
          if (typeof value === "string" && !currentValues.includes(value)) {
            const newEnumValues = [...currentValues, value];
            const newEnum = z5.enum(toTuple(newEnumValues));
            const description = metadata?.description || DEFAULT_DESC;
            const newUnion = newEnum.or(z5.string().describe(description));
            setMetadata(newUnion, { enumForge: true });
            const finalField = isOptional ? newUnion.optional() : newUnion;
            modifiedFields[key] = finalField;
          }
        }
      } else if (isZodEnum(unwrappedField)) {
        const currentValues = getEnumValues(unwrappedField);
        if (typeof value === "string" && !currentValues.includes(value)) {
          const newEnumValues = [...currentValues, value];
          const newEnum = z5.enum(toTuple(newEnumValues));
          const newUnion = newEnum.or(z5.string().describe(DEFAULT_DESC));
          setMetadata(newUnion, { enumForge: true });
          const finalField = isOptional ? newUnion.optional() : newUnion;
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
    return toTuple([...base, ...toAdd]);
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
    if (!isZodEnum(field)) {
      throw new Error(`Field "${key}" is not a ZodEnum.`);
    }
    const baseValues = getEnumValues(field);
    const newValues = getNewValues(baseValues, arg3);
    return extendSchema(schema, {
      [key]: z5.enum(newValues)
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
