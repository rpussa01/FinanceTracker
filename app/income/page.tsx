export const dynamic = "force-dynamic";
import { revalidatePath } from "next/cache";
import { prisma } from "../lib/prisma";
import { auDate, endOfFinanceWeek, inputDate, money, startOfFinanceWeek } from "../lib/finance";
import { buttonClass, Card, inputClass, Panel, Shell } from "@/components/ui";

async function saveForecast(formData: FormData) { "use server"; const weeklyAmount = Number(formData.get("weeklyAmount") || 0); if (weeklyAmount < 0) return; await prisma.incomeForecast.upsert({ where: { id: "main" }, update: { weeklyAmount }, create: { id: "main", weeklyAmount } }); revalidatePath("/income"); revalidatePath("/"); }
async function addIncome(formData: FormData) { "use server"; const amount = Number(formData.get("amount") || 0); const date = String(formData.get("date") || ""); if (!amount || !date) return; await prisma.incomeLog.create({ data: { amount, source: String(formData.get("source") || "Weekly income"), date: new Date(date) } }); revalidatePath("/income"); revalidatePath("/"); }
async function deleteIncome(formData: FormData) { "use server"; const id = String(formData.get("id") || ""); if (id) await prisma.incomeLog.delete({ where: { id } }); revalidatePath("/income"); revalidatePath("/"); }

export default async function IncomePage() {
  const now = new Date(); const weekStart = startOfFinanceWeek(now); const weekEnd = endOfFinanceWeek(now);
  const [forecast, logs] = await Promise.all([prisma.incomeForecast.findUnique({ where: { id: "main" } }), prisma.incomeLog.findMany({ orderBy: { date: "desc" } })]);
  const weekLogs = logs.filter(l => l.date >= weekStart && l.date <= weekEnd);
  const weeklyForecast = forecast?.weeklyAmount || 0; const actual = weekLogs.reduce((s,l)=>s+l.amount,0); const difference = actual - weeklyForecast;
  return <Shell title="Income" subtitle="Save forecasted weekly income and log actual income every week.">
    <section className="grid grid-cols-1 md:grid-cols-4 gap-5"><Card title="Forecast Weekly" value={money(weeklyForecast)} note="Expected weekly income"/><Card title="Actual This Week" value={money(actual)} note="Logged income" tone="success"/><Card title="Difference" value={money(difference)} note="Actual - forecast" tone={difference < 0 ? "danger" : "success"}/><Card title="Monthly Estimate" value={money(weeklyForecast * 4.33)} note="Weekly forecast × 4.33" tone="light"/></section>
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-6"><Panel title="Save Forecasted Weekly Income"><form action={saveForecast} className="space-y-4"><input name="weeklyAmount" type="number" step="0.01" placeholder="Expected weekly income" defaultValue={weeklyForecast || ""} className={inputClass}/><button className={buttonClass}>Save Forecast</button></form></Panel><Panel title="Log Actual Income"><form action={addIncome} className="space-y-4"><input name="amount" type="number" step="0.01" placeholder="Actual income amount" className={inputClass}/><select name="source" className={inputClass}><option>Bunnings</option><option>Restaurant</option><option>Other</option></select><input name="date" type="date" defaultValue={inputDate(now)} className={inputClass}/><button className={buttonClass}>Add Income Log</button></form></Panel></section>
    <Panel title="Income History"><div className="space-y-3">{logs.map(log => <div key={log.id} className="flex justify-between items-center rounded-2xl bg-black/5 p-4"><div><p className="font-black">{log.source}</p><p className="text-sm text-black/50">{auDate(log.date)}</p></div><div className="flex gap-4 items-center"><p className="text-xl font-black text-emerald-600">+{money(log.amount)}</p><form action={deleteIncome}><input type="hidden" name="id" value={log.id}/><button className="rounded-xl bg-red-100 text-red-700 px-4 py-2 font-bold">Delete</button></form></div></div>)}{logs.length===0 && <p className="text-black/50">No income logged yet.</p>}</div></Panel>
  </Shell>;
}
