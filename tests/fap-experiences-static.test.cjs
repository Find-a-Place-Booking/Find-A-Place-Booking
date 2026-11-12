const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
for(const path of ['app/experiences/page.tsx','components/Header.tsx','lib/public/discovery-categories.ts','lib/public/buffalo-river-discovery.ts']){
 const content=fs.readFileSync(path,'utf8');
 const result=ts.transpileModule(content,{fileName:path,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.Preserve}});
 assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,'TS syntax: '+path);
}
const source=fs.readFileSync('app/experiences/page.tsx','utf8');
assert.ok(source.includes('admin.rpc("public_listing_index")'));
assert.ok(source.includes('if (!stay || !title) continue'));
assert.ok(source.includes('new Map<string, ExperienceGroup>()'));
assert.ok(fs.readFileSync('components/Header.tsx','utf8').includes('["Experiences", "/experiences"]')); 
console.log('PASS experiences: TS syntax and published-only dedup checks');
