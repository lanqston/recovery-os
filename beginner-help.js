/* Plain-language help shared by stock pages and the Recovery tracker. */
(()=>{'use strict';
const terms={
'Higher low':'A recent price low that is above the previous low. It can be an early sign of improvement, but does not confirm a recovery.',
'Resistance':'A price area where a stock has previously struggled to rise further. A reclaim means moving back above that area.',
'Relative strength':'How a stock performs compared with a market index or other stocks.',
'Drawdown':'The drop from an earlier high price, usually expressed as a percentage.',
'Screening rules':'The saved conditions a company must meet to join a research list. Passing them is not a recommendation to buy.',
'Reward/risk':'A comparison of a planned potential gain with a planned potential loss. Neither outcome is guaranteed.',
'Ticker':'The short code used to identify a stock. AAPL is Apple’s ticker.',
'Share price':'The price of one share of a company. Always check the date next to it.',
'Market cap':'The value of all a company’s shares combined. It describes company size, not whether the shares are a bargain.',
'Revenue':'The money a company earns from selling its products or services, before expenses.',
'Net income':'The profit left after expenses and taxes. A negative number means a loss.',
'Earnings per share (EPS)':'The company’s profit divided by its share count. Diluted EPS also accounts for shares that could be issued.',
'Revenue growth':'How much sales increased or decreased compared with the stated earlier period.',
'Margin':'The share of revenue left as profit. Higher margins mean the company keeps more of each sales dollar.',
'Cash flow':'Money moving into and out of a business. Free cash flow is cash from operations minus spending on long-term assets.',
'Debt':'Money the company owes. Compare it with cash and the company’s ability to repay it.',
'Valuation':'How the share price compares with the company’s earnings, sales or other measures. A low ratio is not automatically a good deal.',
'P/E ratio':'Share price divided by earnings per share. It can be misleading when earnings are unusually high, unusually low or negative.',
'Quarter and fiscal year':'A quarter covers about three months. A fiscal year is the company’s accounting year, which may differ from the calendar year.',
'Filing':'An official company report submitted to a regulator. A 10-K is an annual report, a 10-Q is a quarterly report, and an 8-K reports important events.',
'Catalyst':'An event that could change the business or investors’ expectations, such as earnings or a product launch. Its effect is uncertain.',
'Recovery plan':'The saved explanation of why a struggling company might improve, what to watch, and what would make that view wrong.',
'Risk':'Something that could cause a loss or prevent the business from improving.',
'Volume':'How many shares traded during a period. High volume means more trading, not necessarily buying pressure.',
'Moving average (SMA)':'The average closing price over a set number of trading days. It smooths price swings and reacts after prices move.',
'RSI':'A 0–100 measure of recent price momentum. A high or low reading is not a buy or sell instruction.',
'MACD':'A comparison of moving averages used to track changes in momentum. It can give false signals.',
'ATR':'A measure of how much the price typically moves per trading session. It measures movement size, not direction.',
'VWAP':'An average price weighted by trading volume. Daily-bar calculations differ from an intraday trading feed.',
'Volatility':'How widely prices move. More volatility can mean bigger gains and bigger losses.',
'Bullish and bearish':'Bullish means expecting prices to rise; bearish means expecting them to fall. These are views, not guarantees.',
'Watchlist':'A list of companies you want to follow. Saving a company does not buy shares.',
'Paper trade':'A simulated trade used for practice. It does not use real money.',
'Saved and delayed data':'Saved data is a stored observation. Delayed data arrives after the market event. Neither label means the price is live.'
};
const guides={brief:['Start here','Read the latest results, then check the dates and recent news. One good quarter does not tell the whole story.',['Revenue','Net income','Earnings per share (EPS)']],price:['Reading the chart','Each candle summarizes a trading period. The body shows the open and close; the thin lines show the high and low. Indicators describe past prices and cannot guarantee the next move.',['Moving average (SMA)','Volume','RSI','MACD','ATR','VWAP','Volatility']],financials:['Understanding the financials','Compare similar periods, such as this quarter with the same quarter last year. Look at sales, profit, cash flow and debt together.',['Revenue','Net income','Margin','Cash flow','Debt','Quarter and fiscal year']],filings:['Reading company reports','Start with the report date and type. Open the original document for the company’s full explanation.',['Filing']],catalysts:['Understanding company news','Check when the event happened and whether it changes the business. A headline alone does not explain every price move.',['Catalyst','Bullish and bearish']],risks:['What could go wrong?','Read these alongside the recovery case. Think about what evidence would make you change your mind.',['Risk','Debt']],sources:['Where the numbers come from','Open a source to see the original report. The date of a figure and the date it was downloaded can be different.',['Saved and delayed data']],thesis:['Understanding the recovery plan','This is a saved assessment, not an automatic recommendation. Read the reason for the decline, the possible improvement, the checklist and the risks.',['Recovery plan','Catalyst','Risk','Higher low','Resistance','Relative strength','Screening rules','Reward/risk','Paper trade']]};
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function definitions(keys){return keys.map(k=>`<dt>${esc(k)}</dt><dd>${esc(terms[k])}</dd>`).join('')}
function guide(section){const g=guides[section];return g?`<details class="beginner-guide"><summary>${g[0]}</summary><p>${g[1]}</p><dl>${definitions(g[2])}</dl></details>`:''}
function open(){const ui=window.RecoveryFabric;if(!ui)return;ui.modal('Stock basics',`<p>A stock is a small ownership share in a company. Its price can rise or fall, and you can lose money.</p><p>Use <b>World</b> to find companies, <b>Recovery</b> to follow saved recovery plans, and <b>Saved</b> for your watchlist and notes. This app does not place trades.</p><label for="stockTerms">Find a term</label><input id="stockTerms" type="search" placeholder="Try revenue, EPS or catalyst"><dl id="stockDefinitions">${definitions(Object.keys(terms))}</dl>`);document.querySelector('#stockTerms').oninput=e=>{const q=e.target.value.toLowerCase(),keys=Object.keys(terms).filter(k=>(k+' '+terms[k]).toLowerCase().includes(q));document.querySelector('#stockDefinitions').innerHTML=keys.length?definitions(keys):'<p>No matching term. Try another word.</p>'}}
function mount(){const host=document.querySelector('.ex-actions');if(host&&!document.querySelector('#stockBasics')){const b=document.createElement('button');b.id='stockBasics';b.textContent='Learn';b.setAttribute('aria-label','Learn stock basics');b.onclick=open;host.append(b)}}
window.RecoveryBasics={guide,open};mount();window.addEventListener('market-atlas-ready',mount);document.addEventListener('DOMContentLoaded',mount);new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});
})();
