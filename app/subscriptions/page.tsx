export const dynamic = "force-dynamic";

import { revalidatePath } from "next/cache";
import { prisma } from "../lib/prisma";
import { auDate, inputDate, money } from "../lib/finance";
import { buttonClass, Card, inputClass, Panel, Shell } from "@/components/ui";

function getNextFuturePaymentDate(
  originalDate: Date,
  frequency: string,
  now: Date
) {
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

async function addSub(fd: FormData) {
  "use server";

  const name = String(fd.get("name") || "").trim();
  const date = String(fd.get("nextPaymentDate") || "");

  if (!name || !date) return;

  await prisma.subscription.create({
    data: {
      name,
      amount: Number(fd.get("amount") || 0),
      frequency: String(fd.get("frequency") || "MONTHLY") as any,
      nextPaymentDate: new Date(date),
      active: true,
    },
  });

  revalidatePath("/subscriptions");
  revalidatePath("/");
}

async function deleteSub(fd: FormData) {
  "use server";

  const id = String(fd.get("id") || "");
  if (!id) return;

  await prisma.subscription.delete({
    where: { id },
  });

  revalidatePath("/subscriptions");
  revalidatePath("/");
}

async function toggleSub(fd: FormData) {
  "use server";

  const id = String(fd.get("id") || "");
  const active = String(fd.get("active")) === "true";

  if (!id) return;

  await prisma.subscription.update({
    where: { id },
    data: {
      active: !active,
    },
  });

  revalidatePath("/subscriptions");
  revalidatePath("/");
}

export default async function SubscriptionsPage() {
  const now = new Date();

  const next7 = new Date(now);
  next7.setDate(now.getDate() + 7);

  const next30 = new Date(now);
  next30.setDate(now.getDate() + 30);

  const [subs, categories] = await Promise.all([
    prisma.subscription.findMany({
      orderBy: {
        nextPaymentDate: "asc",
      },
    }),

    prisma.category.findMany({
      orderBy: {
        name: "asc",
      },
    }),
  ]);

  const subscriptions = subs.map((subscription) => {
    const calculatedNextPaymentDate = getNextFuturePaymentDate(
      subscription.nextPaymentDate,
      subscription.frequency,
      now
    );

    return {
      ...subscription,
      calculatedNextPaymentDate,
    };
  });

  const active = subscriptions.filter((subscription) => subscription.active);

  const due7 = active.filter(
    (subscription) =>
      subscription.calculatedNextPaymentDate >= now &&
      subscription.calculatedNextPaymentDate <= next7
  );

  const due30 = active.filter(
    (subscription) =>
      subscription.calculatedNextPaymentDate >= now &&
      subscription.calculatedNextPaymentDate <= next30
  );

  const monthlyBurn = active.reduce((sum, subscription) => {
    if (subscription.frequency === "WEEKLY") {
      return sum + subscription.amount * 4.33;
    }

    if (subscription.frequency === "FORTNIGHTLY") {
      return sum + subscription.amount * 2.17;
    }

    if (subscription.frequency === "YEARLY") {
      return sum + subscription.amount / 12;
    }

    return sum + subscription.amount;
  }, 0);

  const sortedSubscriptions = subscriptions.sort(
    (a, b) =>
      a.calculatedNextPaymentDate.getTime() -
      b.calculatedNextPaymentDate.getTime()
  );

  return (
    <Shell
      title="Subscriptions"
      subtitle="Upcoming payments are automatically rolled forward from old dates."
    >
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card title="Monthly Burn" value={money(monthlyBurn)} />

        <Card
          title="Next 7 Days"
          value={money(
            due7.reduce((sum, subscription) => sum + subscription.amount, 0)
          )}
          tone="danger"
        />

        <Card
          title="Next 30 Days"
          value={money(
            due30.reduce((sum, subscription) => sum + subscription.amount, 0)
          )}
          tone="warning"
        />
      </section>

      <Panel title="Add Subscription">
        <form action={addSub} className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input name="name" placeholder="Name" className={inputClass} />

          <input
            name="amount"
            type="number"
            step="0.01"
            placeholder="Amount"
            className={inputClass}
          />

          <select name="frequency" className={inputClass}>
            <option value="WEEKLY">WEEKLY</option>
            <option value="FORTNIGHTLY">FORTNIGHTLY</option>
            <option value="MONTHLY">MONTHLY</option>
            <option value="YEARLY">YEARLY</option>
          </select>

          <select name="categoryName" className={inputClass}>
            <option value="">Optional category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </select>

          <input
            name="nextPaymentDate"
            type="date"
            defaultValue={inputDate(now)}
            className={inputClass}
          />

          <button className={buttonClass}>Add</button>
        </form>

        <p className="text-sm text-black/50 mt-3">
          Category is optional for now. To save it permanently, add categoryId to
          your Subscription model.
        </p>
      </Panel>

      <Panel title="All Subscriptions">
        <div className="space-y-3">
          {sortedSubscriptions.map((subscription) => (
            <div
              key={subscription.id}
              className="flex justify-between items-center rounded-2xl bg-black/5 p-4"
            >
              <div>
                <p className="font-black">{subscription.name}</p>

                <p className="text-sm text-black/50">
                  {money(subscription.amount)} • {subscription.frequency} • next{" "}
                  {auDate(subscription.calculatedNextPaymentDate)} •{" "}
                  {subscription.active ? "Active" : "Inactive"}
                </p>

                {subscription.nextPaymentDate < now && (
                  <p className="text-xs text-black/40 mt-1">
                    Original saved date was {auDate(subscription.nextPaymentDate)}
                    . Rolled forward automatically.
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <form action={toggleSub}>
                  <input type="hidden" name="id" value={subscription.id} />
                  <input
                    type="hidden"
                    name="active"
                    value={String(subscription.active)}
                  />

                  <button className="rounded-xl bg-black text-white px-4 py-2 font-bold">
                    {subscription.active ? "Pause" : "Activate"}
                  </button>
                </form>

                <form action={deleteSub}>
                  <input type="hidden" name="id" value={subscription.id} />

                  <button className="rounded-xl bg-red-100 text-red-700 px-4 py-2 font-bold">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}

          {sortedSubscriptions.length === 0 && (
            <p className="text-black/50">No subscriptions yet.</p>
          )}
        </div>
      </Panel>
    </Shell>
  );
}