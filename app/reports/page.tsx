export const dynamic = "force-dynamic";
export const revalidate = 0;

import OpenAI from "openai";
import { prisma } from "../lib/prisma";
import {
  auDate,
  endOfFinanceWeek,
  endOfMonth,
  money,
  startOfFinanceWeek,
  startOfMonth,
} from "../lib/finance";
import { Card, Panel, Shell } from "@/components/ui";

async function generateAIReport(data: any) {
  if (!process.env.OPENAI_API_KEY) {
    return "OpenAI is not connected. Add OPENAI_API_KEY to your .env file.";
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5",
      input: `
You are the AI Financial Analyst inside Finance Command Centre.

The user struggles with impulse/compulsive spending.
Your job is to analyse the financial report and produce a serious but supportive money control report.

Rules:
- Use Australian dollars.
- Be direct.
- No generic advice.
- No shame.
- Focus on cash flow, overspending, habits, risk, and exact actions.
- Explain what the numbers mean.
- Give hard rules for the next 7 days.
- Keep it practical.

Data:
${JSON.stringify(data, null, 2)}

Return exactly this format:

EXECUTIVE SUMMARY:
...

CASH FLOW STATUS:
...

SPENDING BEHAVIOUR:
...

BIGGEST RISK:
...

CATEGORY WARNING:
...

7-DAY ACTION PLAN:
1. ...
2. ...
3. ...

SPENDING RULE:
...

AI COACH MESSAGE:
...
`,
    });

    return response.output_text || "AI report could not be generated.";
  } catch (error) {
    console.error(error);
    return "AI report unavailable. Check your OpenAI model, API key, or billing.";
  }
}

export default async function ReportsPage() {
  const now = new Date();

  const weekStart = startOfFinanceWeek(now);
  const weekEnd = endOfFinanceWeek(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [
    weeklyTransactions,
    monthlyTransactions,
    categories,
    budgets,
    subscriptions,
    incomeForecast,
    incomeLogs,
    goals,
  ] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        date: {
          gte: weekStart,
          lte: weekEnd,
        },
      },
      include: { category: true },
      orderBy: { date: "desc" },
    }),

    prisma.transaction.findMany({
      where: {
        date: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      include: { category: true },
      orderBy: { date: "desc" },
    }),

    prisma.category.findMany({
      orderBy: { name: "asc" },
    }),

    prisma.budget.findMany({
      include: { category: true },
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

    prisma.goal.findMany({
      orderBy: { createdAt: "desc" },
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

  const weeklyIncomeFromTransactions = weeklyTransactions
    .filter((transaction) => transaction.type === "INCOME")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const monthlyIncomeFromTransactions = monthlyTransactions
    .filter((transaction) => transaction.type === "INCOME")
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const weeklyBalance = actualWeeklyIncome + weeklyIncomeFromTransactions - weeklyExpenses;

  const activeSubscriptions = subscriptions.filter(
    (subscription) => subscription.active
  );

  const fixedMonthlyBurn = activeSubscriptions.reduce(
    (sum, subscription) => sum + subscription.amount,
    0
  );

  const freeCashAfterBills =
    forecastMonthlyIncome - monthlyExpenses - fixedMonthlyBurn;

  const weeklyBudget =
    budgets.reduce((sum, budget) => sum + budget.weeklyLimit, 0) ||
    categories.reduce((sum, category) => sum + category.weeklyLimit, 0);

  const monthlyBudget =
    budgets.reduce((sum, budget) => sum + budget.monthlyLimit, 0) ||
    categories.reduce((sum, category) => sum + category.monthlyLimit, 0);

  const categoryBreakdown = categories.map((category) => {
    const weeklySpent = weeklyTransactions
      .filter(
        (transaction) =>
          transaction.type === "EXPENSE" && transaction.categoryId === category.id
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    const monthlySpent = monthlyTransactions
      .filter(
        (transaction) =>
          transaction.type === "EXPENSE" && transaction.categoryId === category.id
      )
      .reduce((sum, transaction) => sum + transaction.amount, 0);

    return {
      id: category.id,
      name: category.name,
      weeklyLimit: category.weeklyLimit,
      monthlyLimit: category.monthlyLimit,
      weeklySpent,
      monthlySpent,
      weeklyRemaining: category.weeklyLimit - weeklySpent,
      monthlyRemaining: category.monthlyLimit - monthlySpent,
    };
  });

  const topSpendingCategories = [...categoryBreakdown]
    .sort((a, b) => b.monthlySpent - a.monthlySpent)
    .slice(0, 5);

  const biggestRiskCategory =
    topSpendingCategories.find((category) => category.monthlySpent > 0) || null;

  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          (weeklyExpenses > weeklyBudget ? 25 : 0) -
          (monthlyExpenses > monthlyBudget ? 25 : 0) -
          (freeCashAfterBills < 0 ? 25 : 0) -
          (fixedMonthlyBurn > forecastMonthlyIncome * 0.4 ? 15 : 0)
      )
    )
  );

  const reportData = {
    period: {
      week: `${auDate(weekStart)} to ${auDate(weekEnd)}`,
      month: `${auDate(monthStart)} to ${auDate(monthEnd)}`,
    },
    income: {
      forecastWeeklyIncome,
      forecastMonthlyIncome,
      actualWeeklyIncome,
      weeklyIncomeFromTransactions,
      monthlyIncomeFromTransactions,
    },
    spending: {
      weeklyExpenses,
      monthlyExpenses,
      weeklyBudget,
      monthlyBudget,
      weeklyBudgetRemaining: weeklyBudget - weeklyExpenses,
      monthlyBudgetRemaining: monthlyBudget - monthlyExpenses,
    },
    cashFlow: {
      weeklyBalance,
      fixedMonthlyBurn,
      freeCashAfterBills,
      healthScore,
    },
    topSpendingCategories,
    subscriptions: activeSubscriptions.map((subscription) => ({
      name: subscription.name,
      amount: subscription.amount,
      nextPaymentDate: auDate(subscription.nextPaymentDate),
    })),
    goals: goals.map((goal) => ({
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
    })),
  };

  const aiReport = await generateAIReport(reportData);

  return (
    <Shell
      title="AI Financial Reports"
      subtitle={`AI-driven report for ${auDate(monthStart)} → ${auDate(
        monthEnd
      )}`}
    >
      <section className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <Card
          title="AI Health Score"
          value={`${healthScore}/100`}
          note="Report risk score"
          tone={
            healthScore < 60
              ? "danger"
              : healthScore < 80
              ? "warning"
              : "success"
          }
        />

        <Card
          title="Weekly Spend"
          value={money(weeklyExpenses)}
          note={`${money(weeklyBudget)} weekly budget`}
          tone={weeklyExpenses > weeklyBudget ? "danger" : "success"}
        />

        <Card
          title="Monthly Spend"
          value={money(monthlyExpenses)}
          note={`${money(monthlyBudget)} monthly budget`}
          tone={monthlyExpenses > monthlyBudget ? "danger" : "success"}
        />

        <Card
          title="Free Cash"
          value={money(freeCashAfterBills)}
          note="After expenses and fixed bills"
          tone={freeCashAfterBills < 0 ? "danger" : "success"}
        />
      </section>

      <Panel title="AI Money Control Report">
        <div className="rounded-3xl bg-black text-white p-6 border border-emerald-500/30">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs tracking-[0.35em] text-emerald-400 font-black uppercase">
                OpenAI Financial Analyst
              </p>
              <h3 className="text-2xl font-black mt-2">
                Spending Behaviour Intelligence
              </h3>
            </div>

            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-right">
              <p className="text-xs text-white/50 font-bold uppercase">
                Status
              </p>
              <p className="text-2xl font-black">{healthScore}/100</p>
            </div>
          </div>

          <div className="whitespace-pre-line text-white/80 leading-7 font-medium">
            {aiReport}
          </div>
        </div>
      </Panel>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Top Spending Categories">
          <div className="space-y-4">
            {topSpendingCategories.map((category) => (
              <div key={category.id} className="rounded-2xl bg-black/5 p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-black">{category.name}</p>
                    <p className="text-sm text-black/50">
                      Monthly limit {money(category.monthlyLimit)}
                    </p>
                  </div>

                  <p className="text-xl font-black">
                    {money(category.monthlySpent)}
                  </p>
                </div>

                <div className="h-3 bg-black/10 rounded-full mt-3 overflow-hidden">
                  <div
                    className={
                      category.monthlyLimit > 0 &&
                      category.monthlySpent > category.monthlyLimit
                        ? "h-full bg-red-500"
                        : "h-full bg-emerald-500"
                    }
                    style={{
                      width: `${
                        category.monthlyLimit > 0
                          ? Math.min(
                              100,
                              (category.monthlySpent / category.monthlyLimit) *
                                100
                            )
                          : category.monthlySpent > 0
                          ? 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            ))}

            {topSpendingCategories.length === 0 && (
              <p className="text-black/50">No spending data yet.</p>
            )}
          </div>
        </Panel>

        <Panel title="Risk Flags">
          <div className="space-y-3 text-black/70">
            <p>
              <b>Highest spending category:</b>{" "}
              {biggestRiskCategory ? biggestRiskCategory.name : "No data yet"}
            </p>

            <p>
              <b>Weekly budget status:</b>{" "}
              {weeklyExpenses > weeklyBudget
                ? `${money(weeklyExpenses - weeklyBudget)} over budget`
                : `${money(weeklyBudget - weeklyExpenses)} remaining`}
            </p>

            <p>
              <b>Monthly budget status:</b>{" "}
              {monthlyExpenses > monthlyBudget
                ? `${money(monthlyExpenses - monthlyBudget)} over budget`
                : `${money(monthlyBudget - monthlyExpenses)} remaining`}
            </p>

            <p>
              <b>Fixed monthly burn:</b> {money(fixedMonthlyBurn)}
            </p>

            <p>
              <b>Free cash after bills:</b>{" "}
              <span
                className={
                  freeCashAfterBills < 0 ? "text-red-600" : "text-emerald-600"
                }
              >
                {money(freeCashAfterBills)}
              </span>
            </p>
          </div>
        </Panel>
      </section>
    </Shell>
  );
}