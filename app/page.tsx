export const dynamic = "force-dynamic";
export const revalidate = 0;

import OpenAI from "openai";
import { revalidatePath } from "next/cache";
import { prisma } from "./lib/prisma";
import {
  auDate,
  daysPassedInFinanceWeek,
  daysRemainingInFinanceWeek,
  endOfFinanceWeek,
  inputDate,
  money,
  startOfFinanceWeek,
  startOfMonth,
  endOfMonth,
} from "./lib/finance";
import { buttonClass, Card, inputClass, Panel, Shell } from "@/components/ui";

async function addTransaction(formData: FormData) {
  "use server";

  const amount = Number(formData.get("amount") || 0);
  const categoryId = String(formData.get("categoryId") || "");
  const date = String(formData.get("date") || "");

  if (!amount || !categoryId || !date) return;

  await prisma.transaction.create({
    data: {
      type: String(formData.get("type")) === "INCOME" ? "INCOME" : "EXPENSE",
      amount,
      categoryId,
      merchant: String(formData.get("merchant") || "") || null,
      description: String(formData.get("description") || "") || null,
      date: new Date(date),
    },
  });

  revalidatePath("/");
}

async function deleteTransaction(formData: FormData) {
  "use server";

  const id = String(formData.get("id") || "");
  if (!id) return;

  await prisma.transaction.delete({
    where: { id },
  });

  revalidatePath("/");
}

async function generateCashFlowInsight(data: {
  healthScore: number;
  forecastWeeklyIncome: number;
  actualWeeklyIncome: number;
  weeklyExpenses: number;
  monthlyExpenses: number;
  weeklyBalance: number;
  weeklyBudget: number;
  projectedWeeklySpend: number;
  forecastOver: number;
  freeCashAfterBills: number;
  safeDailySpend: number;
  dueNext7: number;
  dueNext30: number;
  fixedMonthlyBurn: number;
}) {
  if (!process.env.OPENAI_API_KEY) {
    return `OpenAI is not connected yet.

Add OPENAI_API_KEY to your .env file.

Until then:
Your safe daily spend is ${money(data.safeDailySpend)}.
Your free cash after bills is ${money(data.freeCashAfterBills)}.
Do not spend emotionally today. Wait 24 hours before buying anything non-essential.`;
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.5-mini",
      input: `
You are the AI Cash Flow Commander inside a finance app.

The user says they are a bit of a compulsive spender.
Your job is to protect them from emotional spending and help them make calm money decisions.

Important:
- Do not diagnose.
- Do not shame.
- Be direct, firm, practical, and supportive.
- Use Australian dollars.
- Give exact actions for today.
- Keep it short but powerful.
- Speak like a premium finance coach.
- Focus on spending control, bills, cashflow, risk, and today's limit.

Data:
Health score: ${data.healthScore}/100
Forecast weekly income: $${data.forecastWeeklyIncome.toFixed(2)}
Actual weekly income: $${data.actualWeeklyIncome.toFixed(2)}
Weekly expenses: $${data.weeklyExpenses.toFixed(2)}
Monthly expenses: $${data.monthlyExpenses.toFixed(2)}
Weekly balance: $${data.weeklyBalance.toFixed(2)}
Weekly budget: $${data.weeklyBudget.toFixed(2)}
Projected weekly spend: $${data.projectedWeeklySpend.toFixed(2)}
Forecast over/under budget: $${data.forecastOver.toFixed(2)}
Free cash after bills: $${data.freeCashAfterBills.toFixed(2)}
Safe daily spend: $${data.safeDailySpend.toFixed(2)}
Due next 7 days: $${data.dueNext7.toFixed(2)}
Due next 30 days: $${data.dueNext30.toFixed(2)}
Fixed monthly burn: $${data.fixedMonthlyBurn.toFixed(2)}

Return exactly this format:

COMMAND STATUS:
...

SPENDING RISK:
...

TODAY'S RULE:
...

DO NOT BUY LIST:
...

MONEY MOVE NOW:
...

FINAL WARNING:
...
`,
    });

    return response.output_text || "AI insight could not be generated.";
  } catch (error) {
    console.error(error);

    return `AI insight temporarily unavailable.

Check:
1. OPENAI_API_KEY exists in .env
2. You restarted npm run dev
3. Your OpenAI account has API credit

For now: keep today's non-essential spending under ${money(
      data.safeDailySpend
    )} and use a 24-hour delay before buying anything emotional.`;
  }
}

export default async function DashboardPage() {
  const now = new Date();

  const weekStart = startOfFinanceWeek(now);
  const weekEnd = endOfFinanceWeek(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [
    categories,
    transactions,
    weeklyTransactions,
    monthlyTransactions,
    subscriptions,
    incomeForecast,
    incomeLogs,
    budgets,
    goals,
  ] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),

    prisma.transaction.findMany({
      include: { category: true },
      orderBy: { date: "desc" },
      take: 20,
    }),

    prisma.transaction.findMany({
      where: {
        date: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
    }),

    prisma.transaction.findMany({
      where: {
        date: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
    }),

    prisma.subscription.findMany({
      orderBy: { nextPaymentDate: "asc" },
    }),

    prisma.incomeForecast.findUnique({
      where: { id: "main" },
    }),

    prisma.incomeLog.findMany({
      where: {
        date: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
    }),

    prisma.budget.findMany({
      include: { category: true },
    }),

    prisma.goal.findMany({
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
  ]);

  const actualWeeklyIncome = incomeLogs.reduce(
    (sum, log) => sum + log.amount,
    0
  );

  const forecastWeeklyIncome =
    incomeForecast?.weeklyAmount && incomeForecast.weeklyAmount > 0
      ? incomeForecast.weeklyAmount
      : actualWeeklyIncome;

  const forecastMonthlyIncome = forecastWeeklyIncome * 4.33;

  const weeklyExpenses = weeklyTransactions
    .filter((transaction) => transaction.type === "EXPENSE")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const monthlyExpenses = monthlyTransactions
    .filter((transaction) => transaction.type === "EXPENSE")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const activeSubs = subscriptions.filter((subscription) => subscription.active);

  const fixedMonthlyBurn = activeSubs.reduce(
    (sum, subscription) => sum + subscription.amount,
    0
  );

  const next7 = new Date(now);
  next7.setDate(now.getDate() + 7);

  const next30 = new Date(now);
  next30.setDate(now.getDate() + 30);

  const dueNext7 = activeSubs
    .filter(
      (subscription) =>
        subscription.nextPaymentDate >= now &&
        subscription.nextPaymentDate <= next7
    )
    .reduce((sum, subscription) => sum + subscription.amount, 0);

  const dueNext30 = activeSubs
    .filter(
      (subscription) =>
        subscription.nextPaymentDate >= now &&
        subscription.nextPaymentDate <= next30
    )
    .reduce((sum, subscription) => sum + subscription.amount, 0);

  const weeklyBalance = actualWeeklyIncome - weeklyExpenses;

  const freeCashAfterBills =
    forecastMonthlyIncome - monthlyExpenses - fixedMonthlyBurn;

  const safeDailySpend =
    Math.max(0, forecastWeeklyIncome - weeklyExpenses - dueNext7) /
    Math.max(1, daysRemainingInFinanceWeek(now));

  const weeklyBudget =
    budgets.reduce((sum, budget) => sum + budget.weeklyLimit, 0) ||
    categories.reduce((sum, category) => sum + category.weeklyLimit, 0);

  const projectedWeeklySpend =
    weeklyExpenses > 0
      ? (weeklyExpenses / Math.max(1, daysPassedInFinanceWeek(now))) * 7
      : 0;

  const forecastOver = projectedWeeklySpend - weeklyBudget;

  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          (forecastOver > 0 ? 25 : 0) -
          (freeCashAfterBills < 0 ? 25 : 0) -
          (dueNext7 > weeklyBalance ? 20 : 0)
      )
    )
  );

  const aiInsight = await generateCashFlowInsight({
    healthScore,
    forecastWeeklyIncome,
    actualWeeklyIncome,
    weeklyExpenses,
    monthlyExpenses,
    weeklyBalance,
    weeklyBudget,
    projectedWeeklySpend,
    forecastOver,
    freeCashAfterBills,
    safeDailySpend,
    dueNext7,
    dueNext30,
    fixedMonthlyBurn,
  });

  return (
    <Shell
      title="Finance Dashboard"
      subtitle={`Thursday finance week: ${auDate(weekStart)} → ${auDate(
        weekEnd
      )}`}
    >
      <section className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <Card
          title="Health Score"
          value={`${healthScore}/100`}
          note="Cash-flow risk score"
          tone={
            healthScore < 60
              ? "danger"
              : healthScore < 80
              ? "warning"
              : "success"
          }
        />

        <Card
          title="Forecast Weekly Income"
          value={money(forecastWeeklyIncome)}
          note={
            incomeForecast?.weeklyAmount && incomeForecast.weeklyAmount > 0
              ? "Planning income"
              : "Using actual income this week"
          }
        />

        <Card
          title="Actual Income This Week"
          value={money(actualWeeklyIncome)}
          note="Logged income"
          tone="success"
        />

        <Card
          title="Weekly Balance"
          value={money(weeklyBalance)}
          note="Actual income - weekly expenses"
          tone={weeklyBalance < 0 ? "danger" : "normal"}
        />

        <Card
          title="Safe Daily Spend"
          value={money(safeDailySpend)}
          note="Hard daily spending ceiling"
          tone={safeDailySpend <= 0 ? "danger" : "success"}
        />

        <Card
          title="Due Next 7 Days"
          value={money(dueNext7)}
          note="Future active subscriptions only"
          tone={dueNext7 > weeklyBalance ? "danger" : "normal"}
        />

        <Card
          title="Due Next 30 Days"
          value={money(dueNext30)}
          note="Cash pressure"
          tone="warning"
        />

        <Card
          title="Free Cash After Bills"
          value={money(freeCashAfterBills)}
          note="Monthly estimate - spending - bills"
          tone={freeCashAfterBills < 0 ? "danger" : "success"}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Quick Add Transaction">
          <form action={addTransaction} className="space-y-4">
            <select name="type" className={inputClass}>
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
            </select>

            <input
              name="amount"
              type="number"
              step="0.01"
              placeholder="Amount"
              className={inputClass}
            />

            <select name="categoryId" className={inputClass}>
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <input name="merchant" placeholder="Merchant" className={inputClass} />
            <input
              name="description"
              placeholder="Description"
              className={inputClass}
            />

            <input
              name="date"
              type="date"
              defaultValue={inputDate(now)}
              className={inputClass}
            />

            <button className={buttonClass}>Add Transaction</button>
          </form>
        </Panel>

        <Panel title="Forecast Engine">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card title="Weekly Budget" value={money(weeklyBudget)} tone="light" />

            <Card
              title="Projected Spend"
              value={money(projectedWeeklySpend)}
              tone="light"
            />

            <Card
              title="Forecast"
              value={
                forecastOver > 0
                  ? `${money(forecastOver)} over`
                  : `${money(Math.abs(forecastOver))} under`
              }
              tone={forecastOver > 0 ? "danger" : "success"}
            />
          </div>

          <div className="mt-5 rounded-2xl bg-black/5 p-5">
            <p className="font-black">Monthly income estimate</p>
            <p className="text-3xl font-black mt-2">
              {money(forecastMonthlyIncome)}
            </p>
            <p className="text-black/50">
              {incomeForecast?.weeklyAmount && incomeForecast.weeklyAmount > 0
                ? "Forecast weekly income × 4.33"
                : "Actual weekly income used because no forecast is set"}
            </p>
          </div>
        </Panel>
      </section>

      <Panel title="AI Cash Flow Commander">
        <div className="rounded-3xl bg-black text-white p-6 border border-emerald-500/30">
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <p className="text-xs tracking-[0.35em] text-emerald-400 font-black uppercase">
                OpenAI Spending Control
              </p>
              <h3 className="text-2xl font-black mt-2">
                Compulsive Spending Guardrail
              </h3>
            </div>

            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-right">
              <p className="text-xs text-white/50 font-bold uppercase">Limit</p>
              <p className="text-2xl font-black">{money(safeDailySpend)}</p>
            </div>
          </div>

          <div className="whitespace-pre-line text-white/80 leading-7 font-medium">
            {aiInsight}
          </div>
        </div>
      </Panel>

      <Panel title="Recent Transactions">
        <div className="space-y-3">
          {transactions.map((transaction) => (
            <div
              key={transaction.id}
              className="flex justify-between items-center rounded-2xl bg-black/5 p-4"
            >
              <div>
                <p className="font-black">
                  {transaction.merchant ||
                    transaction.description ||
                    transaction.category.name}
                </p>

                <p className="text-sm text-black/50">
                  {auDate(transaction.date)} • {transaction.category.name}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <p
                  className={`text-xl font-black ${
                    transaction.type === "INCOME"
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  {transaction.type === "INCOME" ? "+" : "-"}
                  {money(transaction.amount)}
                </p>

                <form action={deleteTransaction}>
                  <input type="hidden" name="id" value={transaction.id} />
                  <button className="rounded-xl bg-red-100 text-red-700 px-4 py-2 font-bold">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}

          {transactions.length === 0 && (
            <p className="text-black/50">No transactions yet.</p>
          )}
        </div>
      </Panel>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Goals Snapshot">
          <div className="space-y-4">
            {goals.map((goal) => {
              const progress = goal.targetAmount
                ? Math.min(
                    100,
                    Math.round((goal.currentAmount / goal.targetAmount) * 100)
                  )
                : 0;

              return (
                <div key={goal.id} className="rounded-2xl bg-black/5 p-4">
                  <div className="flex justify-between">
                    <p className="font-black">{goal.name}</p>
                    <p className="font-black">{progress}%</p>
                  </div>

                  <div className="h-3 bg-black/10 rounded-full mt-3 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <p className="text-sm text-black/50 mt-2">
                    {money(goal.currentAmount)} / {money(goal.targetAmount)}
                  </p>
                </div>
              );
            })}

            {goals.length === 0 && (
              <p className="text-black/50">No goals yet.</p>
            )}
          </div>
        </Panel>

        <Panel title="Spending Protection Rules">
          <div className="space-y-3 text-black/70">
            <p>
              <b>Rule 1:</b> No impulse purchase without waiting 24 hours.
            </p>
            <p>
              <b>Rule 2:</b> Anything above {money(safeDailySpend)} must wait
              until tomorrow.
            </p>
            <p>
              <b>Rule 3:</b> If it is not food, fuel, rent, bills, or business
              growth, it is optional.
            </p>
            <p>
              <b>Rule 4:</b> Log every purchase before you buy it, not after.
            </p>
          </div>
        </Panel>
      </section>
    </Shell>
  );
}