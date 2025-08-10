/**
 * Creates a flexible enum that allows for dynamic extension.
 */
declare function flexEnum(values: string[], description?: string): any;
declare function flexEnum(enumDef: any, description?: string): any;
declare function flexEnum(schema: any, dataJson: unknown): any;
declare function flexEnum(zodInstance: any, values: string[], description?: string): any;
declare function flexEnum(zodInstance: any, enumDef: any, description?: string): any;
/**
 * Extends a ZodEnum with new values.
 */
declare function forgeEnum(values: string[], add: string[] | string): any;
declare function forgeEnum(enumDef: any, add: string[] | string): any;
declare function forgeEnum(schema: any, key: string, add: string[] | string): any;

export { flexEnum, forgeEnum };
