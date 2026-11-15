export function visibleObserved(feed,now=Date.now()){
 if(!feed||feed.schemaVersion!==1||feed.status!=='observed'||!Array.isArray(feed.offers)||feed.offers.length>200)throw Error('Invalid observations');
 const cities=['Casablanca','Rabat','Marrakech','Tanger','Agadir','Fès','Nador'];const seen=new Set();
 return feed.offers.filter(o=>{
 const ok=o.type==='travel'&&o.priceStatus==='observed'&&o.currency==='MAD'&&typeof o.price==='number'&&Number.isFinite(o.price)&&o.price>=0&&cities.includes(o.origin)&&typeof o.destination==='string'&&o.destination.length>0&&typeof o.id==='string'&&!seen.has(o.id)&&typeof o.sourceName==='string'&&o.sourceName.length>0&&typeof o.sourceUrl==='string'&&o.sourceUrl.startsWith('https://')&&o.validUntil===null&&o.validFrom===null&&Number.isFinite(Date.parse(o.collectedAt))&&Date.parse(o.collectedAt)<=now+300000&&/^\d{4}-\d{2}-\d{2}$/.test(o.departureDate)&&o.departureDate>new Date(now).toISOString().slice(0,10)&&(o.tripType==='oneWay'?o.returnDate===null:o.tripType==='roundTrip'&&/^\d{4}-\d{2}-\d{2}$/.test(o.returnDate)&&o.returnDate>=o.departureDate)&&['flight','package'].includes(o.travelKind)&&Array.isArray(o.included)&&Array.isArray(o.excluded);
 if(ok)seen.add(o.id);return ok;
 }).sort((a,b)=>a.price-b.price);
}
