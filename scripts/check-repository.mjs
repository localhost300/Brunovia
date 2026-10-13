import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const tracked=execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{encoding:"utf8"}).split("\0").filter(Boolean);
const errors=[];
const forbidden=[/^(?:\.next|node_modules|test-results|playwright-report|tmp|artifacts\/backups)(?:\/|$)/,/^\.env(?:\.|$)/];
const secretPatterns=[/SUPABASE_SERVICE_ROLE_KEY\s*=\s*\S+/i,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\bghp_[A-Za-z0-9]{20,}\b/,/\bsk_live_[A-Za-z0-9]{16,}\b/];
for(const file of tracked){
  const normalized=file.replaceAll("\\","/");
  if(forbidden.some((pattern)=>pattern.test(normalized))&&!normalized.endsWith(".env.example"))errors.push(`Generated or private file is tracked: ${file}`);
  let stat;try{stat=statSync(file)}catch{continue}
  if(stat.size>20*1024*1024)errors.push(`Tracked file exceeds 20 MiB: ${file} (${(stat.size/1024/1024).toFixed(1)} MiB)`);
  if(stat.size<=2*1024*1024&&!/\.(?:png|jpe?g|gif|pdf|woff2|ico)$/i.test(file)){
    const content=readFileSync(file,"utf8");
    if(secretPatterns.some((pattern)=>pattern.test(content)))errors.push(`Possible secret in tracked file: ${file}`);
  }
}
if(errors.length){console.error(errors.map((error)=>`- ${error}`).join("\n"));process.exit(1)}
console.log(`Repository check passed: ${tracked.length} versioned or pending files, no generated directories, oversized files, or obvious secrets.`);
