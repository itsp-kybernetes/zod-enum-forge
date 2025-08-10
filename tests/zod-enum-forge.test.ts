// Compatibility layer for Zod v3 and v4
import * as z3 from "zod/v3";
import * as z4 from "zod/v4";
import { toJSONSchema } from 'zod';

let z: any;
let zodVersion: 'v3' | 'v4';

try {
    // Try v4 first
    const testSchema = z4.z.string();
    zodVersion = (testSchema as any)._zod ? 'v4' : 'v3';
    z = z4.z;
} catch {
    // Fallback to v3
    z = z3.z;
    zodVersion = 'v3';
}

// Helper to get the appropriate def object (v3 uses _def, v4 uses _zod.def)
function getDef(schema: any): any {
    // Try both v4 and v3 structures, same as in src/index.ts
    return schema._zod?.def || schema._def || schema.def;
}

import { flexEnum, forgeEnum } from '../src/index';
import { describe, it, expect } from 'vitest';

describe('flexEnum', () => {
    it('should create a flexible enum from an array of values', () => {
        const myEnum = flexEnum(['a', 'b']);
        expect(myEnum.safeParse('a').success).toBe(true);
        expect(myEnum.safeParse('b').success).toBe(true);
        expect(myEnum.safeParse('c').success).toBe(true); // Should allow unknown strings since it's flexible

        // Check metadata on the union
        const meta = getDef(myEnum)?.metadata;
        expect(meta).toEqual({ enumForge: true, description: "If none of the existing enum values match, provide a new appropriate value for this field. Don't copy this description to the new value." });
    });

    it('should create a flexible enum from a ZodEnum', () => {
        const baseEnum = z.enum(['a', 'b']);
        const myEnum = flexEnum(baseEnum);
        expect(myEnum.safeParse('a').success).toBe(true);
        expect(myEnum.safeParse('b').success).toBe(true);
        expect(myEnum.safeParse('c').success).toBe(true); // Should allow unknown strings since it's flexible
        const meta = getDef(myEnum)?.metadata;
        expect(meta).toEqual({ enumForge: true, description: "If none of the existing enum values match, provide a new appropriate value for this field. Don't copy this description to the new value." });
    });

    it('should update a schema with new enum values from data', () => {
        const schema = z.object({
            status: flexEnum(['pending', 'done']),
        });

        const data = { status: 'in_progress' };
        const newSchema = flexEnum(schema, data);

        const statusField = newSchema.shape.status;
        const def = getDef(statusField);
        const enumPart = def?.options?.[0];

        // Check if the enum contains the new value
        if (enumPart && enumPart.enum) {
            const enumValues = Object.values(enumPart.enum);
            expect(enumValues).toContain('in_progress');
        } else {
            // Fallback check using def.values if available
            const enumDef = getDef(enumPart);
            expect(enumDef?.values).toContain('in_progress');
        }
    });

    it('should update a multilevel schema with new enum values from data', () => {
        const schema = z.object({
            textClassification: z.object({
                category: z.enum(['spam', 'ham']), // Changed to regular enum
                subCategory: z.enum(['urgent', 'non-urgent']).optional().nullable(), // Changed to regular enum
                features: z.object({
                    sentiment: z.enum(['positive', 'negative']).optional().nullable(), // Changed to regular enum
                    intent: z.enum(['inform', 'request', 'command']), // Changed to regular enum
                })
            }),
            keyFindings: z.array(z.string()),
            additionalInfo: z.object({
                createdAt: z.date().optional().nullable(),
                authors: z.array(z.string()).optional().nullable(),
            }).optional().nullable(),
        });

        const data = {
            textClassification: {
                category: 'offers',
                subCategory: 'urgent',
                features: {
                    sentiment: 'neutral', // New value not in original enum
                    intent: 'inform'
                }
            },
            keyFindings: ['Message about new discount offer.'],
            additionalInfo: {
                createdAt: new Date(),
                authors: ['Alice', 'Bob']
            }
        };

        const newSchema = flexEnum(schema, data);

        const categoryField = newSchema.shape.textClassification.shape.category;
        const def = getDef(categoryField);
        const enumPart = def?.options?.[0];

        // Check if the enum contains the new value
        if (enumPart && enumPart.enum) {
            const enumValues = Object.values(enumPart.enum);
            expect(enumValues).toContain('offers');
        } else {
            // Fallback check using def.values if available
            const enumDef = getDef(enumPart);
            expect(enumDef?.values).toContain('offers');
        }

        // check data is passing newSchema 
        const newSchema_result = newSchema.safeParse(data);
        expect(newSchema_result.success).toBe(true);

        // check data is not passing original schema
        const originalSchema_result = schema.safeParse(data);
        expect(originalSchema_result.success).toBe(false);
    });

    it('should handle nested objects when updating schema', () => {
        const schema = z.object({
            user: z.object({
                role: z.enum(['admin', 'user']) // Changed to regular enum
            })
        });

        const data = { user: { role: 'guest' } };
        const newSchema = flexEnum(schema, data);

        const roleField = newSchema.shape.user.shape.role;
        const def = getDef(roleField);
        const enumPart = def?.options?.[0];

        // Check if the enum contains the new value
        if (enumPart && enumPart.enum) {
            const enumValues = Object.values(enumPart.enum);
            expect(enumValues).toContain('guest');
        } else {
            // Fallback check using def.values if available
            const enumDef = getDef(enumPart);
            expect(enumDef?.values).toContain('guest');
        }
    });

    it('should not modify schema if value already exists in enum', () => {
        const schema = z.object({
            status: z.enum(['pending', 'done']), // Changed to regular enum
        });
        const data = { status: 'done' };
        const newSchema = flexEnum(schema, data);
        expect(newSchema).toBe(schema); // Should return the original schema instance
    });

    it('should handle nullable and optional fields correctly', () => {
        const schema = z.object({
            status: z.enum(['pending', 'done']).optional().nullable(),
            category: z.enum(['urgent', 'normal']).nullable(),
        });

        const data = { 
            status: 'in_progress',  // New value for optional nullable field
            category: 'low'         // New value for nullable field
        };

        const newSchema = flexEnum(schema, data);

        // Test that the new schema can handle the new values
        const result = newSchema.safeParse(data);
        expect(result.success).toBe(true);

        // Test that nullable values still work
        const nullData = { status: null, category: null };
        const nullResult = newSchema.safeParse(nullData);
        expect(nullResult.success).toBe(true);

        // Test that undefined values work for optional field
        const undefinedData = { category: 'urgent' }; // status is undefined
        const undefinedResult = newSchema.safeParse(undefinedData);
        expect(undefinedResult.success).toBe(true);
    });

    it('should properly convert to JSON Schema using toJSONSchema', () => {
        // Test basic flexEnum conversion
        const basicFlexEnum = flexEnum(['pending', 'done', 'cancelled']);
        const basicJsonSchema = toJSONSchema(basicFlexEnum);
        
        expect(basicJsonSchema).toHaveProperty('anyOf');
        expect(basicJsonSchema.anyOf).toHaveLength(2);
        
        // Should have enum part
        const enumPart = basicJsonSchema.anyOf.find((part: any) => part.enum);
        expect(enumPart).toBeDefined();
        expect(enumPart.enum).toEqual(['pending', 'done', 'cancelled']);
        
        // Should have string part for flexibility
        const stringPart = basicJsonSchema.anyOf.find((part: any) => part.type === 'string' && !part.enum);
        expect(stringPart).toBeDefined();
        expect(stringPart.type).toBe('string');

        // Test complex schema with flexEnum
        const complexSchema = z.object({
            status: flexEnum(['active', 'inactive']),
            category: z.enum(['urgent', 'normal']),
            description: z.string()
        });

        const complexJsonSchema = toJSONSchema(complexSchema);
        
        expect(complexJsonSchema.type).toBe('object');
        expect(complexJsonSchema.properties).toHaveProperty('status');
        expect(complexJsonSchema.properties).toHaveProperty('category');
        expect(complexJsonSchema.properties).toHaveProperty('description');

        // Check that flexEnum status field has proper anyOf structure
        const statusProperty = complexJsonSchema.properties.status;
        expect(statusProperty).toHaveProperty('anyOf');
        expect(statusProperty.anyOf).toHaveLength(2);

        // Check that regular enum category field has simple enum structure
        const categoryProperty = complexJsonSchema.properties.category;
        expect(categoryProperty).toHaveProperty('enum');
        expect(categoryProperty.enum).toEqual(['urgent', 'normal']);
    });

    it('should convert updated schema with new enum values to JSON Schema', () => {
        const originalSchema = z.object({
            status: z.enum(['pending', 'done']),
            priority: flexEnum(['low', 'high'])
        });

        const data = { 
            status: 'in_progress', // New value for regular enum
            priority: 'medium'     // New value for flexEnum
        };

        const updatedSchema = flexEnum(originalSchema, data);
        const jsonSchema = toJSONSchema(updatedSchema);

        expect(jsonSchema.type).toBe('object');
        expect(jsonSchema.properties).toHaveProperty('status');
        expect(jsonSchema.properties).toHaveProperty('priority');

        // Updated status should now be flexEnum (anyOf structure)
        const statusProperty = jsonSchema.properties.status;
        expect(statusProperty).toHaveProperty('anyOf');
        const statusEnumPart = statusProperty.anyOf.find((part: any) => part.enum);
        expect(statusEnumPart.enum).toContain('in_progress');
        expect(statusEnumPart.enum).toContain('pending');
        expect(statusEnumPart.enum).toContain('done');

        // Priority should still be flexEnum with new value
        const priorityProperty = jsonSchema.properties.priority;
        expect(priorityProperty).toHaveProperty('anyOf');
        const priorityEnumPart = priorityProperty.anyOf.find((part: any) => part.enum);
        expect(priorityEnumPart.enum).toContain('medium');
        expect(priorityEnumPart.enum).toContain('low');
        expect(priorityEnumPart.enum).toContain('high');
    });

    it('should convert user article schema with flexEnum to JSON Schema', () => {
        const articleSchema = z.object({
            textClassification: z.object({
                category: flexEnum(['politics', 'mathematics', 'ecology']),
                subCategory: flexEnum(['international politics', 'geometry', 'climate change']).optional().nullable(),
            }),
            keyfindings: z.object({
                summary: z.string().max(500),
                importantFigures: z.array(z.string()).min(1).max(5),
                relatedArticles: z.array(z.string()).min(1).max(5)
            })
        });

        // Test that toJSONSchema works without errors
        let jsonSchema: any;
        expect(() => {
            jsonSchema = toJSONSchema(articleSchema);
        }).not.toThrow();

        // Verify the basic structure
        expect(jsonSchema.type).toBe('object');
        expect(jsonSchema.properties).toHaveProperty('textClassification');
        expect(jsonSchema.properties).toHaveProperty('keyfindings');

        // Check textClassification structure
        const textClassProp = (jsonSchema.properties as any).textClassification;
        expect(textClassProp.type).toBe('object');
        expect(textClassProp.properties).toHaveProperty('category');
        expect(textClassProp.properties).toHaveProperty('subCategory');

        // Check that flexEnum fields have anyOf structure (union of enum and string)
        const categoryProp = textClassProp.properties.category;
        expect(categoryProp).toHaveProperty('anyOf');
        expect(Array.isArray(categoryProp.anyOf)).toBe(true);
        expect(categoryProp.anyOf.length).toBe(2);

        // Verify enum values are preserved
        const categoryEnumPart = categoryProp.anyOf.find((part: any) => part.enum);
        expect(categoryEnumPart).toBeDefined();
        expect(categoryEnumPart.enum).toContain('politics');
        expect(categoryEnumPart.enum).toContain('mathematics');
        expect(categoryEnumPart.enum).toContain('ecology');

        // Verify string part exists for flexibility
        const categoryStringPart = categoryProp.anyOf.find((part: any) => part.type === 'string' && !part.enum);
        expect(categoryStringPart).toBeDefined();
        expect(categoryStringPart.type).toBe('string');

        console.log('Article schema JSON Schema conversion successful!');
    });
});

describe('forgeEnum', () => {
    it('should extend an enum from an array of values', () => {
        const newEnum = forgeEnum(['a', 'b'], 'c');

        // Check using .enum property first, fallback to def.values
        if (newEnum.enum) {
            const enumValues = Object.values(newEnum.enum);
            expect(enumValues).toEqual(['a', 'b', 'c']);
        } else {
            const enumDef = getDef(newEnum);
            expect(enumDef?.values).toEqual(['a', 'b', 'c']);
        }
    });

    it('should extend an enum from a ZodEnum', () => {
        const baseEnum = z.enum(['a', 'b']);
        const newEnum = forgeEnum(baseEnum, ['c', 'd']);

        if (newEnum.enum) {
            const enumValues = Object.values(newEnum.enum);
            expect(enumValues).toEqual(['a', 'b', 'c', 'd']);
        } else {
            const enumDef = getDef(newEnum);
            expect(enumDef?.values).toEqual(['a', 'b', 'c', 'd']);
        }
    });

    it('should extend an enum within a schema object', () => {
        const schema = z.object({
            status: z.enum(['pending', 'done']),
        });
        const newSchema = forgeEnum(schema, 'status', 'archived');
        const statusEnum = newSchema.shape.status;

        if (statusEnum.enum) {
            const enumValues = Object.values(statusEnum.enum);
            expect(enumValues).toContain('archived');
        } else {
            const enumDef = getDef(statusEnum);
            expect(enumDef?.values).toContain('archived');
        }
    });

    it('should throw an error if the key does not correspond to a ZodEnum', () => {
        const schema = z.object({
            name: z.string(),
        });
        expect(() => forgeEnum(schema, 'name', 'test')).toThrow('Field "name" is not a ZodEnum.');
    });

    it('should handle nullable and optional enums in schema extension', () => {
        const schema = z.object({
            status: z.enum(['pending', 'done']).optional().nullable(),
            priority: z.enum(['low', 'high']).nullable(),
        });

        const newSchemaStatus = forgeEnum(schema, 'status', 'archived');
        const newSchemaPriority = forgeEnum(schema, 'priority', 'medium');

        // Test that the extended enums still maintain their nullable/optional properties
        expect(newSchemaStatus.safeParse({ status: null, priority: 'low' }).success).toBe(true);
        expect(newSchemaStatus.safeParse({ priority: 'low' }).success).toBe(true); // status undefined
        expect(newSchemaStatus.safeParse({ status: 'archived', priority: 'low' }).success).toBe(true);

        expect(newSchemaPriority.safeParse({ status: 'pending', priority: null }).success).toBe(true);
        expect(newSchemaPriority.safeParse({ status: 'pending', priority: 'medium' }).success).toBe(true);
    });

    it('should sanitize values containing DEFAULT_DESC by replacing with "unknown"', () => {
        const baseEnum = z.enum(['a', 'b']);
        
        // Test with exact DEFAULT_DESC value
        const exactMatch = forgeEnum(baseEnum, "If none of the existing enum values match, provide a new appropriate value for this field. Don't copy this description to the new value.");
        const values1 = exactMatch.options;
        expect(values1).toContain('unknown');
        expect(values1).not.toContain("If none of the existing enum values match, provide a new appropriate value for this field. Don't copy this description to the new value.");
        
        // Test with value containing DEFAULT_DESC
        const partialMatch = forgeEnum(baseEnum, "Some text If none of the existing enum values match, provide a new appropriate value for this field. Don't copy this description to the new value. more text");
        const values2 = partialMatch.options;
        expect(values2).toContain('unknown');
        expect(values2).not.toContain("Some text If none of the existing enum values match, provide a new appropriate value for this field. Don't copy this description to the new value. more text");
        
        // Test with array containing DEFAULT_DESC
        const arrayWithDesc = forgeEnum(baseEnum, ['c', "If none of the existing enum values match, provide a new appropriate value for this field. Don't copy this description to the new value.", 'd']);
        const values3 = arrayWithDesc.options;
        expect(values3).toContain('unknown');
        expect(values3).toContain('c');
        expect(values3).toContain('d');
        expect(values3).not.toContain("If none of the existing enum values match, provide a new appropriate value for this field. Don't copy this description to the new value.");
    });

    it('should sanitize values in flexEnum data updates containing DEFAULT_DESC', () => {
        const schema = z.object({
            status: flexEnum(['pending', 'completed'])
        });
        
        // Test with exact DEFAULT_DESC value
        const data1 = { 
            status: "If none of the existing enum values match, provide a new appropriate value for this field. Don't copy this description to the new value." 
        };
        const updatedSchema1 = flexEnum(schema, data1);
        
        // Extract enum values from the flexible enum (union type)
        const statusField1 = updatedSchema1.shape.status;
        const def1 = getDef(statusField1);
        const enumPart1 = def1.options[0];
        const enumValues1 = enumPart1.options || Object.values(getDef(enumPart1)?.values || {});
        
        expect(enumValues1).toContain('unknown');
        expect(enumValues1).not.toContain("If none of the existing enum values match, provide a new appropriate value for this field. Don't copy this description to the new value.");
        
        // Test with value containing DEFAULT_DESC
        const data2 = { 
            status: "test If none of the existing enum values match, provide a new appropriate value for this field. Don't copy this description to the new value. end" 
        };
        const updatedSchema2 = flexEnum(schema, data2);
        
        const statusField2 = updatedSchema2.shape.status;
        const def2 = getDef(statusField2);
        const enumPart2 = def2.options[0];
        const enumValues2 = enumPart2.options || Object.values(getDef(enumPart2)?.values || {});
        
        expect(enumValues2).toContain('unknown');
        expect(enumValues2).not.toContain("test If none of the existing enum values match, provide a new appropriate value for this field. Don't copy this description to the new value. end");
    });


});
