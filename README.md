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
  <a href="https://github.com/twój-username/zod-enum-forge/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-BSD--2--Clause-blue.svg" alt="License">
  </a>
</p>

Tiny helpers to extend Zod enums for open-set/iterative classification workflows.

## Overview

`zod-enum-forge` provides utilities to dynamically extend Zod enums, making them "flexible" for scenarios where you need to handle unknown values in iterative data processing workflows, such as LLM-based classification tasks.

## Features

- 🔧 **Flexible Enums**: Create enums that can be extended with new values dynamically
- 🔄 **Schema Updates**: Automatically update schemas based on incoming data
- 🌐 **Multi-level Support**: Handle nested objects with flexible enums
- 🔗 **Zod Compatibility**: Works with both Zod v3 and v4
- 📦 **Lightweight**: Minimal dependencies, focused functionality

## Installation

```bash
npm install zod-enum-forge
```

## Quick Start

```typescript
import { z } from 'zod';
import { flexEnum, forgeEnum } from 'zod-enum-forge';

// Create a flexible enum
const statusEnum = flexEnum(['pending', 'done']);

// Or from existing Zod enum
const baseEnum = z.enum(['a', 'b']);
const flexibleEnum = flexEnum(baseEnum);

// Extend an enum with new values
const extendedEnum = forgeEnum(['pending', 'done'], 'archived');
```

## API Reference

### `flexEnum`

Creates flexible enums that can be dynamically extended based on data.

#### Signatures

```typescript
// Create from array of values
flexEnum(values: string[], description?: string): ZodEnum

// Create from existing ZodEnum
flexEnum(enumDef: ZodEnum, description?: string): ZodEnum

// Update schema based on data
flexEnum(schema: ZodObject, dataJson: unknown): ZodObject
```

#### Examples

```typescript
import { z } from 'zod';
import { flexEnum } from 'zod-enum-forge';

// Basic flexible enum
const statusEnum = flexEnum(['pending', 'done']);

// With custom description for new values
const categoryEnum = flexEnum(['spam', 'ham'], 'Custom category type');

// Dynamic schema updates
const schema = z.object({
  status: flexEnum(['pending', 'done']),
  category: flexEnum(['urgent', 'normal'])
});

const data = { 
  status: 'in_progress',  // New value!
  category: 'low_priority' // Another new value!
};

const updatedSchema = flexEnum(schema, data);
// Schema now accepts the new values
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
    subCategory: flexEnum(['urgent', 'non-urgent']).optional(),
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

The library properly handles optional fields:

```typescript
const schema = z.object({
  required: flexEnum(['a', 'b']),
  optional: flexEnum(['x', 'y']).optional()
});

const data = {
  required: 'c',    // Extends required field
  optional: 'z'     // Extends optional field (remains optional)
};

const updated = flexEnum(schema, data);
```

## Use Cases

### LLM-based Classification

Perfect for iterative classification workflows where you discover new categories as you process data:

This example demonstrates a real-world scenario where you're processing articles with an LLM (GPT-4) and discovering new classification categories on the fly. The schema starts with basic categories but grows automatically as the LLM encounters new types of content that don't fit existing categories.

**How it works:**
1. **Initial Schema**: Start with a basic classification schema with known categories
2. **Iterative Processing**: For each article, use the current schema with OpenAI's structured output
3. **Dynamic Extension**: When the LLM outputs new enum values not in the current schema, `flexEnum` automatically extends the schema
4. **Schema Evolution**: The updated schema is used for subsequent articles, creating a self-improving classification system

```typescript
import fs from "fs";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { flexEnum } from 'zod-enum-forge';

const articleSchema = z.object({
  textClassification: z.object({
    category: flexEnum(['spam', 'ham']),
    subCategory: flexEnum(['urgent', 'non-urgent']).optional(),
    features: z.object({
      sentiment: flexEnum(['positive', 'negative']),
      intent: flexEnum(['inform', 'request', 'command'])
    })
  }),
  metadata: z.object({
    source: flexEnum(['email', 'chat'])
  })
});

async function main() {
  let currArticleSchema = articleSchema;
  const articlesContent_raw = fs.readFileSync('./articles.json', 'utf8');
  const articlesContent = JSON.parse(articlesContent_raw);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const articles = [];

  for (let n = 0; n < articlesContent.length; n++) {
    const response = await openai.responses.parse({
      model: "gpt-4.1",
      input: [
        { role: "system", content: "Write the information about article." },
        {
          role: "user",
          content: "Article content:\n" + articlesContent[n],
        },
      ],
      text: {
        format: zodTextFormat(currArticleSchema, "article"),
      },
    });

    const article = response.output_parsed;
    currArticleSchema = flexEnum(currArticleSchema, article);
    articles.push(article);
  }

  fs.writeFileSync('./processed_articles.json', JSON.stringify(articles, null, 2));
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

This approach is particularly useful for:
- Content categorization where categories aren't known upfront
- Sentiment analysis with evolving emotional categories  
- Intent classification in chatbots
- Document taxonomy development
- Any scenario where classification categories emerge from data rather than being predefined




### Taxonomy Evolution

Build evolving taxonomies that grow with your data:

```typescript
let taxonomy = z.object({
  domain: flexEnum(['technology', 'business']),
  subdomain: flexEnum(['ai', 'blockchain'])
});

// As you process more documents
const documents = [
  { domain: 'healthcare', subdomain: 'telemedicine' },
  { domain: 'technology', subdomain: 'quantum' },
  { domain: 'business', subdomain: 'sustainability' }
];

documents.forEach(doc => {
  taxonomy = flexEnum(taxonomy, doc);
});

// Taxonomy now includes all discovered categories
```

## Zod Version Compatibility

This library automatically detects and works with both Zod v3 and v4:

- **Zod v3**: Uses `_def` property structure
- **Zod v4**: Uses `_zod.def` property structure with traits

No configuration needed - the library handles the differences internally.

## TypeScript Support

Full TypeScript support with proper type inference:

```typescript
const schema = z.object({
  status: flexEnum(['pending', 'done'])
});

type SchemaType = z.infer<typeof schema>;
// { status: "pending" | "done" }
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

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MFreeBSD © Mariusz Żabiński (kybernetes.ngo)

## Keywords

- zod
- enum
- taxonomy
- open-set
- llm
- structured-output
- classification
- dynamic-schemas

