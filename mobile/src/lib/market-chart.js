// Shared by the web app and APK. Market prices are distinct from account balances.
export const marketPeriods = [
  ['day', '1 D'], ['5d', '5 D'], ['month', '1 M'], ['6mo', '6 M'],
  ['year', 'YTD'], ['12m', '1 A'], ['5y', '5 A'], ['all', 'Máx'],
];

export const marketRange = (period) => ({
  day: '1d', '5d': '5d', month: '1mo', '6mo': '1y',
  year: 'ytd', '12m': '1y', '5y': '5y', all: '10y',
})[period] || '1mo';

const money = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function marketPricePoints(quote, period = 'month') {
  const closes = quote?.indicators?.quote?.[0]?.close || [];
  const timestamps = quote?.timestamp || [];
  let points = timestamps.map((timestamp, index) => ({
    timestamp: Number(timestamp), price: Number(closes[index]),
    date: new Date(Number(timestamp) * 1000).toISOString().slice(0, 10),
  })).filter((point) => Number.isFinite(point.price) && point.price > 0 && Number.isFinite(point.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  if (period === '6mo' && points.length) {
    const end = new Date(points.at(-1).timestamp * 1000);
    end.setUTCMonth(end.getUTCMonth() - 6);
    points = points.filter((point) => point.timestamp * 1000 >= end.getTime());
  }
  return points;
}

function quantityAtDate(investment, movements, date) {
  const trades = movements.filter((m) => m.investment_id === investment.id && ['buy', 'sale'].includes(m.type));
  const initial = Number(investment.quantity || 0) - trades.reduce((sum, m) => sum + (m.type === 'buy' ? 1 : -1) * Number(m.quantity || 0), 0);
  return round(initial + trades.filter((m) => m.date <= date).reduce((sum, m) => sum + (m.type === 'buy' ? 1 : -1) * Number(m.quantity || 0), 0));
}

export function marketChartHTML(quote, investment, period = 'month', movements = []) {
  const prices = marketPricePoints(quote, period);
  const position = prices.filter((point) => point.date >= investment.purchase_date)
    .map((point) => ({ ...point, quantity: quantityAtDate(investment, movements, point.date) }))
    .filter((point) => point.quantity > 0)
    .map((point) => ({ ...point, value: round(point.price * point.quantity) }));
  const previousClose = Number(quote?.meta?.chartPreviousClose ?? quote?.meta?.previousClose);
  const title = safe(investment.name || investment.ticker || 'Ativo');
  const ticker = safe(investment.ticker || investment.name || '');
  const latest = prices.at(-1);
  const payload = JSON.stringify({ prices, position, period, previousClose: Number.isFinite(previousClose) && previousClose > 0 ? previousClose : null })
    .replace(/</g, '\\u003c');
  return `<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *{box-sizing:border-box}body{margin:0;background:#fff;color:#263d35;font:14px system-ui,-apple-system,sans-serif}.wrap{padding:12px 8px 8px}.head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 12px 8px}.name{font-size:17px;font-weight:700}.ticker{color:#718076;font-size:12px;margin-top:2px}.modes{display:flex;gap:4px;padding:0 10px 8px}.mode{border:0;background:none;border-radius:8px;padding:8px 10px;color:#667a6d;font:inherit;cursor:pointer}.mode.active{background:#e7f4eb;color:#146d45;font-weight:700}.figure{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:0 12px}.figure strong{font-size:32px;letter-spacing:-.04em;font-weight:500}.delta{font-size:14px;font-weight:700;border-radius:7px;padding:5px 7px}.up{color:#137849;background:#e8f6ed}.down{color:#b13e3e;background:#fceeee}.when{color:#718076;font-size:12px;padding:4px 12px 12px}.plot{position:relative;width:100%}svg{display:block;width:100%;height:auto;touch-action:none}.axis{fill:#718076;font-size:11px}.grid{stroke:#e8ede8;stroke-width:1}.baseline{stroke:#9ca99e;stroke-width:1;stroke-dasharray:3 4}.line{fill:none;stroke:#178a58;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}.line.negative{stroke:#c45855}.cross{stroke:#718076;stroke-width:1;stroke-dasharray:3 3}.dot{fill:#178a58;stroke:#fff;stroke-width:2}.dot.negative{fill:#c45855}.hit{fill:transparent}.tooltip{position:absolute;top:16px;min-width:138px;padding:7px 9px;border:1px solid #dce4dd;border-radius:7px;background:white;box-shadow:0 3px 12px #17392b22;pointer-events:none;font-size:12px}.tooltip strong{display:block;font-size:14px;margin-bottom:2px}.details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;border-top:1px solid #e7ece7;padding:12px;color:#617468;font-size:12px}.details strong{display:block;color:#263d35;font-size:13px;margin-top:2px}.empty{padding:70px 20px;text-align:center;color:#66776d}.note{padding:0 12px 8px;color:#718076;font-size:11px;line-height:1.4}
  </style><div class="wrap"><div class="head"><div><div class="name">${title}</div><div class="ticker">${ticker} · B3</div></div></div><div class="modes"><button class="mode active" data-mode="price">Cotação do papel</button><button class="mode" data-mode="position">Minha posição</button></div><div class="figure"><strong id="figure">${latest ? money(latest.price) : '—'}</strong><span id="delta" class="delta"></span></div><div class="when" id="when">${latest ? 'Última cotação disponível' : 'Sem cotações neste período'}</div><div class="plot"><svg id="plot" viewBox="0 0 760 315" role="img" aria-label="Evolução da cotação de ${title}"></svg><div class="tooltip" id="tooltip" hidden></div></div><div class="details" id="details"></div><div class="note" id="note">Fonte: Yahoo Finance via consulta do aplicativo. A cotação pode ter atraso. Em "Minha posição", a quantidade cadastrada e as compras/vendas registradas são aplicadas ao preço de mercado; valores de resgates não são somados à linha.</div></div><script>
  const data=${payload},svg=document.getElementById('plot'),tooltip=document.getElementById('tooltip'),figure=document.getElementById('figure'),delta=document.getElementById('delta'),when=document.getElementById('when'),details=document.getElementById('details');let mode='price',selected=null;
  const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n),pct=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2,minimumFractionDigits:2}).format(n)+'%',clock=t=>new Date(t*1000).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}),short=t=>data.period==='day'?new Date(t*1000).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}):new Date(t*1000).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'short'});
  function draw(){const rows=mode==='price'?data.prices:data.position;tooltip.hidden=true;if(!rows.length){svg.innerHTML='<text class="axis" x="380" y="150" text-anchor="middle">'+(mode==='position'?'Nenhuma posição sua neste período.':'Não há cotações para este período.')+'</text>';figure.textContent='—';delta.textContent='';when.textContent='Selecione outro período';details.innerHTML='';return}
    const last=rows.at(-1),first=rows[0],base=mode==='price'&&data.period==='day'&&data.previousClose?data.previousClose:first[mode==='price'?'price':'value'],value=p=>mode==='price'?p.price:p.value,change=value(last)-base,rate=base>0?change/base*100:0,negative=change<0;
    figure.textContent=brl(value(last));delta.textContent=(change>=0?'↑ ':'↓ ')+pct(Math.abs(rate))+' · '+(change>=0?'+':'−')+brl(Math.abs(change));delta.className='delta '+(negative?'down':'up');when.textContent=clock(last.timestamp)+' · '+(mode==='price'?'preço por papel':'quantidade × cotação');
    const values=rows.map(value),min=Math.min(...values),max=Math.max(...values),axisMin=Math.min(min,...(mode==='price'&&data.period==='day'&&data.previousClose?[data.previousClose]:[])),axisMax=Math.max(max,...(mode==='price'&&data.period==='day'&&data.previousClose?[data.previousClose]:[])),padding=Math.max(.01,(axisMax-axisMin)*.13),lo=axisMin-padding,hi=axisMax+padding,span=hi-lo,t0=first.timestamp,t1=last.timestamp,x=p=>t0===t1?380:62+(p.timestamp-t0)/(t1-t0)*626,y=v=>260-(v-lo)/span*210;
    let out='';for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i,yy=y(v);out+='<line class="grid" x1="62" y1="'+yy+'" x2="688" y2="'+yy+'"/><text class="axis" x="52" y="'+(yy+4)+'" text-anchor="end">'+new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(v)+'</text>'}if(mode==='price'&&data.period==='day'&&data.previousClose){const yy=y(data.previousClose);out+='<line class="baseline" x1="62" y1="'+yy+'" x2="688" y2="'+yy+'"/>'}out+='<path class="line '+(negative?'negative':'')+'" d="'+rows.map((p,i)=>(i?'L':'M')+x(p).toFixed(1)+' '+y(value(p)).toFixed(1)).join(' ')+'"/>';out+='<line id="cross" class="cross" y1="32" y2="260" visibility="hidden"/><circle id="dot" class="dot '+(negative?'negative':'')+'" r="5" visibility="hidden"/>';out+='<text class="axis" x="62" y="289">'+short(t0)+'</text><text class="axis" x="688" y="289" text-anchor="end">'+short(t1)+'</text><rect class="hit" x="62" y="25" width="626" height="240"/>';svg.innerHTML=out;
    const fmt=brl(value(last));details.innerHTML='<div>Menor no período<strong>'+brl(min)+'</strong></div><div>Maior no período<strong>'+brl(max)+'</strong></div>'+(mode==='position'?'<div>Quantidade no último ponto<strong>'+last.quantity+'</strong></div><div>Último valor da posição<strong>'+fmt+'</strong></div>':'<div>Primeiro preço do período<strong>'+brl(first.price)+'</strong></div><div>Último preço do período<strong>'+brl(last.price)+'</strong></div>');
    const hit=svg.querySelector('.hit');function focus(event){const box=svg.getBoundingClientRect(),px=(event.clientX-box.left)/box.width*760,target=t0+(Math.max(62,Math.min(688,px))-62)/626*(t1-t0);let low=0,high=rows.length-1;while(low<high){const mid=(low+high)>>1;if(rows[mid].timestamp<target)low=mid+1;else high=mid}const idx=low>0&&Math.abs(rows[low-1].timestamp-target)<Math.abs(rows[low].timestamp-target)?low-1:low,p=rows[idx],xx=x(p),yy=y(value(p));svg.querySelector('#cross').setAttribute('x1',xx);svg.querySelector('#cross').setAttribute('x2',xx);svg.querySelector('#cross').setAttribute('visibility','visible');svg.querySelector('#dot').setAttribute('cx',xx);svg.querySelector('#dot').setAttribute('cy',yy);svg.querySelector('#dot').setAttribute('visibility','visible');tooltip.hidden=false;tooltip.style.left=Math.min(Math.max(5,xx/760*box.width-65),box.width-148)+'px';tooltip.innerHTML='<strong>'+brl(value(p))+'</strong>'+clock(p.timestamp)+(mode==='position'?'<br>'+p.quantity+' papel(is) · '+brl(p.price)+'/un.':'');}
    hit.addEventListener('pointermove',focus);hit.addEventListener('pointerdown',focus);hit.addEventListener('pointerleave',()=>{tooltip.hidden=true;svg.querySelector('#cross').setAttribute('visibility','hidden');svg.querySelector('#dot').setAttribute('visibility','hidden')});
  }
  document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{mode=button.dataset.mode;document.querySelectorAll('[data-mode]').forEach(item=>item.classList.toggle('active',item===button));draw()});draw();
  </script></html>`;
}
