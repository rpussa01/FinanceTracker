export const dynamic = "force-dynamic";
import { prisma } from "../lib/prisma";
import { endOfFinanceWeek, endOfMonth, money, startOfFinanceWeek, startOfMonth } from "../lib/finance";
import { Card, Panel, Shell } from "@/components/ui";
export default async function ReportsPage(){const now=new Date(); const weekStart=startOfFinanceWeek(now), weekEnd=endOfFinanceWeek(now), monthStart=startOfMonth(now), monthEnd=endOfMonth(now); const [forecast,logs,weekTx,monthTx,categories,subs]=await Promise.all([prisma.incomeForecast.findUnique({where:{id:"main"}}),prisma.incomeLog.findMany({where:{date:{gte:weekStart,lte:weekEnd}}}),prisma.transaction.findMany({where:{date:{gte:weekStart,lte:weekEnd}},include:{category:true}}),prisma.transaction.findMany({where:{date:{gte:monthStart,lte:monthEnd}},include:{category:true}}),prisma.category.findMany(),prisma.subscription.findMany()]); const weeklyForecast=forecast?.weeklyAmount||0; const actualIncome=logs.reduce((s,l)=>s+l.amount,0); const weeklyExpenses=weekTx.filter(t=>t.type==="EXPENSE").reduce((s,t)=>s+t.amount,0); const monthlyExpenses=monthTx.filter(t=>t.type==="EXPENSE").reduce((s,t)=>s+t.amount,0); const fixedBurn=subs.filter(s=>s.active).reduce((s,x)=>s+x.amount,0); const freeCash=weeklyForecast*4.33-monthlyExpenses-fixedBurn; return <Shell title="Reports" subtitle="Weekly income, monthly forecast, category spend and subscription impact."><section className="grid grid-cols-1 md:grid-cols-4 gap-5"><Card title="Weekly Income" value={money(actualIncome)} tone="success"/><Card title="Weekly Expenses" value={money(weeklyExpenses)} tone="danger"/><Card title="Monthly Estimate" value={money(weeklyForecast*4.33)}/><Card title="Free Cash" value={money(freeCash)} tone={freeCash<0?"danger":"success"}/></section><Panel title="Category Breakdown This Month"><div className="space-y-3">{categories.map(c=>{const spent=monthTx.filter(t=>t.type==="EXPENSE"&&t.categoryId===c.id).reduce((s,t)=>s+t.amount,0); return <div key={c.id} className="flex justify-between rounded-2xl bg-black/5 p-4"><p className="font-black">{c.name}</p><p className="font-black text-red-600">{money(spent)}</p></div>})}</div></Panel><Panel title="AI-Style Insights"><div className="space-y-3 text-black/70"><p>Your weekly income is forecasted at <b>{money(weeklyForecast)}</b>.</p><p>Your monthly income estimate is <b>{money(weeklyForecast*4.33)}</b>.</p><p>Your fixed monthly burn is <b>{money(fixedBurn)}</b>.</p><p>{freeCash<0?"Warning: your forecasted month is negative after bills and spending.":"Good: your forecasted month remains positive after bills and spending."}</p></div></Panel></Shell>}

export function daysRemainingInFinanceWeek() {
  const today = new Date();
  const end = endOfFinanceWeek(today);
  const diff = end.getTime() - today.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function daysPassedInFinanceWeek() {
  const today = new Date();
  const start = startOfFinanceWeek(today);
  const diff = today.getTime() - start.getTime();
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)) + 1);
}