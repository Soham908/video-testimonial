const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),path = require('node:path'),ts = require('typescript');
const m={exports:{}};
new Function('module','exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../phoneNumbers.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m,m.exports);
const { validPhone,nationalPhone,PHONE_COUNTRIES }=m.exports;
test('Indian mobile input requires exactly ten digits; legacy sign-in remains compatible',()=>{
 for(const value of ['','987654321','98765432101','98letters1'])assert.equal(validPhone(value,'IN',true),false);
 assert.equal(validPhone('9876543210','IN',true),true);
 assert.equal(validPhone('0005764481','IN'),true);
 assert.equal(validPhone('0005764481','IN',true),false);
});
test('pasted country prefixes and local trunk prefixes do not consume the national digit limit',()=>{
 assert.equal(nationalPhone('+1 9876543210','IN'),'');
 assert.equal(nationalPhone('+91 98765-43210','IN'),'9876543210');
 assert.equal(nationalPhone('987654321012','IN'),'9876543210');
 assert.equal(nationalPhone('+44 7123 456789','GB'),'7123456789');
 assert.equal(nationalPhone('0412345678','AU'),'412345678');
 assert.equal(nationalPhone('8123 4567','SG'),'81234567');
});
test('country selection applies that country\'s national length rather than a universal ten digits',()=>{
 for(const country of PHONE_COUNTRIES){
  assert.equal(validPhone('8'.repeat(country.digits),country.code),true);
  assert.equal(validPhone('8'.repeat(country.digits-1),country.code),false);
  assert.equal(validPhone('8'.repeat(country.digits+1),country.code),false);
 }
});
