export type ImportCell = string | number | boolean | null;
export function parseCsv(text:string):ImportCell[][] {
 const rows:string[][]=[];let row:string[]=[];let value='';let quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'&&quoted&&text[i+1]==='"'){value+='"';i++;}
  else if(c==='"')quoted=!quoted;
  else if(c===','&&!quoted){row.push(value);value='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);value='';if(row.some(v=>v.trim()))rows.push(row);row=[];}
  else value+=c;
 }
 if(quoted)throw new Error('A quoted CSV field is unfinished. Close the quote and upload the corrected file.');
 row.push(value);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
export function rowsToObjects(matrix:ImportCell[][]){
 const headers=(matrix[0]||[]).map(v=>String(v??'').trim().replace(/^\uFEFF/,''));
 if(headers.some(h=>!h))throw new Error('Every spreadsheet column needs a header. Name or remove blank columns.');
 const normalized=headers.map(h=>h.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''));
 if(normalized.some(h=>!h)||new Set(normalized).size!==headers.length)throw new Error('Column headers must be distinct. Rename duplicate headers before importing.');
 return matrix.slice(1).filter(row=>row.some(v=>v!==null&&String(v).trim())).map((row,i)=>{
  if(row.slice(headers.length).some(v=>v!==null&&String(v).trim()))throw new Error(`Row ${i+2} has more values than column headers. Check commas or missing headers.`);
  return Object.fromEntries(headers.map((h,i)=>[h,row[i]??null]));
 });
}
