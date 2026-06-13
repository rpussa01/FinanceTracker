# Finance Command Centre v2

A fresh Next.js finance tracker built around **weekly income**.

## Features

- Dashboard with financial health score
- Forecasted weekly income
- Actual weekly income logs
- Weekly balance
- Safe daily spend
- Upcoming bills next 7 and 30 days
- Monthly income estimate using `weeklyForecastIncome * 4.33`
- Free cash after bills
- Transactions, budgets, categories, subscriptions, goals, reports and settings pages
- Prisma + PostgreSQL schema

## Setup

```bash
npm install
cp .env.example .env
# add your Neon/Postgres DATABASE_URL to .env
npx prisma migrate dev --name init
npx prisma generate
npm run dev
```

Open: http://localhost:3000

## Important logic

Income is weekly. Monthly estimate is calculated as:

```ts
forecastWeeklyIncome * 4.33
```

The dashboard does not subtract monthly bills from one weekly income amount.
