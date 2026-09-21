import test from 'node:test';
import assert from 'node:assert/strict';
import {dnaBreakdown,allocatedCashRows} from '../statements.mjs';
import {spendingDNA,cardSchedule,cents,categoryTotals,inPeriod,totals} from '../finance.mjs';
const categories=[{id:'food',name:'Mercado',spending_area:'Alimentação',type:'expense'},{id:'health',name:'Farmácia',spending_area:'Saúde',type:'expense'}];
const transactions=[
 {id:'cash',type:'expense',date:'2026-05-12',amount:17.35,category_id:'food',description:'Feira'},
 {id:'p1',type:'expense',date:'2026-05-20',amount:30.01,description:'Pagamento XP',account_id:'account'},
 {id:'p2',type:'expense',date:'2026-06-20',amount:69.99,description:'Pagamento XP',account_id:'account'},
 {id:'i1',type:'expense',date:'2026-04-01',amount:60,category_id:'food',credit_card_id:'card',billing_cycle_id:'cycle',description:'Mercado'},
 {id:'i2',type:'income',date:'2026-04-02',amount:10,category_id:'food',credit_card_id:'card',billing_cycle_id:'cycle',description:'Estorno'},
 {id:'i3',type:'expense',date:'2026-04-03',amount:30,category_id:'health',credit_card_id:'card',billing_cycle_id:'cycle',description:'Farmácia'},
 {id:'transfer',type:'transfer',date:'2026-05-02',amount:999,category_id:'food',description:'Transferência'},
 {id:'income',type:'income',date:'2026-05-02',amount:999,category_id:'food',description:'Salário'},
];
const payments=[{transaction_id:'p1',billing_cycle_id:'cycle'},{transaction_id:'p2',billing_cycle_id:'cycle'}];
const cycles=[{id:'cycle',credit_card_id:'card',total_spent:100}];
test('category report details reconcile by category and exact date range, including refunds and residuals',()=>{
 const cats=[...categories,{id:'otherfood',name:'Restaurante',spending_area:'Alimentação'}];
 const tx=[...transactions,{id:'other',date:'2026-05-19',type:'expense',category_id:'otherfood',amount:9}];
 for(const basis of ['cash','card'])for(const [start,end] of [['2026-04-01','2026-06-30'],['2026-05-15','2026-05-21']]){
  const source=basis==='cash'?allocatedCashRows(tx,payments,cycles):cardSchedule(tx,[]);
  for(const group of categoryTotals(inPeriod(source,start,end),cats)){
   const d=dnaBreakdown(tx,[],cats,payments,cycles,{basis,categoryId:group.id,start,end});
   assert.equal(cents(d.total),cents(group.value));
   assert.equal(d.items.reduce((n,t)=>n+cents(t.contribution),0),cents(group.value));
   assert.ok(d.items.every(t=>(t.category_id||'')===group.id&&t.date>=start&&t.date<=end));
  }
 }
});
test('every DNA detail reconciles with its bar in both bases, including empty months',()=>{
 for(const basis of ['cash','card']){
  const source=basis==='cash'?allocatedCashRows(transactions,payments,cycles):cardSchedule(transactions,[]);
  const dna=spendingDNA(source,categories,'2026-08',6);
  for(const area of dna.areas)for(const [i,month] of dna.months.entries()){
   const detail=dnaBreakdown(transactions,[],categories,payments,cycles,{basis,area:area.area,month});
   assert.equal(cents(detail.total),cents(area.monthly[i]));
   assert.equal(detail.items.reduce((sum,t)=>sum+cents(t.contribution),0),cents(detail.total));
   assert.ok(detail.items.every(t=>t.date.startsWith(month)));
  }
 }
});
test('cash drilldown explains partial payments by merchant, retains credit and excludes duplicate invoice',()=>{
 const d=dnaBreakdown(transactions,[],categories,payments,cycles,{basis:'cash',area:'Alimentação',month:'2026-05'});
 assert.equal(d.total,32.36);assert.deepEqual(d.items.map(t=>t.description).sort(),['Estorno','Feira','Mercado']);
 assert.ok(d.items.find(t=>t.description==='Estorno').contribution<0);
 assert.equal(d.items.find(t=>t.description==='Mercado').purchase_date,'2026-04-01');
 const residual=dnaBreakdown(transactions,[],categories,payments,cycles,{basis:'cash',area:'Sem categoria',month:'2026-05'});
 assert.equal(residual.total,6);assert.match(residual.items[0].description,/sem detalhamento/);
});
test('card drilldown follows installment month and excludes cash payment',()=>{
 const installments=[{id:'part',transaction_id:'i1',installment_date:'2026-07-10',installment_amount:20,current_installment:3,total_installments:3}];
 const d=dnaBreakdown(transactions,installments,categories,payments,cycles,{basis:'card',area:'Alimentação',month:'2026-07'});
 assert.equal(d.total,20);assert.equal(d.items.length,1);assert.match(d.items[0].description,/3\/3/);
});
test('paid CEF invoices with net negative Extras split into purchases and credits without a second cash expense',()=>{
 for(const [month,total,travel,extras] of [['2026-06',3858.41,1620.28,-0.06],['2026-08',3989.07,929.34,-0.07]]){
  const cats=[{id:'travel',name:'VIAGENS'},{id:'extras',name:'EXTRAS'},{id:'other',name:'MERCADO'},{id:'payment',name:'Pagamento de Fatura',spending_area:'Faturas sem detalhamento'}];
  const cycle={id:'cycle',credit_card_id:'cef',total_spent:total};
  const payment={id:'cash',type:'expense',date:month+'-26',amount:total,category_id:'payment',account_id:'account',description:'PG. CARTAO CEF'};
  const tx=[payment,{id:'trip',type:'expense',date:month+'-02',amount:travel,category_id:'travel',credit_card_id:'cef',billing_cycle_id:'cycle',description:'Viagem'},{id:'market',type:'expense',date:month+'-03',amount:Number((total-travel-extras).toFixed(2)),category_id:'other',credit_card_id:'cef',billing_cycle_id:'cycle',description:'Mercado'},{id:'refund',type:'income',date:month+'-04',amount:-extras,category_id:'extras',credit_card_id:'cef',billing_cycle_id:'cycle',description:'Ajuste credito'}];
  const pay=[{transaction_id:'cash',billing_cycle_id:'cycle'}];
  const cash=allocatedCashRows(tx,pay,[cycle]);
  assert.equal(cents(totals(cash).expense),cents(total));
  assert.equal(cash.reduce((n,t)=>n+cents(t.amount),0),cents(total));
  assert.equal(categoryTotals(cash,cats).find(g=>g.id==='payment'),undefined);
  assert.equal(cents(categoryTotals(cash,cats).find(g=>g.id==='extras').value),cents(extras));
  const detail=dnaBreakdown(tx,[],cats,pay,[cycle],{basis:'cash',area:'EXTRAS',month});
  assert.equal(detail.items[0].description,'Ajuste credito');
  assert.equal(cents(detail.items[0].contribution),cents(extras));
  assert.equal(totals(tx.filter(t=>!t.credit_card_id)).expense,total);
 }
});
