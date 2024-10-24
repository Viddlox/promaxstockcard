import { PrismaClient } from "@prisma/client";
import { getLimitAndCursor } from "../../utils/query.js";

const prisma = new PrismaClient();

export const getCustomers = async ({ limit, cursor, search }) => {
  const { limitQuery, cursorQuery } = getLimitAndCursor({ limit, cursor });

  const parsedCursor = cursorQuery ? JSON.parse(cursorQuery) : null;

  const customers = await prisma.customers.findMany({
    take: limitQuery,
    skip: parsedCursor ? 1 : 0,
    cursor: parsedCursor
      ? {
          updatedAt_customerId: {
            updatedAt: parsedCursor.updatedAt,
            customerId: parsedCursor.customerId,
          },
        }
      : undefined,
    where: search
      ? { companyName: { contains: search, mode: "insensitive" } }
      : {},
    orderBy: { updatedAt: "desc" },
  });

  const totalCount = await prisma.customers.count({
    where: search
      ? { companyName: { contains: search, mode: "insensitive" } }
      : {},
  });

  const nextCursor =
    customers.length === limitQuery
      ? {
          updatedAt: customers[customers.length - 1].updatedAt,
          customerId: customers[customers.length - 1].customerId,
        }
      : null;

  return {
    data: customers,
    nextCursor,
    total: totalCount,
    hasNextPage: nextCursor !== null,
  };
};
