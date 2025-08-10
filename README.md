# zod-enum-forge

<div align="center">
  <img src="https://kybernetes.ngo/wp-content/uploads/2022/10/Logo-Kybernetes.png" alt="Kybernetes Logo" width="200"/>
  <br/>
  <em>Institute of Socio-Political Technologies "Kybernetes"</em>
  <br/>
  <a href="https://kybernetes.ngo">🌐 kybernetes.ngo</a>
</div>

<p align="center">
  <a href="https://www.npmjs.com/package/zod-enum-forge">
    <img src="https://img.shields.io/npm/v/zod-enum-forge.svg" alt="npm version">
  </a>
  <a href="https://github.com/itsp-kybernetes/zod-enum-forge/blob/master/LICENSE">
    <img src="https://img.shields.io/badge/license-BSD--2--Clause-blue.svg" alt="License">
  </a>
</p>

Tiny helpers to extend Zod enums for open-set/iterative classification workflows.

## Overview

`zod-enum-forge` provides utilities to dynamically extend Zod enums, making them "flexible" for scenarios where you need to handle unknown values in iterative data processing workflows, such as LLM-based classification tasks.

## Features

- 🔧 **Flexible Enums**: Create enums that can accept unknown values while preserving type safety
- 🔄 **Dynamic Schema Updates**: Automatically extend schemas based on incoming data
- 🌐 **Multi-level Support**: Handle deeply nested objects with flexible enums
- 🔗 **Universal Zod Compatibility**: Works seamlessly with both Zod v3 and v4
- 📦 **Zero Configuration**: Automatic version detection and compatibility layer
- ⚡ **Lightweight**: Minimal dependencies, focused functionality
- 🛡️ **Type Safe**: Full TypeScript support with proper type inference

## Installation

```bash
npm install zod-enum-forge
```

**Requirements:**
- Node.js 16+
- Zod v3.25.0+ or v4.0.0+

The library automatically detects and works with both Zod v3 and v4 - no configuration needed.

## Quick Start

```typescript
import { z } from 'zod';
import { flexEnum, forgeEnum } from 'zod-enum-forge';

// Create a flexible enum that can accept unknown values
const statusEnum = flexEnum(['pending', 'done']);

// Or from existing Zod enum
const baseEnum = z.enum(['a', 'b']);
const flexibleEnum = flexEnum(baseEnum);

// Extend an enum with new values
const extendedEnum = forgeEnum(['pending', 'done'], 'archived');

// Dynamic schema updates based on data
const schema = z.object({
  status: flexEnum(['pending', 'done']),
  category: z.enum(['urgent', 'normal'])
});

const data = { 
  status: 'in_progress',  // New value!
  category: 'urgent' 
};

// Schema automatically extends to include new values
const updatedSchema = flexEnum(schema, data);
```

## API Reference

### `flexEnum`

Creates flexible enums that can accept unknown values and be dynamically extended based on data.

#### Signatures

```typescript
// Create from array of values
flexEnum(values: string[], description?: string): ZodUnion

// Create from existing ZodEnum
flexEnum(enumDef: ZodEnum, description?: string): ZodUnion

// Update schema based on data (auto-extends enums)
flexEnum(schema: ZodObject, dataJson: unknown): ZodObject

// Use specific Zod instance (for version control)
flexEnum(zodInstance: ZodType, values: string[], description?: string): ZodUnion
flexEnum(zodInstance: ZodType, enumDef: ZodEnum, description?: string): ZodUnion
```

#### Examples

```typescript
import { z } from 'zod';
import { flexEnum } from 'zod-enum-forge';

// Basic flexible enum - accepts both predefined and unknown values
const statusEnum = flexEnum(['pending', 'done']);
console.log(statusEnum.parse('pending')); // ✅ 'pending'
console.log(statusEnum.parse('in_progress')); // ✅ 'in_progress' (unknown value accepted)

// With custom description for LLM guidance
const categoryEnum = flexEnum(['spam', 'ham'], 'Custom category type for email classification');

// Dynamic schema updates - automatically extends enums when new values are encountered
const schema = z.object({
  status: flexEnum(['pending', 'done']),
  category: flexEnum(['urgent', 'normal'])
});

const data = { 
  status: 'in_progress',  // New value!
  category: 'low_priority' // Another new value!
};

const updatedSchema = flexEnum(schema, data);
// Schema now accepts the new values for future validations
console.log(updatedSchema.parse(data)); // ✅ Works!

// Using specific Zod instance for version control
import { z as zod4 } from 'zod/v4';
const v4FlexEnum = flexEnum(zod4, ['a', 'b'], 'Custom description');
```

### `forgeEnum`

Extends existing enums with new values, creating a new enum with combined values.

#### Signatures

```typescript
// Extend array of values
forgeEnum(values: string[], add: string | string[]): ZodEnum

// Extend existing ZodEnum
forgeEnum(enumDef: ZodEnum, add: string | string[]): ZodEnum

// Extend enum within schema object
forgeEnum(schema: ZodObject, key: string, add: string | string[]): ZodObject
```

#### Examples

```typescript
import { z } from 'zod';
import { forgeEnum } from 'zod-enum-forge';

// Extend array of values
const newEnum = forgeEnum(['a', 'b'], 'c');
// Result: enum with values ['a', 'b', 'c']

// Extend existing Zod enum
const baseEnum = z.enum(['pending', 'done']);
const extendedEnum = forgeEnum(baseEnum, ['archived', 'cancelled']);
// Result: enum with values ['pending', 'done', 'archived', 'cancelled']

// Extend enum within schema
const schema = z.object({
  status: z.enum(['pending', 'done'])
});
const newSchema = forgeEnum(schema, 'status', 'archived');
// Schema now has status enum with 'archived' value
```

## Advanced Usage

### Nested Objects

The library handles complex nested structures:

```typescript
const schema = z.object({
  textClassification: z.object({
    category: flexEnum(['spam', 'ham']),
    subCategory: flexEnum(['urgent', 'non-urgent']).optional().nullable(),
    features: z.object({
      sentiment: flexEnum(['positive', 'negative']),
      intent: flexEnum(['inform', 'request', 'command'])
    })
  }),
  metadata: z.object({
    source: flexEnum(['email', 'chat'])
  })
});

const newData = {
  textClassification: {
    category: 'offers',     // New category
    subCategory: 'urgent',
    features: {
      sentiment: 'neutral', // New sentiment
      intent: 'inform'
    }
  },
  metadata: {
    source: 'sms'          // New source
  }
};

const updatedSchema = flexEnum(schema, newData);
// All new enum values are now supported
```

### Optional Fields

The library properly handles optional and nullable fields:

```typescript
const schema = z.object({
  required: flexEnum(['a', 'b']),
  optional: flexEnum(['x', 'y']).optional().nullable()
});

const data = {
  required: 'c',    // Extends required field
  optional: 'z'     // Extends optional field (remains optional and nullable)
};

const updated = flexEnum(schema, data);
```

## Use Cases

### LLM-based Classification

Perfect for iterative classification workflows where you discover new categories as you process data:

This example demonstrates a real-world scenario where you're processing Wikipedia articles with an LLM (GPT-4o) and discovering new classification categories on the fly. The schema starts with basic categories but grows automatically as the LLM encounters new types of content that don't fit existing categories.

**How it works:**
1. **Initial Schema**: Start with a classification schema with predefined categories
2. **Iterative Processing**: For each article, use the current schema with OpenAI's structured output
3. **Dynamic Extension**: When the LLM outputs new enum values not in the current schema, `flexEnum` automatically extends the schema
4. **Schema Evolution**: The updated schema is used for subsequent articles, creating a self-improving classification system

```typescript
import fs from "fs";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import csv from 'async-csv';
import { flexEnum } from 'zod-enum-forge';
import 'dotenv/config';

// Classification schema for Wikipedia articles
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

async function main() {
  let currArticleSchema = articleSchema;
  
  // Load articles from CSV file
  const articlesContent_raw = await fs.promises.readFile('./articles.csv', 'utf8');
  const articlesContent = await csv.parse(articlesContent_raw) as string[][];

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const articles = [];

  // Process first 4 articles (skipping header row)
  for (let n = 1; n < 5; n++) {
    if (!articlesContent[n]?.[0]) {
      continue; // Skip empty rows
    }
    
    const response = await openai.responses.parse({
      model: "gpt-4o",
      input: [
        { role: "system", content: "Write the information about article." },
        {
          role: "user",
          content: "Article content:\n" + (articlesContent[n]?.[0] ?? ''),
        },
      ],
      text: {
        format: zodTextFormat(currArticleSchema, "article"),
      },
    });

    const article = response.output_parsed;
    // Dynamically extend schema based on LLM output
    currArticleSchema = flexEnum(currArticleSchema, article);
    articles.push(article);
  }

  // Save processed articles and final schema
  fs.writeFileSync('./processed_articles.json', JSON.stringify(articles, null, 2));
  fs.writeFileSync('./last_schema.json', JSON.stringify(zodTextFormat(currArticleSchema, "article"), null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

**Key Benefits:**
- **Automatic Discovery**: New categories are discovered organically through LLM processing
- **No Manual Intervention**: The schema evolves without requiring manual updates
- **Consistent Structure**: All processed articles maintain the same structured format
- **Iterative Improvement**: Each processed article potentially improves the classification schema for future articles
- **Schema Persistence**: Final evolved schema can be saved and reused

This approach is particularly useful for:
- Content categorization where categories aren't known upfront
- Academic paper classification across disciplines
- News article categorization with emerging topics
- Sentiment analysis with evolving emotional categories  
- Intent classification in chatbots
- Document taxonomy development
- Any scenario where classification categories emerge from data rather than being predefined




### Taxonomy Evolution

Build evolving taxonomies that grow with your data:

```typescript
let taxonomy = z.object({
  domain: flexEnum(['technology', 'business']),
  subdomain: flexEnum(['ai', 'blockchain']).optional().nullable()
});

// As you process more documents
const documents = [
  { domain: 'healthcare', subdomain: 'telemedicine' },
  { domain: 'technology', subdomain: 'quantum' },
  { domain: 'business', subdomain: null } // nullable value
];

documents.forEach(doc => {
  taxonomy = flexEnum(taxonomy, doc);
});

// Taxonomy now includes all discovered categories
```

## Zod Version Compatibility

This library (v0.2.0) automatically detects and works with both Zod v3 and v4:

- **Zod v3**: Uses `_def` property structure
- **Zod v4**: Uses `_zod.def` property structure with traits

The compatibility layer automatically:
- Detects which Zod version you're using
- Adapts internal API calls accordingly
- Maintains consistent behavior across versions
- Supports schemas created with different Zod instances

**Version Detection:**
```typescript
// Library automatically detects version from your schemas
const v3Schema = z3.enum(['a', 'b']);
const v4Schema = z4.enum(['a', 'b']);

// Both work seamlessly
const flexV3 = flexEnum(v3Schema);
const flexV4 = flexEnum(v4Schema);

// You can also specify the Zod instance explicitly
const explicitV4 = flexEnum(z4, ['a', 'b']);
```

No configuration needed - the library handles all differences internally.

## How It Works

### Flexible Enum Implementation

`flexEnum` creates a Zod union type that combines:
1. **Predefined enum values** - for known/expected values
2. **String schema** - for accepting unknown values

```typescript
// flexEnum(['a', 'b']) internally creates:
z.enum(['a', 'b']).or(z.string().describe("If none of the existing enum values match, provide a new appropriate value for this field."))
```

This approach provides:
- **Type safety** for known values
- **Flexibility** for unknown values  
- **LLM guidance** through descriptions
- **Automatic extension** when new values are encountered

### Schema Evolution

When using `flexEnum(schema, data)`:
1. Library traverses the schema structure
2. Identifies flexible enums (marked with special metadata)
3. Checks if data contains new enum values
4. Extends enums with new values while preserving structure
5. Maintains optional/nullable wrappers

```typescript
const schema = z.object({
  status: flexEnum(['pending', 'done']).optional(),
  nested: z.object({
    category: flexEnum(['a', 'b'])
  })
});

const data = { 
  status: 'in_progress',  // New value
  nested: { category: 'c' } // New nested value
};

// Result: schema with extended enums, status remains optional
const newSchema = flexEnum(schema, data);
```

## TypeScript Support

Full TypeScript support with proper type inference:

```typescript
const schema = z.object({
  status: flexEnum(['pending', 'done'])
});

type SchemaType = z.infer<typeof schema>;
// Result: { status: "pending" | "done" | string }

// The union type allows both predefined and custom values
const validData1: SchemaType = { status: 'pending' }; // ✅ Known value
const validData2: SchemaType = { status: 'custom' }; // ✅ Unknown value
```

## Error Handling

The library provides clear error messages:

```typescript
const schema = z.object({
  name: z.string()  // Not an enum
});

// This will throw: 'Field "name" is not a ZodEnum.'
forgeEnum(schema, 'name', 'test');
```

## Project source and contributing

Source code is available on GitHub: [itsp-kybernetes/zod-enum-forge](https://github.com/itsp-kybernetes/zod-enum-forge)

Contributions are welcome! Please feel free to submit a Pull Request.

## License

FreeBSD-2-Clause © Mariusz Żabiński (kybernetes.ngo)

## Keywords

- zod
- enum
- taxonomy
- open-set
- llm
- structured-output
- classification
- dynamic-schemas
- typescript
- schema-evolution

