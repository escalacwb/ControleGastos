import { normalize, parseCsv, csvDate, parseMoney, cents } from './finance';

export const isStatementPayment = description => /^(pagamentos validos normais|pagamento recebido|pagamento efetuado|pagamento de fatura|pagamento da fatura|pagamento fatura|inclusao de pagamento|obrigado pelo pagamento|total da fatura anterior)\b/.test(normalize(description).trim());
const rules = [
  [/supermerc|mercado|atacadao|assai|hortifruti/, /mercado/],
  [/drog|farmac|hospital|clinica|laboratorio/, /^saude$/],
  [/restaurante|pizza|lanch|queijo quente|hamburg|padaria|cafe\b|ifood|ifd\*/, /aliment/],
  [/infantil|crianca|brinqued|bebe/, /infantil/],
  [/pet\b|petshop|veterina|cobasi|petz/, /animais/],
  [/posto\b|combust|estacion|uber\b|99app|pedagio/, /veicul|transporte/],
  [/hotel|iberostar|turismo|pousada|airbnb|passagem|latam|azul linhas|premium group|bonitotrav/, /viagen/],
  [/steam|cinema|netflix|spotify|teatro|livraria|amazon music/, /lazer/],
  [/confecc|vestuario|renner|riachuelo|calcado/, /vestuario/],
  [/energia|sanepar|condominio|aluguel|material de construcao/, /habit|moradia/],
];
export function suggestStatementCategory(description, bankCategory, categories, history = []) {
  const eligible = categories.filter(c => c.type === 'expense' && !/reembols|pagamento.*fatura/.test(normalize(c.name)));
  const name = normalize(description);
  const learned = [...new Set(history.filter(t => normalize(t.description) === name && eligible.some(c=>c.id===t.category_id)).map(t=>t.category_id))];
  if (learned.length===1) return {category_id:learned[0],reason:'Usada antes neste estabelecimento'};
  const bank = eligible.find(c => bankCategory && normalize(c.name) === normalize(bankCategory));
  if(bank) return {category_id:bank.id,reason:'Categoria do arquivo'};
  for(const [pattern, category] of rules) {
    if(pattern.test(name+' '+normalize(bankCategory))) {
      const match=eligible.find(c=>category.test(normalize(c.name)));
      if(match)return {category_id:match.id,reason:'Sugestão pelo estabelecimento'};
    }
  }
  return {category_id:eligible.find(c=>/^(extras|outros gastos|outros)$/.test(normalize(c.name)))?.id||null,reason:'Revisar: estabelecimento não identificado'};
}
export function parseStatementCsv(text,categories=[],history=[]) {
  const [headers,...data] = parseCsv(text);
  if(!headers)throw Error('O arquivo está vazio.');
  const col = patterns => headers.findIndex(h=>patterns.some(p=>p.test(normalize(h))));
  const date=col([/^data$/, /^date$/]), description=col([/estabelecimento/,/^title$/, /descri/, /historico/]), amount=col([/^valor$/, /^amount$/, /^total$/]);
  if([date,description,amount].some(i=>i<0))throw Error('Não encontrei as colunas de data, estabelecimento/descrição e valor.');
  const category=col([/categoria/,/^category$/]),parcel=col([/parcela/]),holder=col([/portador/,/titular/]);
  return prepareStatementRows(data.map((r,i)=>({line:i+2,date:csvDate(r[date]),description:r[description]?.trim(),amount:parseMoney(r[amount]),bank_category:r[category]||'',parcel:r[parcel]||'',holder:r[holder]||''})),categories,history);
}
export function prepareStatementRows(data,categories=[],history=[]) {
  const items=[], excluded=[],invalid=[], occurrences=new Map();
  for(const r of data){
    if(isStatementPayment(r.description)){excluded.push(r);continue;}
    if(!r.date||!r.description||!Number.isFinite(r.amount)||!r.amount){invalid.push(r);continue;}
    const identity=[r.date,normalize(r.description),cents(r.amount),normalize(r.parcel),normalize(r.holder)].join('|');
    const occurrence=(occurrences.get(identity)||0)+1;occurrences.set(identity,occurrence);
    items.push({...r,...suggestStatementCategory(r.description,r.bank_category,categories,history),key:identity+'|'+occurrence,selected:true});
  }
  if(items.length>1000)throw Error('A fatura deve ter no máximo 1.000 itens.');
  return {items,excluded,invalid,total:items.reduce((n,r)=>n+cents(r.amount),0)/100};
}
// PDF extraction is intentionally conservative: only complete, dated lines with a final amount.
export function pdfPageLines(items) {
  const entries=items.filter(i=>i.str?.trim()).map(i=>({str:i.str.trim(),x:i.x??i.transform[4],y:i.y??i.transform[5]}));
  // CAIXA uses two columns and slightly offset/wrapped descriptions. Anchor on each date
  // and its D/C amount instead of flattening unrelated text on the same baseline.
  const caixalines=[];
  for(const date of entries.filter(i=>/^\d{2}\/\d{2}$/.test(i.str))){
    const amount=entries.find(i=>i.x>date.x+100&&Math.abs(i.y-date.y)<2&&/^\d[\d.]*,\d{2}[DC]$/.test(i.str));
    if(!amount)continue;
    const description=entries.filter(i=>i.x>date.x+10&&i.x<amount.x&&i.y<=date.y+2.5&&i.y>=date.y-4.5).sort((a,b)=>a.x-b.x||b.y-a.y).map(i=>i.str).join(' ');
    caixalines.push(date.str+' '+description+' '+amount.str);
  }
  if(caixalines.length)return caixalines;
  const groups=[];for(const i of entries.sort((a,b)=>b.y-a.y||a.x-b.x)){let g=groups.find(g=>Math.abs(g.y-i.y)<2);if(!g){g={y:i.y,items:[]};groups.push(g);}g.items.push(i);}
  return groups.map(g=>g.items.sort((a,b)=>a.x-b.x).map(i=>i.str).join(' '));
}
export function parseStatementPdfLines(lines,year,categories=[],history=[]) {
  const dueIndex=lines.findIndex(line=>/^VENCIMENTO\s*$/i.test(line.trim()));
  const dueText=dueIndex>=0?lines.slice(dueIndex+1,dueIndex+5).join(' ').match(/\b\d{2}\/\d{2}\/\d{4}\b/)?.[0]:null;
  const due=dueText?csvDate(dueText):null;
  if(due)year=Number(due.slice(0,4));
  const data=[];const unrecognized=[];
  for(const [index,line] of lines.entries()){
    const match=line.trim().match(/^(\d{2}[/-]\d{2}(?:[/-]\d{4})?)\s+(.+?)\s+(?:R\$\s*)?(-?\s*\d[\d.]*,\d{2})\s*([DC])?\s*$/);
    if(!match){if(/^\d{2}[/-]\d{2}\s+.+\d[.,]\d{2}/.test(line.trim()))unrecognized.push({line:index+1,description:line});continue;}
    const itemYear=due&&Number(match[1].slice(3,5))>Number(due.slice(5,7))?year-1:year;
    const date=match[1].length===5?match[1]+'/'+itemYear:match[1];
    const parcel=match[2].match(/\b\d{2}\s+DE\s+\d{2}\b/i)?.[0]||'';
    data.push({line:index+1,date:csvDate(date),description:match[2].replace(parcel,'').replace(/\s+/g,' ').trim(),amount:parseMoney(match[3])*(match[4]==='C'?-1:1),parcel,holder:''});
  }
  const result=prepareStatementRows(data,categories,history);result.invalid.push(...unrecognized);
  result.due=due;
  if(!result.items.length)throw Error('Não foi possível identificar compras neste PDF. Use o CSV do banco; PDFs digitalizados precisam de leitura manual.');
  return result;
}

// Allocate each cash payment across its statement items. The sum always equals the payment,
// including partial payments, credits and a residual for statements not fully itemized.
export function allocatedCashRows(transactions,payments=[],cycles=[]) {
  const cash=transactions.filter(t=>!t.credit_card_id);
  return cash.flatMap(t=>{
    const payment=payments.find(p=>p.transaction_id===t.id);
    const cycle=payment&&cycles.find(c=>c.id===payment.billing_cycle_id);
    const items=cycle&&transactions.filter(i=>i.billing_cycle_id===cycle.id);
    if(!cycle||!items.length||cents(cycle.total_spent)<=0)return [t];
    const buckets=new Map();for(const i of items){const key=i.category_id||'';buckets.set(key,(buckets.get(key)||0)+(i.type==='income'?-1:1)*cents(i.amount));}
    const net=[...buckets.values()].reduce((a,b)=>a+b,0),total=cents(cycle.total_spent),paid=cents(t.amount);
    // If details exceed the statement, keep totals honest until reconciled.
    if(net>total||[...buckets.values()].some(v=>v<0))return [t];
    if(net<total)buckets.set('',(buckets.get('')||0)+total-net);
    let remaining=paid;const groups=[...buckets].filter(([,v])=>v>0);
    return groups.map(([category_id,value],i)=>{const amount=i===groups.length-1?remaining:Math.min(remaining,Math.round(paid*value/total));remaining-=amount;return {...t,id:t.id+':'+i,category_id:category_id||null,amount:amount/100,description:t.description+' · distribuição da fatura'};});
  });
}
