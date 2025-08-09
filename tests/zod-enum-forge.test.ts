// Compatibility layer for Zod v3 and v4
import * as z3 from "zod/v3";
import * as z4 from "zod/v4";

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
    return zodVersion === 'v4' ? schema._zod?.def : schema._def;
}

import { flexEnum, forgeEnum } from '../src/index';
import { describe, it, expect } from 'vitest';

describe('flexEnum', () => {
    it('should create a flexible enum from an array of values', () => {
        const myEnum = flexEnum(['a', 'b']);
        expect(myEnum.safeParse('a').success).toBe(true);
        expect(myEnum.safeParse('c').success).toBe(false); // Should not allow unknown strings initially

        // Check metadata on the enum
        const meta = getDef(myEnum)?.metadata;
        expect(meta).toEqual({ enumForge: true, description: "A new, previously undefined element compared to previous enum values." });
    });

    it('should create a flexible enum from a ZodEnum', () => {
        const baseEnum = z.enum(['a', 'b']);
        const myEnum = flexEnum(baseEnum);
        expect(myEnum.safeParse('a').success).toBe(true);
        expect(myEnum.safeParse('c').success).toBe(false); // Should not allow unknown strings initially
        const meta = getDef(myEnum)?.metadata;
        expect(meta).toEqual({ enumForge: true, description: "A new, previously undefined element compared to previous enum values." });
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
                category: flexEnum(['spam', 'ham']),
                subCategory: flexEnum(['urgent', 'non-urgent']).optional(), // changed to optional
                features: z.object({
                    sentiment: flexEnum(['positive', 'negative']).optional(), // changed to optional
                    intent: flexEnum(['inform', 'request', 'command']),
                })
            }),
            keyFindings: z.array(z.string()),
            additionalInfo: z.object({
                createdAt: z.date().optional(),
                authors: z.array(z.string()).optional(),
            }).optional(),
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
                role: flexEnum(['admin', 'user'])
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
            status: flexEnum(['pending', 'done']),
        });
        const data = { status: 'done' };
        const newSchema = flexEnum(schema, data);
        expect(newSchema).toBe(schema); // Should return the original schema instance
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


});
