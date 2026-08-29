import {
  checkInventory,
  configurePricingPolicy,
  createMerchant,
  createProduct,
  getPublicProduct,
  listMerchantProducts,
  requestOffers,
  searchProducts,
  updateProduct,
  upsertInventory,
} from "@visa-commerce/commerce";

export const defaultCommerceApiServices = {
  checkInventory,
  configurePricingPolicy,
  createMerchant,
  createProduct,
  getPublicProduct,
  listMerchantProducts,
  requestOffers,
  searchProducts,
  updateProduct,
  upsertInventory,
};

export type CommerceApiServices = typeof defaultCommerceApiServices;
