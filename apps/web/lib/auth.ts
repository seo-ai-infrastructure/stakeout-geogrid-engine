import { auth, currentUser } from "@clerk/nextjs/server";
import { db, type User } from "@geogrid/db";

/** Resolve (or lazily create) the local User for the signed-in Clerk identity. New accounts start with 0 credits: no free trial. */
export async function requireUser(): Promise<User | null> {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const existing = await db.user.findUnique({ where: { clerkId } });
  if (existing) return existing;
  const cu = await currentUser();
  const email = cu?.primaryEmailAddress?.emailAddress ?? `${clerkId}@no-email.local`;
  try {
    return await db.user.create({ data: { clerkId, email, name: cu?.fullName ?? null, creditBalance: 0 } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return db.user.findUnique({ where: { clerkId } });
    throw e;
  }
}
