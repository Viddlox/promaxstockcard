import { PrismaClient } from "@prisma/client";
import { HttpError } from "../../utils/http.js";
import { getLimitAndCursor } from "../../utils/query.js";

const prisma = new PrismaClient();

export const getProducts = async ({ limit, cursor, search = "" }) => {
  const { limitQuery, cursorQuery } = getLimitAndCursor({ limit, cursor });

  const parsedCursor = cursorQuery ? JSON.parse(cursorQuery) : null;

  const products = await prisma.products.findMany({
    take: limitQuery,
    skip: parsedCursor ? 1 : 0,
    cursor: parsedCursor
      ? {
          updatedAt_productId: {
            updatedAt: parsedCursor.updatedAt,
            productId: parsedCursor.productId,
          },
        }
      : undefined,
    where: search
      ? { productproductName: { contains: search, mode: "insensitive" } }
      : {},
    orderBy: { updatedAt: "desc" },
  });

  const totalCount = await prisma.products.count({
    where: search
      ? { productproductName: { contains: search, mode: "insensitive" } }
      : {},
  });

  const nextCursor =
    products.length === limitQuery
      ? {
          updatedAt: products[products.length - 1].updatedAt,
          productId: products[products.length - 1].productId,
        }
      : null;

  return {
    data: products,
    nextCursor,
    total: totalCount,
    hasNextPage: nextCursor !== null,
  };
};

export const postCreateProduct = async ({
  productId,
  productName,
  basePrice,
  quantity = 1,
  bom = null,
}) => {
  if (!productId || !productName || !basePrice || quantity === undefined || !bom) {
    throw new HttpError(400, "Missing required fields");
  }

  if (bom && Array.isArray(bom)) {
    const partIds = bom.map((part) => part.partId);

    const existingParts = await prisma.inventory.findMany({
      where: {
        partId: { in: partIds },
      },
      select: {
        partId: true,
      },
    });

    const existingPartIds = existingParts.map((part) => part.partId);

    const missingParts = partIds.filter(
      (partId) => !existingPartIds.includes(partId)
    );

    if (missingParts.length > 0) {
      throw new HttpError(
        400,
        missingParts.length === 1
          ? `${missingParts} does not exist`
          : `${missingParts} do not exist`
      );
    }
  }

  const newProduct = await prisma.products.create({
    data: {
      productId,
      productName,
      basePrice,
      quantity: parseInt(quantity, 10),
      bom: bom.length ? JSON.parse(bom) : null
    },
  });

  return newProduct;
};

export const deleteProducts = async ({ productIds = [] }) => {
  if (productIds.length === 0) {
    throw new HttpError(400, "Missing required fields");
  }

  await prisma.products.deleteMany({
    where: {
      productId: {
        in: productIds,
      },
    },
  });
};

export const getTopProducts = async () => {
  const invoices = await prisma.invoices.findMany();

  const productCount = {};

  invoices.forEach((invoice) => {
    const { productId, modifications } = invoice.orderSummary;

    if (productId) {
      productCount[productId] = (productCount[productId] || 0) + 1;
    }

    if (modifications && Array.isArray(modifications)) {
      modifications.forEach((mod) => {
        if (mod.productId && mod.modificationType === "add") {
          productCount[mod.productId] = (productCount[mod.productId] || 0) + 1;
        }
      });
    }
  });

  const topProductIds = Object.entries(productCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([productId]) => productId);

  const topProducts = await prisma.products.findMany({
    where: {
      productId: {
        in: topProductIds,
      },
    },
  });

  const sortedTopProducts = topProducts.sort(
    (a, b) =>
      topProductIds.indexOf(a.productId) - topProductIds.indexOf(b.productId)
  );

  return sortedTopProducts;
};