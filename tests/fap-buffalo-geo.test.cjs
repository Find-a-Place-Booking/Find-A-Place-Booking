const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('lib/public/buffalo-river-discovery.ts', 'utf8');
const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
const sandboxModule = {exports: {}};
vm.runInNewContext(js, {module: sandboxModule, exports: sandboxModule.exports, require, console, Math, Number, Set});
const {searchBuffaloRiverStays, BUFFALO_RIVER_MAX_DISTANCE_MILES} = sandboxModule.exports;
const fixtures = [
 {name:'Norfork Hideaway',slug:'norfork',lat:36.229250,lng:-92.306720,city:'Norfork',state:'AR',location:'Norfork, AR'},
 {name:'Lucky Star Lookout',slug:'lucky',lat:35.978340,lng:-93.099980,city:'Jasper',state:'AR',location:'Jasper, AR'},
 {name:'Cabin in the Woods',slug:'woods',lat:35.914517,lng:-93.215437,city:'Jasper',state:'AR',location:'Jasper, AR'}
];
const result=searchBuffaloRiverStays(fixtures,'Buffalo National River',40).map(x=>x.slug);
assert.equal(BUFFALO_RIVER_MAX_DISTANCE_MILES,12);
assert.equal(result.includes('norfork'),false);
assert.equal(result.includes('lucky'),true);
assert.equal(result.includes('woods'),true);
console.log('PASS Buffalo geography: Norfork excluded, Lucky Star and Cabin in the Woods included');
