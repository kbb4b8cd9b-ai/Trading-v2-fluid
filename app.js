const $=id=>document.getElementById(id);
const agents=["Trend","Momentum","RSI","MACD","Breakout","Volatility","Volume","MeanRev","Structure","RiskGuardian"];
let state={equity:50,capital:50,trades:0,wins:0,running:false,price:null,prev:null,positions:[],history:[50],symbol:"btcusdt",mode:"DEMO",lastSignal:0};
let ws=null, reconnectTimer=null, uiScheduled=false, lastAgentUpdate=0;

function fmt(n){return "€"+Number(n).toFixed(2)}
function signalFor(i){
  if(!state.price||!state.prev)return ["WAIT",0];
  const drift=(state.price-state.prev)/state.prev;
  if(Math.abs(drift)<0.00015)return ["WAIT",0];
  const score=(Math.sin(i*1.73+(state.price%1000)/100)+1)/2;
  const threshold=.64+(i%3)*.035;
  if(score>threshold)return [drift>0?"BUY":"SELL",score];
  return ["WAIT",score];
}
function renderAgents(){
  const html=agents.map((a,i)=>{
    const [sig,score]=signalFor(i),cls=sig==="BUY"?"buy":sig==="SELL"?"sell":"wait";
    return `<div class="agent"><div class="top"><span class="name">${a}</span><span class="sig ${cls}">${sig}</span></div><div class="bar"><i style="width:${Math.round(score*100)}%"></i></div></div>`;
  }).join("");
  $("agentGrid").innerHTML=html;
}
function draw(){
  const c=$("chart"),r=c.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,2);
  if(r.width<10)return;
  c.width=Math.round(r.width*d);c.height=Math.round(170*d);
  const x=c.getContext("2d");x.setTransform(d,0,0,d,0,0);x.clearRect(0,0,r.width,170);
  const a=state.history,min=Math.min(...a),max=Math.max(...a),span=Math.max(max-min,.01);
  x.beginPath();
  a.forEach((v,i)=>{const px=i/Math.max(a.length-1,1)*r.width,py=158-(v-min)/span*135;i?x.lineTo(px,py):x.moveTo(px,py)});
  x.strokeStyle="#ff7a18";x.lineWidth=1.6;x.stroke();
}
function renderPositions(){
  $("positions").innerHTML=state.positions.length?state.positions.map(p=>{
    const pnl=(state.price-p.entry)*p.qty*(p.side==="BUY"?1:-1);
    return `<div class="position"><b>${p.side}</b> ${p.symbol.toUpperCase()} • entry ${p.entry.toFixed(2)} • now ${(state.price||p.entry).toFixed(2)} <span class="pnl ${pnl>=0?"up":"down"}">${pnl>=0?"+":""}${pnl.toFixed(2)}</span></div>`;
  }).join(""):"Nessuna posizione";
}
function renderCore(){
  $("equity").textContent=fmt(state.equity);
  $("trades").textContent=state.trades;
  $("winrate").textContent=state.trades?Math.round(state.wins/state.trades*100)+"%":"—";
  $("price").textContent=state.symbol.toUpperCase().replace("USDT","/USDT")+" "+(state.price?state.price.toFixed(2):"—");
  $("connection").textContent=ws&&ws.readyState===1?"● live":"● reconnecting";
  $("connection").style.color=ws&&ws.readyState===1?"#39c878":"#888";
  renderPositions();
}
function renderAll(){
  renderCore();
  renderAgents();
  draw();
  uiScheduled=false;
}
function scheduleUI(){
  if(uiScheduled)return;
  uiScheduled=true;
  setTimeout(renderAll,250);
}
function addFeed(text){
  const el=document.createElement("div");el.className="trade";el.innerHTML=text;
  $("feed").prepend(el);
  while($("feed").children.length>20)$("feed").lastChild.remove();
}
function strategyTick(){
  if(!state.running||!state.prev||!state.price)return;
  if(Date.now()-state.lastSignal<15000)return;
  state.lastSignal=Date.now();
  const ret=(state.price-state.prev)/state.prev;
  if(Math.abs(ret)<0.0002||state.positions.length)return;
  let confirmations=0;
  for(let i=0;i<10;i++)if(signalFor(i)[0]===(ret>0?"BUY":"SELL"))confirmations++;
  if(confirmations<6)return;
  const risk=state.equity*0.015,qty=risk/(state.price*0.003),side=ret>0?"BUY":"SELL";
  state.positions.push({side,symbol:state.symbol,entry:state.price,qty});
  addFeed(`<span>${side} ${state.symbol.toUpperCase()}</span><span>${state.price.toFixed(2)}</span><span>10 agents • ${confirmations}/10</span>`);
}
function managePosition(){
  if(!state.positions.length||!state.price)return;
  const p=state.positions[0],move=(state.price-p.entry)/p.entry*(p.side==="BUY"?1:-1);
  if(move>=0.0025||move<=-0.0015){
    const pnl=(state.price-p.entry)*p.qty*(p.side==="BUY"?1:-1);
    state.equity+=pnl;state.trades++;if(pnl>0)state.wins++;
    state.history.push(state.equity);if(state.history.length>120)state.history.shift();
    addFeed(`<span>${pnl>=0?"WIN":"LOSS"}</span><span>${p.side} close</span><span class="${pnl>=0?"up":"down"}">${pnl>=0?"+":""}${pnl.toFixed(2)}</span>`);
    state.positions=[];
  }
}
function connect(){
  if(ws)try{ws.close()}catch(e){}
  ws=new WebSocket("wss://stream.binance.com:9443/ws/"+state.symbol+"@ticker");
  ws.onopen=()=>scheduleUI();
  ws.onmessage=e=>{
    const p=Number(JSON.parse(e.data).c);
    state.prev=state.price;state.price=p;
    if(state.running)strategyTick();
    scheduleUI();
  };
  ws.onclose=()=>{scheduleUI();clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,3000)};
  ws.onerror=()=>{try{ws.close()}catch(e){}};
}
$("start").onclick=()=>{
  state.capital=Math.max(10,Number($("capital").value)||50);
  state.equity=state.capital;state.history=[state.equity];state.trades=0;state.wins=0;state.positions=[];
  state.running=true;state.lastSignal=0;scheduleUI();
};
$("stop").onclick=()=>{state.running=false;scheduleUI()};
$("symbol").onchange=e=>{state.symbol=e.target.value;state.price=null;state.prev=null;connect();scheduleUI()};
$("demoBtn").onclick=()=>{state.mode="DEMO";state.running=false;$("demoBtn").classList.add("active");$("readBtn").classList.remove("active");scheduleUI()};
$("readBtn").onclick=()=>{state.mode="LIVE_READONLY";state.running=false;$("readBtn").classList.add("active");$("demoBtn").classList.remove("active");scheduleUI()};
setInterval(()=>{if(state.running)managePosition();scheduleUI()},1000);
window.addEventListener("resize",()=>{clearTimeout(window.__resize);window.__resize=setTimeout(draw,150)});
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
connect();renderAll();