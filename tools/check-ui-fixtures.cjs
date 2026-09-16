const {chromium}=require('playwright');
const {randomUUID}=require('node:crypto');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const member=randomUUID(),uid=randomUUID(),a1=randomUUID(),a2=randomUUID(),c1=randomUUID(),c2=randomUUID(),c3=randomUUID(),card=randomUUID(),cycle=randomUUID();
const date=new Date(),month=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`,today=month+'-15';
const db={accounts:[{id:a1,user_id:uid,name:'Conta da família',type:'checking',balance:8250},{id:a2,user_id:uid,name:'Carteira',type:'cash',balance:180}],categories:[{id:c1,user_id:uid,name:'Mercado',type:'expense',spending_area:'Alimentação',color:'#72925f'},{id:c2,user_id:uid,name:'Moradia',type:'expense',spending_area:'Moradia',color:'#bfac88'},{id:c3,user_id:uid,name:'Salário',type:'income',color:'#174f42'}],credit_cards:[{id:card,user_id:uid,account_id:a1,bank_name:'Cartão da família',holder_name:'Família exemplo',last_four_digits:'1234',card_network:'Visa',credit_limit:10000,closing_day:20,due_day:5,is_active:true}],billing_cycles:[{id:cycle,user_id:uid,credit_card_id:card,total_spent:1450,total_paid:450,due_date:month+'-25',cycle_start_date:month+'-01',cycle_end_date:month+'-28',status:'partial_payment'}],card_payments:[],statement_documents:[],installments:[],investments:[],investment_transactions:[],pending_transactions:[],transactions:[]};
for(let i=0;i<1055;i++){const d=new Date(date.getFullYear(),date.getMonth()-Math.floor(i/151),1+(i%27),12);db.transactions.push({id:randomUUID(),user_id:uid,account_id:a1,category_id:i%7===0?c3:i%3===0?c2:c1,type:i%7===0?'income':'expense',amount:i%7===0?750:20+i%80,description:i%7===0?'Receita exemplo':i%3===0?'Despesa de moradia':'Mercado da semana',date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,created_at:d.toISOString(),updated_at:d.toISOString(),credit_card_id:null});}
const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:member,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',aud:'authenticated'})).toString('base64url')+'.fixture';const user={id:member,email:'familia@example.invalid',aud:'authenticated',role:'authenticated'};const session={access_token:jwt,refresh_token:'fixture',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};let historyFixtures=[];const calls=[],errors=[];
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100}});try{
page.on('pageerror',e=>errors.push(e.message));await page.route('**/*.supabase.co/**',async route=>{const request=route.request(),url=new URL(request.url()),method=request.method();let body={};const respond=async(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
if(url.pathname.includes('/auth/v1/token'))return respond(session);if(url.pathname.includes('/auth/v1/user'))return respond(user);if(url.pathname.includes('/auth/v1/logout'))return respond({});
if(url.pathname.includes('/rpc/')){const name=url.pathname.split('/').pop();if(name==='get_finance_workspace')return respond({owner_id:uid,shared:true});if(name==='statement_payment_candidates')return respond(historyFixtures);body=request.postDataJSON();calls.push({name,body});if(name==='save_financial_transaction'){const existing=db.transactions.find(t=>t.id===body.p_id),t={...body.p_data,id:existing?.id||randomUUID(),user_id:uid,updated_at:new Date().toISOString(),created_at:existing?.created_at||new Date().toISOString()};if(existing)Object.assign(existing,t);else db.transactions.push(t);return respond(t);}if(name==='delete_financial_transaction'){db.transactions=db.transactions.filter(t=>t.id!==body.p_id);return respond(null);}if(name==='import_financial_transactions'){db.transactions.push(...body.p_rows.map(t=>({...t,id:randomUUID(),user_id:uid,updated_at:new Date().toISOString(),created_at:new Date().toISOString()})));return respond(body.p_rows.length);}return respond({});}
const table=url.pathname.split('/').pop();if(!Object.hasOwn(db,table))throw Error('Unexpected network route '+url.pathname);if(method==='GET'){if(!['pending_transactions','statement_documents'].includes(table))assert.equal(url.searchParams.get('user_id'),'eq.'+uid,'Requests must use workspace owner, not logged member');let list=db[table];const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||list.length);return respond(list.slice(offset,offset+limit));}throw Error('Unexpected direct write '+table);
});await page.goto('http://127.0.0.1:4173');await page.locator('#login-email').fill(user.email);await page.locator('#login-password').fill('fixture');await page.locator('#login-submit').click();await page.locator('.kpi-value').first().waitFor();const screenshotDir=path.join(__dirname,'../.local-tools/screenshots');fs.mkdirSync(screenshotDir,{recursive:true});await page.screenshot({path:path.join(screenshotDir,'overview-fixture-desktop.png'),fullPage:true});
await page.locator('.nav-link[href="#transactions"]').click();await page.locator('[data-action="filter-all"]').click();assert.match(await page.locator('.totals-strip .count').textContent(),/1055|1\.055/);assert.equal(await page.locator('#transaction-results tbody tr').count(),30);await page.locator('[data-action="next-page"]').click();assert.equal(await page.locator('#transaction-results tbody tr').count(),30);
await page.locator('[data-action="new-transaction"]').first().click();await page.locator('#field-description').fill('Compra conferida E2E');await page.locator('#field-amount').fill('125,90');await page.locator('#field-date').fill(today);await page.locator('#field-account').selectOption(a1);await page.locator('#field-category').selectOption(c1);await page.locator('#edit-form button[type="submit"]').click();await page.locator('#dialog').waitFor({state:'hidden'});assert.equal(calls.at(-1).body.p_data.amount,125.9);
await page.locator('#filter-query').fill('Compra conferida E2E');await page.waitForTimeout(180);assert.equal(await page.locator('#transaction-results tbody tr').count(),1);await page.locator('[data-action="edit-transaction"]').click();await page.locator('#field-amount').fill('149,99');await page.locator('#edit-form button[type="submit"]').click();await page.locator('#dialog').waitFor({state:'hidden'});assert.ok(calls.at(-1).body.p_id);assert.ok(calls.at(-1).body.p_expected_updated_at);assert.equal(calls.at(-1).body.p_data.amount,149.99);
await page.locator('[data-action="duplicate-transaction"]').click();await page.locator('#field-description').fill('Repetição E2E');await page.locator('#edit-form button[type="submit"]').click();await page.locator('#dialog').waitFor({state:'hidden'});assert.equal(calls.at(-1).body.p_id,null);
await page.locator('[data-action="delete-transaction"]').click();await page.locator('#edit-form button[type="submit"]').click();await page.locator('#dialog').waitFor({state:'hidden'});assert.equal(calls.at(-1).name,'delete_financial_transaction');
await page.locator('.nav-link[href="#cards"]').click();await page.locator('[data-action="pay-cycle"]').first().click();await page.locator('#statement-history').filter({hasText:'Nenhum pagamento'}).waitFor();await page.locator('[name="confirm_new_payment"]').check();await page.locator('[name="pay_amount"]').fill('250,00');await page.locator('select[name="pay_account"]').selectOption(a1);await page.locator('#edit-form button[type="submit"]').click();await page.locator('#dialog').waitFor({state:'hidden'});assert.equal(calls.at(-1).name,'save_statement_bundle');assert.equal(calls.at(-1).body.p_data.pay_amount,250);

for(const fixture of JSON.parse(process.env.STATEMENT_FIXTURES_JSON||'[]')){
 const chooserEvent=page.waitForEvent('filechooser');
 await page.locator('[data-action="import-card-statement"]').first().click();
 await (await chooserEvent).setFiles(fixture.path);
 await page.locator('[data-statement-category]').first().waitFor({timeout:45000});
 assert.equal(await page.locator('[data-statement-category]').count(),fixture.items);
 assert.equal(Number(await page.locator('[name="total"]').inputValue()),fixture.total);
 await page.locator('[name="month"]').fill('2026-04');await page.locator('[name="month"]').dispatchEvent('change');
 await page.locator('#statement-history').filter({hasText:'Nenhum pagamento'}).waitFor();
 await page.locator('#edit-form button[type="submit"]').click();await page.locator('#dialog').waitFor({state:'hidden'});
 const payload=calls.at(-1).body.p_data;assert.equal(payload.card_id,card);assert.equal(payload.items.length,fixture.items);assert.equal(payload.pay_amount,0);assert.ok(payload.document.content_base64.length>0);assert.equal(payload.document.sha256.length,64);
}


await page.locator('[data-action="new-statement"]').first().click();
await page.locator('#statement-file').setInputFiles({name:'Fatura2026-03-25.csv',mimeType:'text/csv',buffer:Buffer.from('Data;Estabelecimento;Portador;Valor;Parcela\n01/03/2026;Loja;Titular;R$ 100,00;-\n02/03/2026;Pagamentos Validos Normais;Titular;R$ -900,00;-\n03/03/2026;Estorno Loja;Titular;R$ -10,00;-')});
await page.locator('[data-statement-select="1"]').waitFor();
assert.equal(await page.locator('[name=total]').inputValue(),'90.00');
assert.match(await page.locator('#statement-preview').textContent(),/1 pagamentos ignorados/);
await page.locator('[data-statement-select="1"]').uncheck();
assert.equal(await page.locator('[name=total]').inputValue(),'100.00');
await page.locator('[data-statement-select="1"]').check();
assert.equal(await page.locator('[name=total]').inputValue(),'90.00');
await page.locator('[name=total]').fill('100,00');
await page.locator('[data-statement-select="1"]').uncheck();
assert.equal(await page.locator('[name=total]').inputValue(),'100,00');
await page.locator('#edit-form button[type="submit"]').click();await page.locator('#dialog').waitFor({state:'hidden'});
assert.equal(calls.at(-1).body.p_data.total,100);assert.equal(calls.at(-1).body.p_data.items.length,1);assert.equal(calls.at(-1).body.p_data.pay_amount,0);

historyFixtures=[{id:randomUUID(),date:'2026-05-22',description:'PG. NUBANK WAGNER',amount:100.02,account_id:a1,account_name:'Conta original',linked_cycle_id:null,close_amount:true,difference:0.02}];
await page.locator('[data-action="new-statement"]').first().click();
await page.locator('#statement-file').setInputFiles({name:'Nubank_2026-05-22.csv',mimeType:'text/csv',buffer:Buffer.from('date,title,amount\n2026-05-10,Supermercado,100.00')});
await page.locator('#statement-history').filter({hasText:'Pagamento encontrado:'}).waitFor();
assert.equal(await page.locator('#statement-payment-mode').inputValue(),'existing');
assert.equal(await page.locator('[name=existing_payment_id]').inputValue(),historyFixtures[0].id);
await page.locator('#edit-form button[type="submit"]').click();await page.locator('#dialog').waitFor({state:'hidden'});
assert.equal(calls.at(-1).body.p_data.pay_amount,0);assert.equal(calls.at(-1).body.p_data.existing_payment_id,historyFixtures[0].id);
historyFixtures=[];
await page.locator('.nav-link[href="#reports"]').click();await page.locator('#report-preset').selectOption('month');assert.equal(await page.locator('#report-start').inputValue(),month+'-01');await page.locator('#report-preset').selectOption('all');assert.equal(await page.locator('#report-start').inputValue(),'');
await page.locator('.nav-link[href="#import"]').click();await page.locator('#csv-file').setInputFiles({name:'fixture.csv',mimeType:'text/csv',buffer:Buffer.from(`Data;Descrição;Valor\n${month}-02;CSV almoço;12,30\n${month}-02;CSV almoço;12,30\n31/02/2026;Data inválida;9\n${month}-03;CSV transporte;50,00`)});await page.locator('#import-target').selectOption('account:'+a1);await page.locator('[data-action="preview-import"]').click();assert.match(await page.locator('#import-results .info-banner').textContent(),/2 prontos.*1 duplicados.*1 inválidos/);await page.locator('[data-action="confirm-import"]').click();await page.waitForTimeout(250);assert.equal(calls.at(-1).name,'import_financial_transactions');assert.equal(calls.at(-1).body.p_rows.length,2);assert.equal(calls.at(-1).body.p_rows[0].amount,12.3);
await page.locator('.nav-link[href="#dna"]').click();assert.ok(await page.locator('.dna-card').count());await page.screenshot({path:path.join(screenshotDir,'dna-fixture-desktop.png'),fullPage:true});

const {dnaBreakdown}=await import('../release/statements.mjs');
for(const index of [0,5]){
 const bar=page.locator('[data-action="dna-details"]').nth(index);
 const area=await bar.getAttribute('data-area'), selectedMonth=await bar.getAttribute('data-month');
 const expected=dnaBreakdown(db.transactions,db.installments,db.categories,db.card_payments,db.billing_cycles,{basis:'cash',area,month:selectedMonth});
 await bar.focus();await page.keyboard.press('Enter');await page.locator('#dialog').waitFor({state:'visible'});
 assert.equal(await page.locator('.dna-detail-row').count(),expected.items.length);
 const sum=await page.locator('[data-contribution]').evaluateAll(nodes=>nodes.reduce((s,n)=>s+Math.round(Number(n.dataset.contribution)*100),0));
 assert.equal(sum,Math.round(expected.total*100));
 await page.screenshot({path:path.join(screenshotDir,'dna-detail-desktop.png')});
 await page.keyboard.press('Escape');await page.locator('#dialog').waitFor({state:'hidden'});
}
await page.setViewportSize({width:390,height:844});
await page.locator('[data-action="dna-details"]').first().click();await page.locator('#dialog').waitFor({state:'visible'});
assert.equal(await page.locator('#dialog').evaluate(el=>el.scrollWidth>el.clientWidth),false,'Modal horizontal overflow');
await page.screenshot({path:path.join(screenshotDir,'dna-detail-mobile.png')});await page.locator('#dialog [data-action="close-dialog"]').click();
await page.setViewportSize({width:390,height:844});for(const view of ['overview','transactions','cards','reports','dna','accounts','categories','investments','pending','import']){if(!await page.locator(`.nav-link[href="#${view}"]`).isVisible())await page.locator("#more-nav").click();await page.locator(`.nav-link[href="#${view}"]`).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Overflow '+view);}await page.locator('.nav-link[href="#overview"]').click();await page.screenshot({path:path.join(screenshotDir,'overview-fixture-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:['pagination 1055 records','30 visible rows','create BRL expense','optimistic edit','duplicate','delete','partial card payment','DNA from history','10 mobile layouts'],mockedWrites:calls.length,realNetworkWrites:0}));
}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
