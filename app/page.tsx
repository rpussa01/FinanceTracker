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

function getNextFuturePaymentDate(originalDate: Date, frequency: string, now: Date) {
  const next = new Date(originalDate);

  while (next < now) {
    if (frequency === "WEEKLY") {
      next.setDate(next.getDate() + 7);
    } else if (frequency === "FORTNIGHTLY") {
      next.setDate(next.getDate() + 14);
    } else if (frequency === "MONTHLY") {
      next.setMonth(next.getMonth() + 1);
    } else if (frequency === "YEARLY") {
      next.setFullYear(next.getFullYear() + 1);
    } else {
      break;
    }
  }

  return next;
}

function monthlyEquivalent(amount: number, frequency: string) {
  if (frequency === "WEEKLY") return amount * 4.33;
  if (frequency === "FORTNIGHTLY") return amount * 2.17;
  if (frequency === "YEARLY") return amount / 12;
  return amount;
}

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

function subscriptionMatchesCategory(subscriptionName: string, categoryName: string) {
  const sub = subscriptionName.toLowerCase();
  const cat = categoryName.toLowerCase();

  if (sub.includes(cat)) return true;

  if (
    cat.includes("fitness") &&
    (sub.includes("gym") ||
      sub.includes("fitness") ||
      sub.includes("snap") ||
      sub.includes("anytime") ||
      sub.includes("jetts") ||
      sub.includes("revo"))
  ) {
    return true;
  }

  if (
    cat.includes("groceries") &&
    (sub.includes("woolworths") ||
      sub.includes("coles") ||
      sub.includes("aldi") ||
      sub.includes("grocery"))
  ) {
    return true;
  }

  if (
    cat.includes("transport") &&
    (sub.includes("fuel") ||
      sub.includes("uber") ||
      sub.includes("parking") ||
      sub.includes("car"))
  ) {
    return true;
  }

  return false;
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
    rawSubscriptions,
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
      where: { date: { gte: weekStart, lte: weekEnd } },
      include: { category: true },
    }),

    prisma.transaction.findMany({
      where: { date: { gte: monthStart, lte: monthEnd } },
      include: { category: true },
    }),

    prisma.subscription.findMany({
      orderBy: { nextPaymentDate: "asc" },
    }),

    prisma.incomeForecast.findUnique({
      where: { id: "main" },
    }),

    prisma.incomeLog.findMany({
      where: { date: { gte: weekStart, lte: weekEnd } },
    }),

    prisma.budget.findMany({
      include: { category: true },
    }),

    prisma.goal.findMany({
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
  ]);

  const subscriptions = rawSubscriptions
    .map((subscription) => ({
      ...subscription,
      upcomingDate: getNextFuturePaymentDate(
        subscription.nextPaymentDate,
        subscription.frequency,
        now
      ),
      monthlyAmount: monthlyEquivalent(subscription.amount, subscription.frequency),
    }))
    .sort((a, b) => a.upcomingDate.getTime() - b.upcomingDate.getTime());

  const activeSubs = subscriptions.filter((subscription) => subscription.active);

  const actualWeeklyIncome = incomeLogs.reduce((sum, log) => sum + log.amount, 0);

  const forecastWeeklyIncome =
    incomeForecast?.weeklyAmount && incomeForecast.weeklyAmount > 0
      ? incomeForecast.weeklyAmount
      : actualWeeklyIncome;

  const forecastMonthlyIncome = forecastWeeklyIncome * 4.33;

  const weeklyExpenses = weeklyTransactions
    .filter((transaction) => transaction.type === "EXPENSE")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const monthlyTransactionExpenses = monthlyTransactions
    .filter((transaction) => transaction.type === "EXPENSE")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const fixedMonthlyBurn = activeSubs.reduce(
    (sum, subscription) => sum + subscription.monthlyAmount,
    0
  );

  const next7 = new Date(now);
  next7.setDate(now.getDate() + 7);

  const next30 = new Date(now);
  next30.setDate(now.getDate() + 30);

  const dueNext7 = activeSubs
    .filter(
      (subscription) =>
        subscription.upcomingDate >= now && subscription.upcomingDate <= next7
    )
    .reduce((sum, subscription) => sum + subscription.amount, 0);

  const dueNext30 = activeSubs
    .filter(
      (subscription) =>
        subscription.upcomingDate >= now && subscription.upcomingDate <= next30
    )
    .reduce((sum, subscription) => sum + subscription.amount, 0);

  const weeklyBalance = actualWeeklyIncome - weeklyExpenses;

  const freeCashAfterBills =
    forecastMonthlyIncome - monthlyTransactionExpenses - fixedMonthlyBurn;

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

  const spendRate =
    forecastWeeklyIncome > 0 ? weeklyExpenses / forecastWeeklyIncome : 0;

  const burnRateMonthly =
    forecastMonthlyIncome > 0
      ? ((monthlyTransactionExpenses + fixedMonthlyBurn) / forecastMonthlyIncome) *
        100
      : 0;

  const recommendedDailySpend = Math.max(0, freeCashAfterBills * 0.35) / 30;
  const impulseLockAmount = Math.max(20, recommendedDailySpend * 0.5);

  const riskLevel =
    healthScore < 50
      ? "High Risk"
      : healthScore < 75
      ? "Controlled Risk"
      : "Strong Position";

  const riskTone =
    healthScore < 50 ? "danger" : healthScore < 75 ? "warning" : "success";

  const categoryChartData = categories
    .map((category) => {
      const matchingBudget = budgets.find(
        (budget) => budget.categoryId === category.id
      );

      const weeklyLimit = matchingBudget?.weeklyLimit || category.weeklyLimit || 0;

      const monthlyLimit =
        matchingBudget?.monthlyLimit ||
        category.monthlyLimit ||
        weeklyLimit * 4.33;

      const transactionSpent = monthlyTransactions
        .filter(
          (transaction) =>
            transaction.type === "EXPENSE" &&
            transaction.categoryId === category.id
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0);

      const subscriptionSpent = activeSubs
        .filter((subscription) =>
          subscriptionMatchesCategory(subscription.name, category.name)
        )
        .reduce((sum, subscription) => sum + subscription.monthlyAmount, 0);

      const spent = transactionSpent + subscriptionSpent;

      const percentUsed =
        monthlyLimit > 0 ? Math.min(100, (spent / monthlyLimit) * 100) : 0;

      return {
        id: category.id,
        name: category.name,
        weeklyLimit,
        monthlyLimit,
        transactionSpent,
        subscriptionSpent,
        spent,
        remaining: monthlyLimit - spent,
        percentUsed,
      };
    })
    .filter((category) => category.monthlyLimit > 0 || category.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  const topCategory = categoryChartData[0];

  const subscriptionPieData = activeSubs
    .map((subscription) => ({
      id: subscription.id,
      name: subscription.name,
      amount: subscription.monthlyAmount,
      actualAmount: subscription.amount,
      frequency: subscription.frequency,
      upcomingDate: subscription.upcomingDate,
    }))
    .sort((a, b) => b.amount - a.amount);

  const subscriptionColors = [
    "#10b981",
    "#3b82f6",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#06b6d4",
    "#84cc16",
    "#ec4899",
  ];

  let runningTotal = 0;

  const subscriptionPieGradient =
    fixedMonthlyBurn > 0
      ? subscriptionPieData
          .map((subscription, index) => {
            const start = (runningTotal / fixedMonthlyBurn) * 100;
            runningTotal += subscription.amount;
            const end = (runningTotal / fixedMonthlyBurn) * 100;

            return `${
              subscriptionColors[index % subscriptionColors.length]
            } ${start}% ${end}%`;
          })
          .join(", ")
      : "#e5e7eb 0% 100%";

  return (
    <Shell
      title="Finance Dashboard"
      subtitle={`Thursday finance week: ${auDate(weekStart)} → ${auDate(
        weekEnd
      )}`}
    >
      <section className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <Card title="Health Score" value={`${healthScore}/100`} note="Cash-flow risk score" tone={riskTone} />
        <Card title="Forecast Weekly Income" value={money(forecastWeeklyIncome)} note={incomeForecast?.weeklyAmount ? "Planning income" : "Using actual income this week"} />
        <Card title="Actual Income This Week" value={money(actualWeeklyIncome)} note="Logged income" tone="success" />
        <Card title="Weekly Balance" value={money(weeklyBalance)} note="Actual income - weekly expenses" tone={weeklyBalance < 0 ? "danger" : "normal"} />
        <Card title="Safe Daily Spend" value={money(safeDailySpend)} note="Weekly cash-flow ceiling" tone={safeDailySpend <= 0 ? "danger" : "success"} />
        <Card title="Due Next 7 Days" value={money(dueNext7)} note="Rolled-forward active subscriptions" tone={dueNext7 > weeklyBalance ? "danger" : "normal"} />
        <Card title="Due Next 30 Days" value={money(dueNext30)} note="Rolled-forward upcoming bills" tone="warning" />
        <Card title="Free Cash After Bills" value={money(freeCashAfterBills)} note="Monthly estimate - spending - bills" tone={freeCashAfterBills < 0 ? "danger" : "success"} />
      </section>

      <Panel title="Money Control Centre">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="rounded-3xl bg-black text-white p-6 border border-emerald-500/30">
            <p className="text-xs tracking-[0.35em] text-emerald-400 font-black uppercase">
              Command Status
            </p>
            <h3 className="text-3xl font-black mt-3">{riskLevel}</h3>
            <p className="text-white/60 mt-3 leading-7">
              Your status is based on income, spending speed, bills due, budget
              pressure, and remaining cash flow.
            </p>

            <div className="mt-6 rounded-2xl bg-white/10 p-4">
              <p className="text-white/50 text-sm font-bold">Monthly burn rate</p>
              <p className="text-3xl font-black mt-1">
                {burnRateMonthly.toFixed(1)}%
              </p>
              <p className="text-white/50 text-sm mt-1">
                Expenses plus fixed bills versus income.
              </p>
            </div>
          </div>

          <div className="rounded-3xl bg-black/5 p-6">
            <p className="text-xs tracking-[0.35em] text-black/40 font-black uppercase">
              Spending Guardrail
            </p>
            <h3 className="text-3xl font-black mt-3">
              {money(recommendedDailySpend)}
            </h3>
            <p className="text-black/50 mt-2">
              Recommended daily lifestyle spend after protecting bills and cash flow.
            </p>

            <div className="mt-6 space-y-3 text-black/70">
              <p><b>Impulse lock:</b> Anything above {money(impulseLockAmount)} waits 24 hours.</p>
              <p><b>Hard ceiling:</b> Do not exceed {money(safeDailySpend)} today.</p>
              <p><b>Focus:</b> food, fuel, bills, and business growth only.</p>
            </div>
          </div>

          <div className="rounded-3xl bg-black/5 p-6">
            <p className="text-xs tracking-[0.35em] text-black/40 font-black uppercase">
              Behaviour Signal
            </p>
            <h3 className="text-3xl font-black mt-3">
              {(spendRate * 100).toFixed(1)}%
            </h3>
            <p className="text-black/50 mt-2">
              Of weekly income already spent this finance week.
            </p>

            <div className="mt-6 space-y-3 text-black/70">
              <p>
                <b>Top category:</b>{" "}
                {topCategory && topCategory.spent > 0
                  ? `${topCategory.name} — ${money(topCategory.spent)}`
                  : "No major category yet"}
              </p>
              <p>
                <b>Forecast:</b>{" "}
                {forecastOver > 0
                  ? `${money(forecastOver)} over weekly budget`
                  : `${money(Math.abs(forecastOver))} under weekly budget`}
              </p>
              <p><b>Rule:</b> Log before spending, not after.</p>
            </div>
          </div>
        </div>
      </Panel>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Subscription Breakdown">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="flex justify-center">
              <div
                className="w-72 h-72 rounded-full relative shadow-inner"
                style={{ background: `conic-gradient(${subscriptionPieGradient})` }}
              >
                <div className="absolute inset-10 bg-white rounded-full flex flex-col items-center justify-center text-center">
                  <p className="text-xs tracking-[0.25em] text-black/40 font-black uppercase">
                    Monthly Subs
                  </p>
                  <p className="text-3xl font-black mt-2">
                    {money(fixedMonthlyBurn)}
                  </p>
                  <p className="text-sm text-black/50 mt-1">
                    {activeSubs.length} active
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {subscriptionPieData.map((subscription, index) => {
                const percentage =
                  fixedMonthlyBurn > 0
                    ? (subscription.amount / fixedMonthlyBurn) * 100
                    : 0;

                return (
                  <div key={subscription.id} className="flex items-center justify-between rounded-2xl bg-black/5 p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{
                          backgroundColor:
                            subscriptionColors[index % subscriptionColors.length],
                        }}
                      />
                      <div>
                        <p className="font-black">{subscription.name}</p>
                        <p className="text-sm text-black/50">
                          Next payment {auDate(subscription.upcomingDate)}
                        </p>
                        <p className="text-xs text-black/40">
                          {money(subscription.actualAmount)} {subscription.frequency.toLowerCase()}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="font-black">{money(subscription.amount)}</p>
                      <p className="text-sm text-black/50">
                        {percentage.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                );
              })}

              {subscriptionPieData.length === 0 && (
                <p className="text-black/50">No active subscriptions yet.</p>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Subscription Pressure">
          <div className="grid grid-cols-1 gap-4">
            <Card
              title="Total Active Subscriptions"
              value={money(fixedMonthlyBurn)}
              note="Monthly recurring burn"
              tone={
                fixedMonthlyBurn > forecastMonthlyIncome * 0.25
                  ? "danger"
                  : "success"
              }
            />

            <Card
              title="Income Used by Subscriptions"
              value={
                forecastMonthlyIncome > 0
                  ? `${((fixedMonthlyBurn / forecastMonthlyIncome) * 100).toFixed(1)}%`
                  : "0.0%"
              }
              note="Recurring subscriptions vs monthly income"
              tone={
                fixedMonthlyBurn > forecastMonthlyIncome * 0.25
                  ? "danger"
                  : "normal"
              }
            />

            <Card
              title="Next 30 Days"
              value={money(dueNext30)}
              note="Subscriptions due soon"
              tone="warning"
            />
          </div>
        </Panel>
      </section>

      <Panel title="Budget vs Spent by Category">
        <div className="space-y-5">
          {categoryChartData.map((category) => (
            <div key={category.id} className="rounded-3xl bg-black/5 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-black text-lg">{category.name}</p>
                  <p className="text-sm text-black/50">
                    Monthly budget {money(category.monthlyLimit)} • Spent{" "}
                    {money(category.spent)}
                  </p>
                  <p className="text-xs text-black/40 mt-1">
                    Transactions {money(category.transactionSpent)} • Subscriptions{" "}
                    {money(category.subscriptionSpent)}
                  </p>
                </div>

                <div className="text-right">
                  <p className={`text-xl font-black ${category.remaining < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {category.remaining < 0
                      ? `${money(Math.abs(category.remaining))} over`
                      : `${money(category.remaining)} left`}
                  </p>
                  <p className="text-sm text-black/50">
                    {category.percentUsed.toFixed(1)}% used
                  </p>
                </div>
              </div>

              <div className="mt-4 h-4 rounded-full bg-black/10 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    category.percentUsed >= 100
                      ? "bg-red-500"
                      : category.percentUsed >= 75
                      ? "bg-yellow-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min(100, category.percentUsed)}%` }}
                />
              </div>
            </div>
          ))}

          {categoryChartData.length === 0 && (
            <p className="text-black/50">No category budgets or spending yet.</p>
          )}
        </div>
      </Panel>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Quick Add Transaction">
          <form action={addTransaction} className="space-y-4">
            <select name="type" className={inputClass}>
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
            </select>

            <input name="amount" type="number" step="0.01" placeholder="Amount" className={inputClass} />

            <select name="categoryId" className={inputClass}>
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <input name="merchant" placeholder="Merchant" className={inputClass} />
            <input name="description" placeholder="Description" className={inputClass} />
            <input name="date" type="date" defaultValue={inputDate(now)} className={inputClass} />

            <button className={buttonClass}>Add Transaction</button>
          </form>
        </Panel>

        <Panel title="Forecast Engine">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card title="Weekly Budget" value={money(weeklyBudget)} tone="light" />
            <Card title="Projected Spend" value={money(projectedWeeklySpend)} tone="light" />
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
            <div key={transaction.id} className="flex justify-between items-center rounded-2xl bg-black/5 p-4">
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
                <p className={`text-xl font-black ${transaction.type === "INCOME" ? "text-emerald-600" : "text-red-600"}`}>
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

            {goals.length === 0 && <p className="text-black/50">No goals yet.</p>}
          </div>
        </Panel>

        <Panel title="Spending Protection Rules">
          <div className="space-y-3 text-black/70">
            <p><b>Rule 1:</b> No impulse purchase without waiting 24 hours.</p>
            <p><b>Rule 2:</b> Anything above {money(impulseLockAmount)} gets delayed.</p>
            <p><b>Rule 3:</b> Anything above {money(safeDailySpend)} must wait until tomorrow.</p>
            <p><b>Rule 4:</b> If it is not food, fuel, rent, bills, or business growth, it is optional.</p>
            <p><b>Rule 5:</b> Log every purchase before you buy it.</p>
          </div>
        </Panel>
      </section>
    </Shell>
  );
}