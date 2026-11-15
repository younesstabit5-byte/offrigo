import {z} from 'zod';
import {writeFile} from 'node:fs/promises';
import {feedSchema} from '../shared/offers.ts';
await writeFile('offers.schema.json',JSON.stringify(z.toJSONSchema(feedSchema),null,2)+'\n');
