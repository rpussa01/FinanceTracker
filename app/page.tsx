export const dynamic = "force-dynamic";
export const revalidate = 0;

import { revalidatePath } from "next/cache";
import { prisma } from "./lib/prisma";
import {
  auDate,
  daysPassedInFinanceWeek,
  daysRemainingInFinanceWeek,
  endOfFinanceWeek,
  endOfMonth,
  inputDate,
  money,
  startOfFinanceWeek,
  startOfMonth,
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

  if (id) {
    await prisma.transaction.delete({
      where: { id },
    });
  }

  revalidatePath("/");
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
    prisma.category.findMany({
      orderBy: { name: "asc" },
    }),

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

  const actualWeeklyIncome = incomeLogs.reduce((sum, log) => sum + log.amount, 0);

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
        subscription.nextPaymentDate >= now && subscription.nextPaymentDate <= next7
    )
    .reduce((sum, subscription) => sum + subscription.amount, 0);

  const dueNext30 = activeSubs
    .filter(
      (subscription) =>
        subscription.nextPaymentDate >= now && subscription.nextPaymentDate <= next30
    )
    .reduce((sum, subscription) => sum + subscription.amount, 0);

  const weeklyBalance = actualWeeklyIncome - weeklyExpenses;

  const freeCashAfterBills =
    forecastMonthlyIncome - monthlyExpenses - fixedMonthlyBurn;

  const incomeForSafeSpend = forecastWeeklyIncome || actualWeeklyIncome;

  const safeDailySpend =
    Math.max(0, incomeForSafeSpend - weeklyExpenses - dueNext7) /
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
          tone={healthScore < 60 ? "danger" : healthScore < 80 ? "warning" : "success"}
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
          note="After weekly spend and 7-day bills"
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

        <Panel title="AI Cash Flow Insights">
          <div className="space-y-3 text-black/70">
            <p>
              Your forecast weekly income is{" "}
              <b>{money(forecastWeeklyIncome)}</b>.
            </p>

            <p>
              Your actual weekly income is <b>{money(actualWeeklyIncome)}</b>.
            </p>

            <p>
              Your fixed monthly burn is <b>{money(fixedMonthlyBurn)}</b>.
            </p>

            <p>
              Your free cash after bills is{" "}
              <b
                className={
                  freeCashAfterBills < 0 ? "text-red-600" : "text-emerald-600"
                }
              >
                {money(freeCashAfterBills)}
              </b>
              .
            </p>

            <p>
              You can safely spend about <b>{money(safeDailySpend)}</b> per day
              until the finance week resets.
            </p>

            {incomeForecast?.weeklyAmount ? null : (
              <p className="text-orange-600 font-bold">
                No forecast income is set, so this dashboard is using your
                actual logged income for this week.
              </p>
            )}
          </div>
        </Panel>
      </section>
    </Shell>
  );
}