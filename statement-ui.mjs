import { money, cents, parseMoney, today, normalize } from './finance.mjs';
import { parseStatementCsv, parseStatementPdfLines, pdfPageLines } from './statements.mjs?v=2.2.5';
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options = (items,selected='')=>items.map(x=>`<option value="${esc(x.id)}" ${x.id===selected?'selected':''}>${esc(x.name)}</option>`).join('');
export function openStatementEditor({card,cycle,month,rows,showDialog,formWrap,rpc,client,pay=false,autoImport=false}) {
  let parsed=null,document=null,reading=false;const request=crypto.randomUUID();
  let existing=[]; let historySequence=0;
  let automaticTotal=!cycle;
  const categories=rows('categories').filter(c=>c.type==='expense'&&!/reembols|pagamento.*fatura/.test(normalize(c.name)));
  const total=cycle?.total_spent||'';
  const body=`<div class="info-banner">${esc(card.bank_name)} · As compras detalham a fatura e não descontam dinheiro da conta. Só o pagamento entra no total de saídas.</div>
  <div class="form-grid"><label>Referência<input name="month" type="month" value="${cycle?.cycle_start_date.slice(0,7)||month}" required ${cycle?'readonly':''}></label><label>Vencimento<input name="due" type="date" value="${cycle?.due_date||month+'-'+String(Math.min(card.due_day||10,28)).padStart(2,'0')}" required ${cycle?'readonly':''}></label><label class="full">Total da fatura (R$)<input name="total" inputmode="decimal" value="${total}" required ${cycle?'readonly':''}></label></div>
  <label class="upload-zone"><strong>Anexar fatura CSV ou PDF</strong><span>Até 5 MB · confira as compras e categorias antes de salvar</span><input id="statement-file" type="file" accept=".csv,.pdf,text/csv,application/pdf"></label>
  <div id="statement-preview" aria-live="polite"></div>
  <div id="statement-history" class="info-banner" aria-live="polite">O histórico será conferido antes de registrar qualquer pagamento.</div><div class="form-grid"><label class="full">Pagamento<select name="payment_mode" id="statement-payment-mode"><option value="none">Salvar fatura / anexar detalhes, sem novo pagamento</option><option value="new" ${pay&&!autoImport?'selected':''}>Registrar pagamento agora</option><option value="existing">Já lancei o pagamento — vincular sem descontar novamente</option></select></label><div id="statement-payment-fields" class="full"></div></div>
  <details id="statement-saved-details"><summary id="statement-saved-summary">Compras e anexos já salvos nesta fatura</summary><div id="statement-saved">Os anexos serão conferidos.</div><div id="statement-saved-items"></div></details>`;
  showDialog(cycle?'Fatura · detalhes e pagamento':'Registrar fatura',formWrap(body,'Salvar fatura'),async form=>{
    if(reading)throw Error('Aguarde a leitura do arquivo.');
    if(form.querySelector('#statement-file').files.length&&!document)throw Error('O arquivo selecionado não foi lido. Escolha um CSV ou PDF válido antes de salvar.');
    const fd=new FormData(form),amount=parseMoney(fd.get('total'));
    if(!(amount>0))throw Error('Informe o total positivo da fatura.');
    const items=parsed?.items.filter(x=>x.selected)||[];
    const net=items.reduce((n,x)=>n+cents(x.amount),0)/100;
    if(document && (!items.length||parsed.invalid.length))throw Error('Existem linhas que não puderam ser lidas. Corrija o arquivo ou use o CSV do banco.');
    if(document && cents(net)!==cents(amount) && !form.querySelector('#statement-difference')?.checked)throw Error('Confira a diferença entre os itens e o total e marque a confirmação abaixo da prévia.');
    const history=await rpc('statement_payment_candidates',{p_card:card.id,p_month:fd.get('month')+'-01',p_total:amount,p_cycle:cycle?.id||null});
    const mode=fd.get('payment_mode');
    if(mode==='new'&&history.some(t=>!t.linked_cycle_id))throw Error('Encontramos pagamento anterior deste cartão. Use Vincular pagamento já lançado.');
    if(mode==='new'&&!fd.get('confirm_new_payment'))throw Error('Confirme que este pagamento ainda não foi lançado.');
    const resolvedCycle=cycle||rows('billing_cycles').find(c=>c.credit_card_id===card.id&&c.cycle_start_date.slice(0,7)===fd.get('month'));
    const reviseTotal=resolvedCycle&&cents(resolvedCycle.total_spent)!==cents(amount);
    if(reviseTotal&&Number(resolvedCycle.total_paid)>0)throw Error('Esta fatura já tem pagamento registrado. Confira os detalhes antes de alterar o total.');
    if(reviseTotal&&!fd.get('confirm_total_revision'))throw Error('Confirme a correção do total da fatura existente no aviso acima.');
    if(mode==='existing'&&!fd.get('existing_payment_id'))throw Error('Escolha o pagamento já lançado.');
    if(mode==='new'&&!(parseMoney(fd.get('pay_amount'))>0))throw Error('Informe o valor pago.');
    await rpc('save_statement_bundle',{p_data:{request_id:request,card_id:card.id,cycle_id:resolvedCycle?.id||null,month:fd.get('month')+'-01',due:fd.get('due'),total:amount,expected_total:resolvedCycle?.total_spent??null,confirm_total_revision:!!reviseTotal&&!!fd.get('confirm_total_revision'),confirm_new_payment:mode==='new'&&!!fd.get('confirm_new_payment'),items,document,existing_payment_id:mode==='existing'?fd.get('existing_payment_id'):null,pay_amount:mode==='new'?parseMoney(fd.get('pay_amount')):0,pay_account:fd.get('pay_account'),pay_date:fd.get('pay_date')}});
  },{wide:true});
  const dialog=window.document.querySelector('#dialog');
  let shownCycleId=null,documentSequence=0;
  const totalNotice=window.document.createElement('div');totalNotice.id='statement-total-revision';dialog.querySelector('#statement-history').after(totalNotice);
  function checkTotal(){const amount=parseMoney(dialog.querySelector('[name=total]').value),month=dialog.querySelector('[name=month]').value,current=cycle||rows('billing_cycles').find(c=>c.credit_card_id===card.id&&c.cycle_start_date.slice(0,7)===month);totalNotice.innerHTML=current&&amount>0&&cents(current.total_spent)!==cents(amount)?`<div class="info-banner">Já existe uma fatura deste cartão nesta referência, com total de <strong>${money(current.total_spent)}</strong>. ${Number(current.total_paid)>0?'Ela tem pagamento registrado; confira seus detalhes.':`Nenhum pagamento foi registrado nela. <label><input type="checkbox" name="confirm_total_revision"> Confirmo corrigir o total para <strong>${money(amount)}</strong>, mantendo a mesma fatura e seus detalhes.</label>`}</div>`:'';}
  const paymentFields=()=>{
    const mode=dialog.querySelector('#statement-payment-mode').value;
    dialog.querySelector('#statement-payment-fields').innerHTML=mode==='none'?'':mode==='existing'?`<label>Pagamento já registrado<select name="existing_payment_id" required><option value="">Escolher lançamento</option>${options(existing.map(t=>({id:t.id,name:`${t.date} · ${t.description} · ${money(t.amount)} · ${t.account_name||'Conta não informada'}`})))}</select></label><label>Conta para o vínculo<select name="pay_account">${options(rows('accounts').filter(a=>!['credit_card','investment'].includes(a.type)),card.account_id)}</select></label><p class="form-note">A conta padrão do cartão já vem selecionada e pode ser alterada. Se o pagamento antigo já tiver conta, ela será preservada. O saldo fica igual.</p>`:`<div class="form-grid"><label>Valor pago<input name="pay_amount" inputmode="decimal" value="${cycle?Math.max(0,Number(cycle.total_spent)-Number(cycle.total_paid)):dialog.querySelector('[name=total]').value}" required></label><label>Data do pagamento<input name="pay_date" type="date" value="${today()}" required></label><label class="full">Conta<select name="pay_account">${options(rows('accounts').filter(a=>!['credit_card','investment'].includes(a.type)),card.account_id)}</select></label><label class="full form-note"><input type="checkbox" name="confirm_new_payment"> Confirmo que este pagamento ainda não foi lançado. Criar uma nova saída na conta.</label></div>`;
  };
  dialog.querySelector('#statement-payment-mode').onchange=paymentFields;paymentFields();
  async function checkHistory(){
    checkTotal();
    renderSaved();
    const sequence=++historySequence,month=dialog.querySelector('[name=month]').value,total=parseMoney(dialog.querySelector('[name=total]').value);
    if(!month||!(total>0))return;
    const panel=dialog.querySelector('#statement-history');panel.textContent='Conferindo pagamentos anteriores…';
    try{
      const candidates=await rpc('statement_payment_candidates',{p_card:card.id,p_month:month+'-01',p_total:total,p_cycle:cycle?.id||null});
      if(sequence!==historySequence||!dialog.open)return;
      existing=candidates.filter(t=>!t.linked_cycle_id);
      const matches=existing.filter(t=>t.close_amount);
      const current=cycle||rows('billing_cycles').find(c=>c.credit_card_id===card.id&&c.cycle_start_date.slice(0,7)===month);
      const mode=dialog.querySelector('#statement-payment-mode');
      if(current&&Number(current.total_paid)>=Number(current.total_spent)){
        mode.value='none';panel.textContent='Esta fatura já está paga. O arquivo apenas detalha as compras; não haverá nova saída.';
      }else if(matches.length===1){
        mode.value='existing';panel.textContent='Pagamento encontrado: '+matches[0].date+' · '+matches[0].description+' · '+money(matches[0].amount)+'. Vamos vinculá-lo, preservando a data, o valor e o saldo originais.';
      }else if(existing.length){mode.value='existing';panel.textContent='Há '+existing.length+' pagamento(s) deste cartão no período. Escolha o correspondente. Um novo débito está bloqueado.';
      }else{if(autoImport)mode.value='none';panel.textContent='Nenhum pagamento correspondente encontrado. Você pode salvar só os detalhes ou escolher Registrar pagamento agora e confirmar a nova saída.';}
      paymentFields();if(matches.length===1&&mode.value==='existing')dialog.querySelector('[name=existing_payment_id]').value=matches[0].id;
    }catch(e){if(sequence===historySequence)panel.textContent='Não foi possível conferir o histórico. Tente novamente antes de pagar.';}
  }
  dialog.querySelector('[name=month]').addEventListener('change',checkHistory);
  dialog.querySelector('[name=total]').addEventListener('change',checkHistory);
  dialog.querySelector('[name=total]').addEventListener('input',()=>{automaticTotal=false;});
  checkHistory();

  function renderPreview(){
    const selected=parsed.items.filter(r=>r.selected),net=selected.reduce((n,r)=>n+cents(r.amount),0)/100;
    dialog.querySelector('#statement-preview').innerHTML=`<p><strong>${selected.length} compras/créditos · ${money(net)}</strong><br>${parsed.excluded.length} pagamentos ignorados · ${parsed.invalid.length} linhas não reconhecidas</p><p class="form-note">Parcelas representam somente o valor cobrado nesta fatura. Linhas iguais dentro do arquivo são preservadas. Reimportações da mesma fatura não duplicam os itens.</p><div class="table-wrap statement-preview"><table><thead><tr><th>Incluir</th><th>Compra</th><th>Categoria sugerida</th><th>Valor</th></tr></thead><tbody>${parsed.items.map((r,i)=>`<tr><td><input type="checkbox" data-statement-select="${i}" aria-label="Incluir ${esc(r.description)}" ${r.selected?'checked':''}></td><td>${esc(r.description)}<small style="display:block">${r.date}${r.parcel&&r.parcel!=='-'?' · parcela '+esc(r.parcel):''}</small></td><td><select data-statement-category="${i}" aria-label="Categoria de ${esc(r.description)}"><option value="">Outros gastos</option>${options(categories,r.category_id)}</select><small style="display:block">${esc(r.reason)}</small></td><td>${money(r.amount)}</td></tr>`).join('')}</tbody></table></div><label class="form-note"><input type="checkbox" id="statement-difference"> Conferi eventual diferença: o total informado inclui valores que não estão detalhados neste arquivo.</label>${parsed.invalid.length?'<p class="form-error">Há linhas não reconhecidas. O salvamento do arquivo foi bloqueado para evitar uma importação incompleta.</p>':''}`;
    dialog.querySelectorAll('[data-statement-category]').forEach(el=>el.onchange=()=>{parsed.items[Number(el.dataset.statementCategory)].category_id=el.value||null;});
    dialog.querySelectorAll('[data-statement-select]').forEach(el=>el.onchange=()=>{
      parsed.items[Number(el.dataset.statementSelect)].selected=el.checked;
      if(automaticTotal){
        const previous=dialog.querySelector('[name=total]').value;
        const total=parsed.items.filter(r=>r.selected).reduce((n,r)=>n+cents(r.amount),0)/100;
        dialog.querySelector('[name=total]').value=total.toFixed(2);
        const paid=dialog.querySelector('[name=pay_amount]');
        if(paid&&cents(parseMoney(paid.value))===cents(parseMoney(previous)))paid.value=total.toFixed(2);
        checkHistory();
      }
      renderPreview();
    });
  }
  dialog.querySelector('#statement-file').onchange=async event=>{
    parsed=null;document=null;const file=event.target.files[0];if(!file)return;
    const preview=dialog.querySelector('#statement-preview');reading=true;preview.textContent='Lendo arquivo…';
    try{
      if(file.size>5*1024*1024)throw Error('Escolha um arquivo de até 5 MB.');
      const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer);
      if(/\.pdf$/i.test(file.name)){
        const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
        const pdf=await pdfjs.getDocument({data:bytes.slice(),isEvalSupported:false}).promise;
        const lines=[];
        try{if(pdf.numPages>50)throw Error('PDF com mais de 50 páginas. Use o CSV.');
        for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p),content=await page.getTextContent();lines.push(...pdfPageLines(content.items));}
        parsed=parseStatementPdfLines(lines,Number(dialog.querySelector('[name=month]').value.slice(0,4)),categories,rows('transactions'));
        }finally{await pdf.destroy();}
      }else if(/\.csv$/i.test(file.name)){
        let text=new TextDecoder('utf-8').decode(bytes);if(text.includes('\uFFFD'))text=new TextDecoder('windows-1252').decode(bytes);
        parsed=parseStatementCsv(text,categories,rows('transactions'));
      }else throw Error('Use um arquivo CSV ou PDF.');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(x=>x.toString(16).padStart(2,'0')).join('');
      let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      document={name:file.name,sha256:hash,mime:/\.pdf$/i.test(file.name)?'application/pdf':'text/csv',content_base64:btoa(binary)};
      if(!cycle){
        if(automaticTotal)dialog.querySelector('[name=total]').value=parsed.total.toFixed(2);
        const due=parsed.due||file.name.match(/\d{4}-\d{2}-\d{2}/)?.[0];
        if(due){dialog.querySelector('[name=due]').value=due;dialog.querySelector('[name=month]').value=due.slice(0,7);}
      }
      renderPreview();paymentFields();await checkHistory();
    }catch(e){parsed=null;document=null;preview.textContent=e.message||'Não foi possível ler o arquivo.';}finally{reading=false;}
  };
  if(autoImport)dialog.querySelector('#statement-file').click();
  function renderSaved(){
    const selected=dialog.querySelector('[name=month]').value;
    const current=cycle||rows('billing_cycles').find(c=>c.credit_card_id===card.id&&c.cycle_start_date.slice(0,7)===selected);
    const items=current?rows('transactions').filter(t=>t.billing_cycle_id===current.id):[];
    const total=items.reduce((sum,t)=>sum+(t.type==='income'?-1:1)*cents(t.amount),0)/100;
    dialog.querySelector('#statement-saved-summary').textContent=`Compras e anexos já salvos nesta fatura${items.length?` · ${items.length} itens · ${money(total)}`:''}`;
    dialog.querySelector('#statement-saved-items').innerHTML=items.length?`<p>Estas compras já estão anexadas. Não é preciso importar a mesma fatura de novo.</p><div class="dna-detail-list">${items.map(t=>`<article class="dna-detail-row"><div><strong>${esc(t.description)}</strong><small>${esc(t.date)} · ${esc(rows('categories').find(c=>c.id===t.category_id)?.name||'Sem categoria')}</small></div><strong class="${t.type==='income'?'positive':''}">${t.type==='income'?'− ':''}${money(t.amount)}</strong></article>`).join('')}</div>`:'';
    if(items.length)dialog.querySelector('#statement-saved-details').open=true;
    if(current?.id===shownCycleId)return;
    shownCycleId=current?.id||null;
    const sequence=++documentSequence,box=dialog.querySelector('#statement-saved');
    if(!current){box.textContent='Os arquivos ficam disponíveis após salvar.';return;}
    box.textContent='Carregando anexos…';
    client.from('statement_documents').select('id,name,created_at').eq('billing_cycle_id',current.id).then(({data,error})=>{
      if(sequence!==documentSequence||!dialog.open)return;
      if(error){box.textContent='Não foi possível consultar os anexos.';return;}
      box.innerHTML=data.length?data.map(d=>`<button type="button" class="button small" data-document="${d.id}">${esc(d.name)}</button>`).join(' '):'Nenhum anexo salvo.';
      box.querySelectorAll('[data-document]').forEach(el=>el.onclick=async()=>{el.disabled=true;try{const {data:d,error:e}=await client.from('statement_documents').select('name,mime,content_base64').eq('id',el.dataset.document).single();if(e)throw e;const bytes=Uint8Array.from(atob(d.content_base64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:d.mime}));const a=window.document.createElement('a');a.href=url;a.download=d.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}catch{box.append(' Falha ao baixar anexo.');}finally{el.disabled=false;}});
    });
  }
}
