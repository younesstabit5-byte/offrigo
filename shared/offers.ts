import cities from './moroccan-cities.json' with {type:'json'};
import {z} from 'zod';
const text=z.string().trim().min(1).max(1000);
const instant=z.string().datetime({offset:true});
const url=z.string().url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!/(^|\.)(google|bing|yahoo)\./i.test(u.hostname)&&u.pathname!=='/';},'Direct HTTPS supplier URL required');
const base={title:text,price:z.number().finite().nonnegative(),currency:z.literal('MAD'),validFrom:instant,validUntil:instant,sourceUrl:url};
export const rawOfferSchema=z.discriminatedUnion('type',[
 z.object({...base,type:z.literal('travel'),origin:z.enum(cities),destination:text,departureAt:instant,returnAt:instant}).strict(),
 z.object({...base,type:z.literal('shopping'),store:text,city:z.enum([...cities,'En ligne'])}).strict(),
 z.object({...base,type:z.literal('event'),regularPrice:z.number().positive(),discountSourceUrl:url,venue:text,city:z.enum(cities),eventStartsAt:instant,eventEndsAt:instant}).strict()
]);
const meta={id:z.string().regex(/^[a-f0-9]{64}$/),collectedAt:instant,sourceName:text};
export const publishedOfferSchema=z.discriminatedUnion('type',[rawOfferSchema.options[0].extend(meta),rawOfferSchema.options[1].extend(meta),rawOfferSchema.options[2].extend(meta)]);
// The union above is used at runtime; this explicit type preserves discrimination in clients.
export type RawOffer=z.infer<typeof rawOfferSchema>;
export type PublishedOffer=RawOffer&{id:string;collectedAt:string;sourceName:string};
export const feedSchema=z.object({schemaVersion:z.literal(1),generatedAt:instant,status:z.enum(['ready','source à connecter']),offers:z.array(publishedOfferSchema).max(200)}).strict();
export interface Feed{schemaVersion:1;generatedAt:string;status:'ready'|'source à connecter';offers:PublishedOffer[]}
export function active(o:RawOffer,now=Date.now()){
 const start=Date.parse(o.validFrom),end=Date.parse(o.validUntil);
 return start<end&&start<=now&&end>now&&(o.type!=='travel'||(Date.parse(o.departureAt)>now&&Date.parse(o.returnAt)>Date.parse(o.departureAt)))&&(o.type!=='event'||(o.price<o.regularPrice&&Date.parse(o.eventEndsAt)>now&&Date.parse(o.eventEndsAt)>Date.parse(o.eventStartsAt)&&end<=Date.parse(o.eventEndsAt)));
}
export function validateFeed(input:unknown,now=Date.now()):Feed{
 const result=feedSchema.parse(input) as unknown as Feed;
 if(Date.parse(result.generatedAt)>now+300000||new Set(result.offers.map(o=>o.id)).size!==result.offers.length)throw Error('Invalid feed metadata');
 if(result.offers.some(o=>Date.parse(o.collectedAt)>now+300000||Date.parse(o.validFrom)>=Date.parse(o.validUntil)||!active(o,Date.parse(o.collectedAt))))throw Error('Invalid offer dates');
 return result;
}
