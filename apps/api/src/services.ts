import {
  configurePricingPolicy,
  createMerchant,
  createProduct,
  listMerchantProducts,
  updateProduct,
  upsertInventory,
} from "@visa-commerce/commerce";

export const defaultCommerceApiServices = {
  configurePricingPolicy,
  createMerchant,
  createProduct,
  listMerchantProducts,
  updateProduct,
  upsertInventory,
};

export type CommerceApiServices = typeof defaultCommerceApiServices;
