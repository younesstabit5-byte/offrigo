import {readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {pathToFileURL} from 'node:url';
import {XMLParser} from 'fast-xml-parser';
import {z} from 'zod';
import {rawOfferSchema,active,validateFeed,type RawOffer,type PublishedOffer,type Feed} from '../shared/offers.ts';
const sourceSchema=z.object({id:z.string().regex(/^[a-z0-9-]+$/),name:z.string().min(1),format:z.enum(['json','rss-json']),enabled:z.boolean(),urlEnv:z.string().regex(/^[A-Z][A-Z0-9_]+$/),allowedHosts:z.array(z.string()).min(1),termsUrl:z.string().url(),permissionReference:z.string().min(10),publicRedistributionAllowed:z.boolean()}).strict();
export function identity(o:RawOffer){const u=new URL(o.sourceUrl);for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);u.hash='';u.searchParams.sort();return createHash('sha256').update(JSON.stringify([o.type,o.currency,u.href,o.validFrom,o.validUntil,o.type==='travel'?[o.origin,o.destination,o.departureAt,o.returnAt]:o.type==='event'?[o.venue,o.city,o.eventStartsAt,o.eventEndsAt]:[o.store,o.city]])).digest('hex');}
export function select(rows:unknown[],name:string,now:number):PublishedOffer[]{const result:PublishedOffer[]=[];for(const row of rows){const p=rawOfferSchema.safeParse(row);if(!p.success||!active(p.data,now))continue;result.push({...p.data,id:identity(p.data),collectedAt:new Date(now).toISOString(),sourceName:name});}return result;}
export function deduplicate(rows:PublishedOffer[]){const map=new Map<string,PublishedOffer>();for(const o of rows){const old=map.get(o.id);if(!old||o.price<old.price)map.set(o.id,o);}return [...map.values()].sort((a,b)=>a.validUntil.localeCompare(b.validUntil)||a.id.localeCompare(b.id)).slice(0,200);}
async function download(value:string,hosts:string[]){
 const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!hosts.includes(u.hostname)||isIP(u.hostname))throw Error('Source URL refused');
 const addresses=await lookup(u.hostname,{all:true});if(!addresses.length||addresses.some(({address:a})=>a.includes(':')&&!/^2|^3/.test(a)||/^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01])|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\./.test(a)))throw Error('Private network refused');
 const r=await fetch(u,{redirect:'error',signal:AbortSignal.timeout(25000),headers:{Accept:'application/json, application/rss+xml, application/xml','User-Agent':'OffrigoFeedCollector/1.0'}});
 if(!r.ok||!r.body)throw Error('Source request failed');
 const type=r.headers.get('content-type')||'';if(!/json|xml|rss/i.test(type))throw Error('Only structured feeds accepted');
 let size=0;const chunks:Uint8Array[]=[];for await(const chunk of r.body){size+=chunk.length;if(size>5_000_000)throw Error('Feed too large');chunks.push(chunk);}return Buffer.concat(chunks).toString('utf8');
}
export function parseFeed(text:string,format:string):unknown[]{if(format==='json'){const data=JSON.parse(text);if(!Array.isArray(data.offers)||data.offers.length>10000)throw Error('Expected bounded offers array');return data.offers;}if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('DTD and entities forbidden');const xml=new XMLParser({parseTagValue:false,processEntities:false}).parse(text);const items=xml.rss?.channel?.item;if(!items)return [];const list=Array.isArray(items)?items:[items];if(list.length>10000)throw Error('Too many feed items');return list.flatMap(item=>{try{const data=item['offrigo:offer'];return typeof data==='string'?[JSON.parse(data)]:[];}catch{return [];}});}
export async function run(){
 const file=resolve(process.env.OUTPUT_FILE||'offers.json');
 // An existing invalid backup is an error, never silently overwritten.
 try{validateFeed(JSON.parse(await readFile(file,'utf8')));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw Error('Invalid existing offers.json');}
 const config=z.array(sourceSchema).max(12).parse(JSON.parse(await readFile(process.env.SOURCES_FILE||'sources.json','utf8')));
 const now=Date.now(),rows:PublishedOffer[]=[];
 for(const source of config.filter(s=>s.enabled)){
  if(!source.publicRedistributionAllowed||source.termsUrl.includes('example.invalid')||source.permissionReference.includes('À remplacer'))throw Error('Source lacks redistribution approval');
  const endpoint=process.env[source.urlEnv];if(!endpoint)throw Error('Missing source configuration');
  // Any failing enabled source aborts the entire run, preserving the previous file.
  const text=await download(endpoint,source.allowedHosts);const raw=parseFeed(text,source.format);const accepted=select(raw,source.name,now);rows.push(...accepted);
  console.log(JSON.stringify({source:source.id,received:raw.length,accepted:accepted.length}));
 }
 const offers=deduplicate(rows);if(!offers.length){console.log('No valid offers: previous offers.json preserved; source à connecter if unconfigured.');return;}
 const feed:Feed={schemaVersion:1,generatedAt:new Date(now).toISOString(),status:'ready',offers};validateFeed(feed,now);
 await mkdir(dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';try{await writeFile(temp,JSON.stringify(feed,null,2)+'\n',{flag:'wx'});await rename(temp,file);}finally{await rm(temp,{force:true});}
 console.log(JSON.stringify({published:offers.length}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)run().catch(()=>{console.error('Collection failed. Previous offers.json preserved. Check approved sources/configuration.');process.exitCode=1;});
