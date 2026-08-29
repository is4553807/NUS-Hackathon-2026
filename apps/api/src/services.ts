import {
  checkInventory,
  configurePricingPolicy,
  createMerchant,
  createOrder,
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
  createOrder,
  createProduct,
  getPublicProduct,
  listMerchantProducts,
  requestOffers,
  searchProducts,
  updateProduct,
  upsertInventory,
};

export type CommerceApiServices = typeof defaultCommerceApiServices;
