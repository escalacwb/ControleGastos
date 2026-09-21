import test from 'node:test';
import assert from 'node:assert/strict';
import {spendingDNA,spendingArea} from '../finance.mjs';
import {dnaBreakdown} from '../statements.mjs';

test('DNA separates travel from leisure, including legacy grouping and drilldown',()=>{
 for(const spending_area of [null,'Lazer e viagens']){
  const categories=[{id:'leisure',name:'LAZER & CULTURA',spending_area},{id:'travel',name:'VIAGENS',spending_area}];
  const rows=[{id:'a',category_id:'leisure',type:'expense',date:'2026-08-10',amount:100},{id:'b',category_id:'travel',type:'expense',date:'2026-08-11',amount:900}];
  const dna=spendingDNA(rows,categories,'2026-09',1);
  assert.equal(dna.areas.length,2);
  assert.equal(dna.average,1000);
  for(const [area,total,id] of [['Lazer e cultura',100,'a'],['Viagens',900,'b']]){
   assert.equal(dna.areas.find(g=>g.area===area).average,total);
   const detail=dnaBreakdown(rows,[],categories,[],[],{basis:'cash',area,month:'2026-08'});
   assert.equal(detail.total,total);
   assert.deepEqual(detail.items.map(t=>t.id),[id]);
  }
 }
 assert.equal(spendingArea({name:'VIAGENS',spending_area:'Trabalho'}),'Trabalho');
});
