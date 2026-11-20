const fs=require('fs'),path=require('path');
for(const name of ['pilotReportPipelineV2.cjs','reportFacts.cjs','reportNarrative.cjs','reportDatabaseNarrative.cjs','reportPresentation.cjs','reportImport.cjs','reportQuality.cjs','reportGrounding.cjs','aiLiveBudget.cjs']){
 const to=path.join(__dirname,'../dist/services',name);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(__dirname,'../src/services',name),to);
}
console.log('[copy-reports] Copied isolated report modules');
