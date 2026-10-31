import { env } from "cloudflare:workers";
import packages from "./server/biomedical-source-package.json";
import { PortalHttpError, TECHFLEX_ORG_ID, type PortalIdentity } from "./portal-auth";
import { safeServerLog } from "./server-observability";

export const biomedicalReadRoles = ["owner_administrator", "operations_administrator", "biomedical_lead", "dispatcher", "finance"] as const;
export const biomedicalWriteRoles = ["owner_administrator", "operations_administrator"] as const;
export type BiomedicalSource = typeof packages[number];
export type BiomedicalSummary = Omit<BiomedicalSource, "documents"> & { documents: Omit<BiomedicalSource["documents"][number], "dataKey">[] };
export function biomedicalSource(key: string) {
  const source = packages.find(item => item.key === key);
  if (!source) throw new PortalHttpError(404, "That prepared account was not found.");
  return source;
}
export function biomedicalSummaries(): BiomedicalSummary[] {
  return packages.map(source => ({ ...source, documents: source.documents.map(({dataKey: _bytes, ...document}) => document) }));
}
export async function sourceDocumentBytes(source: BiomedicalSource, role: string) {
  const document = source.documents.find(item => item.role === role);
  if (!document) throw new PortalHttpError(404, "Document not found.");
  const {default: contents}=await import("./server/biomedical-document-data");
  return { document, bytes: Uint8Array.from(atob(contents[document.dataKey]), value => value.charCodeAt(0)) };
}
type ContractRow = { id: string; accountId: string; name: string; termsJson: string; sourceJson: string };
export async function savedBiomedicalAccount(key: string) {
  const row = await env.DB.prepare(`SELECT c.id,c.account_id AS accountId,a.name,c.covered_services_json AS termsJson,c.service_level_json AS sourceJson
    FROM service_contracts c JOIN accounts a ON a.id=c.account_id AND a.organization_id=c.organization_id
    WHERE c.organization_id=? AND c.contract_type='biomedical_pm' AND json_extract(c.service_level_json,'$.sourceKey')=?`).bind(TECHFLEX_ORG_ID,key).first<ContractRow>();
  if (!row) return null;
  const source = JSON.parse(row.sourceJson) as { locationId: string; attachmentIds: string[]; assetIds: string[]; revision: string };
  const location = await env.DB.prepare("SELECT id,name,address_1 AS address1,address_2 AS address2,city,state,postal_code AS postalCode FROM locations WHERE id=? AND account_id=?").bind(source.locationId,row.accountId).first();
  if (!location) throw new PortalHttpError(409, "This account's facility link needs review in Locations. No records were changed.");
  const assets = (await env.DB.prepare(`SELECT id,asset_tag AS assetTag,manufacturer,model,serial_number AS serialNumber,description,status,metadata_json AS metadataJson
    FROM assets WHERE organization_id=? AND account_id=? AND location_id=? ORDER BY asset_tag`).bind(TECHFLEX_ORG_ID,row.accountId,source.locationId).all()).results;
  const documents = (await env.DB.prepare(`SELECT id,file_name AS fileName,category FROM attachments WHERE organization_id=? AND entity_type='account' AND entity_id=? AND id IN (SELECT value FROM json_each(?))`).bind(TECHFLEX_ORG_ID,row.accountId,JSON.stringify(source.attachmentIds)).all()).results;
  return { contractId: row.id, accountId: row.accountId, name: row.name, location, assets, documents, terms: JSON.parse(row.termsJson) as BiomedicalSource["terms"] };
}
export type SavedBiomedicalAccount = NonNullable<Awaited<ReturnType<typeof savedBiomedicalAccount>>>;

type StagedFile = { id: string; key: string; role: string; fileName: string; sizeBytes: number; sha256: string };
async function cleanupStaged(files: StagedFile[]) {
  for (const file of files) {
    try {
      // An interrupted commit may have succeeded. Never delete a referenced file.
      if (await env.DB.prepare("SELECT id FROM attachments WHERE storage_key=? LIMIT 1").bind(file.key).first()) continue;
      const pendingId=crypto.randomUUID();
      await env.DB.prepare(`INSERT INTO audit_logs(id,organization_id,action,entity_type,entity_id,before_json,after_json)
        VALUES (?,?,'attachment.storage_cleanup_pending','attachment',?,?,?)`).bind(pendingId,TECHFLEX_ORG_ID,file.id,JSON.stringify({storageKey:file.key}),JSON.stringify({metadataSaved:false,storageRemoved:false})).run();
      await env.BUCKET.delete(file.key);
      await env.DB.prepare(`INSERT INTO audit_logs(id,organization_id,action,entity_type,entity_id,before_json,after_json)
        VALUES (?,?,'attachment.storage_cleanup_completed','attachment',?,?,?)`).bind(`${pendingId}:completed`,TECHFLEX_ORG_ID,file.id,JSON.stringify({storageKey:file.key}),JSON.stringify({storageRemoved:true})).run();
    } catch(error) { safeServerLog("attachment_cleanup",error); }
  }
}
const normalizedName = "lower(replace(replace(replace(name,'&','and'),' ',''),'.',''))";
export async function importBiomedicalAccount(identity: PortalIdentity, key: string, revision: string) {
  if (!(biomedicalWriteRoles as readonly string[]).includes(identity.role)) throw new PortalHttpError(403,"Only an administrator can add the prepared accounts.");
  const source=biomedicalSource(key);
  if (revision!==source.revision) throw new PortalHttpError(409,"The prepared package changed. Refresh this page before adding it.");
  const existing=await savedBiomedicalAccount(key);
  if (existing) return {account:existing,alreadySaved:true};
  const matches=(await env.DB.prepare(`SELECT id,record_version AS version FROM accounts WHERE organization_id=? AND (${normalizedName}=? OR external_id=?)`).bind(TECHFLEX_ORG_ID,source.name.toLowerCase().replace(/&/g,"and").replace(/[ .]/g,""),source.siteCode).all<{id:string;version:number}>()).results;
  if(matches.length>1) throw new PortalHttpError(409,"Two accounts match this facility. Merge or rename the duplicate in Accounts, then retry. Nothing has been imported.");
  const accountId=matches[0]?.id || crypto.randomUUID(), contractId=`biomedical-${source.key}-${source.revision}`;
  if (await env.DB.prepare("SELECT id FROM service_contracts WHERE organization_id=? AND account_id=? AND contract_number=?").bind(TECHFLEX_ORG_ID,accountId,source.terms.agreementNumber).first())
    throw new PortalHttpError(409,"This agreement already exists. Review the saved contract instead of importing a second copy.");
  const locations=(await env.DB.prepare("SELECT id,record_version AS version FROM locations WHERE account_id=? AND lower(address_1)=lower(?) AND lower(COALESCE(address_2,''))=lower(?) AND lower(city)=lower(?) AND state=? AND postal_code=?").bind(accountId,source.address.address1,source.address.address2,source.address.city,source.address.state,source.address.postalCode).all<{id:string;version:number}>()).results;
  if(locations.length>1) throw new PortalHttpError(409,"This address has duplicate locations. Review Locations before importing.");
  const locationId=locations[0]?.id || crypto.randomUUID();
  const previousAssets=(await env.DB.prepare("SELECT id,asset_tag AS tag,account_id AS accountId,location_id AS locationId,serial_number AS serial,model,record_version AS version FROM assets WHERE organization_id=? AND asset_tag IN (SELECT json_extract(value,'$.assetTag') FROM json_each(?))").bind(TECHFLEX_ORG_ID,JSON.stringify(source.assets)).all<{id:string;tag:string;accountId:string;locationId:string;serial:string|null;model:string;version:number}>()).results;
  for(const asset of previousAssets) {
    const incoming=source.assets.find(item=>item.assetTag===asset.tag)!;
    if(asset.accountId!==accountId || asset.locationId!==locationId || asset.serial!==incoming.serialNumber || asset.model!==incoming.model)
      throw new PortalHttpError(409,`Asset ${asset.tag} already has different saved details. Review that asset before importing; its existing record has been preserved.`);
  }
  const assetRows=source.assets.map(asset=>({...asset,id:previousAssets.find(item=>item.tag===asset.assetTag)?.id || crypto.randomUUID()}));
  const staged:StagedFile[]=[];
  try {
    for(const item of source.documents) {
      const id=crypto.randomUUID(), storageKey=`${TECHFLEX_ORG_ID}/account/${accountId}/${id}/${item.fileName}`;
      staged.push({id,key:storageKey,role:item.role,fileName:item.fileName,sizeBytes:item.sizeBytes,sha256:item.sha256});
      const {bytes}=await sourceDocumentBytes(source,item.role);
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),value=>value.toString(16).padStart(2,"0")).join("");
      if(digest!==item.sha256 || bytes.byteLength!==item.sizeBytes) throw new Error("Prepared document integrity check failed");
      await env.BUCKET.put(storageKey,bytes,{httpMetadata:{contentType:"application/pdf"}});
    }
    const statements=[env.DB.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM service_contracts WHERE id=? OR (account_id=? AND contract_number=?)) THEN 1 ELSE json('biomedical_import_conflict') END").bind(contractId,accountId,source.terms.agreementNumber)];
    if(matches[0]) statements.push(env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM accounts WHERE id=? AND organization_id=? AND record_version=?) THEN 1 ELSE json('biomedical_import_conflict') END").bind(accountId,TECHFLEX_ORG_ID,matches[0].version));
    else {
      statements.push(env.DB.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM accounts WHERE organization_id=? AND (${normalizedName}=? OR external_id=?)) THEN 1 ELSE json('biomedical_import_conflict') END`).bind(TECHFLEX_ORG_ID,source.name.toLowerCase().replace(/[ .]/g,""),source.siteCode));
      statements.push(env.DB.prepare("INSERT INTO accounts(id,organization_id,external_id,name,account_type,payment_terms_days,service_level,service_discipline,notes) VALUES (?,?,?,?,'facility',30,'Biomedical/PM','biomedical',?)").bind(accountId,TECHFLEX_ORG_ID,source.siteCode,source.name,"Imported from the signed biomedical service agreement and attached inventory. Billing contact email must be verified before sending invoices."));
    }
    if(locations[0]) statements.push(env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM locations WHERE id=? AND account_id=? AND record_version=?) THEN 1 ELSE json('biomedical_import_conflict') END").bind(locationId,accountId,locations[0].version));
    else statements.push(env.DB.prepare("INSERT INTO locations(id,account_id,external_id,name,location_type,address_1,address_2,city,state,postal_code) VALUES (?,?,?,?,'surgical_center',?,?,?,?,?)").bind(locationId,accountId,source.siteCode,source.name,source.address.address1,source.address.address2,source.address.city,source.address.state,source.address.postalCode));
    for(const asset of previousAssets) statements.push(env.DB.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM assets WHERE id=? AND organization_id=? AND account_id=? AND location_id=? AND record_version=?) THEN 1 ELSE json('biomedical_import_conflict') END").bind(asset.id,TECHFLEX_ORG_ID,accountId,locationId,asset.version));
    const newAssets=assetRows.filter(asset=>!previousAssets.some(previous=>previous.id===asset.id));
    statements.push(env.DB.prepare(`INSERT INTO assets(id,organization_id,account_id,location_id,asset_tag,customer_asset_id,manufacturer,model,serial_number,description,risk_class,status,metadata_json)
      SELECT json_extract(value,'$.id'),?,?,?,json_extract(value,'$.assetTag'),json_extract(value,'$.assetTag'),json_extract(value,'$.manufacturer'),json_extract(value,'$.model'),json_extract(value,'$.serialNumber'),json_extract(value,'$.equipmentType'),'unassessed',CASE WHEN json_extract(value,'$.coverage')='excluded_outlet_reference' THEN 'inventory_reference' ELSE 'pending_verification' END,
      json_object('sourcePackage',?,'sourcePage',json_extract(value,'$.sourcePage'),'coverage',json_extract(value,'$.coverage'),'sourceTier',json_extract(value,'$.tier'),'tagSource',json_extract(value,'$.tagSource'),'verification','Imported inventory; no current inspection or PM result recorded') FROM json_each(?)`).bind(TECHFLEX_ORG_ID,accountId,locationId,source.key,JSON.stringify(newAssets)));
    statements.push(env.DB.prepare(`INSERT INTO service_contracts(id,organization_id,account_id,contract_number,name,contract_type,starts_on,ends_on,auto_renew,service_level_json,covered_services_json,status)
      VALUES (?,?,?,?,?,'biomedical_pm',?,?,0,?,?,'active')`).bind(contractId,TECHFLEX_ORG_ID,accountId,source.terms.agreementNumber,`${source.name} — Annual Biomedical/PM`,source.terms.effectiveDate,source.terms.termEndExclusive,
      JSON.stringify({sourceKey:source.key,revision:source.revision,locationId,assetIds:assetRows.map(asset=>asset.id),attachmentIds:staged.map(file=>file.id),addressSource:source.address.sourceUrl,addressVerifiedOn:source.address.verifiedOn}),JSON.stringify(source.terms)));
    for(const file of staged) statements.push(env.DB.prepare("INSERT INTO attachments(id,organization_id,entity_type,entity_id,storage_key,file_name,content_type,size_bytes,checksum,category,uploaded_by) VALUES (?,?,'account',?,?,?,'application/pdf',?,?,?,?)").bind(file.id,TECHFLEX_ORG_ID,accountId,file.key,file.fileName,file.sizeBytes,file.sha256,file.role==="agreement"?"partner_contract":"general",identity.userId));
    statements.push(env.DB.prepare("INSERT INTO audit_logs(id,organization_id,actor_user_id,action,entity_type,entity_id,after_json) VALUES (?,?,?,'biomedical.account_imported','account',?,?)").bind(crypto.randomUUID(),TECHFLEX_ORG_ID,identity.userId,accountId,JSON.stringify({sourceKey:key,revision,contractId,assetCount:assetRows.length,newAssetCount:newAssets.length,documents:staged.map(({key:_key,...file})=>file),invoicesCreated:0})));
    await env.DB.batch(statements);
  } catch(error) {
    // Reconcile an acknowledged or ambiguous commit before any cleanup/retry.
    const committed=await savedBiomedicalAccount(key).catch(()=>null);
    await cleanupStaged(staged);
    if(committed) return {account:committed,alreadySaved:true};
    if(/conflict|UNIQUE|malformed JSON/i.test(String(error))) throw new PortalHttpError(409,"Saved records changed during import. Nothing was replaced. Refresh this page and retry after reviewing the account.");
    throw new PortalHttpError(503,"The account import could not be confirmed. Refresh to check its saved status, then retry. The prepared assets and original documents remain available here.");
  }
  return {account:await savedBiomedicalAccount(key),alreadySaved:false};
}
